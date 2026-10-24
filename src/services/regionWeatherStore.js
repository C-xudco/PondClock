import { SERVICES_CONFIG } from "../config/services.js";
import { SCENE_SITES, sceneSiteForRegion } from "../data/sceneSites.js";
import { browserStorage } from "./environment.js";
import { createWeatherScheduler } from "./weatherScheduler.js";
import { fetchWeatherSnapshot, readSnapshotCache, simulatedSnapshot, snapshotLocation,
  validWeatherSnapshot, writeSnapshotCache } from "./weatherSnapshot.js";

export const sceneWeatherTargetKey = (site) => `scene:${site.siteId}@${site.siteRevision}`;
export const weatherErrorMessage = (code) => code === "HTTP_429" ? "天气服务请求受限，稍后自动更新。"
  : code === "OFFLINE" ? "网络离线，正在使用缓存或离线景色。"
    : code === "TIMEOUT" ? "天气请求超时，稍后自动重试。"
      : code ? "天气暂时不可用，正在使用缓存或离线景色。" : null;
const errorCodeFor = (error) => error?.status === 429 || /HTTP\s*429/.test(error?.message || "") ? "HTTP_429"
  : Number.isInteger(error?.status) ? `HTTP_${error.status}`
    : error?.code === "ENV_TIMEOUT" || error?.name === "AbortError" ? "TIMEOUT"
      : error?.code === "ENV_RESPONSE_INVALID" ? "INVALID_RESPONSE" : "NETWORK_ERROR";

