import { GAME_VERSION } from '../config/storage.js';

const codes = /^(OK|HTTP_[1-5]\d\d|TIMEOUT|INVALID_RESPONSE|NETWORK_ERROR|COOLDOWN|ABORTED|OFFLINE)$/;
const safeCode = (value) => typeof value === 'string' && codes.test(value) ? value : null;
const safeSource = (value) => ['ip', 'ip-cached', 'oversea', 'default', 'fallback', 'disabled', 'online', 'cached', 'simulated', 'reference'].includes(value) ? value : null;
const safeProvider = (value) => ['ipapi', 'ipwhois'].includes(value) ? value : null;
const time = (value) => Number.isSafeInteger(value) && value > 0 ? value : null;

// Deliberately select every field. Never serialize geo, weather, appInfo or Error
// objects wholesale: those may contain location, IPs, paths or proxy credentials.
export function networkDiagnostics({ geo, weather, enabled, connected = globalThis.navigator?.onLine, nowMs = Date.now() }) {
  return JSON.stringify({
    version: GAME_VERSION, checkedAtMs: nowMs,
    enabled: enabled === true, systemReportsOnline: typeof connected === 'boolean' ? connected : null,
    location: {
      source: safeSource(geo?.source), provider: safeProvider(geo?.provider), refreshing: geo?.refreshing === true,
      lastAttemptAtMs: time(geo?.lastAttemptAtMs), fetchedAtMs: time(geo?.fetchedAtMs), retryAtMs: time(geo?.retryAtMs),
      attempts: (Array.isArray(geo?.attempts) ? geo.attempts : []).slice(0, 2).map((attempt) => ({
        provider: safeProvider(attempt.provider), code: safeCode(attempt.code), atMs: time(attempt.atMs),
        retryAtMs: time(attempt.retryAtMs),
      })),
    },
    weather: {
      source: safeSource(weather?.weatherSource), locationSource: safeSource(weather?.weatherLocationSource),
      refreshing: weather?.weatherRefreshing === true, code: safeCode(weather?.weatherErrorCode),
      lastAttemptAtMs: time(weather?.weatherLastAttemptAtMs), retryAtMs: time(weather?.weatherRetryAtMs),
      fetchedAtMs: time(weather?.weatherFetchedAtMs),
    },
  }, null, 2);
}
