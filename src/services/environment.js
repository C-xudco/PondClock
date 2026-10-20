import { DEFAULT_REGION, REGIONS } from "../lib/gameConfig.js";
import { matchRegionForProvince } from "../lib/gameUtils.js";
import { regionLocation } from "../data/regionLocations.js";
import { SERVICES_CONFIG } from "../config/services.js";

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
  constructor(message, status = null) {
    super(message);
    this.name = "EnvironmentError";
    this.status = status;
  }
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
    const isGeo = url.origin === "https://ipapi.co" && url.pathname === "/json/" && !url.search;
    const isWeather = url.origin === "https://api.open-meteo.com" && url.pathname === "/v1/forecast";
    if (url.username || url.password || url.hash || !(isGeo || isWeather)) {
      throw new EnvironmentError("Unknown environment service");
    }
    if ((retryUntil.get(url.origin) || 0) > now()) throw new EnvironmentError("环境服务稍后再试（HTTP 429）", 429);
    if (signal?.aborted) throw abortedError();
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, timeoutMs);
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
            const retryHeader = response.headers?.get?.("Retry-After");
            const seconds = Number(retryHeader);
            const suggested = retryHeader && Number.isFinite(seconds)
              ? seconds * 1000 : Math.max(0, Date.parse(retryHeader) - now()) || 0;
            retryUntil.set(url.origin, now() + Math.max(SERVICES_CONFIG.weather.refreshMs,
              Math.min(24 * 60 * 60 * 1000, suggested)));
          }
          throw new EnvironmentError(`环境服务暂不可用（HTTP ${response.status}）`, response.status);
        }
        return response.json();
      });
      return await abortable(operation, controller.signal);
    } catch (error) {
      // Electron serializes Error custom fields, so also recognize its HTTP text.
      if (error?.status === 429 || /HTTP\s*429/.test(error?.message || "")) {
        retryUntil.set(url.origin, Math.max(retryUntil.get(url.origin) || 0,
          now() + SERVICES_CONFIG.weather.refreshMs));
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  };
}

const defaultRequester = createEnvironmentRequester();
export const requestEnvironmentJson = (url, options) => defaultRequester(url, options);

export function parseGeoResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error) throw new EnvironmentError("IP 服务未返回有效地区");
  const country = cleanText(data.country_code, 10).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new EnvironmentError("IP 国家字段无效");
  const isChineseRegion = country === "CN" || Object.prototype.hasOwnProperty.call(specialRegions, country);
  const matched = isChineseRegion ? matchRegionForProvince(
    specialRegions[country], data.region, data.region_code, data.city,
  ) : null;
  const detail = [cleanText(data.region), cleanText(data.city)].filter(Boolean).join(" · ")
    || cleanText(data.country_name) || "未匹配到具体地区";
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
  };
  if (validCoordinates(data.latitude, data.longitude)) {
    result.latitude = data.latitude;
    result.longitude = data.longitude;
  }
  return result;
}

export function writeGeoCache(storage, geo, nowMs = Date.now()) {
  if (!regionIds.has(geo?.regionId) || !["ip", "default", "oversea"].includes(geo.source)) return;
  writeJson(storage, SERVICES_CONFIG.geo.cacheKey, { ...geo, version: 1, fetchedAtMs: nowMs });
}

export async function fetchGeo({ requestJson = requestEnvironmentJson, signal } = {}) {
  const data = await requestJson(SERVICES_CONFIG.geo.url, { signal, timeoutMs: SERVICES_CONFIG.geo.timeoutMs });
  return parseGeoResponse(data);
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
