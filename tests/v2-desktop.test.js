import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createNewGame } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';

const require = createRequire(import.meta.url);
const { importLegacyCopy, EDITION } = require('../desktop/edition.cjs');
const { createSaveRepository, checksum } = require('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 28);
const envelope = snapshot => Buffer.from(JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  checksum: checksum(snapshot), revision: snapshot.revision, snapshot }));
function legacy(revision = 7) {
  const snapshot = createNewGame('jiangnan', NOW, { randomSeed: 9 });
  for (const key of ['editionId', 'fishing', 'activePass', 'focus', 'freeTravelTickets', 'discounts', 'legacy', 'travelReceiptIds']) delete snapshot[key];
  return { ...snapshot, schemaVersion: 3, gameVersion: '1.3.0', revision, coins: 1234, rodLevel: 2 };
}
async function setup(t) {
  const root = path.resolve('tests/.tmp');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'focus-copy-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), root);
    assert.ok(path.basename(directory).startsWith('focus-copy-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const legacyDirectory = path.join(directory, 'old/saves'), newDirectory = path.join(directory, 'focus/saves');
  await fs.mkdir(legacyDirectory, { recursive: true });
  const repository = createSaveRepository({ directory: newDirectory, validate: validateSave, supportedSchemaVersion: 4 });
  return { legacyDirectory, newDirectory, repository, validate: validateSave };
}

test('first edition has a separate identity and copies highest old slot with exact raw backups, once', async t => {
  const f = await setup(t);
  assert.equal(EDITION.profile, 'PondClock-Focus');
  assert.equal(EDITION.appId, 'cn.pondclock.focus');
  const old = legacy(), raws = [envelope(legacy(6)), envelope(old)];
  for (const [index, name] of ['save-a.json', 'save-b.json'].entries()) await fs.writeFile(path.join(f.legacyDirectory, name), raws[index]);
  assert.equal((await importLegacyCopy(f)).imported, true);
  const loaded = (await f.repository.load()).snapshot;
  assert.equal(loaded.schemaVersion, 4);
  assert.equal(loaded.editionId, 'first-focus');
  assert.equal(loaded.coins, 1234 + 3200);
  assert.equal(loaded.rodLevel, 0);
  assert.ok(loaded.appearance.ownedProducts.includes('whitecape_character_pack'));
  assert.equal(loaded.appearance.equipped.character, 'minimal');
  const backups = await fs.readdir(path.join(f.newDirectory, 'legacy-copy'));
  assert.equal(backups.length, 2);
  for (const [index, name] of ['save-a.json', 'save-b.json'].entries()) {
    assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, name)), raws[index]);
    assert.deepEqual(await fs.readFile(path.join(f.newDirectory, 'legacy-copy', backups.find(entry => entry.startsWith(name)))), raws[index]);
  }
  assert.equal((await importLegacyCopy(f)).imported, false);
  assert.deepEqual((await f.repository.load()).snapshot, loaded);
});

test('existing focus progress prevents even opening the old directory', async t => {
  const f = await setup(t), snapshot = createNewGame('dongbei', NOW);
  await f.repository.save(snapshot);
  const fileSystem = { readFile: () => { throw new Error('must not inspect old files'); } };
  assert.equal((await importLegacyCopy({ ...f, fileSystem })).imported, false);
  assert.deepEqual((await f.repository.load()).snapshot, snapshot);
});

test('future or conflicting old slots are preserved and do not initialize a new profile', async t => {
  const f = await setup(t), a = envelope(legacy());
  await fs.writeFile(path.join(f.legacyDirectory, 'save-a.json'), a);
  for (const snapshot of [{ ...legacy(), schemaVersion: 99 }, { ...legacy(), coins: 999 }]) {
    const b = envelope(snapshot);
    await fs.writeFile(path.join(f.legacyDirectory, 'save-b.json'), b);
    await assert.rejects(importLegacyCopy(f), /较新|冲突|未自动导入/);
    assert.equal((await f.repository.load()).snapshot, null);
    assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, 'save-a.json')), a);
    assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, 'save-b.json')), b);
  }
});

test('backup failure aborts before import and safe retry keeps both old bytes', async t => {
  const f = await setup(t), raw = envelope(legacy());
  await fs.writeFile(path.join(f.legacyDirectory, 'save-a.json'), raw);
  const fileSystem = { ...fs, writeFile: async () => { throw Object.assign(new Error('backup denied'), { code: 'EACCES' }); } };
  await assert.rejects(importLegacyCopy({ ...f, fileSystem }), /backup denied/);
  assert.equal((await f.repository.load()).snapshot, null);
  assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, 'save-a.json')), raw);
  assert.equal((await importLegacyCopy(f)).imported, true);
  assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, 'save-a.json')), raw);
});
