// Browser/Electron scheduling helpers. State changes still belong to persisted commands.
export const RUNTIME_INTERVAL_MS = 250;
export const FOCUS_CHECKPOINT_MS = 5000;
export const ACTIVE_CHECKPOINT_MS = 1000;
export const MAX_SCHEDULING_GAP_MS = 10000;

export function clockLabel(milliseconds) {
  const seconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
}

export function localDayKey(nowMs) {
  const date = new Date(nowMs);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

export function acceptsActiveKey(event, { focused = true, paused = false, blocked = false, insideGauge = false } = {}) {
  if (!focused || paused || blocked || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'ContextMenu', 'F1', 'F4', 'F5', 'F11', 'F12'].includes(event.key)) return false;
  const target = event.target;
  if (target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"],[data-no-active-key]')) return false;
  if (!insideGauge && target?.closest?.('button,a,[role="button"]')) return false;
  return true;
}

export function fishingView(state, nowMs) {
  const fishing = state?.fishing;
  const attempt = fishing?.attempt;
  if (!fishing || state.travel || fishing.mode === 'stopped') return { status: 'stopped', waitLeft: 0, windowLeft: 0, activePhase: 'stopped' };
  if (fishing.mode === 'active') return { status: 'idle', waitLeft: 0, windowLeft: 0,
    activePhase: fishing.phase === 'gauge' ? (attempt?.gaugeRunning ? 'bar' : 'paused') : fishing.phase };
  return { status: fishing.phase === 'bite' ? 'bite' : 'idle',
    waitLeft: fishing.phase === 'waiting' ? Math.max(0, Math.ceil(((attempt?.waitUntilMs || 0) - nowMs) / 1000)) : 0,
    windowLeft: fishing.phase === 'bite' ? Math.max(0, Math.ceil(((attempt?.deadlineMs || 0) - nowMs) / 1000)) : 0,
    activePhase: 'stopped' };
}

// One timer pump for persisted ordinary attempts, active animations and focus checkpoints.
// An inflight guard prevents a slow save from queuing many copies of the same timer command.
export class FishingRuntimePump {
  constructor({ session, dispatch }) {
    this.session = session;
    this.dispatch = dispatch;
    this.busy = false;
    this.reset();
  }
  reset(monoMs = null) {
    this.lastMono = monoMs;
    this.lastFocusMono = monoMs;
    this.lastActiveMono = monoMs;
    this.retryAfterMono = 0;
  }
  async tick(nowMs, monoMs) {
    const previous = this.lastMono;
    this.lastMono = monoMs;
    if (this.busy || !this.session.snapshot || this.session.blocked || monoMs < this.retryAfterMono) return null;
    this.lastFocusMono ??= monoMs;
    this.lastActiveMono ??= monoMs;
    this.busy = true;
    try {
      if (previous !== null && monoMs - previous > MAX_SCHEDULING_GAP_MS) {
        // A suspended renderer must never replay missed fish or cash out an unseen gauge.
        const result = await this.dispatch('RECOVER_RUNTIME');
        this.reset(monoMs);
        return result;
      }
      const focus = this.session.snapshot.focus;
      if ((focus?.plan?.status === 'running' || focus?.breakRemainingMs > 0)
        && monoMs - this.lastFocusMono >= FOCUS_CHECKPOINT_MS) {
        this.lastFocusMono = monoMs;
        if (!await this.dispatch('FOCUS_TICK')) { this.retryAfterMono = monoMs + FOCUS_CHECKPOINT_MS; return null; }
      }
      const current = this.session.snapshot;
      if (current.travel || current.fishing?.mode === 'stopped') return null;
      const fishing = current.fishing;
      const attempt = fishing?.attempt;
      if (!attempt) return null;
      let command = null;
      let fields = {};
      if (fishing.mode === 'ordinary') {
        if (fishing.phase === 'waiting' && nowMs >= attempt.waitUntilMs) {
          // This fallback also guards a stale initial wait loaded from an old live renderer.
          command = nowMs >= attempt.waitUntilMs + 20000 ? 'RECOVER_RUNTIME' : 'OPEN_BITE';
        } else if (fishing.phase === 'bite' && nowMs >= attempt.deadlineMs) {
          command = 'RESOLVE_BITE'; fields = { attemptId: attempt.id, manual: false };
        }
      } else if (fishing.mode === 'active') {
        if (fishing.phase === 'casting' && nowMs >= attempt.nextSwingAtMs) command = 'ADVANCE_ACTIVE';
        if (fishing.phase === 'gauge' && attempt.gaugeRunning && monoMs - this.lastActiveMono >= ACTIVE_CHECKPOINT_MS) {
          this.lastActiveMono = monoMs;
          command = 'TICK_ACTIVE';
        }
      }
      if (!command) return null;
      const result = await this.dispatch(command, fields);
      if (!result) this.retryAfterMono = monoMs + FOCUS_CHECKPOINT_MS;
      return result;
    } finally { this.busy = false; }
  }
}
