import { useEffect, useMemo, useState } from "react";
import { SERVICES_CONFIG } from "@/config/services";
import {
  browserStorage, fetchWeather, readWeatherCache, writeWeatherCache,
  simulatedWeather, weatherLocation,
} from "@/services/environment";

const SEASONS = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"];

// Computer-local weather follows IP coordinates, independent of game air travel.
export function useClockWeather(regionId, geo, online = true) {
  const [now, setNow] = useState(() => new Date());
  const latitude = geo?.latitude;
  const longitude = geo?.longitude;
  const detail = geo?.detail;
  const location = useMemo(() => weatherLocation(regionId, { latitude, longitude, detail }),
    [regionId, latitude, longitude, detail]);
  const fallback = () => readWeatherCache(browserStorage(), location) || simulatedWeather(location);
  const [environment, setEnvironment] = useState(fallback);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let timer;
    const controller = new AbortController();
    const stored = () => readWeatherCache(browserStorage(), location) || simulatedWeather(location);
    setEnvironment(stored());

    const refresh = async () => {
      const cached = readWeatherCache(browserStorage(), location);
      const age = cached ? Date.now() - cached.fetchedAtMs : Infinity;
      if (cached && age < SERVICES_CONFIG.weather.refreshMs) {
        if (active) {
          setEnvironment(cached);
          timer = setTimeout(refresh, SERVICES_CONFIG.weather.refreshMs - age);
        }
        return;
      }
      try {
        const next = await fetchWeather(location, { signal: controller.signal });
        if (!active) return;
        writeWeatherCache(browserStorage(), location, next);
        setEnvironment(next);
      } catch {
        if (!active) return;
        setEnvironment(stored());
      }
      // Failures, including 429, wait the full refresh interval before retrying.
      if (active) timer = setTimeout(refresh, SERVICES_CONFIG.weather.refreshMs);
    };

    if (online) refresh();
    else timer = setInterval(() => { if (active) setEnvironment(stored()); }, SERVICES_CONFIG.weather.refreshMs);
    return () => { active = false; controller.abort(); clearTimeout(timer); clearInterval(timer); };
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
  };
}
