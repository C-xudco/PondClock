import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { createRepository } from '../src/storage/repository.js';
import { STORAGE_CONFIG, DEFAULT_SETTINGS } from '../src/config/storage.js';
import { FISH } from '../src/lib/gameConfig.js';

const { createSaveRepository, checksum } = createRequire(import.meta.url)('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 25, 8);
const KEY = STORAGE_CONFIG.webKey;
const BACKUP = `${KEY}.backup`;
const clone = (value) => structuredClone(value);

function legacyFixture() {
  const initial = { ...createNewGame('jiangnan', NOW - 10 * 86400000, { randomSeed: 9 }), coins: 20000,
    lastEffectiveNowMs: NOW };
  let state = applyCommand(initial, { id: 'old-geo', type: 'GEO_VISIT', regionId: 'dongbei' }, NOW);
  state = applyCommand(state, { id: 'old-flight', type: 'START_TRAVEL', toId: 'dongbei' }, NOW);
  const fish = (uid, caughtAtMs) => ({ uid, speciesId: FISH[0].id, name: FISH[0].name, quality: 'rare',
    length: 20, weight: 1, regionId: 'jiangnan', originRegionId: 'jiangnan', caughtAtMs });
  state.bucket = [fish('newer', NOW), fish('older-b', NOW - 168 * 3600000), fish('older-a', NOW - 168 * 3600000)];
  state.codex = { [FISH[0].id]: { maxLength: 20, maxWeight: 1, bestQuality: 'rare', firstCaughtAtMs: NOW - 168 * 3600000, catchCount: 9 } };
  state.schemaVersion = 1;
  state.settings = { onlineEnhancements: false, alwaysOnTop: false };
  for (const key of ['randomSeed', 'catchSequence', 'items', 'saleBuff', 'arrivalSequence', 'arrivalConsumedSequence', 'arrivalEvent']) delete state[key];
  return state;
}
const envelope = (snapshot) => `${JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  revision: snapshot.revision, checksum: checksum(snapshot), snapshot })}\n`;

async function diskSetup(t, fileSystem) {
  const temporaryRoot = path.resolve('tests', '.tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'pondclock-migrate-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith('pondclock-migrate-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, repo: createSaveRepository({ directory, validate: validateSave, fileSystem }) };
}

function webSetup(t, entries) {
  const descriptors = new Map(['window', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const memory = new Map(entries), writes = [];
  const storage = { getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); memory.set(key, value); } };
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { memory, writes, storage, repo: createRepository() };
}

test('v1 migration preserves every existing asset, identity and paid deadline with deterministic old-fish sequence', () => {
  const old = legacyFixture(), original = clone(old);
  const first = validateSave(old), second = validateSave(clone(old));
  assert.deepEqual(first, second); assert.deepEqual(old, original);
  for (const key of ['coins', 'rodLevel', 'baitCount', 'baitLeft', 'codex', 'pityCounter', 'travel', 'revision',
    'lastEffectiveNowMs', 'createdAtMs', 'homeRegion', 'currentRegion', 'realRegion', 'unlockedRegions', 'recentCommittedCommandIds', 'lastCommittedCommandId']) {
    assert.deepEqual(first[key], old[key], key);
  }
  assert.equal(first.schemaVersion, STORAGE_CONFIG.schemaVersion); assert.equal(first.catchSequence, 9);
  assert.deepEqual(first.bucket.map((fish) => [fish.uid, fish.caughtAtMs, fish.catchSequence]),
    [['newer', NOW, 3], ['older-b', NOW - 168 * 3600000, 2], ['older-a', NOW - 168 * 3600000, 1]]);
  assert.deepEqual(first.items, []); assert.equal(first.saleBuff, null); assert.equal(first.arrivalEvent, null);
  assert.deepEqual(first.settings, { ...DEFAULT_SETTINGS, onlineEnhancements: false, alwaysOnTop: false });
});

test('desktop startup retains exact old slots before atomically persisting the current schema and can restart', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const old = legacyFixture(), rawA = envelope({ ...old, revision: 1, coins: 17 }), rawB = envelope(old);
  await fs.writeFile(path.join(directory, 'save-a.json'), rawA);
  await fs.writeFile(path.join(directory, 'save-b.json'), rawB);
  const loaded = await repo.load(); assert.equal(loaded.recovery.migrated, true);
  assert.deepEqual(loaded.snapshot, validateSave(old));
  const backups = (await fs.readdir(directory)).filter((name) => name.includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`));
  assert.equal(backups.length, 2);
  assert.deepEqual(new Set(await Promise.all(backups.map((name) => fs.readFile(path.join(directory, name), 'utf8')))), new Set([rawA, rawB]));
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'save-b.json'), 'utf8')).snapshot.schemaVersion, STORAGE_CONFIG.schemaVersion);
  const restarted = createSaveRepository({ directory, validate: validateSave });
  assert.deepEqual((await restarted.load()).snapshot, loaded.snapshot);
  assert.equal((await fs.readdir(directory)).filter((name) => name.includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`)).length, 2);
});

