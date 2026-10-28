import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { STORAGE_CONFIG } from '../src/config/storage.js';
import { GameSession } from '../src/application/gameSession.js';
import { watchRepairOutcome, lootKindForSlot, repairKindForSlot } from '../src/domain/loot.js';
import { quoteBucketSale, quoteSaleFish, compareCatchOrder } from '../src/domain/market.js';
import { FISH, REGIONS, RODS, BITE, JUDGE } from '../src/lib/gameConfig.js';
import { FISHING_CONFIG } from '../src/config/fishing.js';
import { randInt, qualityById } from '../src/lib/gameUtils.js';

import { FishingRuntimePump, fishingView, localDayKey, RUNTIME_INTERVAL_MS } from '../src/hooks/fishingRuntime.js';
import { ACTIVE_FISHING_CONFIG, gaugePosition } from '../src/config/activeFishing.js';
import { FOCUS_CONFIG } from '../src/config/focus.js';
import { findBite, capture, captureCommand } from './helpers/ordinaryCapture.js';

const { createSaveRepository, checksum } = createRequire(import.meta.url)('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 25, 10);
const clone = (value) => structuredClone(value);
const freshGame = (extra = {}) => validateSave({ ...createNewGame('jiangnan', NOW - 10 * 86400000, { randomSeed: 19 }), lastEffectiveNowMs: NOW, ...extra });
const envelope = (snapshot) => JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  revision: snapshot.revision, checksum: checksum(snapshot), snapshot });

