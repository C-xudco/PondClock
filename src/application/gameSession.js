import { createNewGame, applyCommand } from '../domain/gameState.js';
import { validateSave } from '../domain/saveSchema.js';

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
  }
  now = () => {
    const mono = this.monoClock();
    this.effective = Math.max(this.wallClock(), this.effective + Math.max(0, mono - this.prevMono));
    this.prevMono = mono;
    return Math.floor(this.effective);
  };
  publish(snapshot) {
    this.snapshot = snapshot;
    this.effective = Math.max(this.now(), snapshot.lastEffectiveNowMs);
    this.listeners.forEach((listener) => {
      try { listener(snapshot); } catch (error) { this.lastNotificationError = error; }
    });
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  async load() {
    const result = await this.repository.loadSave();
    if (result.snapshot) this.publish(validateSave(result.snapshot));
    return result;
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
    return this.enqueue(async () => {
      if (this.blocked || !this.snapshot) throw new Error('存档尚未准备好，请重启或稍后重试');
      const next = applyCommand(this.snapshot, command, this.now());
      if (next === this.snapshot) return next;
      return this.commit(next, command.id);
    });
  }
}
