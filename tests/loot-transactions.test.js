import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { LOOT_CONFIG } from '../src/config/lootConfig.js';
import { FISH, BAIT_CATCHES, REGIONS, RODS } from '../src/lib/gameConfig.js';
import { catchOutcome, lootKindForSlot, repairForSlot, integerInRange, randomIntegerBelow, watchRepairOutcome, itemSalePrice } from '../src/domain/loot.js';
import { quoteSaleFish, quoteBucketSale, quoteFish } from '../src/domain/market.js';
import { openBite, findBite, capture, captureCommand } from './helpers/ordinaryCapture.js';
import { GameSession } from '../src/application/gameSession.js';

const NOW = Date.UTC(2026, 9, 25, 8);
const WEEK = 168 * 60 * 60 * 1000;
let serial = 0;
const action = (type, fields = {}) => ({ id: `loot-test-${++serial}`, type, ...fields });
const game = (seed = 1) => ({ ...createNewGame('jiangnan', NOW, { randomSeed: seed }), coins: 20000 });
const collect = (state) => capture(openBite(state));
const itemFixture = (type, sequence, extra = {}) => ({ uid: `item-${type}-${sequence}`, type, catchSequence: sequence,
  caughtAtMs: NOW, originRegionId: 'jiangnan', status: 'found', repairSeed: type === 'waterlogged_watch' ? sequence : null,
  repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null, ...extra });
const fishFixture = (sequence, extra = {}) => ({ uid: `fish-${sequence}`, speciesId: FISH[0].id, name: FISH[0].name,
  quality: 'common', length: 10, weight: (FISH[0].wt[0] + FISH[0].wt[1]) / 2,
  caughtAtMs: NOW, regionId: 'jiangnan', originRegionId: 'jiangnan', catchSequence: sequence, ...extra });
const withItems = (items) => validateSave({ ...game(), items, catchSequence: Math.max(...items.map((item) => item.catchSequence)) });

test('enumerate all 10000 mutually exclusive catch slots and all 1000 paid repair slots', () => {
  const loot = {}, repair = {};
  for (let slot = 0; slot < LOOT_CONFIG.denominator; slot++) {
    const kind = lootKindForSlot(slot); loot[kind] = (loot[kind] || 0) + 1;
  }
  let jackpot = 0;
  for (let slot = 0; slot < LOOT_CONFIG.repairDenominator; slot++) {
    const result = repairForSlot(slot, 0.5); repair[result.kind] = (repair[result.kind] || 0) + 1;
    if (result.salePrice === 10000) jackpot += 1;
  }
  assert.deepEqual(loot, LOOT_CONFIG.weights);
  assert.deepEqual(repair, LOOT_CONFIG.repairWeights);
  assert.equal(jackpot, 1);
  for (const bad of [-1, 10000, 0.5, NaN]) assert.throws(() => lootKindForSlot(bad));
});

test('repair integer ranges include both endpoints and only top branch can yield 10000', () => {
  assert.equal(repairForSlot(399).salePrice, 0);
  assert.equal(repairForSlot(400, 0).salePrice, 10);
  assert.equal(repairForSlot(949, 1 - Number.EPSILON).salePrice, 200);
  assert.equal(repairForSlot(950, 0).salePrice, 1000);
  assert.equal(repairForSlot(998, 1 - Number.EPSILON).salePrice, 9999);
  assert.equal(repairForSlot(999).salePrice, 10000);
  assert.throws(() => integerInRange([10, 200], 1));
  assert.equal(0.55 * 105 + 0.049 * 5499.5 + 0.001 * 10000, 337.2255);
  const values = [0xffffffff / 0x100000000, 1999 / 0x100000000];
  assert.equal(randomIntegerBelow(() => values.shift(), 1000), 999);
  assert.equal(values.length, 0, 'biased uint32 tail must be rejected before taking a uniform slot');
});

