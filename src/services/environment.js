import { DEFAULT_REGION, REGIONS } from "../lib/gameConfig.js";
import { matchRegionForProvince } from "../lib/gameUtils.js";
import { regionLocation } from "../data/regionLocations.js";
import { SERVICES_CONFIG } from "../config/services.js";
import environmentEndpoints from "../config/environmentEndpoints.cjs";

const { GEO_PROVIDERS, isGeoUrl } = environmentEndpoints;
const providerIds = new Set(GEO_PROVIDERS.map((provider) => provider.id));
const attemptCodes = new Set(["OK", "HTTP_403", "HTTP_429", "TIMEOUT", "INVALID_RESPONSE", "NETWORK_ERROR", "COOLDOWN"]);

const regionIds = new Set(REGIONS.map((region) => region.id));
const specialRegions = { HK: "香港", MO: "澳门", TW: "台湾" };
const weatherCodes = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const snowCodes = new Set([71, 73, 75, 77, 85, 86]);
const cloudyCodes = new Set([1, 2, 3, 45, 48]);
const cleanText = (value, max = 120) => typeof value === "string"
  ? [...value].filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join("").trim().slice(0, max) : "";

export const validCoordinates = (latitude, longitude) => Number.isFinite(latitude)
  && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

export class EnvironmentError extends Error {
  constructor(message, status = null, retryAtMs = null) {
    super(message);
    this.name = "EnvironmentError";
    this.status = status;
    this.retryAtMs = retryAtMs;
  }
}

function retryAfterTime(header, nowMs, minimumMs) {
  const seconds = header && /^\s*\d+(?:\.\d+)?\s*$/.test(header) ? Number(header) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(header) - nowMs) || 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(nowMs + Math.max(minimumMs, delay)));
}

