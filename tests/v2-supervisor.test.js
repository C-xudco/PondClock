import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { GameSession } from '../src/application/gameSession.js';
import { FOCUS_CONFIG } from '../src/config/focus.js';

const require = createRequire(import.meta.url);
const { importLegacyCopy } = require('../desktop/edition.cjs');
const NOW = Date.UTC(2026, 9, 28, 3);
let sequence = 0;
const command = (type, fields = {}) => ({ id: `supervisor:${++sequence}`, type, ...fields });
const initial = () => ({ ...createNewGame('jiangnan', NOW, { randomSeed: 7103 }), coins: 10000 });
const act = (state, type, fields = {}, now = state.lastEffectiveNowMs) => applyCommand(state, command(type, fields), now);
function memory(initialState) {
  let durable = structuredClone(initialState);
  const clock = { wall: initialState.lastEffectiveNowMs, mono: 0 };
  const repository = {
    loadSave: async () => ({ snapshot: structuredClone(durable) }),
    saveGame: async next => { durable = structuredClone(next); return { snapshot: structuredClone(next) }; },
  };
  return { repository, clock, session: new GameSession(repository, () => clock.wall, () => clock.mono) };
}
function openGauge(state) {
  let next = act(act(state, 'START_ACTIVE'), 'CAST_ACTIVE');
  while (next.fishing.phase === 'casting') next = act(next, 'ADVANCE_ACTIVE', {}, next.fishing.attempt.nextSwingAtMs);
  return next;
}
function evictCommands(state) {
  for (let i = 0; i < 130; i++) state = act(state, 'SETTINGS', { patch: { biteSoundVolume: i % 100 } });
  return state;
}
function withItems(state, types) {
  return validateSave({ ...state, catchSequence: types.length,
    items: types.map((type, index) => ({ uid: `supervisor-item:${index}`, type, status: 'found',
      catchSequence: index + 1, caughtAtMs: NOW, originRegionId: 'jiangnan', repairSeed: null,
      repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null })) });
}

test('supervisor: changing wall time cannot complete focus; only observed monotonic work earns credit', async () => {
  const h = memory(initial()); await h.session.load();
  await h.session.dispatch(command('START_FOCUS', { title: '真实经过的时间' }));
  h.clock.wall += 7 * 86400000;
  h.clock.mono += 5000;
  await h.session.dispatch(command('FOCUS_TICK', { elapsedMs: FOCUS_CONFIG.durationMs }));
  assert.equal(h.session.snapshot.focus.plan.elapsedMs, 5000);
  assert.equal(h.session.snapshot.focus.completedPlanIds.length, 0);
  h.clock.wall -= 14 * 86400000; h.clock.mono += 5000;
  await h.session.dispatch(command('PAUSE_FOCUS'));
  assert.equal(h.session.snapshot.focus.plan.elapsedMs, 10000);
  assert.equal(h.session.snapshot.focus.plan.status, 'paused');
});

test('supervisor: restart of a nearly completed focus pauses, then awards only after the remaining live second', async () => {
  let state = act(initial(), 'START_FOCUS', { title: '最后一秒' });
  state = validateSave({ ...state, focus: { ...state.focus,
    plan: { ...state.focus.plan, elapsedMs: FOCUS_CONFIG.durationMs - 1000 } } });
  const h = memory(state); h.clock.wall += 86400000;
  await h.session.load();
  assert.equal(h.session.snapshot.focus.plan.status, 'paused');
  assert.equal(h.session.snapshot.baitCount, state.baitCount);
  h.clock.mono += 5000; await h.session.dispatch(command('FOCUS_TICK'));
  assert.equal(h.session.snapshot.focus.plan.elapsedMs, FOCUS_CONFIG.durationMs - 1000);
  await h.session.dispatch(command('RESUME_FOCUS'));
  h.clock.mono += 1000; await h.session.dispatch(command('FOCUS_TICK'));
  assert.equal(h.session.snapshot.focus.plan, null);
  assert.equal(h.session.snapshot.baitCount, state.baitCount + 1);
  const second = new GameSession(h.repository, () => h.clock.wall, () => h.clock.mono);
  await second.load(); await second.dispatch(command('FOCUS_TICK'));
  assert.equal(second.snapshot.baitCount, state.baitCount + 1);
  assert.equal(second.snapshot.focus.completedPlanIds.length, 1);
});

test('supervisor: retrying an old focus checkpoint cannot consume newly observed time', async () => {
  const h = memory(initial()); await h.session.load();
  await h.session.dispatch(command('START_FOCUS', { title: '检查点重试' }));
  h.clock.mono = 5000;
  const checkpoint = command('FOCUS_TICK');
  await h.session.dispatch(checkpoint);
  assert.equal(h.session.snapshot.focus.plan.elapsedMs, 5000);
  h.clock.mono = 10000;
  await h.session.dispatch(checkpoint);
  await h.session.dispatch(command('FOCUS_TICK'));
  assert.equal(h.session.snapshot.focus.plan.elapsedMs, 10000);
});

test('supervisor: retrying an old gauge checkpoint cannot consume the remaining needle movement', async () => {
  const h = memory(openGauge(act(initial(), 'BUY_ACTIVE_PASS')));
  await h.session.load(); await h.session.dispatch(command('RESUME_ACTIVE_BAR'));
  h.clock.mono = 500;
  const checkpoint = command('TICK_ACTIVE');
  await h.session.dispatch(checkpoint);
  assert.equal(h.session.snapshot.fishing.attempt.gaugeElapsedMs, 500);
  h.clock.mono = 750;
  await h.session.dispatch(checkpoint);
  await h.session.dispatch(command('TICK_ACTIVE'));
  assert.equal(h.session.snapshot.fishing.attempt.gaugeElapsedMs, 750);
  assert.equal(h.session.snapshot.activePass.remaining, 14);
});