async function disk(t, fileSystem) {
  const parent = path.resolve('tests', '.tmp');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'review-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), parent);
    assert.ok(path.basename(directory).startsWith('review-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, repo: createSaveRepository({ directory, validate: validateSave, fileSystem }) };
}

test('review: explicit conflict recovery import remains authoritative after restart', async (t) => {
  const { directory, repo } = await disk(t);
  await fs.writeFile(path.join(directory, 'save-a.json'), envelope(freshGame({ revision: 9, coins: 101 })));
  await fs.writeFile(path.join(directory, 'save-b.json'), envelope(freshGame({ revision: 9, coins: 202 })));
  await assert.rejects(repo.load(), { code: 'SAVE_CONFLICT' });
  const imported = await repo.importSnapshot(freshGame({ coins: 777 }));
  assert.equal(imported.snapshot.coins, 777);
  const restarted = createSaveRepository({ directory, validate: validateSave });
  assert.equal((await restarted.load()).snapshot.coins, 777, 'import receipt must match the next load');
});

test('review: ENOENT during backup write is not mistaken for a missing original', async (t) => {
  const fileSystem = { ...fs, writeFile: async (filename, ...args) => {
    if (String(filename).includes(`.pre-schema${STORAGE_CONFIG.schemaVersion}-`)) throw Object.assign(new Error('backup directory unavailable'), { code: 'ENOENT' });
    return fs.writeFile(filename, ...args);
  } };
  const { directory, repo } = await disk(t, fileSystem);
  const old = clone(freshGame()); old.schemaVersion = 1;
  old.settings = { onlineEnhancements: false, alwaysOnTop: true };
  const filename = path.join(directory, 'save-a.json'), original = envelope(old);
  await fs.writeFile(filename, original);
  await assert.rejects(repo.load(), { code: 'SAVE_MIGRATION_FAILED' });
  assert.equal(await fs.readFile(filename, 'utf8'), original);
});

test('review: independently enumerate the complete loot and paid-repair denominators', () => {
  const tally = (size, fn) => Array.from({ length: size }, (_, index) => fn(index))
    .reduce((counts, kind) => ({ ...counts, [kind]: (counts[kind] || 0) + 1 }), {});
  assert.deepEqual(tally(10000, lootKindForSlot), { fish: 7400, old_shoe: 500, waterlogged_watch: 400, influencer_manual: 200, rusty_tin_can: 300, river_shell: 300, ferry_token: 300, sealed_bait_box: 300, scratched_compass: 300 });
  assert.deepEqual(tally(1000, repairKindForSlot), { failed: 400, ordinary: 550, luxury: 49, top: 1 });
});

test('review: mixed-age preview and all permutations of batch/single sales agree without spending preview charges', () => {
  const species = FISH[0];
  const fish = (index) => ({ uid: `review-fish-${index}`, speciesId: species.id, quality: 'common', length: 12, weight: 0.04,
    caughtAtMs: index === 5 ? NOW - 168 * 3600000 : NOW, originRegionId: 'jiangnan', catchSequence: index });
  const original = freshGame({ catchSequence: 9, bucket: Array.from({ length: 9 }, (_, index) => fish(index + 1)),
    saleBuff: { version: 1, activationCatchSequence: 2, remaining: 3, sourceItemUid: 'review-used-manual' } });
  for (let rotation = 0; rotation < original.bucket.length; rotation += 1) {
    const bucket = original.bucket.slice(rotation).concat(original.bucket.slice(0, rotation)).reverse();
    const state = validateSave({ ...original, bucket }), before = clone(state), quote = quoteBucketSale(state, NOW);
    assert.deepEqual(state, before);
    assert.equal(quote.buffUsed, 3);
    assert.equal(quote.quotes.find((entry) => entry.uid === 'review-fish-5').price, 1);
    assert.equal(quote.quotes.find((entry) => entry.uid === 'review-fish-5').buffApplied, false);
    const batch = applyCommand(state, { type: 'SELL_ALL', id: `review-batch-${rotation}` }, NOW);
    let single = state;
    for (const [index, entry] of [...bucket].sort(compareCatchOrder).entries()) {
      const preview = quoteSaleFish(entry, single, NOW);
      const next = applyCommand(single, { type: 'SELL_ONE', uid: entry.uid, id: `review-single-${rotation}-${index}` }, NOW);
      assert.equal(next.coins - single.coins, preview.price);
      single = next;
    }
    assert.equal(batch.coins - state.coins, quote.price);
    assert.equal(batch.coins, single.coins);
    assert.equal(batch.saleBuff.remaining, single.saleBuff.remaining);
  }
});

test('review: paid repair survives unknown acknowledgment and its replay after command-history eviction', async () => {
  const initial = findBite(seed => freshGame({ randomSeed: seed, coins: 1000 }), 'waterlogged_watch');
  const catchEvent = captureCommand(initial);
  let durable = capture(initial);
  const item = durable.items[0], expected = watchRepairOutcome(item);
  let lost = true;
  const repository = { loadSave: async () => ({ snapshot: clone(durable) }), saveGame: async (next) => {
    durable = clone(next);
    if (lost) { lost = false; throw new Error('receipt lost after durable write'); }
    return { snapshot: clone(durable) };
  } };
  const session = new GameSession(repository, () => NOW, () => 0);
  await session.load();
  const repaired = await session.dispatch({ type: 'REPAIR_ITEM', uid: item.uid, id: 'review-paid-repair' });
  assert.equal(repaired.coins, 500);
  assert.equal(repaired.items[0].salePrice, expected.salePrice);
  for (let index = 0; index < 140; index += 1) {
    await session.dispatch({ type: 'SETTINGS', patch: { alwaysOnTop: index % 2 === 0 }, id: `review-setting-${index}` });
  }
  assert.equal(session.snapshot.recentCommittedCommandIds.includes('review-paid-repair'), false);
  await assert.rejects(session.dispatch({ type: 'REPAIR_ITEM', uid: item.uid, id: 'review-paid-repair' }), /已经修过/);
  assert.equal(session.snapshot.coins, 500);
  assert.equal(session.snapshot.items[0].salePrice, expected.salePrice);
  await assert.rejects(session.dispatch(catchEvent), /鱼讯/);
});

// Execute the actual hook callbacks with injected lifecycle primitives and actual
// GameSession. Effects are deliberately not mounted: this is not a browser/UI test.
async function hookHarness(initial, { importSnapshot } = {}) {
  let durable = clone(initial), arrivals = 0;
  const repository = { loadSave: async () => ({ snapshot: clone(durable) }),
    saveGame: async (next) => { durable = clone(next); return { snapshot: clone(durable) }; },
    importSave: async () => { durable = clone(importSnapshot); return { canceled: false }; } };
  class FixedSession extends GameSession {
    constructor(repo) { super(repo, () => NOW, () => 0); this.publish(clone(initial)); }
  }
  class Director {
    reset() {}
    arrival() { arrivals += 1; return null; }
  }
  let index = 0;
  const useState = (initializer) => {
    const value = index === 2 ? clone(initial) : typeof initializer === 'function' ? initializer() : initializer;
    index += 1;
    return [value, () => {}];
  };
  const dependencies = { useState, useCallback: (fn) => fn, useRef: (value) => ({ current: value }), useEffect: () => {},
    toast: { success() {}, error() {}, info() {} }, GameSession: FixedSession, applyCommand,
    createRepository: () => repository, RODS, BITE, JUDGE, FISH, REGIONS, FISHING_CONFIG,
    randInt, qualityById, FishingRuntimePump, fishingView, localDayKey, RUNTIME_INTERVAL_MS, ACTIVE_FISHING_CONFIG, gaugePosition, FOCUS_CONFIG, DialogueDirector: Director, BiteAudio: class {}, itemName: () => 'item' };
  const source = (await fs.readFile(new URL('../src/hooks/useFishingGame.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.env.DEV', 'false')
    .replace('export function useFishingGame()', 'function useFishingGame()');
  const factory = new Function(...Object.keys(dependencies), `${source}\nreturn useFishingGame;`);
  const hook = factory(...Object.values(dependencies))();
  return { hook, getSnapshot: () => clone(durable), arrivalCount: () => arrivals };
}

test('review: concurrent real-visit callbacks speak once for one durable arrival', async () => {
  const initial = freshGame({ realRegion: 'dongbei', unlockedRegions: ['jiangnan', 'dongbei'] });
  const harness = await hookHarness(initial);
  await Promise.all([harness.hook.visitRealRegion(), harness.hook.visitRealRegion()]);
  assert.equal(harness.getSnapshot().arrivalSequence, 1);
  assert.equal(harness.getSnapshot().arrivalConsumedSequence, 1);
  assert.equal(harness.arrivalCount(), 1, 'a no-op competing visit must not emit the same arrival twice');
});

test('review: import consumes old arrival without speaking and without nested-enqueue deadlock', async () => {
  const initial = freshGame();
  const imported = applyCommand({ ...initial, realRegion: 'dongbei', unlockedRegions: ['jiangnan', 'dongbei'] },
    { type: 'REAL_VISIT', id: 'review-imported-old-arrival' }, NOW);
  const harness = await hookHarness(initial, { importSnapshot: imported });
  let timer;
  try {
    await Promise.race([harness.hook.importSave(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('import queue deadlock')), 1000); })]);
  } finally { clearTimeout(timer); }
  assert.equal(harness.getSnapshot().arrivalConsumedSequence, 1);
  assert.equal(harness.arrivalCount(), 0);
});
