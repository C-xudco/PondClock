// Network services enrich the game; cached/default data keeps offline play usable.
export const SERVICES_CONFIG = Object.freeze({
  geo: Object.freeze({
    url: "https://ipapi.co/json/",
    cacheKey: "pondclock.geo",
    timeoutMs: 4500,
    cacheMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
  }),
  weather: Object.freeze({
    url: "https://api.open-meteo.com/v1/forecast",
    cacheKey: "pondclock.weather.v1",
    timeoutMs: 6000,
    refreshMs: 15 * 60 * 1000,
    cacheMaxAgeMs: 6 * 60 * 60 * 1000,
  }),
});
