import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { catchOutcome, lootKindForSlot, itemSalePrice } from '../src/domain/loot.js';
import { GameSession } from '../src/application/gameSession.js';
import { FOCUS_CONFIG } from '../src/config/focus.js';
import { gaugePosition, gaugeBand } from '../src/config/activeFishing.js';

const NOW = Date.UTC(2026, 9, 27, 3);
let serial = 0;
const command = (type, fields = {}) => ({ id: `v2-test:${++serial}`, type, ...fields });
const action = (state, type, fields = {}, now = state.lastEffectiveNowMs) => applyCommand(state, command(type, fields), now);
const game = (seed = 1) => ({ ...createNewGame('jiangnan', NOW, { randomSeed: seed }), coins: 10000 });
function bite(state, useBait = false) {
  const waiting = action(state, 'START_FISHING', { useBait });
  return action(waiting, 'OPEN_BITE', {}, waiting.fishing.attempt.waitUntilMs);
}
function withItems(state, types) {
  const items = types.map((type, index) => ({ uid: `fixture:${type}:${index}`, type, status: 'found',
    catchSequence: index + 1, caughtAtMs: NOW, originRegionId: 'jiangnan', repairSeed: null,
    repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null }));
  return validateSave({ ...state, items, catchSequence: Math.max(state.catchSequence, items.length) });
}
function gauge(state) {
  let next = action(state, 'START_ACTIVE');
  next = action(next, 'CAST_ACTIVE');
  while (next.fishing.phase === 'casting') next = action(next, 'ADVANCE_ACTIVE', {}, next.fishing.attempt.nextSwingAtMs);
  return next;
}
function completePlan(state, title = '写作') {
  let next = action(state, 'START_FOCUS', { title });
  for (let i = 0; i < FOCUS_CONFIG.durationMs / 30000; i++) next = action(next, 'FOCUS_TICK', { elapsedMs: 30000 }, next.lastEffectiveNowMs + 30000);
  return next;
}
function memorySession(initial, options = {}) {
  let durable = structuredClone(initial), wall = initial.lastEffectiveNowMs, mono = 0;
  const repository = {
    loadSave: async () => ({ snapshot: structuredClone(durable) }),
    saveGame: async next => {
      if (options.beforeSave) await options.beforeSave(next, durable);
      durable = structuredClone(next);
      if (options.afterSave) await options.afterSave(next);
      return { snapshot: structuredClone(durable) };
    },
  };
  const session = new GameSession(repository, () => wall, () => mono);
  return { session, repository, durable: () => durable,
    advance: (ms, wallMs = ms) => { mono += ms; wall += wallMs; }, setWall: ms => { wall = ms; } };
}

test('v2: schema4 identity and one-time legacy compensation preserve original bytes and old trip', () => {
  const old = { ...game(), schemaVersion: 3, rodLevel: 2, coins: 100 };
  old.travel = { id: 'legacy-flight', fromId: 'jiangnan', toId: 'dongbei', departAtMs: NOW,
    arriveAtMs: NOW + 123456, farePaid: 4321, routesVersion: 1 };
  const before = JSON.stringify(old), migrated = validateSave(old);
  assert.equal(migrated.schemaVersion, 4); assert.equal(migrated.gameVersion, '2.0.1');
  assert.equal(migrated.editionId, 'first-focus'); assert.equal(migrated.rodLevel, 0);
  assert.equal(migrated.coins, 3300); assert.equal(migrated.legacy.rodCompensation, 3200);
  assert.equal(migrated.travel.farePaid, 4321); assert.equal(migrated.travel.arriveAtMs, NOW + 123456);
  assert.deepEqual(validateSave(migrated), migrated); assert.equal(JSON.stringify(old), before);
  assert.throws(() => validateSave({ ...migrated, schemaVersion: 5 }), /版本/);
  assert.throws(() => validateSave({ ...migrated, editionId: 'other-edition' }), /第一版/);
  assert.throws(() => validateSave({ ...game(), rodLevel: 1 }), /等级/);
});

test('v2: exact mutually exclusive loot weights and usable item direct prices', () => {
  const actual = {};
  for (let i = 0; i < 10000; i++) { const type = lootKindForSlot(i); actual[type] = (actual[type] || 0) + 1; }
  assert.deepEqual(actual, { fish: 7400, old_shoe: 500, waterlogged_watch: 400, influencer_manual: 200,
    rusty_tin_can: 300, river_shell: 300, ferry_token: 300, sealed_bait_box: 300, scratched_compass: 300 });
  for (const [type, price] of [['rusty_tin_can', 3], ['river_shell', 8], ['ferry_token', 25], ['sealed_bait_box', 30], ['scratched_compass', 18]])
    assert.equal(itemSalePrice({ type, status: 'found' }), price);
});