/** The only runtime weather owner: header, scene and viewer are selectors. */
export function createRegionWeatherStore({
  storage = browserStorage(), now = Date.now, fetchSnapshot = fetchWeatherSnapshot,
  connected = () => globalThis.navigator?.onLine !== false, config = SERVICES_CONFIG.weather,
  schedulerOptions = {}, sites = SCENE_SITES,
} = {}) {
  const targets = new Map();
  const listeners = new Set();
  let enabled = false;
  let networkEpoch = 0;
  let headerKey = null;
  let currentRegion = "jiangnan";
  let viewerRegion = null;
  let destinationRegion = null;
  let version = 0;
  let state;
  const emit = () => {
    state = Object.freeze({ version: ++version, enabled, headerKey,
      entries: Object.freeze(Object.fromEntries([...targets].map(([key, value]) => [key, value.entry]))) });
    for (const listener of listeners) listener();
  };
  function register(targetKey, location, place) {
    const existing = targets.get(targetKey);
    if (existing) { existing.place = place; return existing; }
    const target = { location: snapshotLocation(location), place,
      entry: { targetKey, generation: 0, snapshot: null, status: "idle", errorCode: null, retryAtMs: 0, lastAttemptAtMs: null } };
    target.entry.snapshot = readSnapshotCache(storage, target.location, now()) || simulatedSnapshot(target.location);
    targets.set(targetKey, target);
    return target;
  }
  for (const site of Object.values(sites)) {
    if (site.weatherLocation) register(sceneWeatherTargetKey(site), site.weatherLocation, site.place);
  }
  const siteFor = (regionId) => sites[regionId] || Object.values(sites)[0];
  const keyFor = (regionId) => sceneWeatherTargetKey(siteFor(regionId));
  function priorityFor(key) {
    if (key === headerKey || key === keyFor(currentRegion)) return 0;
    if (viewerRegion && key === keyFor(viewerRegion)) return 1;
    if (destinationRegion && key === keyFor(destinationRegion)) return 2;
    return 4;
  }
  function update(key, patch) {
    const target = targets.get(key);
    if (!target) return;
    const next = { ...target.entry, ...patch };
    if (Object.entries(next).every(([name, value]) => target.entry[name] === value)) return;
    target.entry = next;
    emit();
  }
  function matching(locationKey, patch) {
    for (const [key, target] of targets) {
      if (target.location.key === locationKey) update(key, typeof patch === "function" ? patch(target.entry) : patch);
    }
  }
  function fallback(target) {
    const current = target.entry.snapshot;
    return readSnapshotCache(storage, target.location, now())
      || (validWeatherSnapshot(current, target.location, now()) ? { ...current, source: "cached" } : simulatedSnapshot(target.location));
  }
  const checkedFetch = async (location, options) => {
    const next = await fetchSnapshot(location, options);
    if (!validWeatherSnapshot(next, location, now())) {
      throw Object.assign(new Error("天气回复与请求不一致"), { code: "ENV_RESPONSE_INVALID" });
    }
    return next;
  };
  const scheduler = createWeatherScheduler({ fetchSnapshot: checkedFetch, now, config, storage, ...schedulerOptions,
    onCooldown: (retryAtMs) => {
      for (const [key, target] of targets) {
        update(key, { snapshot: fallback(target), status: "degraded", errorCode: "HTTP_429", retryAtMs });
      }
    },
  });
  function refreshTarget(targetKey, reason = "context") {
    const target = targets.get(targetKey);
    if (!target) return Promise.resolve(null);
    if (!enabled || !connected()) {
      update(targetKey, { snapshot: fallback(target), status: "degraded", errorCode: enabled ? "OFFLINE" : null });
      return Promise.resolve(target.entry);
    }
    const snapshot = target.entry.snapshot;
    const schedulerState = scheduler.getState();
    if (schedulerState.rateLimitedUntil > now()) {
      update(targetKey, { snapshot: fallback(target), status: "degraded", errorCode: "HTTP_429", retryAtMs: schedulerState.rateLimitedUntil });
      return Promise.resolve(target.entry);
    }
    const fresh = validWeatherSnapshot(snapshot, target.location, now())
      && now() - snapshot.fetchedAtMs < config.refreshMs && now() - snapshot.observedAtMs < config.refreshMs;
    if (fresh && reason !== "manual") {
      if (target.entry.errorCode === "OFFLINE") update(targetKey, { errorCode: null, status: "ready", retryAtMs: 0 });
      return Promise.resolve(target.entry);
    }
    if (reason === "manual" && target.entry.lastAttemptAtMs !== null && now() - target.entry.lastAttemptAtMs < config.manualThrottleMs) {
      return Promise.resolve(target.entry);
    }
    const epoch = networkEpoch;
    const location = target.location;
    if (target.entry.status !== "refreshing") update(targetKey, { snapshot: fallback(target), status: "queued" });
    return scheduler.enqueue({ key: location.key, location, priority: priorityFor(targetKey),
      onQueued: ({ retryAtMs }) => {
        if (networkEpoch === epoch) matching(location.key, { status: "queued", retryAtMs });
      },
      onStart: ({ startedAtMs }) => {
        if (networkEpoch === epoch) matching(location.key, (entry) => ({ status: "refreshing", generation: entry.generation + 1,
          lastAttemptAtMs: startedAtMs, errorCode: null, retryAtMs: 0 }));
      },
      onResult: (next) => {
        if (networkEpoch !== epoch) return;
        if (![...targets.values()].some((other) => other.location.key === location.key)) return;
        if (!validWeatherSnapshot(next, location, now())) {
          matching(location.key, { status: "degraded", errorCode: "INVALID_RESPONSE", retryAtMs: now() + config.failureRetryMs });
          return;
        }
        writeSnapshotCache(storage, location, next, now());
        matching(location.key, { snapshot: { ...next, source: "online" }, status: "ready", errorCode: null, retryAtMs: 0 });
      },
      onError: (error, { retryAtMs }) => {
        if (networkEpoch !== epoch) return;
        for (const [key, other] of targets) {
          if (other.location.key === location.key) update(key, { snapshot: fallback(other), status: "degraded",
            errorCode: errorCodeFor(error), retryAtMs });
        }
      },
    }).then(() => targets.get(targetKey)?.entry || null);
  }
  function prefetchAll(reason = "prefetch") {
    const keys = [...targets.keys()].sort((a, b) => priorityFor(a) - priorityFor(b));
    // Each pass has 12 scene points plus the single current header point.
    return Promise.all(keys.map((key) => refreshTarget(key, reason)));
  }
  function setHeaderLocation(location, { refresh = true } = {}) {
    const next = snapshotLocation(location);
    const nextKey = `header:${next.key}`;
    if (headerKey === nextKey && targets.get(headerKey)?.place === location.place) return headerKey;
    if (headerKey && headerKey !== nextKey) {
      const oldLocationKey = targets.get(headerKey)?.location.key;
      targets.delete(headerKey);
      if (oldLocationKey && ![...targets.values()].some((target) => target.location.key === oldLocationKey)) scheduler.cancelQueued(oldLocationKey);
    }
    headerKey = nextKey;
    register(headerKey, next, location.place);
    emit();
    if (refresh) void prefetchAll("header-context");
    return headerKey;
  }
  function setEnabled(value) {
    const nextEnabled = value === true;
    if (enabled === nextEnabled) return;
    enabled = nextEnabled;
    networkEpoch++;
    scheduler.setEnabled(enabled && connected());
    for (const [key, target] of targets) update(key, { generation: target.entry.generation + 1,
      snapshot: fallback(target), status: "idle", errorCode: null });
    emit();
    if (enabled) void prefetchAll("enabled");
  }
  function offline() {
    networkEpoch++;
    scheduler.setEnabled(false);
    for (const [key, target] of targets) update(key, { generation: target.entry.generation + 1,
      snapshot: fallback(target), status: "degraded", errorCode: enabled ? "OFFLINE" : null });
  }
  function resume(reason = "online") {
    scheduler.setEnabled(enabled && connected());
    void prefetchAll(reason);
  }
  emit();
  return Object.freeze({ subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state, getEntry: (targetKey) => targets.get(targetKey)?.entry || null,
    getRegionEntry: (regionId) => targets.get(keyFor(regionId))?.entry || null,
    getHeaderEntry: () => targets.get(headerKey)?.entry || null,
    setHeaderLocation, setEnabled, prefetchAll, refreshTarget, offline, resume,
    setCurrentRegion: (regionId) => { currentRegion = regionId; void refreshTarget(keyFor(regionId)); },
    setViewerRegion: (regionId) => { viewerRegion = regionId; if (regionId) void refreshTarget(keyFor(regionId)); },
    setDestinationRegion: (regionId) => { destinationRegion = regionId; if (regionId) void refreshTarget(keyFor(regionId)); },
    setVisible: (visible) => scheduler.setVisible(visible),
    refreshRegion: (regionId, reason = "manual") => refreshTarget(keyFor(regionId), reason),
    refreshHeader: (reason = "manual") => headerKey ? refreshTarget(headerKey, reason) : Promise.resolve(null),
    getDiagnostics: () => { const data = scheduler.getState(); return { activeCount: data.activeCount,
      queuedCount: data.queuedCount, attemptsInWindow: data.attempts.length, retryAtMs: data.rateLimitedUntil }; },
    dispose: () => { networkEpoch++; scheduler.dispose(); listeners.clear(); },
  });
}