test('supervisor: a consumed15-use purchase receipt remains idempotent after command eviction and a newer bundle', () => {
  const receipt = command('BUY_ACTIVE_PASS');
  let state = applyCommand(initial(), receipt, NOW);
  for (let i = 0; i < 15; i++) state = act(openGauge(state), 'CANCEL_ACTIVE_BAR');
  assert.equal(state.activePass.remaining, 0);
  state = evictCommands(state);
  assert.ok(!state.recentCommittedCommandIds.includes(receipt.id));
  assert.strictEqual(applyCommand(state, receipt, state.lastEffectiveNowMs), state);
  state = act(state, 'BUY_ACTIVE_PASS');
  const before = structuredClone(state);
  assert.deepEqual(applyCommand(state, receipt, state.lastEffectiveNowMs), before);
  assert.equal(state.coins, 9100);
});

test('supervisor: a paid flight receipt cannot buy another trip after arrival and command eviction', () => {
  const receipt = command('START_TRAVEL', { toId: 'dongbei' });
  let state = applyCommand(initial(), receipt, NOW);
  state = act(state, 'ARRIVE', {}, state.travel.arriveAtMs);
  state = evictCommands(state);
  const before = structuredClone(state);
  assert.ok(!state.recentCommittedCommandIds.includes(receipt.id));
  assert.deepEqual(applyCommand(state, receipt, state.lastEffectiveNowMs), before);
  assert.equal(state.travel, null);
});

test('supervisor: duplicate discount items are retained and ticket/active-rod discounts redeem independently', () => {
  let state = withItems(initial(), ['ferry_token', 'ferry_token', 'scratched_compass', 'scratched_compass']);
  state = act(state, 'USE_ITEM', { uid: 'supervisor-item:0' });
  state = act(state, 'USE_ITEM', { uid: 'supervisor-item:2' });
  for (const uid of ['supervisor-item:1', 'supervisor-item:3'])
    assert.throws(() => act(state, 'USE_ITEM', { uid }), /同类/);
  assert.deepEqual(state.items.map(item => item.uid), ['supervisor-item:1', 'supervisor-item:3']);
  state = act(state, 'BUY_ACTIVE_PASS');
  assert.equal(state.coins, 9595); assert.equal(state.discounts.activeRod, null);
  assert.equal(state.discounts.ticket.sourceItemUid, 'supervisor-item:2');
  state = act(state, 'USE_ITEM', { uid: 'supervisor-item:1' });
  state = act(state, 'START_TRAVEL', { toId: 'taihu' });
  assert.equal(state.discounts.ticket, null);
  assert.equal(state.discounts.activeRod.sourceItemUid, 'supervisor-item:1');
  assert.equal(state.travel.farePaid, Math.round(state.travel.baseFare * .9));
  assert.deepEqual(state.items.map(item => item.uid), ['supervisor-item:3']);
});

function envelope(snapshot, version = 1) {
  return Buffer.from(JSON.stringify({ format: 'pondclock.save', envelopeVersion: version,
    revision: snapshot.revision, checksum: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), snapshot }) + '\n');
}
async function fixture(t) {
  const intendedDirectory = path.resolve('test-results');
  const root = await fs.mkdtemp(path.join(intendedDirectory, 'supervisor-copy-'));
  assert.equal(path.dirname(path.resolve(root)), intendedDirectory);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const legacyDirectory = path.join(root, 'old'), newDirectory = path.join(root, 'new');
  await fs.mkdir(legacyDirectory); await fs.mkdir(newDirectory);
  const old = { ...initial(), schemaVersion: 3, rodLevel: 1 };
  let copied = null;
  const repository = { load: async () => ({ snapshot: copied }), importLegacySnapshot: async snapshot => { copied = snapshot; } };
  return { root, legacyDirectory, newDirectory, old, repository, copied: () => copied };
}

test('supervisor: automatic legacy copy preserves exact old bytes and refuses to read source once destination has a save', async t => {
  const f = await fixture(t);
  const raw = envelope(f.old), name = path.join(f.legacyDirectory, 'save-a.json');
  await fs.writeFile(name, raw);
  const result = await importLegacyCopy({ ...f, validate: validateSave });
  assert.equal(result.imported, true);
  assert.deepEqual(await fs.readFile(name), raw);
  assert.equal(f.copied().schemaVersion, 4); assert.equal(f.copied().coins, 10600);
  const backups = await fs.readdir(path.join(f.newDirectory, 'legacy-copy'));
  assert.equal(backups.length, 1);
  assert.deepEqual(await fs.readFile(path.join(f.newDirectory, 'legacy-copy', backups[0])), raw);
  const neverRead = { readFile: async () => { throw new Error('Existing profile must not read old files'); } };
  assert.deepEqual(await importLegacyCopy({ ...f, validate: validateSave, fileSystem: neverRead }), { imported: false });
});

test('supervisor: a future legacy envelope prevents silently choosing its older sibling', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.legacyDirectory, 'save-a.json'), envelope(f.old));
  await fs.writeFile(path.join(f.legacyDirectory, 'save-b.json'), envelope({ ...f.old, revision: 1 }, 2));
  await assert.rejects(importLegacyCopy({ ...f, validate: validateSave }), /较新|未自动导入|兼容/);
  assert.equal(f.copied(), null);
  assert.deepEqual(await fs.readFile(path.join(f.legacyDirectory, 'save-b.json')), envelope({ ...f.old, revision: 1 }, 2));
});