test('v2: manual capture100%, one attempt cannot be resolved twice or bypassed by old CATCH', () => {
  const opened = bite(game());
  const resolve = command('RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: true });
  const caught = applyCommand(opened, resolve, opened.lastEffectiveNowMs + 1);
  assert.equal(caught.catchSequence, 1); assert.equal(caught.bucket.length + caught.items.length, 1);
  assert.deepEqual(applyCommand(caught, resolve, caught.lastEffectiveNowMs), caught);
  assert.throws(() => action(caught, 'RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: false }), /鱼讯/);
  assert.throws(() => action(game(), 'CATCH', { expectedCatchSequence: 1 }), /事件/);
  const expired = bite(game(2));
  assert.throws(() => action(expired, 'RESOLVE_BITE', { attemptId: expired.fishing.attempt.id, manual: true }, expired.fishing.attempt.deadlineMs), /截止/);
});

test('v2: one automatic30% check per attempt; failed events consume attempt but no catch, bait or pity', () => {
  let successes = 0, failures = 0;
  for (let seed = 0; seed < 500; seed++) {
    const opened = bite(game(seed));
    const result = action(opened, 'RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: false }, opened.fishing.attempt.deadlineMs);
    if (result.catchSequence) successes++;
    else {
      failures++; assert.equal(result.pityCounter, opened.pityCounter); assert.equal(result.baitCount, opened.baitCount);
      assert.equal(result.fishing.attemptSequence, opened.fishing.attemptSequence + 1);
      assert.throws(() => action(result, 'RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: false }), /鱼讯/);
    }
  }
  assert.ok(successes > 110 && successes < 190, `seeded success count ${successes}`);
  assert.equal(successes + failures, 500);
});

test('v2: stopping consumes ordinary event; recovery never grants offline catch', () => {
  const opened = bite(game()), stopped = action(opened, 'STOP_FISHING');
  assert.equal(stopped.fishing.mode, 'stopped'); assert.equal(stopped.fishing.attempt, null);
  assert.throws(() => action(stopped, 'RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: false }, NOW + 10000000), /鱼讯/);
  const recovered = action(opened, 'RECOVER_RUNTIME', {}, NOW + 10000000);
  assert.equal(recovered.catchSequence, 0); assert.equal(recovered.fishing.mode, 'stopped');
});

test('v2: ordinary bait defaults off and consumes only chosen fish captures', () => {
  for (const enabled of [false, true]) {
    let opened;
    for (let seed = 1; seed < 1000; seed++) {
      const candidate = bite(game(seed), enabled);
      if (catchOutcome(candidate, { attemptSeed: candidate.fishing.attempt.seed, useBait: enabled }).kind === 'fish') { opened = candidate; break; }
    }
    const result = action(opened, 'RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: true });
    assert.equal(result.baitCount, opened.baitCount - Number(enabled));
    assert.equal(result.baitLeft, enabled ? 4 : 0);
  }
});

test('v2: four completed25-minute plans grant4 bait packs and exactly one durable day ticket', () => {
  const initial = game(); let state = initial;
  for (let i = 0; i < 4; i++) state = completePlan(state);
  assert.equal(state.baitCount, initial.baitCount + 4); assert.equal(state.freeTravelTickets, 1);
  assert.equal(state.focus.completedPlanIds.length, 4);
  assert.equal(Object.values(state.focus.days)[0].completedCount, 4);
  assert.equal(Object.values(state.focus.days)[0].ticketGranted, true);
  for (let i = 0; i < 140; i++) state = action(state, 'SETTINGS', { patch: { biteSoundVolume: i % 100 } });
  const reloaded = validateSave(structuredClone(state));
  const ticked = action(reloaded, 'FOCUS_TICK', { elapsedMs: 30000 });
  assert.equal(ticked.baitCount, state.baitCount); assert.equal(ticked.freeTravelTickets, 1);
  const fifth = completePlan(ticked); assert.equal(fifth.freeTravelTickets, 1);
});

test('v2: only one active focus, pause/cancel no awards, start-day does not change at midnight', () => {
  let state = action(game(), 'START_FOCUS', { title: '一件事' });
  const day = state.focus.plan.dayKey;
  assert.throws(() => action(state, 'START_FOCUS', { title: '并行' }), /一个/);
  state = action(state, 'PAUSE_FOCUS', { elapsedMs: 1000 });
  assert.equal(state.focus.plan.status, 'paused');
  state = action(state, 'FOCUS_TICK', { elapsedMs: 30000 }, NOW + 24 * 3600000);
  assert.equal(state.focus.plan.elapsedMs, 1000); assert.equal(state.focus.plan.dayKey, day);
  state = action(state, 'CANCEL_FOCUS'); assert.equal(state.focus.completedPlanIds.length, 0);
});

test('v2: ferry coupon activation retains second item; discounted balance, no stacking or failed spending', () => {
  let state = withItems(game(), ['ferry_token', 'ferry_token']);
  const first = state.items[0].uid, second = state.items[1].uid;
  state = action(state, 'USE_ITEM', { uid: first });
  assert.equal(state.discounts.activeRod.sourceItemUid, first);
  assert.throws(() => action(state, 'USE_ITEM', { uid: second }), /保留/);
  assert.equal(state.items[0].uid, second);
  assert.throws(() => action({ ...state, coins: 404 }, 'BUY_ACTIVE_PASS'), /不足/);
  assert.equal(state.discounts.activeRod.sourceItemUid, first);
  state = action({ ...state, coins: 405 }, 'BUY_ACTIVE_PASS');
  assert.equal(state.coins, 0); assert.equal(state.activePass.remaining, 15); assert.equal(state.discounts.activeRod, null);
  state = action(state, 'USE_ITEM', { uid: second });
  assert.throws(() => action({ ...state, coins: 999 }, 'BUY_ACTIVE_PASS'), /用完/);
  assert.ok(state.discounts.activeRod);
});

test('v2: active empty swings are free; gauge deducts one, white fails and green guarantees fish', () => {
  let state = action(game(), 'BUY_ACTIVE_PASS');
  const paid = state.coins;
  state = action(state, 'START_ACTIVE'); state = action(state, 'CAST_ACTIVE');
  const identity = state.fishing.attempt.id;
  state = action(state, 'ADVANCE_ACTIVE', {}, state.fishing.attempt.nextSwingAtMs);
  assert.equal(state.activePass.remaining, 15);
  while (state.fishing.phase === 'casting') state = action(state, 'ADVANCE_ACTIVE', {}, state.fishing.attempt.nextSwingAtMs);
  assert.equal(state.activePass.remaining, 14); assert.equal(state.fishing.attempt.id, identity);
  state = action(state, 'STOP_ACTIVE_BAR', { elapsedMs: 0, position: 5000 });
  assert.equal(state.catchSequence, 0); assert.equal(state.fishing.lastResult.success, false);
  state = gauge(state); const before = state.activePass.remaining, bait = state.baitCount, pity = state.pityCounter;
  state = action(state, 'STOP_ACTIVE_BAR', { elapsedMs: 750, position: 0 });
  assert.equal(state.activePass.remaining, before); assert.equal(state.bucket.length, 1); assert.equal(state.items.length, 0);
  assert.equal(state.baitCount, bait); assert.equal(state.pityCounter, pity); assert.equal(state.coins, paid);
});

test('v2: active15 gauge opportunities include failures and timeout, no purchase replay beyond128 commands', () => {
  const purchase = command('BUY_ACTIVE_PASS'); let state = applyCommand(game(), purchase, NOW);
  for (let i = 0; i < 15; i++) { state = gauge(state); state = action(state, 'CANCEL_ACTIVE_BAR'); }
  assert.equal(state.activePass.remaining, 0); assert.equal(state.catchSequence, 0);
  assert.throws(() => action(state, 'CAST_ACTIVE'), /准备/);
  for (let i = 0; i < 140; i++) state = action(state, 'SETTINGS', { patch: { biteSoundVolume: i % 100 } });
  assert.equal(state.recentCommittedCommandIds.includes(purchase.id), false);
  assert.equal(applyCommand(state, purchase, state.lastEffectiveNowMs), state);
  const newPass = action(state, 'BUY_ACTIVE_PASS');
  const timed = action(gauge(newPass), 'TICK_ACTIVE', { elapsedMs: 6000 });
  assert.equal(timed.activePass.remaining, 14); assert.equal(timed.catchSequence, 0);
});

test('v2: active recover pauses the same already-paid event without refund or reroll', () => {
  const bar = action(gauge(action(game(), 'BUY_ACTIVE_PASS')), 'TICK_ACTIVE', { elapsedMs: 500 });
  const recovered = action(validateSave(structuredClone(bar)), 'RECOVER_RUNTIME', {}, bar.lastEffectiveNowMs + 86400000);
  assert.equal(recovered.fishing.attempt.id, bar.fishing.attempt.id);
  assert.equal(recovered.fishing.attempt.gaugeRunning, false);
  assert.equal(recovered.activePass.remaining, bar.activePass.remaining);
  const resumed = action(recovered, 'RESUME_ACTIVE_BAR');
  const caught = action(resumed, 'STOP_ACTIVE_BAR', { elapsedMs: 250 });
  assert.equal(caught.bucket.length, 1);
});

test('v2: public gauge geometry is mirrored and follows white/red/yellow/green rates', () => {
  assert.equal(gaugePosition(750), 5000); assert.equal(gaugePosition(2250), 5000);
  assert.equal(gaugeBand(0).success, 0); assert.equal(gaugeBand(10000).success, 0);
  assert.equal(gaugeBand(1000).success, .1); assert.equal(gaugeBand(2250).success, .5);
  assert.equal(gaugeBand(3750).success, 1); assert.equal(gaugeBand(6250).success, .5);
});

test('v2: free travel does not consume compass; paid discount uses discounted balance and records base fare', () => {
  let state = game(); for (let i = 0; i < 4; i++) state = completePlan(state);
  state = withItems(state, ['scratched_compass']); state = action(state, 'USE_ITEM', { uid: state.items[0].uid });
  const coupon = state.discounts.ticket, coins = state.coins;
  const free = action(state, 'START_TRAVEL', { toId: 'dongbei', payment: 'free' });
  assert.equal(free.travel.farePaid, 0); assert.equal(free.freeTravelTickets, 0); assert.equal(free.coins, coins);
  assert.deepEqual(free.discounts.ticket, coupon);
  const arrived = action(free, 'ARRIVE', {}, free.travel.arriveAtMs);
  const paid = action(arrived, 'START_TRAVEL', { toId: 'jiangnan' });
  assert.equal(paid.travel.farePaid, Math.round(paid.travel.baseFare * .9)); assert.equal(paid.discounts.ticket, null);
});

test('v2: session ignores forged elapsed and freezes both runtime clocks across sleep', async () => {
  const harness = memorySession(game()); const { session } = harness; await session.load();
  await session.dispatch(command('START_FOCUS', { title: '工作' }));
  await session.dispatch(command('FOCUS_TICK', { elapsedMs: 1500000 }));
  assert.equal(session.snapshot.focus.plan.elapsedMs, 0);
  harness.advance(10000); await session.dispatch(command('FOCUS_TICK'));
  harness.advance(5000); session.suspendRuntimeClock();
  harness.advance(2 * 3600000); await session.dispatch(command('FOCUS_TICK'));
  assert.equal(session.snapshot.focus.plan.elapsedMs, 15000);
  await session.dispatch(command('RECOVER_RUNTIME')); session.resumeRuntimeClock();
  harness.advance(5000); await session.dispatch(command('FOCUS_TICK'));
  assert.equal(session.snapshot.focus.plan.elapsedMs, 15000); assert.equal(session.snapshot.focus.plan.status, 'paused');
});

test('v2: accepted manual click before deadline survives save-queue delay', async () => {
  const opened = bite(game()); const h = memorySession(opened); h.session.publish(opened);
  let release; const gate = new Promise(resolve => { release = resolve; });
  h.session.enqueue(() => gate);
  h.setWall(opened.fishing.attempt.deadlineMs - 1);
  const pending = h.session.dispatch(command('RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: true }));
  h.setWall(opened.fishing.attempt.deadlineMs + 1000); release();
  const result = await pending; assert.equal(result.catchSequence, 1);
});

test('v2: durable active purchase with lost receipt reconciles once', async () => {
  let fail = true;
  const h = memorySession(game(), { afterSave: async next => {
    if (fail && next.activePass.remaining === 15) { fail = false; throw new Error('receipt lost'); }
  } });
  await h.session.load(); const buy = command('BUY_ACTIVE_PASS');
  const bought = await h.session.dispatch(buy); assert.equal(bought.coins, 9550);
  assert.equal(bought.activePass.remaining, 15);
  assert.deepEqual(await h.session.dispatch(buy), bought);
});

test('v2: focus reward failed write retains elapsed credit for retry without duplicate bait', async () => {
  let initial = action(game(), 'START_FOCUS', { title: '最后五秒' });
  initial = validateSave({ ...initial, focus: { ...initial.focus, plan: { ...initial.focus.plan, elapsedMs: FOCUS_CONFIG.durationMs - 5000 } } });
  let fail = true;
  const h = memorySession(initial, { beforeSave: async (next, old) => {
    if (fail && next.focus.completedPlanIds.length > old.focus.completedPlanIds.length) { fail = false; throw new Error('disk full'); }
  } });
  await h.session.load(); await h.session.dispatch(command('RESUME_FOCUS')); h.advance(5000);
  await assert.rejects(h.session.dispatch(command('FOCUS_TICK')), /保存未确认/);
  assert.equal(h.session.snapshot.focus.completedPlanIds.length, 0);
  const done = await h.session.dispatch(command('FOCUS_TICK'));
  assert.equal(done.focus.completedPlanIds.length, 1); assert.equal(done.baitCount, initial.baitCount + 1);
  await h.session.dispatch(command('FOCUS_TICK')); assert.equal(h.session.snapshot.baitCount, done.baitCount);
});