let sharedStore;
export const getRegionWeatherStore = () => sharedStore ||= createRegionWeatherStore();

export function bindRegionWeatherTriggers(store, {
  windowTarget = globalThis.window, documentTarget = globalThis.document,
  navigatorTarget = globalThis.navigator, schedule = setInterval, cancel = clearInterval,
} = {}) {
  const connected = () => navigatorTarget?.onLine !== false;
  const visible = () => documentTarget?.visibilityState !== "hidden";
  const poll = (reason = "poll") => {
    store.setVisible(visible());
    if (connected()) { if (visible()) store.resume(reason); } else store.offline();
  };
  const online = () => store.resume("online");
  const offline = () => store.offline();
  const focus = () => poll("focus");
  const visibility = () => poll("visibility");
  windowTarget?.addEventListener("online", online);
  windowTarget?.addEventListener("offline", offline);
  windowTarget?.addEventListener("focus", focus);
  documentTarget?.addEventListener("visibilitychange", visibility);
  const timer = schedule(poll, SERVICES_CONFIG.weather.pollMs);
  poll("startup");
  return () => {
    cancel(timer);
    windowTarget?.removeEventListener("online", online);
    windowTarget?.removeEventListener("offline", offline);
    windowTarget?.removeEventListener("focus", focus);
    documentTarget?.removeEventListener("visibilitychange", visibility);
  };
}

export const defaultSceneSite = sceneSiteForRegion;
