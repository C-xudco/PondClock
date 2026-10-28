import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { findBite, capture } from './helpers/ordinaryCapture.js';
import { catchOutcome } from '../src/domain/loot.js';
import { quoteBucketSale } from '../src/domain/market.js';
import { GameSession } from '../src/application/gameSession.js';
import { createRepository } from '../src/storage/repository.js';
import { STORAGE_CONFIG, DEFAULT_SETTINGS, GAME_VERSION } from '../src/config/storage.js';
import { APPEARANCE_PRODUCTS, APPEARANCE_OPTIONS, DEFAULT_APPEARANCE,
  appearanceProduct, ownsAppearanceStyle, ownedStyleIds } from '../src/config/appearance.js';

const { createSaveRepository, checksum } = createRequire(import.meta.url)('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 25, 12);
const fresh = () => ({ ...createNewGame('jiangnan', NOW - 10 * 86400000, { randomSeed: 731 }),
  lastEffectiveNowMs: NOW, coins: 10000 });
let sequence = 0;
const run = (state, type, fields = {}, now = NOW) => applyCommand(state, { id: `art-${++sequence}`, type, ...fields }, now);
const buy = (state, productId = 'inkwash_pack') => run(state, 'BUY_APPEARANCE', { productId });
const equip = (state, slot, styleId) => run(state, 'EQUIP_APPEARANCE', { slot, styleId });
const envelope = (snapshot) => `${JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  revision: snapshot.revision, snapshot, checksum: checksum(snapshot) })}\n`;

function v2Fixture() {
  let state = capture(findBite(seed => ({ ...fresh(), randomSeed: seed }), 'fish'));
  state = run(state, 'BUY_BAIT');
  state = run(state, 'GEO_VISIT', { regionId: 'dongbei' });
  state = run(state, 'START_TRAVEL', { toId: 'dongbei' });
  state = { ...state, schemaVersion: 2, gameVersion: '1.2.0' };
  for (const key of ['appearance', 'editionId', 'legacy', 'fishing', 'activePass', 'focus', 'freeTravelTickets', 'discounts', 'travelReceiptIds']) delete state[key];
  for (const key of ['baseFare', 'payment', 'discountSourceItemUid']) delete state.travel[key];
  delete state.settings.sceneWeatherMode;
  delete state.settings.manualWeather;
  return state;
}

async function disk(t, fileSystem) {
  const parent = path.resolve('tests', '.tmp');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'appearance-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), parent);
    assert.ok(path.basename(directory).startsWith('appearance-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, repo: createSaveRepository({ directory, validate: validateSave, fileSystem }) };
}

test('catalogue has unique stable IDs, safe coin prices and valid cosmetic-only grants', () => {
  assert.equal(new Set(APPEARANCE_PRODUCTS.map((item) => item.id)).size, APPEARANCE_PRODUCTS.length);
  const grants = new Set();
  for (const item of APPEARANCE_PRODUCTS) {
    assert.ok(Number.isSafeInteger(item.price) && item.price > 0);
    assert.equal(appearanceProduct(item.id), item);
    for (const [slot, style] of Object.entries(item.grants)) {
      assert.ok(APPEARANCE_OPTIONS[slot]?.some((option) => option.id === style));
      assert.notEqual(style, DEFAULT_APPEARANCE.equipped[slot]);
      assert.ok(!grants.has(`${slot}:${style}`));
      grants.add(`${slot}:${style}`);
    }
    assert.ok(!Object.hasOwn(item, 'qualityBonus') && !Object.hasOwn(item, 'intervalMult'));
  }
  for (const [slot, options] of Object.entries(APPEARANCE_OPTIONS)) {
    assert.equal(new Set(options.map((option) => option.id)).size, options.length);
    assert.ok(options.every((option) => option.id === 'minimal' || grants.has(`${slot}:${option.id}`)));
  }
});

test('new players receive free minimal scene, character and rod without purchases', () => {
  const state = fresh();
  assert.deepEqual(state.appearance, DEFAULT_APPEARANCE);
  for (const slot of Object.keys(APPEARANCE_OPTIONS)) {
    assert.deepEqual(ownedStyleIds(state.appearance, slot), ['minimal']);
    assert.equal(ownsAppearanceStyle(state.appearance, slot, 'inkwash'), false);
  }
  assert.deepEqual(ownedStyleIds(state.appearance, 'not-a-slot'), []);
  assert.equal(ownsAppearanceStyle(state.appearance, '__proto__', 'minimal'), false);
});

test('bundle purchase deducts the configured price once and unlocks three independently equipped slots', () => {
  const before = fresh(), original = structuredClone(before);
  const purchased = buy(before);
  assert.deepEqual(before, original);
  assert.equal(purchased.coins, before.coins - appearanceProduct('inkwash_pack').price);
  assert.deepEqual(purchased.appearance.equipped, DEFAULT_APPEARANCE.equipped);
  assert.deepEqual(purchased.appearance.ownedProducts, ['inkwash_pack']);
  for (const slot of Object.keys(APPEARANCE_OPTIONS)) assert.equal(ownsAppearanceStyle(purchased.appearance, slot, 'inkwash'), true);
  const equipped = equip(purchased, 'scene', 'inkwash');
  assert.deepEqual(equipped.appearance.equipped, { scene: 'inkwash', character: 'minimal', rod: 'minimal' });
  assert.equal(equipped.coins, purchased.coins);
  assert.deepEqual(equip(equipped, 'scene', 'minimal').appearance.equipped, DEFAULT_APPEARANCE.equipped);
});

test('same product never charges again with another command ID or after bounded history has rolled over', () => {
  let state = buy(fresh());
  assert.equal(buy(state), state);
  const paid = state.coins;
  for (let i = 0; i < STORAGE_CONFIG.commandHistorySize + 2; i++) state = run(state, 'SETTINGS', { patch: { biteSoundVolume: i % 100 } });
  assert.equal(state.recentCommittedCommandIds.length, STORAGE_CONFIG.commandHistorySize);
  assert.equal(buy(state), state);
  assert.equal(state.coins, paid);
  assert.equal(equip(state, 'scene', 'minimal'), state);
});

test('unknown goods, insufficient balance, unowned styles and cross-category styles fail without state changes', () => {
  const state = fresh(), original = structuredClone(state);
  assert.throws(() => buy(state, 'invented'), /未知美术商品/);
  assert.throws(() => buy({ ...state, coins: 0 }), /金币不足/);
  assert.throws(() => equip(state, 'scene', 'inkwash'), /先拥有/);
  assert.throws(() => equip(buy(state, 'jade_rod'), 'character', 'jade'), /先拥有/);
  assert.throws(() => equip(state, '__proto__', 'minimal'), /先拥有/);
  assert.deepEqual(state, original);
  const exactly = buy({ ...state, coins: appearanceProduct('inkwash_pack').price });
  assert.equal(exactly.coins, 0);
});

test('purchase ignores caller supplied price, grants and equip requests and uses the catalogue', () => {
  const state = fresh();
  const next = run(state, 'BUY_APPEARANCE', { productId: 'jade_rod', price: 0,
    grants: { scene: 'inkwash' }, equipped: { scene: 'inkwash' } });
  assert.equal(next.coins, state.coins - appearanceProduct('jade_rod').price);
  assert.deepEqual(next.appearance, { ownedProducts: ['jade_rod'], equipped: { ...DEFAULT_APPEARANCE.equipped } });
});

test('separate characters and rods can be mixed with either scene and survive validation', () => {
  let state = fresh();
  for (const product of APPEARANCE_PRODUCTS) state = buy(state, product.id);
  for (const scene of APPEARANCE_OPTIONS.scene) {
    for (const character of APPEARANCE_OPTIONS.character) {
      for (const rod of APPEARANCE_OPTIONS.rod) {
        const mixed = equip(equip(equip(state, 'scene', scene.id), 'character', character.id), 'rod', rod.id);
        assert.deepEqual(validateSave(mixed).appearance.equipped, { scene: scene.id, character: character.id, rod: rod.id });
      }
    }
  }
});

test('cosmetic purchases and equipment leave catch RNG, rod bonuses, quotes and existing assets unchanged', () => {
  const before = fresh();
  const after = equip(equip(equip(buy(buy(before, 'jade_rod')), 'scene', 'inkwash'), 'character', 'inkwash'), 'rod', 'jade');
  const exempt = new Set(['appearance', 'coins', 'revision', 'lastCommittedCommandId', 'recentCommittedCommandIds']);
  for (const key of Object.keys(before)) if (!exempt.has(key)) assert.deepEqual(after[key], before[key], key);
  for (let randomSeed = 0; randomSeed < 64; randomSeed++) {
    assert.deepEqual(catchOutcome({ ...before, randomSeed }), catchOutcome({ ...after, randomSeed }));
  }
  assert.deepEqual(quoteBucketSale(after, NOW), quoteBucketSale(before, NOW));
});

test('flying blocks appearance purchase and equipment without deducting more money', () => {
  const owned = buy(fresh());
  const flying = run(owned, 'START_TRAVEL', { toId: 'dongbei' });
  const before = structuredClone(flying);
  assert.throws(() => buy(flying, 'jade_rod'), /飞行途中/);
  assert.throws(() => equip(flying, 'scene', 'inkwash'), /飞行途中/);
  assert.deepEqual(flying, before);
});

test('actual arrival and real-location entry reset presentation mode in the same committed state', () => {
  let state = run(fresh(), 'SETTINGS', { patch: { sceneWeatherMode: 'manual', manualWeather: 'snow' } });
  state = run(state, 'GEO_VISIT', { regionId: 'dongbei' });
  assert.equal(state.settings.sceneWeatherMode, 'manual');
  const flying = run(state, 'START_TRAVEL', { toId: 'dongbei' });
  assert.equal(flying.settings.sceneWeatherMode, 'manual');
  assert.equal(run(flying, 'ARRIVE', {}, flying.travel.arriveAtMs - 1), flying);
  const arrived = run(flying, 'ARRIVE', {}, flying.travel.arriveAtMs);
  assert.equal(arrived.currentRegion, 'dongbei');
  assert.equal(arrived.settings.sceneWeatherMode, 'fishing');
  assert.equal(arrived.settings.manualWeather, 'snow');
  const localMode = run(state, 'SETTINGS', { patch: { sceneWeatherMode: 'local' } });
  const entered = run(localMode, 'REAL_VISIT');
  assert.equal(entered.currentRegion, 'dongbei');
  assert.equal(entered.settings.sceneWeatherMode, 'fishing');
  const alreadyThere = run(entered, 'SETTINGS', { patch: { sceneWeatherMode: 'local' } });
  assert.equal(run(alreadyThere, 'REAL_VISIT'), alreadyThere);
});

test('schema3 rejects malformed ownership, missing slots, unowned equipment and invalid weather enums', () => {
  const state = fresh();
  for (const appearance of [null, {}, { ...state.appearance, ownedProducts: ['unknown'] },
    { ...state.appearance, ownedProducts: ['jade_rod', 'jade_rod'] },
    { ...state.appearance, equipped: { ...state.appearance.equipped, scene: 'inkwash' } },
    { ...state.appearance, equipped: { scene: 'minimal', rod: 'minimal' } },
    { ...state.appearance, equipped: { ...state.appearance.equipped, extra: 'minimal' } }]) {
    assert.throws(() => validateSave({ ...state, appearance }), /存档无效/);
  }
  for (const patch of [{ sceneWeatherMode: 'auto' }, { manualWeather: 'thunder' }, { sceneWeatherMode: null }]) {
    assert.throws(() => run(state, 'SETTINGS', { patch }), /场景天气设置/);
  }
});

test('schema2 migration restores minimal art and adds weather defaults while preserving every existing asset and deadline', () => {
  const old = v2Fixture(), original = structuredClone(old);
  const migrated = validateSave(old);
  assert.deepEqual(old, original);
  for (const key of Object.keys(old)) {
    if (!['schemaVersion', 'gameVersion', 'settings', 'travel'].includes(key)) assert.deepEqual(migrated[key], old[key], key);
  }
  assert.equal(migrated.schemaVersion, STORAGE_CONFIG.schemaVersion);
  assert.equal(migrated.gameVersion, GAME_VERSION);
  assert.deepEqual(migrated.settings, { ...DEFAULT_SETTINGS, ...old.settings });
  assert.deepEqual(migrated.appearance.equipped, DEFAULT_APPEARANCE.equipped);
  assert.deepEqual(migrated.appearance.ownedProducts, ['whitecape_character_pack']);
  for (const key of Object.keys(old.travel)) assert.equal(migrated.travel[key], old.travel[key], key);
  assert.equal(migrated.legacy.sourceSchemaVersion, 2);
  assert.equal(migrated.legacy.rodCompensation, 0);
  assert.deepEqual(validateSave(migrated), migrated);
  const spoof = structuredClone(old);
  spoof.appearance = { ownedProducts: ['inkwash_pack'], equipped: { scene: 'inkwash', character: 'inkwash', rod: 'inkwash' } };
  spoof.settings.sceneWeatherMode = 'manual'; spoof.settings.manualWeather = 'snow';
  assert.deepEqual(validateSave(spoof), migrated);
});

test('schema2 disk migration retains both exact old slots and preserves paid flight across restart', async (t) => {
  const { directory, repo } = await disk(t);
  const old = v2Fixture();
  const originals = [envelope({ ...old, revision: old.revision - 1 }), envelope(old)];
  await fs.writeFile(path.join(directory, 'save-a.json'), originals[0]);
  await fs.writeFile(path.join(directory, 'save-b.json'), originals[1]);
  const loaded = await repo.load();
  assert.equal(loaded.recovery.migrated, true);
  assert.deepEqual(loaded.snapshot, validateSave(old));
  const backups = (await fs.readdir(directory)).filter((name) => name.includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`));
  assert.deepEqual(new Set(await Promise.all(backups.map((name) => fs.readFile(path.join(directory, name), 'utf8')))), new Set(originals));
  assert.deepEqual((await createSaveRepository({ directory, validate: validateSave }).load()).snapshot, loaded.snapshot);
});

test('schema2 migration backup failure aborts before replacing old bytes and a later retry safely succeeds', async (t) => {
  let fail = true;
  const fileSystem = { ...fs, writeFile: async (filename, ...args) => {
    if (fail && String(filename).includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`)) {
      throw Object.assign(new Error('backup denied'), { code: 'EACCES' });
    }
    return fs.writeFile(filename, ...args);
  } };
  const { directory, repo } = await disk(t, fileSystem);
  const old = v2Fixture(), filename = path.join(directory, 'save-a.json'), original = envelope(old);
  await fs.writeFile(filename, original);
  await assert.rejects(repo.load(), { code: 'SAVE_MIGRATION_FAILED' });
  assert.equal(await fs.readFile(filename, 'utf8'), original);
  fail = false;
  assert.deepEqual((await repo.load()).snapshot, validateSave(old));
});

