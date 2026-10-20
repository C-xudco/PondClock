import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSaveRepository, checksum } = require('../desktop/saveRepository.cjs');
const { validateEnvironmentUrl, requestEnvironment } = require('../desktop/environment.cjs');

function validate(input) {
  if (input?.schemaVersion !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !Number.isSafeInteger(input.coins) || input.coins < 0 || !Array.isArray(input.bucket) ||
      !Array.isArray(input.recentCommittedCommandIds)) throw new Error('Invalid snapshot');
  return structuredClone(input);
}

const snapshot = (revision, extra = {}) => ({
  schemaVersion: 1, revision, coins: 100, bucket: [], codex: {},
  lastEffectiveNowMs: 1000, lastCommittedCommandId: `command-${revision}`,
  recentCommittedCommandIds: [`command-${revision}`], ...extra,
});

async function setup(t, fileSystem) {
  // Windows managed temp can allow creation but deny rename; use an isolated workspace directory.
  const temporaryRoot = path.resolve('tests', '.tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'pondclock-storage-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith('pondclock-storage-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, repository: createSaveRepository({ directory, validate, fileSystem }) };
}

test('new save, complete snapshot and in-flight travel survive repository restart', async (t) => {
  const { directory, repository } = await setup(t);
  assert.equal((await repository.load()).snapshot, null);
  const state = snapshot(0, {
    bucket: [{ uid: 'fish-1', caughtAtMs: 1000, speciesId: 'jiyu', quality: 'legendary' }],
    codex: { jiyu: { catchCount: 1, firstCaughtAtMs: 1000 } },
    travel: { id: 'flight-1', fromId: 'jiangnan', toId: 'dongbei', startedAtMs: 2000, arrivesAtMs: 182000, farePaid: 200 },
  });
  assert.equal((await repository.save(state)).status, 'committed');
  const restarted = createSaveRepository({ directory, validate });
  assert.deepEqual((await restarted.load()).snapshot, state);
});

test('revision and checksum identity make uncertain-receipt retry idempotent', async (t) => {
  const { repository } = await setup(t);
  await repository.save(snapshot(0));
  await repository.save(snapshot(1, { coins: 120 }));
  assert.equal((await repository.save(snapshot(1, { coins: 120 }))).status, 'already-committed');
  await assert.rejects(repository.save(snapshot(1, { coins: 999 })), { code: 'SAVE_REVISION_CONFLICT' });
  await assert.rejects(repository.save(snapshot(3)), { code: 'SAVE_REVISION_CONFLICT' });
  assert.equal((await repository.load()).snapshot.coins, 120);
});

test('concurrent stale writers cannot duplicate a purchase or sale', async (t) => {
  const { repository } = await setup(t);
  await repository.save(snapshot(0));
  const results = await Promise.allSettled([
    repository.save(snapshot(1, { coins: 110 })),
    repository.save(snapshot(1, { coins: 120 })),
  ]);
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'rejected']);
  assert.equal((await repository.load()).snapshot.coins, 110);
});

test('corrupt latest slot recovers the previous complete commit', async (t) => {
  const { directory, repository } = await setup(t);
  await repository.save(snapshot(0));
  await repository.save(snapshot(1, { coins: 120 }));
  await fs.writeFile(path.join(directory, 'save-b.json'), '{partial');
  const result = await repository.load();
  assert.equal(result.snapshot.revision, 0);
  assert.equal(result.recovery.recovered, true);
  assert.deepEqual(result.recovery.invalidSlots, ['save-b.json']);
});

test('checksum catches a syntactically valid modified balance', async (t) => {
  const { directory, repository } = await setup(t);
  await repository.save(snapshot(0));
  const filename = path.join(directory, 'save-a.json');
  const envelope = JSON.parse(await fs.readFile(filename, 'utf8'));
  envelope.snapshot.coins = 999;
  await fs.writeFile(filename, JSON.stringify(envelope));
  await assert.rejects(repository.load(), { code: 'SAVE_RECOVERY_REQUIRED' });
});

