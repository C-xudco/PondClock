import test from 'node:test';
import assert from 'node:assert/strict';
import { FishingRuntimePump, acceptsActiveKey, clockLabel, fishingView } from '../src/hooks/fishingRuntime.js';
import { GameSession } from '../src/application/gameSession.js';
import { createNewGame } from '../src/domain/gameState.js';

const NOW = Date.UTC(2026, 9, 27, 4);
function fakeRuntime(snapshot) {
  const calls = [];
  const session = { snapshot, blocked: false };
  const dispatch = async (type, fields = {}) => { calls.push({ type, fields }); return session.snapshot; };
  return { session, calls, pump: new FishingRuntimePump({ session, dispatch }) };
}

test('active keys only work in the focused gauge without editable targets or repeated/IME input', () => {
  const event = { key: 'a', target: { closest: () => null } };
  assert.equal(acceptsActiveKey(event), true);
  assert.equal(acceptsActiveKey({ ...event, key: 'Escape' }), true);
  for (const patch of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { defaultPrevented: true }]) {
    assert.equal(acceptsActiveKey({ ...event, ...patch }), false);
  }
  for (const options of [{ focused: false }, { paused: true }, { blocked: true }]) assert.equal(acceptsActiveKey(event, options), false);
  for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'F5', 'F11']) assert.equal(acceptsActiveKey({ ...event, key }), false);
  const edit = { ...event, target: { closest: selector => selector.includes('textarea') ? {} : null } };
  assert.equal(acceptsActiveKey(edit), false);
  const button = { ...event, target: { closest: selector => selector.startsWith('button') ? {} : null } };
  assert.equal(acceptsActiveKey(button), false);
  assert.equal(acceptsActiveKey(button, { insideGauge: true }), true);
});

test('ordinary pump opens only a fresh persisted bite and settles an expired bite once per timer pass', async () => {
  const fixture = fakeRuntime({ focus: {}, fishing: { mode: 'ordinary', phase: 'waiting', attempt: { id: 'one', waitUntilMs: NOW + 1000 } } });
  await fixture.pump.tick(NOW, 0);
  assert.equal(fixture.calls.length, 0);
  await fixture.pump.tick(NOW + 1000, 1000);
  assert.equal(fixture.calls[0].type, 'OPEN_BITE');
  fixture.session.snapshot.fishing = { mode: 'ordinary', phase: 'bite', attempt: { id: 'one', deadlineMs: NOW + 3000 } };
  await fixture.pump.tick(NOW + 2000, 2000);
  assert.equal(fixture.calls.length, 1);
  await fixture.pump.tick(NOW + 3000, 3000);
  assert.deepEqual(fixture.calls[1], { type: 'RESOLVE_BITE', fields: { attemptId: 'one', manual: false } });
});

test('stale waits and suspended scheduling recover instead of giving unseen automatic fish', async () => {
  const fixture = fakeRuntime({ focus: {}, fishing: { mode: 'ordinary', phase: 'waiting', attempt: { id: 'old', waitUntilMs: NOW - 20001 } } });
  await fixture.pump.tick(NOW, 0);
  assert.equal(fixture.calls[0].type, 'RECOVER_RUNTIME');
  fixture.session.snapshot.fishing.phase = 'bite';
  fixture.session.snapshot.fishing.attempt.deadlineMs = NOW + 1000;
  await fixture.pump.tick(NOW + 60000, 60000);
  assert.equal(fixture.calls[1].type, 'RECOVER_RUNTIME');
  assert.ok(fixture.calls.every(call => call.type !== 'RESOLVE_BITE'));
});

test('stopped fishing still checkpoints focus and never starts a fishing command', async () => {
  const fixture = fakeRuntime({ focus: { plan: { status: 'running' } }, fishing: { mode: 'stopped' } });
  await fixture.pump.tick(NOW, 0);
  await fixture.pump.tick(NOW + 4999, 4999);
  assert.equal(fixture.calls.length, 0);
  await fixture.pump.tick(NOW + 5000, 5000);
  assert.deepEqual(fixture.calls.map(call => call.type), ['FOCUS_TICK']);
});

test('inflight timer save cannot enqueue a duplicate command, and a live slow save is not mistaken for sleep', async () => {
  let finish;
  const calls = [];
  const session = { snapshot: { focus: {}, fishing: { mode: 'ordinary', phase: 'waiting', attempt: { waitUntilMs: NOW } } } };
  const pump = new FishingRuntimePump({ session, dispatch: async type => {
    calls.push(type);
    if (type === 'OPEN_BITE') return new Promise(resolve => { finish = () => resolve(session.snapshot); });
    return session.snapshot;
  } });
  const first = pump.tick(NOW, 0);
  for (let seconds = 1; seconds <= 12; seconds++) await pump.tick(NOW + seconds * 1000, seconds * 1000);
  assert.deepEqual(calls, ['OPEN_BITE']);
  finish(); await first;
  session.snapshot.fishing = { mode: 'stopped' };
  await pump.tick(NOW + 12250, 12250);
  assert.deepEqual(calls, ['OPEN_BITE']);
});

