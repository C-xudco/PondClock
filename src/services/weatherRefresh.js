import { SERVICES_CONFIG } from "../config/services.js";
import {
  browserStorage, fetchWeather, readWeatherCache, writeWeatherCache, simulatedWeather,
} from "./environment.js";

export const WEATHER_REFRESH_DEFAULTS = SERVICES_CONFIG.weather;

export function initialWeatherState(location, storage = browserStorage(), nowMs = Date.now()) {
  return { ...(readWeatherCache(storage, location, nowMs) || simulatedWeather(location, nowMs)),
    weatherError: null, weatherErrorCode: null, refreshing: false, lastAttemptAtMs: null, retryAtMs: 0, refreshReason: null };
}

function weatherFailureCode(error) {
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) return `HTTP_${error.status}`;
  if (error?.status === 429 || /HTTP\s*429/.test(error?.message || "")) return "HTTP_429";
  if (error?.status === 403 || /HTTP\s*403/.test(error?.message || "")) return "HTTP_403";
  if (error?.code === "ENV_TIMEOUT" || error?.name === "AbortError") return "TIMEOUT";
  if (error?.code === "ENV_RESPONSE_INVALID" || (error?.name === "EnvironmentError" &&
      /天气.*(?:无效|有效|代码|坐标)/.test(error?.message || ""))) return "INVALID_RESPONSE";
  return "NETWORK_ERROR";
}

function weatherFailureMessage(error) {
  if (error?.status === 429 || /HTTP\s*429/.test(error?.message || "")) {
    return "天气服务请求受限，倒计时结束后会自动重试。";
  }
  if (error?.status === 403 || /HTTP\s*403/.test(error?.message || "")) {
    return "天气服务暂时拒绝请求，正在使用缓存或模拟天气。";
  }
  if (error?.code === "ENV_TIMEOUT" || error?.name === "AbortError") {
    return "天气请求超时，联网后会自动重试。";
  }
  return "暂时无法更新天气，正在使用缓存或模拟天气。";
}