test('named capture streams keep item rates independent of rod/bait/quality and retry IDs', () => {
  const found = new Set();
  for (let seed = 0; seed < 12000 && found.size < Object.keys(LOOT_CONFIG.weights).length; seed++) {
    const base = game(seed);
    const outcome = catchOutcome(base);
    found.add(outcome.kind === 'fish' ? 'fish' : outcome.item.type);
    const modified = { ...base, rodLevel: RODS.length - 1, baitCount: 0, baitLeft: 0, pityCounter: 1000 };
    const improved = catchOutcome(modified, { bestClick: true });
    assert.equal(improved.kind, outcome.kind);
    if (outcome.kind === 'item') assert.deepEqual(improved, outcome);
  }
  assert.deepEqual(found, new Set(Object.keys(LOOT_CONFIG.weights)));
  const first = collect(game(1)), retry = collect(game(1));
  assert.deepEqual(first.bucket, retry.bucket);
});

test('nonfish captures are exclusive, leave bait/pity/codex alone and are schema-valid', () => {
  for (const type of Object.keys(LOOT_CONFIG.weights).filter(type => type !== 'fish')) {
    const base = findBite(seed => ({ ...game(seed), baitLeft: 3, pityCounter: 8 }), type);
    const next = capture(base);
    assert.equal(next.items.length, 1); assert.equal(next.items[0].type, type);
    assert.equal(next.bucket.length, 0); assert.deepEqual(next.codex, {});
    assert.equal(next.baitCount, base.baitCount); assert.equal(next.baitLeft, 3); assert.equal(next.pityCounter, 8);
    assert.equal(next.catchSequence, 1); assert.deepEqual(validateSave(next), next);
  }
});

test('new fish remains local, consumes bait once, and old catch replay fails beyond 128 command IDs', () => {
  const initial = findBite(game, 'fish');
  const catchCommand = captureCommand(initial);
  let next = applyCommand(initial, catchCommand, initial.lastEffectiveNowMs);
  assert.equal(next.baitLeft, BAIT_CATCHES - 1);
  const habitat = REGIONS.find((region) => region.id === 'jiangnan').fish.map(([id]) => id);
  assert.ok(habitat.includes(next.bucket[0].speciesId));
  next = applyCommand(next, action('SELL_ALL'), NOW);
  for (let index = 0; index < 140; index++) next = applyCommand(next, action('SETTINGS', { patch: { biteSoundVolume: index % 100 } }), NOW);
  assert.equal(next.recentCommittedCommandIds.includes(catchCommand.id), false);
  assert.throws(() => applyCommand(next, catchCommand, NOW), /鱼讯/);
  assert.throws(() => applyCommand(next, action('CATCH', { expectedCatchSequence: 2, fish: fishFixture(2) }), NOW), /收竿事件/);
  assert.equal(next.bucket.length, 0);
});

test('shoe and unopened watch sell once at fixed prices, manuals cannot be sold', () => {
  let state = withItems([itemFixture('old_shoe', 1), itemFixture('waterlogged_watch', 2), itemFixture('influencer_manual', 3)]);
  const before = state.coins;
  state = applyCommand(state, action('SELL_ITEM', { uid: 'item-old_shoe-1' }), NOW);
  state = applyCommand(state, action('SELL_ITEM', { uid: 'item-waterlogged_watch-2' }), NOW);
  assert.equal(state.coins, before + 51);
  assert.throws(() => applyCommand(state, action('SELL_ITEM', { uid: 'item-old_shoe-1' }), NOW));
  assert.throws(() => applyCommand(state, action('SELL_ITEM', { uid: 'item-influencer_manual-3' }), NOW));
});

