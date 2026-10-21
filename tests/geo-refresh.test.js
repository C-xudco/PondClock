import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  bindGeoRefreshTriggers, createEnvironmentRequester, createGeoRefreshController, EnvironmentError,
  initialGeoState, parseGeoResponse, readGeoCache, writeGeoCache,
} from '../src/services/environment.js';
import { SERVICES_CONFIG } from '../src/config/services.js';
import { DEFAULT_REGION } from '../src/lib/gameConfig.js';

const require = createRequire(import.meta.url);
const { createEnvironmentService } = require('../desktop/environment.cjs');
const NOW = 1792540800000;
const geoUrl = SERVICES_CONFIG.geo.url;
const config = SERVICES_CONFIG.geo;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const store = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value) };
};
const result = (province) => parseGeoResponse({ country_code: 'CN', region: province });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('new games have a usable fallback immediately and cached visits never claim a new live IP', () => {
  const storage = store();
  const empty = initialGeoState(storage, NOW);
  assert.equal(empty.regionId, DEFAULT_REGION);
  assert.equal(empty.source, 'fallback');
  assert.equal(empty.refreshing, false);
  assert.equal(empty.fetchedAtMs, null);
  writeGeoCache(storage, result('广东'), NOW);
  const cached = initialGeoState(storage, NOW + 100);
  assert.equal(cached.regionId, 'lingnan');
  assert.equal(cached.source, 'ip-cached');
  assert.equal(cached.fetchedAtMs, NOW);
});

test('even a recent geo cache cannot suppress a fresh startup lookup after a VPN change', async () => {
  const storage = store();
  writeGeoCache(storage, result('广东'), NOW);
  let calls = 0;
  const controller = createGeoRefreshController({ storage, now: () => NOW + 1000,
    fetchGeoImpl: async () => { calls++; return result('黑龙江'); } });
  const pending = controller.refresh('startup');
  assert.equal(controller.getState().source, 'ip-cached');
  assert.equal(controller.getState().refreshing, true);
  await pending;
  assert.equal(calls, 1);
  assert.equal(controller.getState().regionId, 'dongbei');
  assert.equal(controller.getState().source, 'ip');
  assert.equal(controller.getState().fetchedAtMs, NOW + 1000);
  assert.equal(readGeoCache(storage, NOW + 1000).regionId, 'dongbei');
});

test('newer manual refresh cancels an old lookup and late old replies cannot overwrite state or cache', async () => {
  let now = NOW;
  const requests = [];
  const storage = store();
  const controller = createGeoRefreshController({ storage, now: () => now, fetchGeoImpl: ({ signal }) => {
    const request = deferred(); requests.push({ ...request, signal }); return request.promise;
  } });
  const first = controller.refresh('startup');
  await tick();
  now += config.manualThrottleMs;
  const second = controller.refresh('manual');
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(result('黑龙江'));
  await second;
  requests[0].resolve(result('广东'));
  await first;
  assert.equal(controller.getState().regionId, 'dongbei');
  assert.equal(readGeoCache(storage, now).regionId, 'dongbei');
});

test('automatic focus/poll requests deduplicate in-flight work and respect the throttle', async () => {
  let now = NOW;
  let calls = 0;
  const request = deferred();
  const controller = createGeoRefreshController({ storage: store(), now: () => now,
    fetchGeoImpl: async () => { calls++; return request.promise; } });
  const started = controller.refresh('startup');
  assert.equal(controller.refresh('focus'), started);
  assert.equal(controller.refresh('poll'), started);
  await tick();
  request.resolve(result('广东'));
  await started;
  await controller.refresh('visibility');
  await controller.refresh('manual');
  assert.equal(calls, 1);
  now += config.autoThrottleMs;
  await controller.refresh('focus');
  assert.equal(calls, 2);
});

test('automatic errors back off while an explicit manual retry can follow a repaired VPN', async () => {
  let now = NOW;
  let calls = 0;
  const controller = createGeoRefreshController({ storage: store(), now: () => now, fetchGeoImpl: async () => {
    calls++; throw Object.assign(new Error('private provider URL and IP'), { status: 403 });
  } });
  await controller.refresh('startup');
  assert.equal(controller.getState().retryAtMs, now + config.failureRetryMs);
  assert.match(controller.getState().error, /拒绝请求/);
  assert.doesNotMatch(controller.getState().error, /private/);
  now += config.autoThrottleMs;
  await controller.refresh('focus');
  assert.equal(calls, 1);
  await controller.refresh('manual');
  assert.equal(calls, 2);
  assert.equal(controller.getState().retryAtMs, now + 2 * config.failureRetryMs);
});

