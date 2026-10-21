import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindWeatherRefreshTriggers, createWeatherRefreshController, initialWeatherState, WEATHER_REFRESH_DEFAULTS,
} from '../src/services/weatherRefresh.js';
import { EnvironmentError, readWeatherCache, weatherLocation, writeWeatherCache } from '../src/services/environment.js';

const NOW = 1792540800000;
const MINUTE = 60 * 1000;
const firstLocation = weatherLocation('jiangnan');
const secondLocation = weatherLocation('lingnan');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const storage = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) };
};
const weather = (location = firstLocation, time = NOW, temperature = 20) => ({
  locationKey: location.key, weather: '晴', temperature, weatherSource: 'online',
  weatherUpdatedAt: time, weatherPlace: location.place, fetchedAtMs: time,
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('weather starts with usable simulation or location-specific cache without a network dependency', () => {
  const store = storage();
  assert.equal(initialWeatherState(firstLocation, store, NOW).weatherSource, 'simulated');
  writeWeatherCache(store, firstLocation, weather());
  const cached = initialWeatherState(firstLocation, store, NOW + 100);
  assert.equal(cached.weatherSource, 'cached');
  assert.equal(cached.refreshing, false);
  assert.equal(cached.weatherError, null);
  assert.equal(initialWeatherState(secondLocation, store, NOW + 100).weatherSource, 'simulated');
});

test('successful 15-minute cache suppresses startup, focus, online and polling; manual refresh remains available', async () => {
  let now = NOW + 1000;
  let calls = 0;
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => now,
    fetchWeatherImpl: async (location) => { calls++; return weather(location, now, 25); } });
  for (const reason of ['startup', 'focus', 'online', 'poll']) await controller.refresh(reason);
  assert.equal(calls, 0);
  await controller.refresh('manual');
  assert.equal(calls, 1);
  assert.equal(controller.getState().temperature, 25);
  now += WEATHER_REFRESH_DEFAULTS.refreshMs;
  await controller.refresh('poll');
  assert.equal(calls, 2);
});

test('first timeout reports safe state and waits one minute, including manual and online attempts', async () => {
  let now = NOW;
  let calls = 0;
  const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => now,
    fetchWeatherImpl: async () => { calls++; throw Object.assign(new Error('private diagnostic text'), { code: 'ENV_TIMEOUT' }); } });
  const pending = controller.refresh('startup');
  assert.equal(controller.getState().refreshing, true);
  assert.equal(controller.getState().lastAttemptAtMs, NOW);
  await pending;
  assert.equal(controller.getState().weatherErrorCode, 'TIMEOUT');
  assert.equal(controller.getState().weatherError.includes('private'), false);
  assert.equal(controller.getState().weatherSource, 'simulated');
  assert.equal(controller.getState().retryAtMs, NOW + MINUTE);
  now += MINUTE - 1;
  for (const reason of ['manual', 'online', 'focus', 'poll']) await controller.refresh(reason);
  assert.equal(calls, 1);
  now++;
  await controller.refresh('poll');
  assert.equal(calls, 2);
  assert.equal(controller.getState().retryAtMs, now + 2 * MINUTE);
});

test('reconnecting clears an offline badge using a fresh cache without forcing a network request', async () => {
  let connected = false;
  let calls = 0;
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store,
    connected: () => connected, now: () => NOW + 1000,
    fetchWeatherImpl: async () => { calls++; return weather(); } });
  await controller.refresh('startup');
  assert.equal(controller.getState().weatherErrorCode, 'OFFLINE');
  connected = true;
  await controller.refresh('focus');
  assert.equal(calls, 0);
  assert.equal(controller.getState().weatherSource, 'cached');
  assert.equal(controller.getState().weatherError, null);
  assert.equal(controller.getState().weatherErrorCode, null);
});

test('a fresh cache cannot erase an active HTTP cooldown when reconnecting', async () => {
  let calls = 0;
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => NOW + 1000,
    fetchWeatherImpl: async () => { calls++; throw new EnvironmentError('HTTP 429', 429, NOW + 60 * MINUTE); } });
  await controller.refresh('manual');
  controller.offline();
  await controller.refresh('online');
  assert.equal(calls, 1);
  assert.equal(controller.getState().weatherErrorCode, 'HTTP_429');
  assert.equal(controller.getState().retryAtMs, NOW + 60 * MINUTE);
});