test('active animations advance from persisted swing deadline; a paused gauge never ticks', async () => {
  const fixture = fakeRuntime({ focus: {}, fishing: { mode: 'active', phase: 'casting', attempt: { id: 'cast', nextSwingAtMs: NOW + 3000 } } });
  await fixture.pump.tick(NOW, 0);
  await fixture.pump.tick(NOW + 3000, 3000);
  assert.equal(fixture.calls[0].type, 'ADVANCE_ACTIVE');
  fixture.session.snapshot.fishing = { mode: 'active', phase: 'gauge', attempt: { id: 'cast', gaugeRunning: false } };
  await fixture.pump.tick(NOW + 4000, 4000);
  assert.equal(fixture.calls.length, 1);
  fixture.session.snapshot.fishing.attempt.gaugeRunning = true;
  await fixture.pump.tick(NOW + 5000, 5000);
  assert.equal(fixture.calls[1].type, 'TICK_ACTIVE');
});

test('view projection has no phantom countdown while stopped or travelling', () => {
  const state = { fishing: { mode: 'ordinary', phase: 'bite', attempt: { deadlineMs: NOW + 2500 } } };
  assert.equal(fishingView(state, NOW).windowLeft, 3);
  assert.equal(fishingView({ ...state, travel: { id: 'trip' } }, NOW).status, 'stopped');
  assert.equal(fishingView({ fishing: { mode: 'stopped' } }, NOW).waitLeft, 0);
  assert.equal(clockLabel(1500000), '25:00');
  assert.equal(clockLabel(-1), '00:00');
});

function realRuntime() {
  const time = { wall: NOW, mono: 0 };
  const repository = {
    disk: { ...createNewGame('jiangnan', NOW, { randomSeed: 51 }), coins: 5000 },
    async loadSave() { return { snapshot: structuredClone(this.disk) }; },
    async saveGame(next) { this.disk = structuredClone(next); return { snapshot: structuredClone(next) }; },
  };
  const session = new GameSession(repository, () => time.wall, () => time.mono);
  const dispatch = (type, fields = {}) => session.dispatch({ id: crypto.randomUUID(), type, ...fields });
  const pump = new FishingRuntimePump({ session, dispatch });
  const advance = milliseconds => { time.wall += milliseconds; time.mono += milliseconds; };
  return { time, session, pump, dispatch, advance };
}

test('real session + pump records an automatic attempt without requiring a click or replaying offline work', async () => {
  const f = realRuntime();
  await f.session.load();
  await f.dispatch('START_FISHING');
  const wait = f.session.snapshot.fishing.attempt.waitUntilMs - f.time.wall;
  // Observed regular callbacks, rather than skipping directly across a sleeping interval.
  for (let ms = 0; ms < wait; ms += 1000) { f.advance(Math.min(1000, wait - ms)); await f.pump.tick(f.time.wall, f.time.mono); }
  assert.equal(f.session.snapshot.fishing.phase, 'bite');
  const attemptId = f.session.snapshot.fishing.attempt.id;
  for (let i = 0; i < 20; i++) { f.advance(1000); await f.pump.tick(f.time.wall, f.time.mono); }
  assert.equal(f.session.snapshot.fishing.lastResult.attemptId, attemptId);
  assert.equal(f.session.snapshot.fishing.lastResult.mode, 'ordinary');
  const catches = f.session.snapshot.catchSequence;
  f.advance(60000); await f.pump.tick(f.time.wall, f.time.mono);
  assert.equal(f.session.snapshot.fishing.mode, 'stopped');
  assert.equal(f.session.snapshot.catchSequence, catches);
});

test('real active flow consumes a gauge once and a green stop saves exactly one fish', async () => {
  const f = realRuntime();
  await f.session.load();
  await f.dispatch('BUY_ACTIVE_PASS');
  await f.dispatch('START_ACTIVE');
  await f.dispatch('CAST_ACTIVE');
  await f.pump.tick(f.time.wall, f.time.mono);
  while (f.session.snapshot.fishing.phase === 'casting') {
    f.advance(3000); await f.pump.tick(f.time.wall, f.time.mono);
  }
  assert.equal(f.session.snapshot.fishing.phase, 'gauge');
  assert.equal(f.session.snapshot.activePass.remaining, 14);
  assert.equal(f.session.snapshot.bucket.length, 0);
  f.advance(750);
  await f.dispatch('STOP_ACTIVE_BAR');
  assert.equal(f.session.snapshot.fishing.phase, 'ready');
  assert.equal(f.session.snapshot.bucket.length, 1);
  assert.equal(f.session.snapshot.fishing.lastResult.success, true);
  assert.equal(f.session.snapshot.activePass.remaining, 14);
});
