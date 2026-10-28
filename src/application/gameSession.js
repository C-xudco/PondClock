import { createNewGame, applyCommand } from '../domain/gameState.js';
import { validateSave } from '../domain/saveSchema.js';
import { FOCUS_CONFIG } from '../config/focus.js';

export class GameSession {
  constructor(repository, wallClock = () => Date.now(), monoClock = () => performance.now()) {
    this.repository = repository;
    this.wallClock = wallClock;
    this.monoClock = monoClock;
    this.snapshot = null;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.effective = wallClock();
    this.prevMono = monoClock();
    this.blocked = false;
    this.runtimeAnchor = monoClock();
    this.runtimeClockFrozen = false;
    this.runtimeTotals = { focus: 0, active: 0 };
    this.runtimeConsumed = { focus: 0, active: 0 };
  }
  runtimeIdentity(channel, snapshot = this.snapshot) {
    if (channel === 'active') return snapshot?.fishing.phase === 'gauge'
      ? `${snapshot.fishing.attempt.id}:${snapshot.fishing.attempt.gaugeRunning}` : null;
    return snapshot?.focus.plan ? `${snapshot.focus.plan.id}:${snapshot.focus.plan.status}`
      : snapshot?.focus.breakRemainingMs > 0 ? `break:${snapshot.focus.completedPlanIds.at(-1)}` : null;
  }
  captureRuntimeClock() {
    const mono = this.monoClock();
    const delta = Math.max(0, mono - this.runtimeAnchor);
    this.runtimeAnchor = mono;
    if (this.runtimeClockFrozen || delta > FOCUS_CONFIG.maximumRuntimeGapMs) return;
    if (this.snapshot?.focus.plan?.status === 'running' || (!this.snapshot?.focus.plan && this.snapshot?.focus.breakRemainingMs > 0)) this.runtimeTotals.focus += delta;
    if (this.snapshot?.fishing.phase === 'gauge' && this.snapshot.fishing.attempt.gaugeRunning) this.runtimeTotals.active += delta;
  }
  peekRuntimeElapsed(channel) {
    if (!['focus', 'active'].includes(channel)) return 0;
    this.captureRuntimeClock();
    return Math.max(0, Math.floor(this.runtimeTotals[channel] - this.runtimeConsumed[channel]));
  }
  suspendRuntimeClock() { this.captureRuntimeClock(); this.runtimeClockFrozen = true; }
  resumeRuntimeClock() { this.runtimeAnchor = this.monoClock(); this.runtimeClockFrozen = false; }
  async suspend() {
    this.suspendRuntimeClock();
    await this.dispatch({ id: `suspend-focus:${this.snapshot?.revision}`, type: 'FOCUS_TICK' });
    await this.dispatch({ id: `suspend-active:${this.snapshot?.revision}`, type: 'TICK_ACTIVE' });
    return this.dispatch({ id: `suspend-recover:${this.snapshot?.revision}`, type: 'RECOVER_RUNTIME' });
  }
  now = () => {
    const mono = this.monoClock();
    this.effective = Math.max(this.wallClock(), this.effective + Math.max(0, mono - this.prevMono));
    this.prevMono = mono;
    return Math.floor(this.effective);
  };
  publish(snapshot) {
    this.captureRuntimeClock();
    for (const channel of ['focus', 'active']) {
      if (this.runtimeIdentity(channel) !== this.runtimeIdentity(channel, snapshot)) this.runtimeConsumed[channel] = this.runtimeTotals[channel];
    }
    this.snapshot = snapshot;
    this.effective = Math.max(this.now(), snapshot.lastEffectiveNowMs);
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { this.lastNotificationError = error; }
    });
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  async load() {
    const result = await this.repository.loadSave();
    if (result.snapshot) {
      this.publish(validateSave(result.snapshot));
      const command = { id: `recover:${this.snapshot.revision}:${this.snapshot.lastEffectiveNowMs}`, type: 'RECOVER_RUNTIME' };
      const recovered = applyCommand(this.snapshot, command, this.now());
      if (recovered !== this.snapshot) await this.commit(recovered, command.id);
      for (const channel of ['focus', 'active']) this.runtimeConsumed[channel] = this.runtimeTotals[channel];
    }
    return { ...result, snapshot: this.snapshot };
  }
  enqueue(task) {
    const work = this.queue.then(task);
    this.queue = work.catch(() => {});
    return work;
  }
  async commit(next, commandId) {
    try {
      const result = await this.repository.saveGame(next);
      const saved = validateSave(result.snapshot || next);
      if (saved.revision !== next.revision || saved.lastCommittedCommandId !== next.lastCommittedCommandId) throw new Error('存档提交确认不一致');
      this.publish(saved);
      return saved;
    } catch (error) {
      // A lost reply is not proof of rollback. Reconcile durable state before allowing another command.
      try {
        const result = await this.repository.loadSave();
        if (result.snapshot) {
          const saved = validateSave(result.snapshot);
          this.publish(saved);
          if (commandId && saved.recentCommittedCommandIds.includes(commandId)) return saved;
          if (!commandId && saved.revision === next.revision) return saved;
          if (saved.revision !== next.revision - 1) this.blocked = true;
        } else if (this.snapshot) this.blocked = true;
      } catch { this.blocked = true; }
      throw new Error(`保存未确认：${error.message}${this.blocked ? '；请重启应用以恢复存档' : '；进度已恢复，可重试'}`);
    }
  }
  initialize(regionId) {
    return this.enqueue(async () => {
      if (this.snapshot) return this.snapshot;
      if (this.blocked) throw new Error('存档状态待恢复，请重新启动');
      return this.commit(createNewGame(regionId, this.now()), null);
    });
  }
  dispatch(command) {
    this.captureRuntimeClock();
    const acceptedAtMs = this.now();
    const acceptedTotals = { ...this.runtimeTotals };
    const acceptedIdentity = { focus: this.runtimeIdentity('focus'), active: this.runtimeIdentity('active') };
    return this.enqueue(async () => {
      if (this.blocked || !this.snapshot) throw new Error('存档尚未准备好，请重启或稍后重试');
      // A replay acknowledges the old commit; it cannot spend runtime accrued
      // since that commit, because no new elapsed time reaches the domain.
      if (this.snapshot.recentCommittedCommandIds.includes(command.id)) return this.snapshot;
      const channel = ['FOCUS_TICK', 'PAUSE_FOCUS'].includes(command.type) ? 'focus'
        : ['TICK_ACTIVE', 'STOP_ACTIVE_BAR', 'PAUSE_ACTIVE_BAR'].includes(command.type) ? 'active' : null;
      const elapsedMs = channel && acceptedIdentity[channel] === this.runtimeIdentity(channel)
        ? Math.min(FOCUS_CONFIG.maximumRuntimeGapMs, Math.max(0, Math.floor(acceptedTotals[channel] - this.runtimeConsumed[channel]))) : 0;
      const consumedThrough = channel ? this.runtimeConsumed[channel] + elapsedMs : 0;
      const trusted = channel ? { ...command, elapsedMs } : command.type === 'RESOLVE_BITE'
        ? { ...command, inputAtMs: acceptedAtMs } : command;
      const next = applyCommand(this.snapshot, trusted, this.now());
      const saved = next === this.snapshot ? next : await this.commit(next, command.id);
      if (channel) this.runtimeConsumed[channel] = Math.max(this.runtimeConsumed[channel], consumedThrough);
      if (command.type === 'RECOVER_RUNTIME') for (const key of ['focus', 'active']) this.runtimeConsumed[key] = this.runtimeTotals[key];
      return saved;
    });
  }
}
