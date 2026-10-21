import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserStorage, validCoordinates, weatherLocation } from "@/services/environment";
import { bindWeatherRefreshTriggers, createWeatherRefreshController, initialWeatherState } from "@/services/weatherRefresh";

const SEASONS = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"];

// Computer-local weather follows IP coordinates, independent of game air travel.
export function useClockWeather(regionId, geo, online = true) {
  const [now, setNow] = useState(() => new Date());
  const latitude = geo?.latitude;
  const longitude = geo?.longitude;
  const detail = geo?.detail;
  const location = useMemo(() => weatherLocation(regionId, { latitude, longitude, detail }),
    [regionId, latitude, longitude, detail]);
  const fallback = () => initialWeatherState(location, browserStorage());
  const [environment, setEnvironment] = useState(fallback);
  const initial = useRef({ location, online });
  const active = useRef(null);
  const refreshWeather = useCallback(() => active.current?.refresh("manual") || Promise.resolve(), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = createWeatherRefreshController({ location: initial.current.location,
      enabled: initial.current.online, onChange: setEnvironment });
    active.current = controller;
    setEnvironment(controller.getState());
    const stop = bindWeatherRefreshTriggers(controller);
    return () => { active.current = null; stop(); };
  }, []);

  useEffect(() => {
    const controller = active.current;
    if (!controller) return;
    controller.setEnabled(online);
    controller.setLocation(location);
    if (online) void controller.refresh("context");
  }, [location, online]);

  // A late reply from another location never flashes as the new place's weather.
  const current = environment.locationKey === location.key ? environment : fallback();
  return {
    time: now.toLocaleTimeString("zh-CN", { hour12: false }),
    date: now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
    hour: now.getHours(),
    season: SEASONS[now.getMonth()],
    weather: current.weather,
    temperature: current.temperature,
    weatherSource: current.weatherSource,
    weatherUpdatedAt: current.weatherUpdatedAt,
    weatherPlace: current.weatherPlace,
    weatherFetchedAtMs: current.fetchedAtMs,
    weatherError: online ? current.weatherError : null,
    weatherErrorCode: online ? current.weatherErrorCode : null,
    weatherRefreshing: online && current.refreshing,
    weatherLastAttemptAtMs: current.lastAttemptAtMs,
    weatherRetryAtMs: current.retryAtMs,
    weatherLocationSource: validCoordinates(latitude, longitude) ? (geo?.cached ? "ip-cached" : "ip") : "reference",
    refreshWeather,
  };
}