test('failure backoff doubles from one minute and stops growing at fifteen minutes', async () => {
  let now = NOW;
  const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => now,
    fetchWeatherImpl: async () => { throw new TypeError('network unavailable'); } });
  for (const delay of [1, 2, 4, 8, 15, 15, 15]) {
    await controller.refresh('poll');
    assert.equal(controller.getState().retryAtMs, now + delay * MINUTE);
    now = controller.getState().retryAtMs;
  }
});

test('HTTP 429 honors long Retry-After across manual, reconnect, location change and local-mode toggles', async () => {
  let now = NOW;
  let calls = 0;
  const deadline = NOW + 2 * 60 * MINUTE;
  const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => now,
    fetchWeatherImpl: async (location) => {
      calls++;
      if (calls === 1) throw new EnvironmentError('HTTP 429', 429, deadline);
      return weather(location, now);
    } });
  await controller.refresh('startup');
  assert.equal(controller.getState().weatherErrorCode, 'HTTP_429');
  assert.equal(controller.getState().retryAtMs, deadline);
  controller.offline();
  await controller.refresh('online');
  controller.setLocation(secondLocation);
  controller.setEnabled(false);
  await controller.refresh('manual');
  controller.setEnabled(true);
  now = deadline - 1;
  for (const reason of ['manual', 'online', 'focus', 'context', 'poll']) await controller.refresh(reason);
  assert.equal(calls, 1);
  now = deadline;
  await controller.refresh('poll');
  assert.equal(calls, 2);
  assert.equal(controller.getState().locationKey, secondLocation.key);
  assert.equal(controller.getState().weatherError, null);
  assert.equal(controller.getState().retryAtMs, 0);
});

test('429 without a valid Retry-After uses at least the weather service fifteen-minute cooldown', async () => {
  const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => NOW,
    fetchWeatherImpl: async () => { throw new EnvironmentError('HTTP 429', 429, Infinity); } });
  await controller.refresh('startup');
  assert.equal(controller.getState().retryAtMs, NOW + 15 * MINUTE);
});

test('disabled enhancements or navigator offline never send a weather request; focus can recover a missed online event', async () => {
  let connected = false;
  let calls = 0;
  const controller = createWeatherRefreshController({ location: firstLocation, enabled: false, storage: storage(),
    connected: () => connected, now: () => NOW,
    fetchWeatherImpl: async (location) => { calls++; return weather(location); } });
  for (const reason of ['startup', 'manual', 'online', 'focus', 'poll']) await controller.refresh(reason);
  assert.equal(calls, 0);
  controller.setEnabled(true);
  await controller.refresh('manual');
  assert.equal(calls, 0);
  assert.equal(controller.getState().weatherErrorCode, 'OFFLINE');
  connected = true;
  await controller.refresh('focus');
  assert.equal(calls, 1);
  assert.equal(controller.getState().weatherSource, 'online');
});

test('local-mode polling expires a six-hour cache without any network request or error', async () => {
  let now = NOW;
  let calls = 0;
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const controller = createWeatherRefreshController({ location: firstLocation, enabled: false, storage: store,
    now: () => now, fetchWeatherImpl: async () => { calls++; return weather(); } });
  now += WEATHER_REFRESH_DEFAULTS.cacheMaxAgeMs;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'cached');
  assert.equal(controller.getState().temperature, 20);
  now++;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'simulated');
  assert.equal(controller.getState().temperature, null);
  assert.equal(controller.getState().weatherError, null);
  assert.equal(controller.getState().weatherErrorCode, null);
  assert.equal(calls, 0);
});

test('local-mode cache expiry preserves a longer service Retry-After deadline', async () => {
  let now = NOW;
  let calls = 0;
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const deadline = NOW + 24 * 60 * MINUTE;
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => now,
    fetchWeatherImpl: async () => { calls++; throw new EnvironmentError('HTTP 429', 429, deadline); } });
  await controller.refresh('manual');
  controller.setEnabled(false);
  now += WEATHER_REFRESH_DEFAULTS.cacheMaxAgeMs + 1;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'simulated');
  assert.equal(controller.getState().temperature, null);
  assert.equal(controller.getState().weatherError, null);
  assert.equal(controller.getState().retryAtMs, deadline);
  controller.setEnabled(true);
  await controller.refresh('online');
  assert.equal(calls, 1);
  assert.equal(controller.getState().weatherErrorCode, 'HTTP_429');
  assert.equal(controller.getState().retryAtMs, deadline);
});