test('failure before atomic rename preserves the previous committed state', async (t) => {
  let failRename = false;
  const fileSystem = { ...fs, rename: async (...args) => {
    if (failRename) throw Object.assign(new Error('simulated disk failure'), { code: 'EIO' });
    return fs.rename(...args);
  } };
  const { directory, repository } = await setup(t, fileSystem);
  await repository.save(snapshot(0));
  failRename = true;
  await assert.rejects(repository.save(snapshot(1)), { code: 'SAVE_WRITE_FAILED' });
  assert.equal((await repository.load()).snapshot.revision, 0);
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp')), []);
});

test('lost verification receipt is resolved by reload without another transaction', async (t) => {
  let failVerification = false;
  const fileSystem = { ...fs, rename: async (...args) => {
    await fs.rename(...args);
    failVerification = true;
  }, readFile: async (...args) => {
    if (failVerification) { failVerification = false; throw new Error('simulated lost receipt'); }
    return fs.readFile(...args);
  } };
  const { repository } = await setup(t, fileSystem);
  await assert.rejects(repository.save(snapshot(0)), { code: 'SAVE_COMMIT_UNKNOWN' });
  assert.equal((await repository.load()).snapshot.revision, 0);
  assert.equal((await repository.save(snapshot(0))).status, 'already-committed');
});

test('future schema is preserved even when an older valid backup exists', async (t) => {
  const { directory, repository } = await setup(t);
  await repository.save(snapshot(0));
  const future = { ...snapshot(1), schemaVersion: 2 };
  const contents = JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1, revision: 1, snapshot: future, checksum: checksum(future) });
  const filename = path.join(directory, 'save-b.json');
  await fs.writeFile(filename, contents);
  await assert.rejects(repository.load(), { code: 'SAVE_NEWER_VERSION' });
  await assert.rejects(repository.save(snapshot(1)), { code: 'SAVE_NEWER_VERSION' });
  assert.equal(await fs.readFile(filename, 'utf8'), contents);
});

test('explicit import repairs corrupt slots only after retaining original bytes', async (t) => {
  const { directory, repository } = await setup(t);
  await fs.writeFile(path.join(directory, 'save-a.json'), 'broken original');
  await assert.rejects(repository.load(), { code: 'SAVE_RECOVERY_REQUIRED' });
  const imported = await repository.importSnapshot(snapshot(99, { coins: 777 }));
  assert.equal(imported.snapshot.revision, 0);
  assert.equal(imported.snapshot.coins, 777);
  const backup = (await fs.readdir(directory)).find((name) => name.includes('.recovery-'));
  assert.equal(await fs.readFile(path.join(directory, backup), 'utf8'), 'broken original');
  assert.equal((await repository.load()).snapshot.coins, 777);
});

test('import advances local revision and leaves previous valid slot available', async (t) => {
  const { repository } = await setup(t);
  await repository.save(snapshot(0));
  const result = await repository.importSnapshot(snapshot(20, { coins: 555 }));
  assert.equal(result.snapshot.revision, 1);
  assert.equal((await repository.load()).recovery.backupAvailable, true);
});

test('environment bridge permits only fixed endpoints and bounded weather queries', () => {
  assert.equal(validateEnvironmentUrl('https://ipapi.co/json/').hostname, 'ipapi.co');
  assert.equal(validateEnvironmentUrl('https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=temperature_2m,weather_code&timezone=Asia%2FShanghai').hostname, 'api.open-meteo.com');
  for (const url of ['file:///C:/secret.txt', 'https://example.com/', 'https://ipapi.co/json/?x=1',
    'https://user:password@ipapi.co/json/', 'https://api.open-meteo.com/v1/forecast?latitude=999&longitude=1&current=weather_code',
    'https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=weather_code&apikey=secret']) {
    assert.throws(() => validateEnvironmentUrl(url));
  }
});

test('environment response bounds and invalid JSON fail without impacting saves', async () => {
  await assert.rejects(requestEnvironment('https://ipapi.co/json/', async () => new Response('bad json')), /有效 JSON/);
  await assert.rejects(requestEnvironment('https://ipapi.co/json/', async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))), /过大/);
  const json = await requestEnvironment('https://ipapi.co/json/', async () => Response.json({ country_code: 'CN' }));
  assert.equal(json.country_code, 'CN');
});
