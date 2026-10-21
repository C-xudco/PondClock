import test from 'node:test';
import assert from 'node:assert/strict';
import endpoints from '../src/config/environmentEndpoints.cjs';
import {
  createEnvironmentRequester, createGeoFetcher, createGeoRefreshController, EnvironmentError,
  parseGeoResponse, readGeoCache, writeGeoCache,
} from '../src/services/environment.js';
import { SERVICES_CONFIG } from '../src/config/services.js';

const NOW = 1792800000000;
const [primary, backup] = endpoints.GEO_PROVIDERS;
const geo = (region = '广东') => ({ country_code: 'CN', region, latitude: 23.1, longitude: 113.2 });
const backupGeo = (region = '黑龙江') => ({ ...geo(region), success: true, country: 'China' });
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const store = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('renderer accepts the two exact disclosed provider URLs and rejects modified paths or fields', async () => {
  const calls = [];
  const request = createEnvironmentRequester({ desktop: { requestEnvironment: async (url) => { calls.push(url); return geo(); } } });
  await request(primary.url);
  await request(backup.url);
  assert.deepEqual(calls, [primary.url, backup.url]);
  for (const url of ['http://ipwho.is/', 'https://ipwho.is/', `${backup.url}&extra=1`,
    backup.url.replace('success,', ''), backup.url.replace('ipwho.is', 'ipwho.is.example.com'),
    primary.url.replace('https://', 'https://user:secret@')]) {
    await assert.rejects(request(url), /Unknown environment service/);
  }
  assert.equal(calls.length, 2);
});

test('403 falls back successfully and that successful provider is preferred on the next VPN refresh', async () => {
  const calls = [];
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => {
    calls.push(url);
    if (url === primary.url) throw new EnvironmentError('HTTP 403', 403);
    return backupGeo();
  } });
  const first = await lookup();
  assert.equal(first.regionId, 'dongbei');
  assert.equal(first.provider, backup.id);
  assert.deepEqual(first.attempts.map(({ provider, code }) => ({ provider, code })),
    [{ provider: primary.id, code: 'HTTP_403' }, { provider: backup.id, code: 'OK' }]);
  await lookup();
  assert.deepEqual(calls, [primary.url, backup.url, backup.url]);
});

test('a formerly preferred provider can fail after changing network and the other provider becomes preferred', async () => {
  let stage = 0;
  const calls = [];
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => {
    calls.push(url);
    if (stage === 0) {
      if (url === primary.url) throw new Error('network');
      return backupGeo();
    }
    if (url === backup.url) throw new Error('new route blocks this provider');
    return geo('浙江');
  } });
  await lookup(); stage++;
  const changed = await lookup();
  await lookup();
  assert.equal(changed.regionId, 'jiangnan');
  assert.equal(changed.provider, primary.id);
  assert.deepEqual(calls, [primary.url, backup.url, backup.url, primary.url, primary.url]);
});

test('an unresponsive primary times out and uses backup even when its mocked request ignores abort', async () => {
  const signals = [];
  const lookup = createGeoFetcher({ now: () => NOW, timeoutMs: 5, requestJson: async (url, { signal }) => {
    signals.push(signal);
    return url === primary.url ? new Promise(() => {}) : backupGeo();
  } });
  const next = await lookup();
  assert.equal(next.provider, backup.id);
  assert.equal(next.attempts[0].code, 'TIMEOUT');
  assert.equal(signals[0].aborted, true);
});

test('malformed responses and an unmatched Chinese province both trigger fallback', async () => {
  for (const payload of [null, [], { country_code: 'invalid' }, geo('Unknown Province')]) {
    const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => url === primary.url ? payload : backupGeo() });
    const next = await lookup();
    assert.equal(next.regionId, 'dongbei');
    assert.equal(next.attempts[0].code, 'INVALID_RESPONSE');
  }
});

test('malformed HTTP JSON and browser network failures have bounded diagnostic codes', async () => {
  for (const [failure, expected] of [[new SyntaxError('private JSON 192.0.2.12'), 'INVALID_RESPONSE'],
    [new TypeError('private URL https://secret.example'), 'NETWORK_ERROR']]) {
    const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => {
      if (url === primary.url) throw failure;
      return backupGeo();
    } });
    const next = await lookup();
    assert.equal(next.attempts[0].code, expected);
    assert.doesNotMatch(JSON.stringify(next), /192\.0\.2|secret\.example|private/);
  }
});

test('a valid overseas result is accepted without inventing a Chinese region or probing another provider', async () => {
  let calls = 0;
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async () => { calls++; return { country_code: 'US', country_name: 'United States' }; } });
  const next = await lookup();
  assert.equal(next.source, 'oversea');
  assert.equal(next.detail, 'United States');
  assert.equal(calls, 1);
});

test('ipwhois success:false cannot unlock a province, while country names and HK/MO/TW remain usable', () => {
  assert.throws(() => parseGeoResponse({ ...backupGeo(), success: false, message: 'Reserved range' }, backup.id));
  assert.throws(() => parseGeoResponse({ ...geo(), country: 'China' }, backup.id));
  assert.equal(parseGeoResponse({ success: true, country_code: 'US', country: 'United States' }, backup.id).detail, 'United States');
  for (const [country, expected] of [['HK', 'lingnan'], ['MO', 'lingnan'], ['TW', 'dongnan']]) {
    assert.equal(parseGeoResponse({ success: true, country_code: country }, backup.id).regionId, expected);
  }
});

