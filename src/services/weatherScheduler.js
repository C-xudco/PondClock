import { SERVICES_CONFIG } from "../config/services.js";

const isRateLimit = (error) => error?.status === 429 || /HTTP\s*429/.test(error?.message || "");
const noop = () => {};

/** Shared transport queue. UI cancellation never releases a real IPC slot. */
export function createWeatherScheduler({
  fetchSnapshot, now = Date.now, config = SERVICES_CONFIG.weather, storage,
  schedule = setTimeout, cancel = clearTimeout, autoWake = true,
  onCooldown = noop,
} = {}) {
  const jobs = new Map();
  const activeByKey = new Map();
  const attempts = [];
  const blockedUntil = new Map();
  const failureCounts = new Map();
  let enabled = true;
  let visible = true;
  let activeCount = 0;
  let lastStartedAt = -Infinity;
  let rateLimitedUntil = 0;
  let sequence = 0;
  let timer = null;
  let disposed = false;
  const savedKey = `${config.cooldownKey}:scheduler`;
  try {
    const saved = JSON.parse(storage?.getItem(savedKey) || "null");
    if (Number.isSafeInteger(saved?.rateLimitedUntil) && saved.rateLimitedUntil > now()) rateLimitedUntil = saved.rateLimitedUntil;
    for (const item of saved?.attempts || []) {
      if (typeof item.key === "string" && Number.isSafeInteger(item.at) && item.at <= now()
          && now() - item.at < config.budgetWindowMs && attempts.length < config.maxAttemptsPerWindow) attempts.push(item);
    }
    lastStartedAt = attempts.at(-1)?.at ?? -Infinity;
  } catch { /* Corrupt scheduling metadata never prevents offline play. */ }
  function prune() {
    while (attempts.length && now() - attempts[0].at >= config.budgetWindowMs) attempts.shift();
  }
  function persist() {
    try { storage?.setItem(savedKey, JSON.stringify({ rateLimitedUntil, attempts })); } catch { /* Best effort metadata only. */ }
  }
  function earliestFor(job) {
    prune();
    const pointAttempts = attempts.filter((item) => item.key === job.key);
    return Math.max(now(), lastStartedAt + config.startIntervalMs, rateLimitedUntil,
      blockedUntil.get(job.key) || 0,
      attempts.length >= config.maxAttemptsPerWindow ? attempts[0].at + config.budgetWindowMs : 0,
      pointAttempts.length >= config.maxPointAttemptsPerWindow ? pointAttempts[0].at + config.budgetWindowMs : 0);
  }
  function arm(at) {
    if (!autoWake || disposed || !enabled || !Number.isFinite(at)) return;
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; pump(); }, Math.max(1, at - now()));
    timer?.unref?.();
  }
  function publishQueued(job, retryAtMs) { job.onQueued?.({ retryAtMs }); }
  function pump() {
    if (disposed || !enabled || activeCount >= config.maxConcurrent) return;
    const queued = [...jobs.values()].filter((job) => !job.started && !activeByKey.has(job.key) && (visible || job.priority <= 1))
      .sort((a, b) => a.priority - b.priority
        || attempts.filter((item) => item.key === a.key).length - attempts.filter((item) => item.key === b.key).length
        || a.sequence - b.sequence);
    let wakeAt = Infinity;
    for (const job of queued) {
      const startAt = earliestFor(job);
      if (startAt > now()) { wakeAt = Math.min(wakeAt, startAt); publishQueued(job, startAt); continue; }
      start(job);
      if (activeCount >= config.maxConcurrent) break;
    }
    if (wakeAt < Infinity) arm(wakeAt);
  }
  function start(job) {
    job.started = true;
    activeByKey.set(job.key, job);
    job.controller = new AbortController();
    activeCount++;
    lastStartedAt = now();
    attempts.push({ key: job.key, at: now() });
    persist();
    job.onStart?.({ startedAtMs: now() });
    let transport;
    const operation = Promise.resolve().then(() => fetchSnapshot(job.location, {
      signal: job.controller.signal, now,
      onTransport: (promise) => { transport = Promise.resolve(promise); transport.catch(noop); },
    }));
    const reported = operation.then((snapshot) => {
      failureCounts.delete(job.key);
      blockedUntil.delete(job.key);
      if (!job.controller.signal.aborted && !disposed) job.onResult?.(snapshot);
      job.resolve(snapshot);
    }, (error) => {
      if (!job.controller.signal.aborted && !disposed) {
        const count = (failureCounts.get(job.key) || 0) + 1;
        failureCounts.set(job.key, count);
        const delay = Math.min(config.maxFailureRetryMs, config.failureRetryMs * 2 ** Math.min(count - 1, 10));
        if (isRateLimit(error)) {
          rateLimitedUntil = Math.max(rateLimitedUntil, now() + config.budgetWindowMs,
            Number.isSafeInteger(error?.retryAtMs) ? error.retryAtMs : 0);
          persist();
          onCooldown(rateLimitedUntil);
        }
        const retryAtMs = Math.max(now() + delay, rateLimitedUntil);
        blockedUntil.set(job.key, retryAtMs);
        job.onError?.(error, { retryAtMs });
      }
      job.resolve(null);
    });
    void reported.then(async () => {
      // requestEnvironmentJson's timeout/AbortSignal can settle at 6s while the
      // main process is still transporting until 8s. Keep counting that slot.
      if (transport) await transport.catch(noop);
      activeCount--;
      if (activeByKey.get(job.key) === job) activeByKey.delete(job.key);
      if (jobs.get(job.key) === job) jobs.delete(job.key);
      pump();
    });
  }
  function enqueue({ key, location, priority = 4, onStart, onResult, onError, onQueued } = {}) {
    if (disposed) return Promise.resolve(null);
    const existing = jobs.get(key);
    if (existing && !(existing.started && existing.controller.signal.aborted)) {
      existing.priority = Math.min(existing.priority, priority);
      pump();
      return existing.promise;
    }
    let resolve;
    const promise = new Promise((yes) => { resolve = yes; });
    const job = { key, location, priority, onStart, onResult, onError, onQueued, sequence: sequence++,
      promise, resolve, started: false };
    jobs.set(key, job);
    publishQueued(job, Math.max(rateLimitedUntil, blockedUntil.get(key) || 0));
    pump();
    return promise;
  }
  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) {
      if (timer !== null) cancel(timer);
      timer = null;
      for (const [key, job] of jobs) {
        if (job.started) job.controller.abort();
        else { jobs.delete(key); job.resolve(null); }
      }
    } else pump();
  }
  function dispose() { setEnabled(false); disposed = true; }
  return Object.freeze({ enqueue, pump, setEnabled, setVisible: (value) => { visible = value === true; pump(); }, dispose,
    cancelQueued: (key) => {
      const job = jobs.get(key);
      if (job && !job.started) { jobs.delete(key); job.resolve(null); }
    },
    getState: () => { prune(); return { activeCount, queuedCount: [...jobs.values()].filter((job) => !job.started).length,
      rateLimitedUntil, attempts: attempts.map((item) => ({ ...item })), lastStartedAt }; },
  });
}