test('manual, foreground and online events cannot bypass an explicit 429 Retry-After', async () => {
  let now = NOW;
  let calls = 0;
  const deadline = NOW + 2 * 24 * 60 * 60 * 1000;
  const controller = createGeoRefreshController({ storage: store(), now: () => now, fetchGeoImpl: async () => {
    calls++;
    if (calls === 1) throw new EnvironmentError('HTTP 429', 429, deadline);
    return result('广东');
  } });
  await controller.refresh('startup');
  assert.equal(controller.getState().retryAtMs, deadline);
  now += config.refreshMs;
  await controller.refresh('manual');
  await controller.refresh('focus');
  controller.offline();
  await controller.refresh('online');
  assert.equal(calls, 1);
  assert.match(controller.getState().error, /请求受限/);
  now = deadline;
  await controller.refresh('poll');
  assert.equal(calls, 2);
  assert.equal(controller.getState().error, null);
});

test('offline cancels a pending lookup and reconnection refreshes without reviving an old reply', async () => {
  const requests = [];
  const controller = createGeoRefreshController({ storage: store(), now: () => NOW, fetchGeoImpl: ({ signal }) => {
    const request = deferred(); requests.push({ ...request, signal }); return request.promise;
  } });
  const original = controller.refresh('startup');
  await tick();
  controller.offline();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(controller.getState().refreshing, false);
  await controller.refresh('manual');
  assert.equal(requests.length, 1);
  const reconnect = controller.refresh('online');
  await tick();
  requests[1].resolve(result('广东'));
  await reconnect;
  requests[0].resolve(result('黑龙江'));
  await original;
  assert.equal(controller.getState().regionId, 'lingnan');
});

test('disabled/unmounted geo controllers abort pending work and never publish or cache a late reply', async () => {
  const storage = store();
  const request = deferred();
  const updates = [];
  let signal;
  const controller = createGeoRefreshController({ storage, now: () => NOW, onChange: (state) => updates.push(state),
    fetchGeoImpl: (options) => { signal = options.signal; return request.promise; } });
  const pending = controller.refresh('startup');
  await tick();
  controller.dispose();
  request.resolve(result('广东'));
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(updates.length, 1);
  assert.equal(readGeoCache(storage, NOW), null);
  await controller.refresh('manual');
  assert.equal(updates.length, 1);
});

test('browser online, focus, visible resume and interval triggers refresh; cleanup removes every trigger', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const navigatorTarget = { onLine: true };
  const reasons = [];
  let interval;
  let disposed = false;
  const stop = bindGeoRefreshTriggers({ refresh: (reason) => { reasons.push(reason); },
    offline: () => reasons.push('offline'), dispose: () => { disposed = true; } }, {
    windowTarget, documentTarget, navigatorTarget,
    schedule: (callback, delay) => { assert.equal(delay, config.refreshMs); interval = callback; return 7; },
    cancel: (id) => { assert.equal(id, 7); },
  });
  windowTarget.dispatchEvent(new Event('focus'));
  documentTarget.visibilityState = 'hidden';
  interval();
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  interval();
  navigatorTarget.onLine = false;
  windowTarget.dispatchEvent(new Event('offline'));
  interval();
  navigatorTarget.onLine = true;
  windowTarget.dispatchEvent(new Event('online'));
  stop();
  windowTarget.dispatchEvent(new Event('focus'));
  windowTarget.dispatchEvent(new Event('online'));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(disposed, true);
  assert.deepEqual(reasons, ['startup', 'focus', 'visibility', 'poll', 'offline', 'online']);
});

