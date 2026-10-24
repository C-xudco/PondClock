import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { validCoordinates, weatherLocation } from "@/services/environment";
import { bindRegionWeatherTriggers, getRegionWeatherStore, weatherErrorMessage } from "@/services/regionWeatherStore";
import { displayWeather, simulatedSnapshot, snapshotLocation } from "@/services/weatherSnapshot";
import { toWeatherVisualState } from "@/domain/weatherVisualState";

const SEASONS = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"];

// Clock always follows the real IP context. Game travel never changes it.
export function useClockWeather(regionId, geo, online = true) {
  const [now, setNow] = useState(() => new Date());
  const store = useMemo(() => getRegionWeatherStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const latitude = geo?.latitude;
  const longitude = geo?.longitude;
  const detail = geo?.detail;
  const location = useMemo(() => snapshotLocation(weatherLocation(regionId, { latitude, longitude, detail })),
    [regionId, latitude, longitude, detail]);
  const entry = state.entries[`header:${location.key}`] || null;
  const snapshot = entry?.snapshot || simulatedSnapshot(location);
  const refreshWeather = useCallback(() => store.refreshHeader("manual"), [store]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const stop = bindRegionWeatherTriggers(store);
    return () => { stop(); store.setEnabled(false); };
  }, [store]);
  useEffect(() => {
    store.setHeaderLocation(location, { refresh: false });
    store.setEnabled(online);
    if (online) store.resume("header-context");
  }, [store, location, online]);
  // Even a failed IP lookup wakes the same bounded 12-site queue.
  useEffect(() => { if (geo?.refreshing) void store.prefetchAll("geo-start"); }, [store, geo?.refreshing]);

  return {
    time: now.toLocaleTimeString("zh-CN", { hour12: false }),
    date: now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
    hour: now.getHours(), season: SEASONS[now.getMonth()],
    weather: displayWeather(snapshot.weatherCode), temperature: snapshot.temperatureC,
    weatherSource: snapshot.source, weatherUpdatedAt: snapshot.observedAtMs,
    weatherPlace: location.place, weatherFetchedAtMs: snapshot.fetchedAtMs,
    weatherError: online ? weatherErrorMessage(entry?.errorCode) : null,
    weatherErrorCode: online ? entry?.errorCode || null : null,
    weatherRefreshing: online && ["queued", "refreshing"].includes(entry?.status),
    weatherLastAttemptAtMs: entry?.lastAttemptAtMs ?? null, weatherRetryAtMs: entry?.retryAtMs ?? 0,
    weatherLocationSource: validCoordinates(latitude, longitude) ? (geo?.cached ? "ip-cached" : "ip") : "reference",
    snapshot, entry, weatherEntry: entry,
    visualState: toWeatherVisualState(snapshot, { nowMs: now.getTime() }),
    refreshWeather,
  };
}
