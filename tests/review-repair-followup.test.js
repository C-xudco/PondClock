import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createNewGame } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { STORAGE_CONFIG } from '../src/config/storage.js';
import { FISH, REGIONS } from '../src/lib/gameConfig.js';
import { MARKET_QUOTES } from '../src/domain/market.js';
import { createWeatherScheduler } from '../src/services/weatherScheduler.js';
import { SERVICES_CONFIG } from '../src/config/services.js';
import { buildMarketComparison, loadApprovedBaseline } from '../docs/next-iteration/roles/fish-catalogue/market-comparison.mjs';

const { createSaveRepository, checksum } = createRequire(import.meta.url)('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 25, 11);
const state = (coins = 100) => ({ ...createNewGame('jiangnan', NOW, { randomSeed: 37 }), coins });
const envelope = (snapshot) => JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  revision: snapshot.revision, snapshot, checksum: checksum(snapshot) });
async function disk(t, fileSystem) {
  const parent = path.resolve('tests', '.tmp');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'review-followup-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), parent);
    assert.ok(path.basename(directory).startsWith('review-followup-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, repo: createSaveRepository({ directory, validate: validateSave, fileSystem }) };
}

test('review followup: a preexisting corrupted migration backup prevents replacement of the legacy original', async (t) => {
  const { directory, repo } = await disk(t);
  const old = { ...state(), schemaVersion: 1, settings: { onlineEnhancements: true, alwaysOnTop: true } };
  const original = envelope(old), filename = path.join(directory, 'save-a.json');
  const digest = createHash('sha256').update(original).digest('hex');
  const backup = `${filename}.pre-schema${STORAGE_CONFIG.schemaVersion}-${digest}.bak`;
  await fs.writeFile(filename, original);
  await fs.writeFile(backup, 'wrong bytes in a preexisting backup');
  await assert.rejects(repo.load(), { code: 'SAVE_MIGRATION_FAILED' });
  assert.equal(await fs.readFile(filename, 'utf8'), original);
  assert.equal(await fs.readFile(backup, 'utf8'), 'wrong bytes in a preexisting backup');
});

test('review followup: recovery backup permission failure leaves both conflicting original slots intact', async (t) => {
  const fileSystem = { ...fs, writeFile: async (filename, ...args) => {
    if (String(filename).includes('.recovery-')) throw Object.assign(new Error('recovery backup is read-only'), { code: 'EACCES' });
    return fs.writeFile(filename, ...args);
  } };
  const { directory, repo } = await disk(t, fileSystem);
  const files = [path.join(directory, 'save-a.json'), path.join(directory, 'save-b.json')];
  const originals = [envelope({ ...state(111), revision: 9 }), envelope({ ...state(222), revision: 9 })];
  await Promise.all(files.map((filename, index) => fs.writeFile(filename, originals[index])));
  await assert.rejects(repo.importSnapshot(state(777)), { code: 'SAVE_RECOVERY_BACKUP_FAILED' });
  assert.deepEqual(await Promise.all(files.map((filename) => fs.readFile(filename, 'utf8'))), originals);
});

test('review followup: losing a whole-repository import verification read reports unknown but restart keeps the import', async (t) => {
  let renamedTarget = null, targetReadsAfterRename = 0;
  const fileSystem = { ...fs, rename: async (source, target, ...args) => {
    await fs.rename(source, target, ...args);
    renamedTarget = path.resolve(target); targetReadsAfterRename = 0;
  },
    readFile: async (filename, ...args) => {
      // Slot reads run concurrently. Count only the durable target: its first
      // read verifies writeSnapshot; its second read verifies the whole store.
      if (renamedTarget === path.resolve(filename) && ++targetReadsAfterRename === 2) {
        throw Object.assign(new Error('lost full-repository verification read'), { code: 'EIO' });
      }
      return fs.readFile(filename, ...args);
    } };
  const { directory, repo } = await disk(t, fileSystem);
  await fs.writeFile(path.join(directory, 'save-a.json'), envelope({ ...state(111), revision: 9 }));
  await fs.writeFile(path.join(directory, 'save-b.json'), envelope({ ...state(222), revision: 9 }));
  await assert.rejects(repo.importSnapshot(state(777)), { code: 'SAVE_COMMIT_UNKNOWN' });
  const restarted = createSaveRepository({ directory, validate: validateSave });
  const loaded = await restarted.load();
  assert.equal(loaded.snapshot.coins, 777);
  assert.equal(loaded.snapshot.revision, 10);
});

test('review followup: cancelled same-key transport retains its slot and budget through re-enable', async () => {
  let now = NOW, calls = 0, releaseOperation, releaseTransport;
  const transport = new Promise((resolve) => { releaseTransport = resolve; });
  const operation = new Promise((resolve) => { releaseOperation = resolve; });
  const scheduler = createWeatherScheduler({ now: () => now, autoWake: false,
    config: { ...SERVICES_CONFIG.weather, maxConcurrent: 1, startIntervalMs: 0 },
    fetchSnapshot: (_location, options) => {
      calls += 1;
      if (calls === 1) { options.onTransport(transport); return operation; }
      return Promise.resolve({ marker: 'new result' });
    } });
  const flush = async () => { for (let index = 0; index < 16; index += 1) await Promise.resolve(); };
  let stale = 0, fresh = 0;
  const first = scheduler.enqueue({ key: 'same-key', location: {}, onResult: () => { stale += 1; } });
  await flush();
  scheduler.setEnabled(false); scheduler.setEnabled(true);
  const second = scheduler.enqueue({ key: 'same-key', location: {}, onResult: () => { fresh += 1; } });
  releaseOperation({ marker: 'old result' }); await first; await flush();
  assert.equal(calls, 1);
  assert.equal(scheduler.getState().activeCount, 1);
  assert.equal(stale, 0);
  now += 1; releaseTransport(); await flush(); await second; await flush();
  assert.equal(calls, 2); assert.equal(fresh, 1);
  assert.equal(scheduler.getState().attempts.length, 2);
  assert.equal(scheduler.getState().activeCount, 0);
  scheduler.dispose();
});

test('historical review: the archived 50-fish candidate reproduces its original market report', async () => {
  const baseline = await loadApprovedBaseline();
  const archivedText = file => execFileSync('git', ['show', `874cdac:${file}`], { encoding: 'utf8', windowsHide: true });
  const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const configUrl = dataUrl(archivedText('src/lib/gameConfig.js'));
  const economyUrl = dataUrl(archivedText('src/config/economy.js'));
  const lootUrl = dataUrl(archivedText('src/config/lootConfig.js'));
  const config = await import(configUrl);
  const market = await import(dataUrl(archivedText('src/domain/market.js')
    .replace('"../lib/gameConfig.js"', JSON.stringify(configUrl))
    .replace('"../config/economy.js"', JSON.stringify(economyUrl))
    .replace('"../config/lootConfig.js"', JSON.stringify(lootUrl))));
  const comparison = buildMarketComparison(baseline, { config, market });
  const recorded = JSON.parse(await fs.readFile(new URL('../docs/next-iteration/roles/fish-catalogue/implementation/market-diff-report.json', import.meta.url), 'utf8'));
  assert.deepEqual(comparison.summary, recorded);
  for (const original of baseline.config.FISH) {
    const current = config.FISH.find((fish) => fish.id === original.id);
    assert.ok(current, `missing old species: ${original.id}`);
    for (const field of ['name', 'basePrice', 'len', 'wt', 'qw']) assert.deepEqual(current[field], original[field], `${original.id}.${field}`);
  }
  assert.equal(comparison.summary.fishCountAfter, 50);
  assert.equal(comparison.summary.marketCellsAfter, 600);
  assert.equal(comparison.summary.changedOldPriceQualityCells, 72);
});

test('V2 review: all archived fish identities remain and approved repricing covers the complete 17-by-56 market', async () => {
  const source = execFileSync('git', ['show', '874cdac:src/lib/gameConfig.js'], { encoding: 'utf8', windowsHide: true });
  const archived = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(archived.FISH.length, 50);
  for (const original of archived.FISH) {
    const current = FISH.find(fish => fish.id === original.id);
    assert.ok(current, original.id);
    for (const field of ['name', 'len', 'wt', 'qw']) assert.deepEqual(current[field], original[field], `${original.id}.${field}`);
    const expectedPrice = Math.round(Math.max(original.basePrice, Math.round(20 + .55 * original.basePrice)) * 1.2);
    assert.equal(current.basePrice, expectedPrice, original.id + ': approved V2 price formula');
  }
  assert.equal(FISH.length, 56); assert.equal(REGIONS.length, 17);
  assert.equal(MARKET_QUOTES.length, 952);
  assert.equal(new Set(MARKET_QUOTES.map(row => `${row.speciesId}:${row.regionId}`)).size, 952);
});
