const fs = require('node:fs/promises');
const path = require('node:path');

const SIZE_PRESETS = Object.freeze({
  compact: Object.freeze({ width: 420, height: 350 }),
  comfortable: Object.freeze({ width: 640, height: 490 }),
});
const MAX_STATE_BYTES = 4096;
const validCoordinate = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 1000000;

function normalizeWindowState(input) {
  if (!input || input.version !== 1 || !Object.hasOwn(SIZE_PRESETS, input.sizePreset) ||
      !validCoordinate(input.x) || !validCoordinate(input.y)) return null;
  // Never persist arbitrary input or any game-save fields in this small file.
  return { version: 1, sizePreset: input.sizePreset, x: input.x, y: input.y };
}

function resolveWindowPlacement(state, workAreas, { sizePreset, resetPosition = false } = {}) {
  const saved = normalizeWindowState(state);
  const preset = Object.hasOwn(SIZE_PRESETS, sizePreset) ? sizePreset : saved?.sizePreset || 'compact';
  const size = SIZE_PRESETS[preset];
  const areas = (Array.isArray(workAreas) ? workAreas : []).filter((area) => area &&
    validCoordinate(area.x) && validCoordinate(area.y) && Number.isSafeInteger(area.width) &&
    Number.isSafeInteger(area.height) && area.width > 0 && area.height > 0 &&
    area.width <= 100000 && area.height <= 100000);
  if (!areas.length) areas.push({ x: 0, y: 0, width: 1024, height: 768 });
  let area = areas[0]; // The caller supplies the primary display first.
  if (saved && !resetPosition) {
    const overlap = (candidate) => Math.max(0, Math.min(saved.x + size.width, candidate.x + candidate.width) -
      Math.max(saved.x, candidate.x)) * Math.max(0, Math.min(saved.y + size.height, candidate.y + candidate.height) -
      Math.max(saved.y, candidate.y));
    const distance = (candidate) => {
      const centerX = saved.x + size.width / 2;
      const centerY = saved.y + size.height / 2;
      const dx = centerX - Math.max(candidate.x, Math.min(centerX, candidate.x + candidate.width));
      const dy = centerY - Math.max(candidate.y, Math.min(centerY, candidate.y + candidate.height));
      return dx * dx + dy * dy;
    };
    for (const candidate of areas.slice(1)) {
      if (overlap(candidate) > overlap(area) ||
          (overlap(candidate) === overlap(area) && distance(candidate) < distance(area))) area = candidate;
    }
  }
  // A small work area can constrain a preset, while retaining its saved name.
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  const clamp = (value, lower, upper) => Math.max(lower, Math.min(value, upper));
  const x = clamp(saved && !resetPosition ? saved.x : area.x + area.width - width - 24,
    area.x, area.x + area.width - width);
  const y = clamp(saved && !resetPosition ? saved.y : area.y + area.height - height - 24,
    area.y, area.y + area.height - height);
  return { sizePreset: preset, bounds: { x, y, width, height } };
}

function createWindowStateRepository({ directory, fileSystem = fs, debounceMs = 250, onError = () => {} }) {
  const filename = path.join(directory, 'window-state.json');
  const temporary = `${filename}.tmp`;
  let pending = null;
  let timer;
  let tail = Promise.resolve(true);
  function report(error) {
    try { Promise.resolve(onError(error)).catch(() => {}); } catch { /* Layout is best effort. */ }
  }
  async function load() {
    try {
      if ((await fileSystem.stat(filename)).size > MAX_STATE_BYTES) return null;
      return normalizeWindowState(JSON.parse(await fileSystem.readFile(filename, 'utf8')));
    } catch (error) {
      if (error?.code !== 'ENOENT') report(error);
      return null;
    }
  }
  async function write(snapshot) {
    try {
      await fileSystem.mkdir(directory, { recursive: true });
      await fileSystem.writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', mode: 0o600 });
      await fileSystem.rename(temporary, filename);
      return true;
    } catch (error) {
      report(error);
      try { await fileSystem.unlink(temporary); } catch { /* A failed layout save never blocks the game. */ }
      return false;
    }
  }
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (pending) {
      const snapshot = pending;
      pending = null;
      tail = tail.then(() => write(snapshot));
    }
    return tail;
  }
  function schedule(state) {
    const normalized = normalizeWindowState(state);
    if (!normalized) return false;
    pending = normalized;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, debounceMs);
    timer.unref?.();
    return true;
  }
  return Object.freeze({ load, schedule, flush });
}

module.exports = { SIZE_PRESETS, normalizeWindowState, resolveWindowPlacement, createWindowStateRepository };