test('automatic requests deduplicate pending work and a newer manual refresh owns state and cache', async () => {
  let now = NOW;
  const requests = [];
  const store = storage();
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => now,
    fetchWeatherImpl: (_location, { signal }) => {
      const request = deferred(); requests.push({ ...request, signal }); return request.promise;
    } });
  const first = controller.refresh('startup');
  assert.equal(controller.refresh('focus'), first);
  assert.equal(controller.refresh('poll'), first);
  assert.equal(controller.refresh('manual'), first, 'manual double clicks share the same pending request');
  await tick();
  now += WEATHER_REFRESH_DEFAULTS.manualThrottleMs;
  const second = controller.refresh('manual');
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(weather(firstLocation, now, 30));
  await second;
  requests[0].resolve(weather(firstLocation, NOW, 1));
  await first;
  assert.equal(controller.getState().temperature, 30);
  assert.equal(readWeatherCache(store, firstLocation, now).temperature, 30);
});

test('changing location aborts the old request and its late reply cannot contaminate the new weather or old cache', async () => {
  const requests = [];
  const store = storage();
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => NOW,
    fetchWeatherImpl: (location, { signal }) => {
      const request = deferred(); requests.push({ ...request, location, signal }); return request.promise;
    } });
  const first = controller.refresh('startup');
  await tick();
  controller.setLocation(secondLocation);
  assert.equal(controller.getState().weatherPlace, secondLocation.place);
  assert.equal(controller.getState().weatherSource, 'simulated');
  const second = controller.refresh('context');
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(weather(secondLocation, NOW, 28));
  await second;
  requests[0].resolve(weather(firstLocation, NOW, 1));
  await first;
  assert.equal(controller.getState().temperature, 28);
  assert.equal(controller.getState().locationKey, secondLocation.key);
  assert.equal(readWeatherCache(store, firstLocation, NOW), null);
});

test('offline and disabled transitions cancel work and late failures do not start retry timers', async () => {
  let connected = true;
  const pending = deferred();
  let signal;
  const store = storage();
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => NOW,
    connected: () => connected, fetchWeatherImpl: (_location, options) => { signal = options.signal; return pending.promise; } });
  const request = controller.refresh('startup');
  await tick();
  connected = false;
  controller.offline();
  assert.equal(signal.aborted, true);
  controller.setEnabled(false);
  pending.reject(new EnvironmentError('HTTP 429', 429, NOW + 600000));
  await request;
  assert.equal(controller.getState().refreshing, false);
  assert.equal(controller.getState().retryAtMs, 0);
  assert.equal(controller.getState().weatherError, null);
  assert.equal(readWeatherCache(store, firstLocation, NOW), null);
});

test('disabling or disposing before dispatch prevents the queued network operation itself', async () => {
  for (const stop of ['disable', 'dispose']) {
    let calls = 0;
    const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => NOW,
      fetchWeatherImpl: async () => { calls++; return weather(); } });
    const pending = controller.refresh('startup');
    if (stop === 'disable') controller.setEnabled(false); else controller.dispose();
    await pending;
    assert.equal(calls, 0, stop);
  }
});

test('disposing aborts the active request and isolates late replies from state, observers and cache', async () => {
  let changes = 0;
  const pending = deferred();
  let signal;
  const store = storage();
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => NOW,
    onChange: () => { changes++; },
    fetchWeatherImpl: (_location, options) => { signal = options.signal; return pending.promise; } });
  const request = controller.refresh('startup');
  await tick();
  controller.dispose();
  const before = controller.getState();
  const count = changes;
  pending.resolve(weather());
  await request;
  await controller.refresh('manual');
  assert.equal(signal.aborted, true);
  assert.equal(changes, count);
  assert.equal(controller.getState(), before);
  assert.equal(readWeatherCache(store, firstLocation, NOW), null);
});