/** Weather has no authority over game regions, unlocks or asset saves. */
export function createWeatherRefreshController({
  location: initialLocation, enabled: initiallyEnabled = true, fetchWeatherImpl = fetchWeather,
  storage = browserStorage(), now = Date.now, onChange = () => {},
  connected = () => globalThis.navigator?.onLine !== false, config = WEATHER_REFRESH_DEFAULTS,
} = {}) {
  let location = { ...initialLocation };
  let state = initialWeatherState(location, storage, now());
  let enabled = initiallyEnabled === true;
  let generation = 0;
  let active;
  let inFlight;
  let disposed = false;
  let failures = 0;
  let lastStartedAt = -Infinity;
  let retryAtMs = 0;
  let rateLimitedUntil = 0;
  let latestWeather = null;
  const publish = (next) => { state = next; if (!disposed) onChange(state); return state; };
  function fallback() {
    const cached = readWeatherCache(storage, location, now());
    if (cached) return cached;
    if (latestWeather?.locationKey === location.key && now() >= latestWeather.fetchedAtMs &&
        now() - latestWeather.fetchedAtMs <= config.cacheMaxAgeMs &&
        Number.isFinite(latestWeather.weatherUpdatedAt) &&
        latestWeather.weatherUpdatedAt <= now() + 15 * 60 * 1000 &&
        now() - latestWeather.weatherUpdatedAt <= config.cacheMaxAgeMs) {
      return { ...latestWeather, weatherSource: "cached", weatherPlace: location.place };
    }
    return simulatedWeather(location, now());
  }
  function cancelCurrent() {
    generation++;
    active?.abort();
    active = null;
    inFlight = null;
  }

  function refresh(reason = "manual") {
    if (disposed) return Promise.resolve(state);
    if (!enabled) {
      // Local mode still ages its cache; it must not display an expired reading
      // forever merely because network requests are disabled.
      return Promise.resolve(publish({ ...fallback(), refreshing: false,
        weatherError: null, weatherErrorCode: null, lastAttemptAtMs: state.lastAttemptAtMs,
        retryAtMs: Math.max(retryAtMs, rateLimitedUntil), refreshReason: reason }));
    }
    if (!connected()) { offline(); return Promise.resolve(state); }
    const nowMs = now();
    if (rateLimitedUntil > nowMs) {
      return Promise.resolve(publish({ ...state, refreshing: false,
        weatherError: weatherFailureMessage({ status: 429 }), weatherErrorCode: "HTTP_429", retryAtMs: rateLimitedUntil }));
    }
    // Neither a manual click nor reconnecting bypasses an announced retry time.
    if (retryAtMs > nowMs) return Promise.resolve(state);
    const manual = reason === "manual";
    if (!manual && inFlight) return inFlight;
    const current = fallback();
    if (!manual && Number.isFinite(current.fetchedAtMs) && nowMs >= current.fetchedAtMs &&
        nowMs - current.fetchedAtMs < config.refreshMs) {
      // Reconnection may use a recent success without another request, but the
      // old offline badge must disappear. Active service cooldowns returned above.
      if (state.weatherErrorCode === "OFFLINE") {
        return Promise.resolve(publish({ ...state, weatherError: null, weatherErrorCode: null,
          retryAtMs: 0, refreshReason: reason }));
      }
      return Promise.resolve(state);
    }
    if (nowMs - lastStartedAt < config.manualThrottleMs) return inFlight || Promise.resolve(state);
    cancelCurrent();
    const controller = new AbortController();
    active = controller;
    const requestGeneration = generation;
    const requestLocation = { ...location };
    lastStartedAt = nowMs;
    publish({ ...state, refreshing: true, lastAttemptAtMs: nowMs,
      weatherError: null, weatherErrorCode: null, retryAtMs: 0, refreshReason: reason });
    const operation = Promise.resolve().then(() => {
      if (disposed || requestGeneration !== generation || controller.signal.aborted) return null;
      return fetchWeatherImpl(requestLocation, { signal: controller.signal, now });
    })
      .then((next) => {
        if (disposed || requestGeneration !== generation) return state;
        if (next?.locationKey !== requestLocation.key) {
          throw Object.assign(new Error("天气回复位置不一致"), { code: "ENV_RESPONSE_INVALID" });
        }
        latestWeather = { ...next, weatherSource: "online", weatherPlace: location.place, fetchedAtMs: now() };
        failures = 0;
        retryAtMs = 0;
        rateLimitedUntil = 0;
        writeWeatherCache(storage, location, latestWeather);
        return publish({ ...latestWeather, refreshing: false, weatherError: null, weatherErrorCode: null, retryAtMs: 0,
          lastAttemptAtMs: nowMs, refreshReason: reason });
      }).catch((error) => {
        if (disposed || requestGeneration !== generation) return state;
        failures++;
        const rateLimited = error?.status === 429 || /HTTP\s*429/.test(error?.message || "");
        if (rateLimited) {
          rateLimitedUntil = Math.max(rateLimitedUntil, now() + config.refreshMs,
            Number.isSafeInteger(error?.retryAtMs) ? error.retryAtMs : 0);
        }
        const delay = Math.min(config.maxFailureRetryMs, config.failureRetryMs * 2 ** Math.min(failures - 1, 10));
        retryAtMs = rateLimited ? rateLimitedUntil : now() + delay;
        return publish({ ...fallback(), refreshing: false, lastAttemptAtMs: nowMs,
          weatherError: weatherFailureMessage(error), weatherErrorCode: weatherFailureCode(error), retryAtMs, refreshReason: reason });
      }).finally(() => { if (requestGeneration === generation) { active = null; inFlight = null; } });
    inFlight = operation;
    return operation;
  }

  function offline() {
    if (disposed) return;
    cancelCurrent();
    publish({ ...fallback(), refreshing: false, lastAttemptAtMs: state.lastAttemptAtMs,
      weatherError: enabled ? "网络离线，联网后会自动更新天气。" : null,
      weatherErrorCode: enabled ? "OFFLINE" : null,
      retryAtMs: Math.max(retryAtMs, rateLimitedUntil), refreshReason: "offline" });
  }
  function setEnabled(value) {
    if (disposed || enabled === (value === true)) return;
    enabled = value === true;
    cancelCurrent();
    publish({ ...fallback(), refreshing: false, lastAttemptAtMs: state.lastAttemptAtMs,
      weatherError: enabled ? state.weatherError : null,
      weatherErrorCode: enabled ? state.weatherErrorCode : null,
      retryAtMs: Math.max(retryAtMs, rateLimitedUntil), refreshReason: enabled ? "enabled" : "disabled" });
  }
  function setLocation(next) {
    if (disposed || (next.key === location.key && next.place === location.place)) return;
    cancelCurrent();
    location = { ...next };
    lastStartedAt = -Infinity;
    publish({ ...fallback(), refreshing: false, lastAttemptAtMs: null,
      weatherError: Math.max(retryAtMs, rateLimitedUntil) > now() ? state.weatherError : null,
      weatherErrorCode: Math.max(retryAtMs, rateLimitedUntil) > now() ? state.weatherErrorCode : null,
      retryAtMs: Math.max(retryAtMs, rateLimitedUntil), refreshReason: "location" });
  }
  function dispose() { disposed = true; cancelCurrent(); }
  return Object.freeze({ refresh, offline, setEnabled, setLocation, dispose, getState: () => state });
}

export function bindWeatherRefreshTriggers(controller, {
  windowTarget = globalThis.window, documentTarget = globalThis.document,
  navigatorTarget = globalThis.navigator, schedule = setInterval, cancel = clearInterval,
  pollMs = WEATHER_REFRESH_DEFAULTS.pollMs,
} = {}) {
  const visible = () => documentTarget?.visibilityState !== "hidden";
  const connected = () => navigatorTarget?.onLine !== false;
  const automatic = (reason) => {
    if (!visible()) return;
    if (connected()) void controller.refresh(reason); else controller.offline();
  };
  const onOnline = () => { if (connected()) void controller.refresh("online"); };
  const onOffline = () => controller.offline();
  const onFocus = () => automatic("focus");
  const onVisibility = () => automatic("visibility");
  windowTarget?.addEventListener("online", onOnline);
  windowTarget?.addEventListener("offline", onOffline);
  windowTarget?.addEventListener("focus", onFocus);
  documentTarget?.addEventListener("visibilitychange", onVisibility);
  const timer = schedule(() => automatic("poll"), pollMs);
  if (connected()) automatic("startup"); else controller.offline();
  return () => {
    cancel(timer);
    windowTarget?.removeEventListener("online", onOnline);
    windowTarget?.removeEventListener("offline", onOffline);
    windowTarget?.removeEventListener("focus", onFocus);
    documentTarget?.removeEventListener("visibilitychange", onVisibility);
    controller.dispose();
  };
}