test('corrupt primary can migrate a valid v1 backup without losing either original', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const old = legacyFixture(), raw = envelope(old);
  await fs.writeFile(path.join(directory, 'save-a.json'), '{broken primary');
  await fs.writeFile(path.join(directory, 'save-b.json'), raw);
  const loaded = await repo.load(); assert.equal(loaded.recovery.recovered, true);
  assert.deepEqual(loaded.snapshot, validateSave(old));
  const contents = await Promise.all((await fs.readdir(directory)).filter((name) => name.endsWith('.bak')).map((name) => fs.readFile(path.join(directory, name), 'utf8')));
  assert.ok(contents.includes('{broken primary')); assert.ok(contents.includes(raw));
});

test('migration backup failure and interrupted rename preserve original bytes and allow a safe retry', async (t) => {
  let failBackup = true, failRename = false;
  const fileSystem = { ...fs, writeFile: async (filename, ...args) => {
    if (failBackup && String(filename).includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`)) throw Object.assign(new Error('read-only backup'), { code: 'EACCES' });
    return fs.writeFile(filename, ...args);
  }, rename: async (...args) => { if (failRename) throw new Error('interrupted migration rename'); return fs.rename(...args); } };
  const { directory, repo } = await diskSetup(t, fileSystem);
  const filename = path.join(directory, 'save-a.json'), raw = envelope(legacyFixture());
  await fs.writeFile(filename, raw);
  await assert.rejects(repo.load(), { code: 'SAVE_MIGRATION_FAILED' }); assert.equal(await fs.readFile(filename, 'utf8'), raw);
  failBackup = false; failRename = true;
  await assert.rejects(repo.load(), { code: 'SAVE_WRITE_FAILED' }); assert.equal(await fs.readFile(filename, 'utf8'), raw);
  assert.equal((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp')).length, 0);
  failRename = false;
  assert.deepEqual((await repo.load()).snapshot, validateSave(legacyFixture()));
});

test('future desktop schema blocks v1 migration and leaves all bytes unchanged', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const oldRaw = envelope(legacyFixture()), futureRaw = envelope({ ...legacyFixture(), revision: 3, schemaVersion: STORAGE_CONFIG.schemaVersion + 1 });
  await fs.writeFile(path.join(directory, 'save-a.json'), oldRaw); await fs.writeFile(path.join(directory, 'save-b.json'), futureRaw);
  await assert.rejects(repo.load(), { code: 'SAVE_NEWER_VERSION' });
  assert.deepEqual((await fs.readdir(directory)).sort(), ['save-a.json', 'save-b.json']);
  assert.equal(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8'), oldRaw);
  assert.equal(await fs.readFile(path.join(directory, 'save-b.json'), 'utf8'), futureRaw);
});

test('explicit v1 import uses the same migration while retaining the previous valid current slot', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const current = createNewGame('hainan', NOW, { randomSeed: 5 });
  await repo.save(current);
  const old = legacyFixture(), input = clone(old), imported = await repo.importSnapshot(old);
  assert.deepEqual(old, input); assert.equal(imported.snapshot.schemaVersion, STORAGE_CONFIG.schemaVersion);
  assert.equal(imported.snapshot.revision, 1); assert.deepEqual(imported.snapshot.travel, old.travel);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8')).snapshot, current);
});

test('Web migration retains all original slots and persists the identical normalized schema', async (t) => {
  const old = legacyFixture(), rawA = JSON.stringify({ ...old, revision: 1 }), rawB = JSON.stringify(old);
  const { memory, repo } = webSetup(t, [[KEY, rawA], [BACKUP, rawB]]);
  const loaded = await repo.loadSave(); assert.equal(loaded.recovery.migrated, true);
  assert.deepEqual(loaded.snapshot, validateSave(old));
  const retained = [...memory].filter(([key]) => key.includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}.`)).map(([, value]) => value);
  assert.deepEqual(new Set(retained), new Set([rawA, rawB]));
  assert.equal(JSON.parse(memory.get(BACKUP)).schemaVersion, STORAGE_CONFIG.schemaVersion);
  assert.deepEqual((await repo.loadSave()).snapshot, loaded.snapshot);
});

test('Web backup quota failure refuses to migrate rather than silently starting empty', async (t) => {
  const raw = JSON.stringify(legacyFixture());
  const { memory, storage, repo } = webSetup(t, [[KEY, raw]]);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(repo.loadSave(), /QuotaExceededError/); assert.equal(memory.get(KEY), raw);
  assert.equal(memory.size, 1);
});

test('Web migration interrupted after backups keeps the original loadable for retry', async (t) => {
  const raw = JSON.stringify(legacyFixture());
  const { memory, storage, repo } = webSetup(t, [[KEY, raw]]);
  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === KEY) throw new Error('write interrupted'); originalSetItem(key, value); };
  await assert.rejects(repo.loadSave(), /interrupted/); assert.equal(memory.get(KEY), raw);
  assert.ok([...memory.keys()].some((key) => key.includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}.`)));
  storage.setItem = originalSetItem;
  assert.deepEqual((await repo.loadSave()).snapshot, validateSave(legacyFixture()));
});

test('future Web schema blocks legacy migration without even creating backup keys', async (t) => {
  const entries = [[KEY, JSON.stringify(legacyFixture())], [BACKUP, JSON.stringify({ ...legacyFixture(), schemaVersion: STORAGE_CONFIG.schemaVersion + 1 })]];
  const { memory, writes, repo } = webSetup(t, entries);
  await assert.rejects(repo.loadSave(), /较新版本/); assert.deepEqual([...memory], entries); assert.equal(writes.length, 0);
});

async function seedConflict(directory) {
  const base = validateSave(legacyFixture());
  const originals = [envelope({ ...base, revision: 9, coins: 101 }), envelope({ ...base, revision: 9, coins: 202 })];
  await fs.writeFile(path.join(directory, 'save-a.json'), originals[0]);
  await fs.writeFile(path.join(directory, 'save-b.json'), originals[1]);
  return { base, originals };
}

test('conflict import advances above every valid slot, retains both originals, and stays authoritative for restart and next save', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const { base, originals } = await seedConflict(directory);
  await assert.rejects(repo.load(), { code: 'SAVE_CONFLICT' });
  const imported = await repo.importSnapshot({ ...base, revision: 0, coins: 777 });
  assert.equal(imported.snapshot.revision, 10); assert.equal(imported.snapshot.coins, 777);
  const retained = await Promise.all((await fs.readdir(directory)).filter((name) => name.includes('.recovery-')).map((name) => fs.readFile(path.join(directory, name), 'utf8')));
  assert.deepEqual(new Set(retained), new Set(originals));
  const restarted = createSaveRepository({ directory, validate: validateSave });
  assert.deepEqual((await restarted.load()).snapshot, imported.snapshot);
  const next = applyCommand(imported.snapshot, { id: 'after-conflict-import', type: 'SETTINGS', patch: { biteSoundVolume: 20 } }, NOW);
  await restarted.save(next); assert.deepEqual((await restarted.load()).snapshot, next);
});

test('ENOENT while creating an explicit recovery backup aborts before either original is replaced', async (t) => {
  const fileSystem = { ...fs, writeFile: async (filename, ...args) => {
    if (String(filename).includes('.recovery-')) throw Object.assign(new Error('backup target unavailable'), { code: 'ENOENT' });
    return fs.writeFile(filename, ...args);
  } };
  const { directory, repo } = await diskSetup(t, fileSystem);
  const { base, originals } = await seedConflict(directory);
  await assert.rejects(repo.importSnapshot({ ...base, coins: 777 }), { code: 'SAVE_RECOVERY_BACKUP_FAILED' });
  assert.equal(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8'), originals[0]);
  assert.equal(await fs.readFile(path.join(directory, 'save-b.json'), 'utf8'), originals[1]);
  await assert.rejects(repo.load(), { code: 'SAVE_CONFLICT' });
});

test('lost conflict-import verification receipt leaves the imported revision recoverable without reverting to an old slot', async (t) => {
  let loseRead = false;
  const fileSystem = { ...fs, rename: async (...args) => { await fs.rename(...args); loseRead = true; },
    readFile: async (...args) => {
      if (loseRead) { loseRead = false; throw Object.assign(new Error('receipt lost after durable rename'), { code: 'EIO' }); }
      return fs.readFile(...args);
    } };
  const { directory, repo } = await diskSetup(t, fileSystem);
  const { base, originals } = await seedConflict(directory);
  await assert.rejects(repo.importSnapshot({ ...base, coins: 777 }), { code: 'SAVE_COMMIT_UNKNOWN' });
  const restarted = createSaveRepository({ directory, validate: validateSave });
  const restored = (await restarted.load()).snapshot;
  assert.equal(restored.coins, 777); assert.equal(restored.revision, 10);
  const retained = await Promise.all((await fs.readdir(directory)).filter((name) => name.includes('.recovery-')).map((name) => fs.readFile(path.join(directory, name), 'utf8')));
  assert.deepEqual(new Set(retained), new Set(originals));
});

test('explicit import cannot bypass a future schema when valid old slots would otherwise permit recovery', async (t) => {
  const { directory, repo } = await diskSetup(t);
  const { base, originals } = await seedConflict(directory);
  const future = envelope({ ...base, revision: 9, coins: 999, schemaVersion: STORAGE_CONFIG.schemaVersion + 1 });
  await fs.writeFile(path.join(directory, 'save-b.json'), future);
  await assert.rejects(repo.importSnapshot({ ...base, coins: 777 }), { code: 'SAVE_NEWER_VERSION' });
  assert.deepEqual((await fs.readdir(directory)).sort(), ['save-a.json', 'save-b.json']);
  assert.equal(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8'), originals[0]);
  assert.equal(await fs.readFile(path.join(directory, 'save-b.json'), 'utf8'), future);
});