test('failed refresh falls back to dated cached data without claiming a current IP visit', async () => {
  const storage = store();
  writeGeoCache(storage, result('广东'), NOW);
  const controller = createGeoRefreshController({ storage, now: () => NOW + 1000,
    fetchGeoImpl: async () => { throw new Error('network down'); } });
  await controller.refresh('startup');
  assert.equal(controller.getState().source, 'ip-cached');
  assert.equal(controller.getState().fetchedAtMs, NOW);
  assert.equal(controller.getState().refreshing, false);
  assert.ok(controller.getState().error);
});

test('desktop 429 metadata survives the renderer requester and a fresh controller cannot bypass its gate', async () => {
  let now = NOW;
  let calls = 0;
  const deadline = NOW + 2 * 24 * 60 * 60 * 1000;
  const request = createEnvironmentRequester({ now: () => now, desktop: { requestEnvironment: async () => {
    calls++; throw Object.assign(new Error('HTTP 429'), { status: 429, retryAtMs: deadline });
  } } });
  await assert.rejects(request(geoUrl), (error) => error.status === 429 && error.retryAtMs === deadline);
  now += 60 * 60 * 1000;
  await assert.rejects(request(geoUrl), (error) => error.retryAtMs === deadline);
  assert.equal(calls, 1);
});

test('desktop IP service aborts the old network request while leaving concurrent weather alone', async () => {
  const service = createEnvironmentService();
  const oldGeo = deferred();
  const weather = deferred();
  let geoSignal;
  let weatherSignal;
  const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=30&longitude=120&current=weather_code';
  const weatherCall = service(weatherUrl, async (_url, options) => { weatherSignal = options.signal; return weather.promise; });
  const oldCall = service(geoUrl, async (_url, options) => { geoSignal = options.signal; return oldGeo.promise; });
  const oldRejected = assert.rejects(oldCall, { code: 'ENV_REQUEST_SUPERSEDED' });
  await tick();
  const current = await service(geoUrl, async () => Response.json({ country_code: 'CN', region: '广东' }));
  await oldRejected;
  assert.equal(current.region, '广东');
  assert.equal(geoSignal.aborted, true);
  assert.equal(weatherSignal.aborted, false);
  weather.resolve(Response.json({ weather: true }));
  assert.deepEqual(await weatherCall, { weather: true });
  oldGeo.resolve(Response.json({ country_code: 'CN', region: '黑龙江' }));
});

test('main-process 429 gate respects long HTTP-date Retry-After across repeated bridge calls', async () => {
  let now = NOW;
  let calls = 0;
  const deadline = NOW + 2 * 24 * 60 * 60 * 1000;
  const service = createEnvironmentService({ now: () => now });
  const limited = async () => { calls++; return new Response('', { status: 429,
    headers: { 'Retry-After': new Date(deadline).toUTCString() } }); };
  await assert.rejects(service(geoUrl, limited), (error) => error.status === 429 && error.retryAtMs === deadline);
  now += 24 * 60 * 60 * 1000;
  await assert.rejects(service(geoUrl, limited), (error) => error.retryAtMs === deadline);
  assert.equal(calls, 1);
  now = deadline;
  await service(geoUrl, async () => { calls++; return Response.json({ ok: true }); });
  assert.equal(calls, 2);
});

test('desktop service deadline settles a hung fetch even when the implementation ignores abort', async () => {
  const service = createEnvironmentService({ timeoutMs: 5 });
  await assert.rejects(service(geoUrl, () => new Promise(() => {})), { code: 'ENV_TIMEOUT' });
});

test('quota errors in an HTTP-200 provider body still activate controller cooldown', async () => {
  let calls = 0;
  const controller = createGeoRefreshController({ storage: store(), now: () => NOW, fetchGeoImpl: async () => {
    calls++; return parseGeoResponse({ error: true, reason: 'RateLimited' });
  } });
  await controller.refresh('startup');
  assert.equal(controller.getState().retryAtMs, NOW + config.rateLimitCooldownMs);
  await controller.refresh('manual');
  assert.equal(calls, 1);
});

test('geo cache stores only location fields, excluding IP and refresh-control errors', () => {
  const storage = store();
  writeGeoCache(storage, { ...result('广东'), ip: '192.0.2.5', error: 'private', retryAtMs: NOW }, NOW);
  const raw = storage.getItem(config.cacheKey);
  assert.doesNotMatch(raw, /192\.0\.2|private|retryAtMs/);
});
