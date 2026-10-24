import { SERVICES_CONFIG } from "../config/services.js";
import { EnvironmentError, requestEnvironmentJson, validCoordinates } from "./environment.js";

export const WEATHER_FIELDS = "temperature_2m,weather_code,is_day,cloud_cover,precipitation,rain,showers,snowfall";
const nullableNumber = (value, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : null;
const safeRead = (storage, key) => { try { return JSON.parse(storage?.getItem(key) || "null"); } catch { return null; } };
const unknownPrecipitation = () => ({ totalMm: null, rainMm: null, showersMm: null, snowfallCm: null, intervalSeconds: null });

export function weatherLocationKey(latitude, longitude) {
  if (!validCoordinates(latitude, longitude)) throw new EnvironmentError("天气坐标无效");
  // Exact canonical decimal coordinates: nearby sites never merge by rounding.
  return `open-meteo:v2:celsius:mm:${Number(latitude)},${Number(longitude)}`;
}

export function snapshotLocation(location) {
  return { ...location, key: weatherLocationKey(location.latitude, location.longitude) };
}

export function buildSnapshotWeatherUrl(location) {
  if (!validCoordinates(location?.latitude, location?.longitude)) throw new EnvironmentError("天气坐标无效");
  const url = new URL(SERVICES_CONFIG.weather.url);
  for (const [key, value] of Object.entries({ latitude: location.latitude, longitude: location.longitude,
    current: WEATHER_FIELDS, temperature_unit: "celsius", precipitation_unit: "mm", timeformat: "unixtime", timezone: "auto" })) {
    url.searchParams.set(key, String(value));
  }
  return url.href;
}

export function parseWeatherSnapshot(data, location, nowMs = Date.now()) {
  const current = data?.current;
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error || !current
      || !validCoordinates(data.latitude, data.longitude)
      || Math.abs(data.latitude - location.latitude) > 1 || Math.abs(data.longitude - location.longitude) > 1
      || !Number.isSafeInteger(current.time) || current.time <= 0
      || current.time * 1000 > nowMs + 15 * 60 * 1000
      || nowMs - current.time * 1000 > SERVICES_CONFIG.weather.cacheMaxAgeMs
      || nullableNumber(current.temperature_2m, -100, 70) === null
      || (data.current_units?.temperature_2m && data.current_units.temperature_2m !== "°C")) {
    throw Object.assign(new EnvironmentError("天气服务未返回有效天气"), { code: "ENV_RESPONSE_INVALID" });
  }
  const unitNumber = (field, expected, max) => data.current_units?.[field] === expected
    ? nullableNumber(current[field], 0, max) : null;
  const weatherCode = Number.isInteger(current.weather_code) && current.weather_code >= 0 && current.weather_code <= 999
    ? current.weather_code : null;
  const isDay = current.is_day === 1 ? true : current.is_day === 0 ? false : null;
  const precipitation = {
    totalMm: unitNumber("precipitation", "mm", 2000), rainMm: unitNumber("rain", "mm", 2000),
    showersMm: unitNumber("showers", "mm", 2000), snowfallCm: unitNumber("snowfall", "cm", 1000),
    intervalSeconds: Number.isSafeInteger(current.interval) && current.interval > 0 && current.interval <= 86400 ? current.interval : null,
  };
  const cloudCoverPct = unitNumber("cloud_cover", "%", 100);
  return {
    schemaVersion: 2, provider: "open-meteo", locationKey: weatherLocationKey(location.latitude, location.longitude),
    weatherCode, temperatureC: Math.round(current.temperature_2m * 10) / 10, isDay, cloudCoverPct, precipitation,
    observedAtMs: current.time * 1000, fetchedAtMs: nowMs, source: "online",
    quality: weatherCode !== null && isDay !== null && cloudCoverPct !== null
      && Object.values(precipitation).every((value) => value !== null) ? "complete" : "partial",
  };
}

