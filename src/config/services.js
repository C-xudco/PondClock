import endpoints from './environmentEndpoints.cjs';

// Network services enrich the game; cached/default data keeps offline play usable.
export const SERVICES_CONFIG = Object.freeze({
  geo: Object.freeze({
    url: "https://ipapi.co/json/",
    providers: endpoints.GEO_PROVIDERS,
    cacheKey: "pondclock.geo",
    initialWaitMs: 1000,
    timeoutMs: 4500,
    cacheMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
    refreshMs: 2 * 60 * 1000,
    autoThrottleMs: 30 * 1000,
    manualThrottleMs: 2 * 1000,
    failureRetryMs: 60 * 1000,
    maxFailureRetryMs: 15 * 60 * 1000,
    rateLimitCooldownMs: 15 * 60 * 1000,
  }),
  weather: Object.freeze({
    url: "https://api.open-meteo.com/v1/forecast",
    cacheKey: "pondclock.weather.v1",
    timeoutMs: 6000,
    refreshMs: 15 * 60 * 1000,
    cacheMaxAgeMs: 6 * 60 * 60 * 1000,
    failureRetryMs: 60 * 1000,
    maxFailureRetryMs: 15 * 60 * 1000,
    manualThrottleMs: 2 * 1000,
    pollMs: 30 * 1000,
  }),
});