test('schema2 Web migration backs up the original before setting new appearance and keeps new purchases on reload', async (t) => {
  const descriptors = new Map(['window', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const old = v2Fixture(), raw = JSON.stringify(old), memory = new Map([[STORAGE_CONFIG.webKey, raw]]), writes = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); memory.set(key, value); },
  } });
  const repo = createRepository();
  const migrated = (await repo.loadSave()).snapshot;
  assert.ok(writes[0].includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}.`));
  assert.equal(memory.get(writes[0]), raw);
  const landed = run(migrated, 'ARRIVE', {}, migrated.travel.arriveAtMs);
  const purchased = buy(landed, 'jade_rod');
  // Save the arrival before the next purchase to preserve repository revision rules.
  await repo.saveGame(landed);
  await repo.saveGame(purchased);
  assert.deepEqual((await createRepository().loadSave()).snapshot, purchased);
});

test('queued double purchase and equipment publish only confirmed ownership and charge once', async () => {
  const initial = fresh(), published = [];
  let disk = structuredClone(initial), acknowledge;
  const repo = { loadSave: async () => ({ snapshot: structuredClone(disk) }),
    saveGame: async (next) => new Promise((resolve) => {
      acknowledge = () => { disk = structuredClone(next); resolve({ snapshot: structuredClone(next) }); };
    }) };
  const session = new GameSession(repo, () => NOW, () => 0);
  await session.load(); session.subscribe((state) => published.push(state));
  const first = session.dispatch({ id: 'purchase-a', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  const second = session.dispatch({ id: 'purchase-b', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  const third = session.dispatch({ id: 'equip-a', type: 'EQUIP_APPEARANCE', slot: 'scene', styleId: 'inkwash' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(session.snapshot.appearance.ownedProducts, []);
  assert.equal(published.length, 0);
  acknowledge(); await first; await second;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.snapshot.coins, initial.coins - appearanceProduct('inkwash_pack').price);
  assert.equal(session.snapshot.appearance.equipped.scene, 'minimal');
  acknowledge(); await third;
  assert.equal(published.length, 2);
  assert.equal(session.snapshot.appearance.equipped.scene, 'inkwash');
});

test('purchase saved before a lost reply reconciles durable ownership without another charge', async () => {
  const initial = fresh(); let disk = structuredClone(initial);
  const repo = { loadSave: async () => ({ snapshot: structuredClone(disk) }),
    saveGame: async (next) => { disk = structuredClone(next); throw new Error('reply lost'); } };
  const session = new GameSession(repo, () => NOW, () => 0);
  await session.load();
  await session.dispatch({ id: 'lost-purchase', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  const paid = session.snapshot.coins;
  await session.dispatch({ id: 'retried-with-new-id', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  assert.equal(session.snapshot.coins, paid);
  assert.deepEqual(session.snapshot.appearance.ownedProducts, ['inkwash_pack']);
});

test('purchase write rejection preserves the previous balance and ownership for retry', async () => {
  const initial = fresh(); let disk = structuredClone(initial), fail = true;
  const repo = { loadSave: async () => ({ snapshot: structuredClone(disk) }),
    saveGame: async (next) => { if (fail) throw new Error('disk full'); disk = structuredClone(next); return { snapshot: disk }; } };
  const session = new GameSession(repo, () => NOW, () => 0);
  await session.load();
  await assert.rejects(session.dispatch({ id: 'failed-purchase', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' }), /保存未确认/);
  assert.deepEqual(session.snapshot, initial);
  fail = false;
  await session.dispatch({ id: 'retry-purchase', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  assert.equal(session.snapshot.coins, initial.coins - appearanceProduct('inkwash_pack').price);
});

test('purchased and mixed art survives actual desktop repository restart and rejects future schemas', async (t) => {
  const { directory, repo } = await disk(t);
  const original = fresh();
  await repo.save(original);
  const purchased = buy(original);
  await repo.save(purchased);
  const equipped = equip(purchased, 'character', 'inkwash');
  await repo.save(equipped);
  assert.deepEqual((await createSaveRepository({ directory, validate: validateSave }).load()).snapshot, equipped);
  const future = envelope({ ...equipped, schemaVersion: STORAGE_CONFIG.schemaVersion + 1 });
  await fs.writeFile(path.join(directory, 'save-a.json'), future);
  await assert.rejects(repo.load(), { code: 'SAVE_NEWER_VERSION' });
  assert.equal(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8'), future);
});