test('repair charges 500 and saves a fixed terminal outcome; failed balance and second repair change nothing', () => {
  const state = withItems([itemFixture('waterlogged_watch', 1)]);
  const original = structuredClone(state);
  assert.throws(() => applyCommand({ ...state, coins: 499 }, action('REPAIR_ITEM', { uid: state.items[0].uid }), NOW));
  assert.deepEqual(state, original);
  const repaired = applyCommand(state, action('REPAIR_ITEM', { uid: state.items[0].uid }), NOW);
  assert.equal(repaired.coins, state.coins - 500);
  assert.equal(repaired.items[0].status, 'repaired');
  assert.equal(repaired.items[0].repairAttempted, true);
  assert.deepEqual({ kind: repaired.items[0].repairOutcome, salePrice: repaired.items[0].salePrice }, watchRepairOutcome(state.items[0]));
  const restored = validateSave(JSON.parse(JSON.stringify(repaired)));
  assert.throws(() => applyCommand(restored, action('REPAIR_ITEM', { uid: state.items[0].uid }), NOW));
  const sold = applyCommand(restored, action('SELL_ITEM', { uid: state.items[0].uid }), NOW);
  assert.equal(sold.coins, repaired.coins + itemSalePrice(restored.items[0]));
});

test('repair retry, lost receipt, restart and sell/repair races cannot reroll or charge twice', async () => {
  const initial = withItems([itemFixture('waterlogged_watch', 1)]);
  let disk = structuredClone(initial), writes = 0, failing = true;
  const repo = { loadSave: async () => ({ snapshot: structuredClone(disk) }), saveGame: async (next) => {
    writes += 1; if (failing) throw new Error('disk full before rename'); disk = structuredClone(next); throw new Error('reply lost');
  } };
  const session = new GameSession(repo, () => NOW, () => 0); await session.load();
  await assert.rejects(session.dispatch(action('REPAIR_ITEM', { uid: initial.items[0].uid })));
  assert.deepEqual(session.snapshot, initial);
  failing = false;
  const saved = await session.dispatch(action('REPAIR_ITEM', { uid: initial.items[0].uid }));
  assert.equal(saved.coins, initial.coins - 500); assert.equal(writes, 2);
  assert.equal(saved.items[0].salePrice, watchRepairOutcome(initial.items[0]).salePrice);
  const restarted = new GameSession(repo, () => NOW, () => 0); await restarted.load();
  await assert.rejects(restarted.dispatch(action('REPAIR_ITEM', { uid: initial.items[0].uid })));
  assert.equal(writes, 2);
  const results = await Promise.allSettled([
    restarted.dispatch(action('SELL_ITEM', { uid: initial.items[0].uid })),
    restarted.dispatch(action('REPAIR_ITEM', { uid: initial.items[0].uid })),
  ]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.equal(disk.items.length, 0); assert.equal(writes, 3);
});

test('terminal item receipts do not depend on the bounded recent-command history', () => {
  let state = withItems([itemFixture('waterlogged_watch', 1), itemFixture('influencer_manual', 2)]);
  const repair = action('REPAIR_ITEM', { uid: 'item-waterlogged_watch-1' });
  const use = action('USE_ITEM', { uid: 'item-influencer_manual-2' });
  state = applyCommand(state, repair, NOW); state = applyCommand(state, use, NOW);
  for (let index = 0; index < 140; index++) state = applyCommand(state, action('SETTINGS', { patch: { biteSoundVolume: index % 100 } }), NOW);
  const before = structuredClone(state);
  assert.equal(state.recentCommittedCommandIds.includes(repair.id), false);
  assert.throws(() => applyCommand(state, repair, NOW)); assert.throws(() => applyCommand(state, use, NOW));
  assert.deepEqual(state, before);
});

test('using a manual consumes it atomically, excludes same-millisecond old fish, and blocks stacking', () => {
  const manual = itemFixture('influencer_manual', 2), spare = itemFixture('influencer_manual', 3);
  let state = validateSave({ ...game(), catchSequence: 3, items: [manual, spare], bucket: [fishFixture(1)] });
  const used = action('USE_ITEM', { uid: manual.uid });
  state = applyCommand(state, used, NOW);
  assert.equal(state.items.length, 1); assert.equal(state.saleBuff.activationCatchSequence, 3);
  assert.equal(quoteSaleFish(state.bucket[0], state, NOW).buffApplied, false);
  assert.throws(() => applyCommand(state, action('USE_ITEM', { uid: spare.uid }), NOW));
  assert.deepEqual(applyCommand(state, used, NOW), state);
  assert.equal(state.items[0].uid, spare.uid);
});

test('only three fresh post-use fish gain 50%; old fish, items and exactly 168h fish do not spend charges', () => {
  const buff = { version: 1, activationCatchSequence: 2, remaining: 3, sourceItemUid: 'consumed-manual' };
  let state = validateSave({ ...game(), catchSequence: 8, lastEffectiveNowMs: NOW + WEEK, saleBuff: buff,
    bucket: [fishFixture(1, { caughtAtMs: NOW + WEEK }), fishFixture(3), ...[4, 5, 6, 7].map((seq) => fishFixture(seq, { caughtAtMs: NOW + WEEK }))],
    items: [itemFixture('old_shoe', 8)] });
  state = applyCommand(state, action('SELL_ONE', { uid: 'fish-1' }), NOW + WEEK);
  state = applyCommand(state, action('SELL_ITEM', { uid: 'item-old_shoe-8' }), NOW + WEEK);
  const expired = quoteSaleFish(state.bucket.find((fish) => fish.uid === 'fish-3'), state, NOW + WEEK);
  assert.equal(expired.price, 1); assert.equal(expired.buffApplied, false);
  state = applyCommand(state, action('SELL_ONE', { uid: 'fish-3' }), NOW + WEEK);
  assert.equal(state.saleBuff.remaining, 3);
  for (let seq = 4; seq <= 7; seq++) {
    const fish = state.bucket.find((entry) => entry.uid === `fish-${seq}`);
    const base = quoteFish(fish, state.currentRegion, NOW + WEEK).price;
    const quote = quoteSaleFish(fish, state, NOW + WEEK);
    assert.equal(quote.price, seq < 7 ? Math.round(base * 1.5) : base);
    const before = state.coins;
    state = applyCommand(state, action('SELL_ONE', { uid: fish.uid }), NOW + WEEK);
    assert.equal(state.coins - before, quote.price);
  }
  assert.equal(state.saleBuff.remaining, 0);
});

test('batch uses catchSequence/uid order, rounds per fish and agrees with the same single-sale order', () => {
  const state = validateSave({ ...game(), catchSequence: 6,
    bucket: [6, 4, 1, 3, 5].map((sequence) => fishFixture(sequence)),
    saleBuff: { version: 1, activationCatchSequence: 2, remaining: 3, sourceItemUid: 'consumed' } });
  const preview = quoteBucketSale(state, NOW);
  assert.deepEqual(preview.quotes.map((quote) => quote.uid), ['fish-1', 'fish-3', 'fish-4', 'fish-5', 'fish-6']);
  assert.equal(state.saleBuff.remaining, 3);
  const batch = applyCommand(state, action('SELL_ALL'), NOW);
  let single = state;
  for (const { uid } of preview.quotes) single = applyCommand(single, action('SELL_ONE', { uid }), NOW);
  assert.equal(batch.coins, single.coins); assert.equal(batch.coins - state.coins, preview.price);
  assert.equal(batch.saleBuff.remaining, single.saleBuff.remaining); assert.equal(batch.saleBuff.remaining, 0);
});

test('eligible odd-priced fish round the50% buff per fish rather than on the aggregate', () => {
  const specimen = FISH.map((species) => ({ ...fishFixture(2), speciesId: species.id, name: species.name, weight: species.wt[0] }))
    .find((fish) => quoteFish(fish, 'jiangnan', NOW).price % 2 === 1);
  assert.ok(specimen, 'the current market must provide an odd-coin fixture');
  const base = quoteFish(specimen, 'jiangnan', NOW).price;
  const state = validateSave({ ...game(), catchSequence: 3,
    bucket: [{ ...specimen, uid: 'odd-a', catchSequence: 2 }, { ...specimen, uid: 'odd-b', catchSequence: 3 }],
    saleBuff: { version: 1, activationCatchSequence: 1, remaining: 3, sourceItemUid: 'used' } });
  const quote = quoteBucketSale(state, NOW), each = Math.round(base * 1.5);
  assert.deepEqual(quote.quotes.map((fish) => fish.price), [each, each]);
  assert.equal(quote.price, each * 2); assert.notEqual(quote.price, Math.round(2 * base * 1.5));
  assert.equal(applyCommand(state, action('SELL_ALL'), NOW).coins - state.coins, each * 2);
});

test('buff qualification and charges persist through JSON, region changes, then next activation excludes existing fish', () => {
  let state = validateSave({ ...game(), catchSequence: 4, bucket: [fishFixture(3)],
    saleBuff: { version: 1, activationCatchSequence: 2, remaining: 1, sourceItemUid: 'used' },
    items: [itemFixture('influencer_manual', 4)] });
  state = applyCommand(state, action('GEO_VISIT', { regionId: 'dongbei' }), NOW);
  state = applyCommand(state, action('REAL_VISIT'), NOW);
  state = validateSave(JSON.parse(JSON.stringify(state)));
  assert.equal(quoteSaleFish(state.bucket[0], state, NOW).buffApplied, true);
  const oldFish = state.bucket[0];
  state = applyCommand(state, action('SELL_ONE', { uid: oldFish.uid }), NOW);
  state = applyCommand(state, action('USE_ITEM', { uid: 'item-influencer_manual-4' }), NOW);
  assert.equal(state.saleBuff.activationCatchSequence, 4); assert.equal(state.saleBuff.remaining, 3);
  assert.equal(quoteSaleFish(oldFish, state, NOW).buffApplied, false);
});

test('arrival event is committed only for actual arrival and consume watermarks survive replay and restart', () => {
  let state = game();
  state = applyCommand(state, action('GEO_VISIT', { regionId: 'dongbei' }), NOW);
  assert.equal(state.arrivalEvent, null);
  state = applyCommand(state, action('REAL_VISIT'), NOW);
  assert.equal(state.arrivalEvent.regionId, 'dongbei'); assert.equal(state.arrivalConsumedSequence, 0);
  const event = state.arrivalEvent;
  state = applyCommand(state, action('CONSUME_ARRIVAL', { sequence: event.sequence }), NOW);
  state = validateSave(JSON.parse(JSON.stringify(state)));
  const noOp = applyCommand(state, action('REAL_VISIT'), NOW);
  assert.equal(noOp, state); assert.equal(state.arrivalConsumedSequence, event.sequence);
  assert.equal(applyCommand(state, action('CONSUME_ARRIVAL', { sequence: event.sequence }), NOW), state);
});

test('schema rejects inconsistent item terminals, shared IDs/sequences, buff fields, audio and watermark values', () => {
  const valid = withItems([itemFixture('waterlogged_watch', 1)]);
  const invalid = [
    { items: [{ ...valid.items[0], repairSeed: -1 }] },
    { items: [{ ...valid.items[0], salePrice: 10000 }] },
    { items: [{ ...valid.items[0], status: 'repaired', repairAttempted: true, salePrice: 10000 }] },
    { items: [valid.items[0], { ...itemFixture('old_shoe', 1), uid: 'different-id' }] },
    { saleBuff: { version: 1, activationCatchSequence: 2, remaining: 3, sourceItemUid: 'used' } },
    { saleBuff: { version: 1, activationCatchSequence: 0, remaining: 4, sourceItemUid: 'used' } },
    { settings: { ...valid.settings, biteSoundVolume: 101 } },
    { settings: { ...valid.settings, backgroundBiteSound: 'true' } },
    { arrivalConsumedSequence: 1 },
    { catchSequence: 0 },
  ];
  for (const patch of invalid) assert.throws(() => validateSave({ ...valid, ...patch }));
});