export async function fetchWeatherSnapshot(location, {
  requestJson = requestEnvironmentJson, signal, now = Date.now, onTransport,
} = {}) {
  const data = await requestJson(buildSnapshotWeatherUrl(location), {
    signal, timeoutMs: SERVICES_CONFIG.weather.timeoutMs, onTransport,
  });
  return parseWeatherSnapshot(data, location, now());
}

export function validWeatherSnapshot(value, location, nowMs = Date.now()) {
  if (value?.schemaVersion !== 2 || value.provider !== "open-meteo" || value.locationKey !== location.key
      || !["online", "cached"].includes(value.source) || !["complete", "partial"].includes(value.quality)
      || nullableNumber(value.temperatureC, -100, 70) === null
      || !Number.isSafeInteger(value.observedAtMs) || !Number.isSafeInteger(value.fetchedAtMs)
      || nowMs < value.fetchedAtMs || nowMs - value.fetchedAtMs > SERVICES_CONFIG.weather.cacheMaxAgeMs
      || value.observedAtMs > nowMs + 15 * 60 * 1000 || nowMs - value.observedAtMs > SERVICES_CONFIG.weather.cacheMaxAgeMs
      || !(value.isDay === null || typeof value.isDay === "boolean")
      || !(value.weatherCode === null || Number.isInteger(value.weatherCode) && value.weatherCode >= 0 && value.weatherCode <= 999)
      || !(value.cloudCoverPct === null || nullableNumber(value.cloudCoverPct, 0, 100) !== null)) return false;
  const p = value.precipitation;
  if (!p || typeof p !== "object") return false;
  for (const [field, max] of [["totalMm", 2000], ["rainMm", 2000], ["showersMm", 2000], ["snowfallCm", 1000]]) {
    if (!(p[field] === null || nullableNumber(p[field], 0, max) !== null)) return false;
  }
  return p.intervalSeconds === null || Number.isSafeInteger(p.intervalSeconds) && p.intervalSeconds > 0 && p.intervalSeconds <= 86400;
}

export function readSnapshotCache(storage, location, nowMs = Date.now()) {
  const cached = safeRead(storage, `${SERVICES_CONFIG.weather.snapshotCacheKey}:${location.key}`);
  return validWeatherSnapshot(cached, location, nowMs) ? { ...cached, source: "cached" } : null;
}

export function writeSnapshotCache(storage, location, snapshot, nowMs = Date.now()) {
  if (snapshot?.source !== "online" || !validWeatherSnapshot(snapshot, location, nowMs)) return;
  try { storage?.setItem(`${SERVICES_CONFIG.weather.snapshotCacheKey}:${location.key}`, JSON.stringify(snapshot)); } catch { /* Offline play survives a full cache. */ }
}

export function simulatedSnapshot(location) {
  return { schemaVersion: 2, provider: "open-meteo", locationKey: location.key,
    weatherCode: null, temperatureC: null, isDay: null, cloudCoverPct: null,
    precipitation: unknownPrecipitation(), observedAtMs: null, fetchedAtMs: null,
    source: "simulated", quality: "simulated" };
}

export function displayWeather(code) {
  if (code === 0) return "晴";
  if (code === 1) return "大部晴朗";
  if (code === 2) return "多云";
  if (code === 3) return "阴";
  if ([45, 48].includes(code)) return code === 48 ? "雾凇雾" : "雾";
  if ([51, 53, 55].includes(code)) return "毛毛雨";
  if ([56, 57, 66, 67].includes(code)) return "冻雨";
  if ([61, 80].includes(code)) return "小雨";
  if ([63, 81].includes(code)) return "中雨";
  if ([65, 82].includes(code)) return "大雨";
  if ([71, 85].includes(code)) return "小雪";
  if ([73, 77].includes(code)) return "雪";
  if ([75, 86].includes(code)) return "大雪";
  if ([95, 97].includes(code)) return "雷雨";
  if ([96, 99].includes(code)) return "雷暴伴冰雹";
  return "天气未知";
}