function abortedError() {
  const error = new Error("Environment request aborted");
  error.name = "AbortError";
  return error;
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(abortedError());
  return new Promise((resolve, reject) => {
    const stop = () => reject(abortedError());
    signal.addEventListener("abort", stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}

/** The desktop bridge owns the allowlist and never falls back to renderer fetch. */
export function createEnvironmentRequester({
  desktop = globalThis.window?.pondDesktop,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const retryUntil = new Map();
  return async function requestJson(input, { signal, timeoutMs = SERVICES_CONFIG.weather.timeoutMs } = {}) {
    const url = new URL(input);
    const isGeo = isGeoUrl(url.href);
    const isWeather = url.origin === "https://api.open-meteo.com" && url.pathname === "/v1/forecast";
    if (url.username || url.password || url.hash || !(isGeo || isWeather)) {
      throw new EnvironmentError("Unknown environment service");
    }
    const rateLimitMinimum = isGeo ? SERVICES_CONFIG.geo.rateLimitCooldownMs : SERVICES_CONFIG.weather.refreshMs;
    if ((retryUntil.get(url.origin) || 0) > now()) {
      throw new EnvironmentError("环境服务稍后再试（HTTP 429）", 429, retryUntil.get(url.origin));
    }
    if (signal?.aborted) throw abortedError();
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    try {
      const operation = Promise.resolve().then(async () => {
        if (controller.signal.aborted) throw abortedError();
        if (typeof desktop?.requestEnvironment === "function") return desktop.requestEnvironment(url.href);
        if (typeof fetchImpl !== "function") throw new EnvironmentError("环境网络不可用");
        const response = await fetchImpl(url.href, {
          signal: controller.signal, headers: { Accept: "application/json" },
          credentials: "omit", cache: "no-store", redirect: "error",
        });
        if (!response.ok) {
          if (response.status === 429) {
            retryUntil.set(url.origin, retryAfterTime(response.headers?.get?.("Retry-After"), now(), rateLimitMinimum));
          }
          throw new EnvironmentError(`环境服务暂不可用（HTTP ${response.status}）`, response.status,
            response.status === 429 ? retryUntil.get(url.origin) : null);
        }
        return response.json();
      });
      return await abortable(operation, controller.signal);
    } catch (error) {
      // Electron serializes Error custom fields, so also recognize its HTTP text.
      if (error?.status === 429 || /HTTP\s*429/.test(error?.message || "")) {
        retryUntil.set(url.origin, Math.max(retryUntil.get(url.origin) || 0,
          now() + rateLimitMinimum, Number.isSafeInteger(error?.retryAtMs) ? error.retryAtMs : 0));
        throw new EnvironmentError("环境服务稍后再试（HTTP 429）", 429, retryUntil.get(url.origin));
      }
      if (timedOut && !signal?.aborted) error.code = "ENV_TIMEOUT";
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  };
}

const defaultRequester = createEnvironmentRequester();
export const requestEnvironmentJson = (url, options) => defaultRequester(url, options);

export function parseGeoResponse(data, provider = "ipapi") {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new EnvironmentError("IP 服务未返回有效地区");
  if (data.error || data.success === false) {
    if (/rate.?limit|quota/i.test(cleanText(data.reason || data.message, 64))) throw new EnvironmentError("IP 服务请求受限（HTTP 429）", 429);
    throw new EnvironmentError("IP 服务未返回有效地区");
  }
  if (provider === "ipwhois" && data.success !== true) throw new EnvironmentError("IP 服务未确认定位成功");
  const country = cleanText(data.country_code, 10).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new EnvironmentError("IP 国家字段无效");
  const isChineseRegion = country === "CN" || Object.prototype.hasOwnProperty.call(specialRegions, country);
  const matched = isChineseRegion ? matchRegionForProvince(
    specialRegions[country], data.region, data.region_code, data.city,
  ) : null;
  const detail = [cleanText(data.region), cleanText(data.city)].filter(Boolean).join(" · ")
    || cleanText(data.country_name || data.country) || "未匹配到具体地区";
  const result = {
    regionId: matched || DEFAULT_REGION,
    source: matched ? "ip" : isChineseRegion ? "default" : "oversea",
    detail,
    cached: false,
  };
  if (validCoordinates(data.latitude, data.longitude)) {
    result.latitude = data.latitude;
    result.longitude = data.longitude;
  }
  return result;
}

function readJson(storage, key) {
  try { return JSON.parse(storage?.getItem(key) || "null"); } catch { return null; }
}

function writeJson(storage, key, data) {
  try { storage?.setItem(key, JSON.stringify(data)); } catch { /* Storage may be disabled. */ }
}

export function readGeoCache(storage, nowMs = Date.now()) {
  const data = readJson(storage, SERVICES_CONFIG.geo.cacheKey);
  if (data?.version !== 1 || !regionIds.has(data.regionId) || !Number.isFinite(data.fetchedAtMs)
    || nowMs < data.fetchedAtMs || nowMs - data.fetchedAtMs > SERVICES_CONFIG.geo.cacheMaxAgeMs
    || !["ip", "default", "oversea"].includes(data.source)) return null;
  const result = {
    regionId: data.regionId, source: data.source === "ip" ? "ip-cached" : data.source,
    detail: cleanText(data.detail), cached: true,
    fetchedAtMs: data.fetchedAtMs,
  };
  if (providerIds.has(data.provider)) result.provider = data.provider;
  if (validCoordinates(data.latitude, data.longitude)) {
    result.latitude = data.latitude;
    result.longitude = data.longitude;
  }
  return result;
}

export function writeGeoCache(storage, geo, nowMs = Date.now()) {
  if (!regionIds.has(geo?.regionId) || !["ip", "default", "oversea"].includes(geo.source)) return;
  const { regionId, source, detail, latitude, longitude } = geo;
  writeJson(storage, SERVICES_CONFIG.geo.cacheKey,
    { regionId, source, detail, latitude, longitude, version: 1, fetchedAtMs: nowMs,
      ...(providerIds.has(geo.provider) ? { provider: geo.provider } : {}) });
}

function safeGeoAttempts(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((attempt) => providerIds.has(attempt?.provider) && attemptCodes.has(attempt.code)
      && Number.isSafeInteger(attempt.atMs) && attempt.atMs >= 0)
    .slice(0, GEO_PROVIDERS.length).map(({ provider, code, atMs, retryAtMs }) => ({ provider, code, atMs,
      ...(Number.isSafeInteger(retryAtMs) && retryAtMs > 0 ? { retryAtMs } : {}) }));
}

function geoLookupError(code, attempts, status = null, retryAtMs = null) {
  const error = new EnvironmentError(status === 429 ? "全部定位服务暂受限，请稍后重试。" : "暂时无法识别当前网络。", status, retryAtMs);
  error.code = code;
  error.attempts = safeGeoAttempts(attempts);
  return error;
}

/** Fail over only between the disclosed providers. Their quotas remain independent. */
export function createGeoFetcher({
  requestJson = requestEnvironmentJson, providers = GEO_PROVIDERS, now: clock = Date.now,
  timeoutMs: defaultTimeoutMs = SERVICES_CONFIG.geo.timeoutMs,
} = {}) {
  let preferred = providers[0]?.id;
  const retryUntil = new Map();
  return async function lookupGeo({ signal, now = clock, timeoutMs = defaultTimeoutMs } = {}) {
    const attempts = [];
    const ordered = [...providers].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    for (const provider of ordered) {
      if (signal?.aborted) {
        const error = geoLookupError("GEO_ABORTED", attempts); error.name = "AbortError"; throw error;
      }
      const retryAtMs = retryUntil.get(provider.id) || 0;
      if (retryAtMs > now()) {
        attempts.push({ provider: provider.id, code: "COOLDOWN", atMs: now(), retryAtMs });
        continue;
      }
      const controller = new AbortController();
      const stop = () => controller.abort();
      signal?.addEventListener("abort", stop, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      let received = false;
      try {
        const data = await abortable(Promise.resolve().then(() => {
          if (controller.signal.aborted) throw abortedError();
          return requestJson(provider.url, { signal: controller.signal, timeoutMs });
        }), controller.signal);
        if (signal?.aborted) throw abortedError();
        received = true;
        const next = parseGeoResponse(data, provider.id);
        if (next.source === "default") throw new EnvironmentError("IP 服务未匹配到省级地区");
        preferred = provider.id;
        retryUntil.delete(provider.id);
        attempts.push({ provider: provider.id, code: "OK", atMs: now() });
        return { ...next, fetchedAtMs: now(), provider: provider.id, attempts: safeGeoAttempts(attempts) };
      } catch (error) {
        if (signal?.aborted || error?.code === "ENV_REQUEST_SUPERSEDED") {
          const canceled = geoLookupError("GEO_ABORTED", attempts); canceled.name = "AbortError"; throw canceled;
        }
        const status = error?.status || Number((error?.message || "").match(/HTTP\s*(\d{3})/)?.[1]);
        let code = received || error instanceof SyntaxError || /有效 JSON/.test(error?.message || "")
          ? "INVALID_RESPONSE" : timedOut || error?.code === "ENV_TIMEOUT" || error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
        if (status === 403) code = "HTTP_403";
        if (status === 429) {
          code = "HTTP_429";
          retryUntil.set(provider.id, Math.max(now() + SERVICES_CONFIG.geo.rateLimitCooldownMs,
            Number.isSafeInteger(error?.retryAtMs) ? error.retryAtMs : 0));
        }
        attempts.push({ provider: provider.id, code, atMs: now(),
          ...(status === 429 ? { retryAtMs: retryUntil.get(provider.id) } : {}) });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
    }
    const allLimited = providers.length > 0 && providers.every((provider) => (retryUntil.get(provider.id) || 0) > now());
    if (allLimited) {
      throw geoLookupError("GEO_RATE_LIMITED", attempts, 429,
        Math.min(...providers.map((provider) => retryUntil.get(provider.id))));
    }
    throw geoLookupError("GEO_UNAVAILABLE", attempts);
  };
}

const defaultGeoFetcher = createGeoFetcher();
export function fetchGeo(options = {}) {
  // Injectable requesters remain isolated in tests; production shares preference
  // and cooldowns across automatic/manual refreshes and React remounts.
  return options.requestJson ? createGeoFetcher({ requestJson: options.requestJson })(options) : defaultGeoFetcher(options);
}

const fallbackGeo = () => ({ regionId: DEFAULT_REGION, source: "fallback",
  detail: "暂未定位，使用默认水域", cached: false, fetchedAtMs: null });

export function initialGeoState(storage = browserStorage(), nowMs = Date.now()) {
  return { ...(readGeoCache(storage, nowMs) || fallbackGeo()), refreshing: false,
    lastAttemptAtMs: null, error: null, errorCode: null, attempts: [], retryAtMs: 0, refreshReason: null };
}

function geoFailureMessage(error) {
  if (error?.status === 429 || /HTTP\s*429/.test(error?.message || "")) return "定位服务请求受限，已暂停重试，请等待倒计时结束。";
  if (error?.status === 403 || /HTTP\s*403/.test(error?.message || "")) return "定位服务暂时拒绝请求，可换网络后重新识别。";
  if (error?.code === "ENV_TIMEOUT" || error?.name === "AbortError") return "定位请求超时，可在网络恢复后重新识别。";
  return "暂时无法识别当前网络，已有解锁和离线钓鱼不受影响。";
}

/** Owns only network state; it never initializes or changes game assets. */
export function createGeoRefreshController({
  fetchGeoImpl = fetchGeo, storage = browserStorage(), now = Date.now,
  onChange = () => {}, config = SERVICES_CONFIG.geo,
} = {}) {
  let state = initialGeoState(storage, now());
  let generation = 0;
  let active;
  let inFlight;
  let disposed = false;
  let networkOffline = false;
  let failures = 0;
  let lastStartedAt = -Infinity;
  let rateLimitedUntil = 0;
  const publish = (next) => { state = next; if (!disposed) onChange(state); return state; };
  const cachedOrFallback = () => {
    const cached = readGeoCache(storage, now());
    if (cached) return cached;
    if (Number.isFinite(state.fetchedAtMs) && now() >= state.fetchedAtMs &&
        now() - state.fetchedAtMs <= config.cacheMaxAgeMs) {
      const { regionId, source, detail, latitude, longitude, fetchedAtMs, provider } = state;
      return { regionId, source: source === "ip" ? "ip-cached" : source,
        detail, latitude, longitude, fetchedAtMs, provider, cached: true };
    }
    return fallbackGeo();
  };

  function refresh(reason = "manual") {
    if (disposed) return Promise.resolve(state);
    if (reason === "online") networkOffline = false;
    if (networkOffline) return Promise.resolve(state);
    const nowMs = now();
    const manual = reason === "manual";
    if (rateLimitedUntil > nowMs) {
      return Promise.resolve(publish({ ...state, refreshing: false,
        error: geoFailureMessage({ status: 429 }), errorCode: "GEO_RATE_LIMITED", retryAtMs: rateLimitedUntil }));
    }
    if (!manual && reason !== "online" && state.retryAtMs > nowMs) {
      return Promise.resolve(state);
    }
    if (!manual && inFlight) return inFlight;
    const throttleMs = manual ? config.manualThrottleMs : config.autoThrottleMs;
    if (nowMs - lastStartedAt < throttleMs) return Promise.resolve(state);
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const requestGeneration = ++generation;
    lastStartedAt = nowMs;
    publish({ ...state, refreshing: true, lastAttemptAtMs: nowMs,
      error: null, errorCode: null, attempts: [], retryAtMs: 0, refreshReason: reason });
    const operation = Promise.resolve().then(() => fetchGeoImpl({ signal: controller.signal, now }))
      .then((next) => {
        if (disposed || requestGeneration !== generation) return state;
        const fetchedAtMs = now();
        failures = 0;
        rateLimitedUntil = 0;
        writeGeoCache(storage, next, fetchedAtMs);
        return publish({ ...next, fetchedAtMs, refreshing: false, error: null, errorCode: null,
          attempts: safeGeoAttempts(next.attempts), retryAtMs: 0,
          lastAttemptAtMs: nowMs, refreshReason: reason });
      }).catch((error) => {
        if (disposed || requestGeneration !== generation) return state;
        failures++;
        const rateLimited = error?.status === 429 || /HTTP\s*429/.test(error?.message || "");
        if (rateLimited) {
          rateLimitedUntil = Number.isSafeInteger(error?.retryAtMs) && error.retryAtMs > now()
            ? error.retryAtMs : now() + config.rateLimitCooldownMs;
        }
        const delay = Math.min(config.maxFailureRetryMs, config.failureRetryMs * 2 ** Math.min(failures - 1, 10));
        return publish({ ...cachedOrFallback(), refreshing: false, lastAttemptAtMs: nowMs,
          error: geoFailureMessage(error), errorCode: ["GEO_UNAVAILABLE", "GEO_RATE_LIMITED", "GEO_ABORTED"].includes(error?.code)
            ? error.code : rateLimited ? "GEO_RATE_LIMITED" : "GEO_UNAVAILABLE",
          attempts: safeGeoAttempts(error?.attempts),
          retryAtMs: rateLimited ? rateLimitedUntil : now() + delay, refreshReason: reason });
      }).finally(() => { if (requestGeneration === generation) { active = null; inFlight = null; } });
    inFlight = operation;
    return operation;
  }

  function offline() {
    if (disposed) return;
    networkOffline = true;
    generation++;
    active?.abort();
    active = null;
    inFlight = null;
    // A subsequent real online event may retry immediately, but never bypass 429.
    lastStartedAt = -Infinity;
    publish({ ...cachedOrFallback(), refreshing: false, lastAttemptAtMs: state.lastAttemptAtMs,
      error: "网络离线，恢复联网后会自动重新识别。", errorCode: "OFFLINE", attempts: state.attempts,
      retryAtMs: rateLimitedUntil, refreshReason: "offline" });
  }

  function dispose() { disposed = true; generation++; active?.abort(); active = null; inFlight = null; }
  return Object.freeze({ refresh, offline, dispose, getState: () => state });
}

/** Browser events are isolated from React so focus/network behavior is directly testable. */
export function bindGeoRefreshTriggers(controller, {
  windowTarget = globalThis.window, documentTarget = globalThis.document,
  navigatorTarget = globalThis.navigator, schedule = setInterval, cancel = clearInterval,
} = {}) {
  const visible = () => documentTarget?.visibilityState !== "hidden";
  const connected = () => navigatorTarget?.onLine !== false;
  const automatic = (reason) => { if (visible() && connected()) void controller.refresh(reason); };
  const onOnline = () => { void controller.refresh("online"); };
  const onOffline = () => controller.offline();
  const onFocus = () => automatic("focus");
  const onVisibility = () => automatic("visibility");
  windowTarget?.addEventListener("online", onOnline);
  windowTarget?.addEventListener("offline", onOffline);
  windowTarget?.addEventListener("focus", onFocus);
  documentTarget?.addEventListener("visibilitychange", onVisibility);
  const timer = schedule(() => automatic("poll"), SERVICES_CONFIG.geo.refreshMs);
  if (connected()) void controller.refresh("startup"); else controller.offline();
  return () => {
    cancel(timer);
    windowTarget?.removeEventListener("online", onOnline);
    windowTarget?.removeEventListener("offline", onOffline);
    windowTarget?.removeEventListener("focus", onFocus);
    documentTarget?.removeEventListener("visibilitychange", onVisibility);
    controller.dispose();
  };
}

export function weatherLocation(regionId = DEFAULT_REGION, geo) {
  const region = regionLocation(regionId) || regionLocation(DEFAULT_REGION);
  const fromIp = validCoordinates(geo?.latitude, geo?.longitude);
  const latitude = fromIp ? geo.latitude : region.latitude;
  const longitude = fromIp ? geo.longitude : region.longitude;
  return {
    latitude, longitude,
    key: `${latitude.toFixed(3)},${longitude.toFixed(3)}`,
    place: fromIp ? cleanText(geo.detail) || "电脑当地" : region.city,
  };
}

export function buildWeatherUrl(location) {
  if (!validCoordinates(location?.latitude, location?.longitude)) throw new EnvironmentError("天气坐标无效");
  const url = new URL(SERVICES_CONFIG.weather.url);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("current", "temperature_2m,weather_code");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "auto");
  return url.href;
}

export function weatherForCode(code) {
  if (!weatherCodes.has(code)) throw new EnvironmentError("天气代码无效");
  if (code === 0) return "晴";
  if (snowCodes.has(code)) return "雪";
  return cloudyCodes.has(code) ? "多云" : "小雨";
}

export function parseWeatherResponse(data, location, nowMs = Date.now()) {
  const current = data?.current;
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error || !current
    || !validCoordinates(data.latitude, data.longitude)
    || Math.abs(data.latitude - location.latitude) > 1 || Math.abs(data.longitude - location.longitude) > 1
    || !Number.isFinite(current.temperature_2m) || current.temperature_2m < -100 || current.temperature_2m > 70
    || (data.current_units?.temperature_2m && data.current_units.temperature_2m !== "°C")
    || !Number.isInteger(current.time) || current.time <= 0
    || current.time * 1000 > nowMs + 15 * 60 * 1000
    || nowMs - current.time * 1000 > SERVICES_CONFIG.weather.cacheMaxAgeMs) {
    throw new EnvironmentError("天气服务未返回有效天气");
  }
  return {
    locationKey: location.key,
    weather: weatherForCode(current.weather_code),
    temperature: Math.round(current.temperature_2m * 10) / 10,
    weatherSource: "online",
    weatherUpdatedAt: current.time * 1000,
    weatherPlace: location.place,
    fetchedAtMs: nowMs,
  };
}

export async function fetchWeather(location, { requestJson = requestEnvironmentJson, signal, now = Date.now } = {}) {
  const data = await requestJson(buildWeatherUrl(location), { signal, timeoutMs: SERVICES_CONFIG.weather.timeoutMs });
  return parseWeatherResponse(data, location, now());
}

const weatherCacheKey = (location) => `${SERVICES_CONFIG.weather.cacheKey}:${location.key}`;

export function readWeatherCache(storage, location, nowMs = Date.now()) {
  const data = readJson(storage, weatherCacheKey(location));
  if (data?.version !== 1 || data.locationKey !== location.key
    || !["晴", "多云", "小雨", "雪"].includes(data.weather)
    || !Number.isFinite(data.temperature) || data.temperature < -100 || data.temperature > 70
    || !Number.isFinite(data.weatherUpdatedAt) || !Number.isFinite(data.fetchedAtMs)
    || nowMs < data.fetchedAtMs || nowMs - data.fetchedAtMs > SERVICES_CONFIG.weather.cacheMaxAgeMs
    || data.weatherUpdatedAt > nowMs + 15 * 60 * 1000
    || nowMs - data.weatherUpdatedAt > SERVICES_CONFIG.weather.cacheMaxAgeMs) return null;
  return { ...data, weatherSource: "cached", weatherPlace: location.place };
}

export function writeWeatherCache(storage, location, weather) {
  if (weather?.locationKey === location.key && weather.weatherSource === "online") {
    writeJson(storage, weatherCacheKey(location), { ...weather, version: 1 });
  }
}

export function simulatedWeather(location, nowMs = Date.now()) {
  const hash = Math.abs(Math.floor(nowMs / SERVICES_CONFIG.weather.refreshMs)
    + Math.round(location.latitude * 10) + Math.round(location.longitude * 10));
  return {
    locationKey: location.key, weather: ["晴", "多云", "小雨"][hash % 3],
    temperature: null, weatherSource: "simulated", weatherUpdatedAt: null,
    weatherPlace: location.place, fetchedAtMs: null,
  };
}

export function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}