test('network failures retain valid cached weather and safe error codes without exposing raw service messages', async () => {
  const store = storage();
  writeWeatherCache(store, firstLocation, weather());
  const controller = createWeatherRefreshController({ location: firstLocation, storage: store, now: () => NOW + 100,
    fetchWeatherImpl: async () => { throw new EnvironmentError('HTTP 403 private token 1.2.3.4', 403); } });
  await controller.refresh('manual');
  assert.equal(controller.getState().weatherSource, 'cached');
  assert.equal(controller.getState().temperature, 20);
  assert.equal(controller.getState().weatherErrorCode, 'HTTP_403');
  assert.equal(controller.getState().weatherError.includes('1.2.3.4'), false);
});

test('blocked storage retains the latest valid successful weather in memory for offline fallback', async () => {
  let now = NOW;
  let calls = 0;
  const controller = createWeatherRefreshController({ location: firstLocation,
    storage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } },
    now: () => now, fetchWeatherImpl: async (location) => {
      calls++;
      if (calls === 1) return weather(location, now, 24);
      throw new TypeError('offline');
    } });
  await controller.refresh('startup');
  now += 15 * MINUTE;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'cached');
  assert.equal(controller.getState().temperature, 24);
});

test('memory fallback expires by observation age even when its fetched timestamp is newer', async () => {
  let now = NOW;
  let calls = 0;
  const controller = createWeatherRefreshController({ location: firstLocation,
    storage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } },
    now: () => now, fetchWeatherImpl: async (location) => {
      calls++;
      return { ...weather(location, NOW), weatherUpdatedAt: NOW - 5 * MINUTE };
    } });
  await controller.refresh('startup');
  controller.setEnabled(false);
  now = NOW + WEATHER_REFRESH_DEFAULTS.cacheMaxAgeMs - 5 * MINUTE;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'cached', 'observation exactly at six hours is still usable');
  now++;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherSource, 'simulated', 'old observation expires before the newer fetched timestamp');
  assert.equal(controller.getState().temperature, null);
  assert.equal(calls, 1);
});

test('mismatched response is rejected and a later success clears error/backoff and failure count', async () => {
  let now = NOW;
  let calls = 0;
  const controller = createWeatherRefreshController({ location: firstLocation, storage: storage(), now: () => now,
    fetchWeatherImpl: async (location) => {
      calls++;
      if (calls === 1) return weather(secondLocation, now);
      if (calls === 2) return weather(location, now);
      throw new TypeError('failure');
    } });
  await controller.refresh('startup');
  assert.equal(controller.getState().weatherErrorCode, 'INVALID_RESPONSE');
  now += MINUTE;
  await controller.refresh('poll');
  assert.equal(controller.getState().weatherErrorCode, null);
  assert.equal(controller.getState().retryAtMs, 0);
  now += 15 * MINUTE;
  await controller.refresh('poll');
  assert.equal(controller.getState().retryAtMs, now + MINUTE, 'a successful request resets the exponential backoff');
});

test('browser triggers poll only while visible/online, recover on focus and remove all listeners on cleanup', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const navigatorTarget = { onLine: true };
  const calls = [];
  let poll;
  let disposed = false;
  let canceled;
  const stop = bindWeatherRefreshTriggers({
    refresh: (reason) => { calls.push(reason); }, offline: () => calls.push('offline'), dispose: () => { disposed = true; },
  }, { windowTarget, documentTarget, navigatorTarget,
    schedule: (callback, delay) => { poll = callback; assert.equal(delay, 30000); return 42; }, cancel: (id) => { canceled = id; } });
  assert.deepEqual(calls, ['startup']);
  documentTarget.visibilityState = 'hidden';
  poll(); windowTarget.dispatchEvent(new Event('focus'));
  assert.deepEqual(calls, ['startup']);
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  navigatorTarget.onLine = false;
  poll(); windowTarget.dispatchEvent(new Event('offline'));
  navigatorTarget.onLine = true;
  windowTarget.dispatchEvent(new Event('online'));
  windowTarget.dispatchEvent(new Event('focus'));
  poll();
  assert.deepEqual(calls, ['startup', 'visibility', 'offline', 'offline', 'online', 'focus', 'poll']);
  stop();
  assert.equal(disposed, true);
  assert.equal(canceled, 42);
  const count = calls.length;
  for (const name of ['online', 'offline', 'focus']) windowTarget.dispatchEvent(new Event(name));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls.length, count);
});
