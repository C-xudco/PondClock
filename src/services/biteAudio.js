const soundUrl = new URL('../assets/audio/bite-plop.wav', import.meta.url).href;

/** Ephemeral bite tokens deliberately never queue behind autoplay or visibility. */
export class BiteAudio {
  constructor({ createAudio = () => new Audio(soundUrl), now = Date.now, hidden = () => document.hidden,
    onBlocked = () => {} } = {}) {
    this.createAudio = createAudio; this.now = now; this.hidden = hidden; this.onBlocked = onBlocked;
    this.audio = null; this.seen = new Set(); this.blocked = false; this.notified = false; this.disposed = false;
  }
  getAudio() {
    if (!this.audio) { this.audio = this.createAudio(); this.audio.preload = 'auto'; }
    return this.audio;
  }
  async unlock() {
    if (this.disposed) return false;
    try {
      const audio = this.getAudio();
      audio.volume = 0;
      await audio.play(); audio.pause(); audio.currentTime = 0;
      this.blocked = false; return true;
    } catch { this.blocked = true; return false; }
  }
  async bite({ id, expiresAtMs }, settings = {}) {
    if (this.disposed || !id || this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    if (this.now() >= expiresAtMs || settings.biteSoundEnabled === false || settings.biteSoundVolume === 0
      || (this.hidden() && settings.backgroundBiteSound === false)) return false;
    try {
      const audio = this.getAudio();
      audio.volume = Math.min(1, Math.max(0, (settings.biteSoundVolume ?? 35) / 100));
      audio.currentTime = 0;
      await audio.play(); this.blocked = false; return true;
    } catch {
      this.blocked = true;
      if (!this.notified) { this.notified = true; this.onBlocked(); }
      return false;
    }
  }
  invalidate() { if (this.audio) { this.audio.pause(); this.audio.currentTime = 0; } }
  dispose() { this.disposed = true; this.invalidate(); this.audio = null; }
}