test('one provider 429 has its own cooldown while the independent disclosed provider still works', async () => {
  const deadline = NOW + 60 * 60 * 1000;
  const calls = [];
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => {
    calls.push(url);
    if (url === primary.url) throw new EnvironmentError('HTTP 429', 429, deadline);
    return backupGeo();
  } });
  const next = await lookup();
  assert.equal(next.provider, backup.id);
  assert.equal(next.attempts[0].code, 'HTTP_429');
  assert.equal(next.attempts[0].retryAtMs, deadline);
  await lookup();
  assert.deepEqual(calls, [primary.url, backup.url, backup.url]);
});

test('only all-provider throttling returns global 429 with the earliest permitted retry time', async () => {
  let now = NOW;
  let calls = 0;
  const firstRetry = NOW + 60 * 60 * 1000;
  const secondRetry = NOW + 2 * 60 * 60 * 1000;
  const lookup = createGeoFetcher({ now: () => now, requestJson: async (url) => {
    calls++;
    if (now >= firstRetry && url === primary.url) return geo();
    throw new EnvironmentError('HTTP 429', 429, url === primary.url ? firstRetry : secondRetry);
  } });
  await assert.rejects(lookup(), (error) => error.status === 429 && error.retryAtMs === firstRetry && error.code === 'GEO_RATE_LIMITED');
  await assert.rejects(lookup(), (error) => error.attempts.every((attempt) => attempt.code === 'COOLDOWN'));
  assert.equal(calls, 2);
  now = firstRetry;
  assert.equal((await lookup()).provider, primary.id);
  assert.equal(calls, 3);
});

test('mixed provider denial and throttling is unavailable rather than a misleading global quota failure', async () => {
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => {
    throw new EnvironmentError(url === primary.url ? 'HTTP 403' : 'HTTP 429', url === primary.url ? 403 : 429);
  } });
  await assert.rejects(lookup(), (error) => error.code === 'GEO_UNAVAILABLE' && error.status === null
    && error.attempts[0].code === 'HTTP_403' && error.attempts[1].code === 'HTTP_429');
});

test('provider application-level quota responses also enter that provider cooldown', async () => {
  let calls = 0;
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async () => {
    calls++; return { success: false, message: 'Rate limit exceeded' };
  } });
  await assert.rejects(lookup(), (error) => error.code === 'GEO_RATE_LIMITED');
  await assert.rejects(lookup());
  assert.equal(calls, 2);
});

test('explicit caller cancellation immediately stops lookup and never attempts backup', async () => {
  const controller = new AbortController();
  const pending = deferred();
  const calls = [];
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async (url) => { calls.push(url); return pending.promise; } });
  const request = lookup({ signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(request, { name: 'AbortError', code: 'GEO_ABORTED' });
  pending.resolve(geo());
  await tick();
  assert.deepEqual(calls, [primary.url]);
  const previousCalls = calls.length;
  await assert.rejects(lookup({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, previousCalls);
});

test('new main-process superseding cancellation never causes a stale request to launch backup', async () => {
  let calls = 0;
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async () => {
    calls++; throw Object.assign(new Error('replaced'), { name: 'AbortError', code: 'ENV_REQUEST_SUPERSEDED' });
  } });
  await assert.rejects(lookup(), { code: 'GEO_ABORTED' });
  assert.equal(calls, 1);
});

test('controller exposes safe failure attempts and preserves only a valid provider in its geo cache', async () => {
  const storage = store();
  const lookup = createGeoFetcher({ now: () => NOW, requestJson: async () => {
    throw new Error('192.0.2.12 https://secret.example');
  } });
  const controller = createGeoRefreshController({ storage, now: () => NOW, fetchGeoImpl: lookup });
  await controller.refresh('manual');
  assert.equal(controller.getState().errorCode, 'GEO_UNAVAILABLE');
  assert.equal(controller.getState().attempts.length, 2);
  assert.doesNotMatch(JSON.stringify(controller.getState()), /192\.0\.2|secret\.example/);
  writeGeoCache(storage, { ...parseGeoResponse(geo()), provider: backup.id, attempts: [{ ip: '192.0.2.13' }] }, NOW);
  assert.equal(readGeoCache(storage, NOW).provider, backup.id);
  assert.doesNotMatch(storage.getItem(SERVICES_CONFIG.geo.cacheKey), /attempts|192\.0\.2/);
  writeGeoCache(storage, { ...parseGeoResponse(geo()), provider: 'https://unknown.example' }, NOW);
  assert.equal(readGeoCache(storage, NOW).provider, undefined);
});

test('controller uses the earliest valid all-provider retry rather than adding another global minimum', async () => {
  const deadline = NOW + 2 * 60 * 1000;
  const failure = Object.assign(new EnvironmentError('all limited', 429, deadline), { code: 'GEO_RATE_LIMITED', attempts: [] });
  const controller = createGeoRefreshController({ storage: store(), now: () => NOW, fetchGeoImpl: async () => { throw failure; } });
  await controller.refresh('manual');
  assert.equal(controller.getState().retryAtMs, deadline);
});
