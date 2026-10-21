import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { networkDiagnostics } from '../src/services/networkDiagnostics.js';
const require = createRequire(import.meta.url);
const { GEO_PROVIDERS, isGeoUrl } = require('../src/config/environmentEndpoints.cjs');
const { validateEnvironmentUrl, createEnvironmentService } = require('../desktop/environment.cjs');
const { createGeoNetworkFetch } = require('../desktop/environmentNetwork.cjs');

test('both exact HTTPS provider URLs pass desktop and shared allowlists; extra fields/credentials do not', () => {
  for (const { url } of GEO_PROVIDERS) {
    assert.equal(isGeoUrl(url), true);
    assert.equal(validateEnvironmentUrl(url).href, url);
  }
  for (const url of ['https://ipwho.is/', `${GEO_PROVIDERS[1].url},ip`, 'http://ipwho.is/',
    `${GEO_PROVIDERS[1].url}&ip=8.8.8.8`, 'https://ipwho.is.evil.test/',
    GEO_PROVIDERS[1].url.replace('https://', 'https://user:pass@'), `${GEO_PROVIDERS[1].url}#x`]) {
    assert.equal(isGeoUrl(url), false);
    assert.throws(() => validateEnvironmentUrl(url));
  }
});

test('a newer request to the alternate provider cancels an older main-process location request', async () => {
  const request = createEnvironmentService();
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let oldSignal;
  const older = request(GEO_PROVIDERS[0].url, async (_url, init) => {
    oldSignal = init.signal; started(); return new Promise(() => {});
  });
  const rejected = assert.rejects(older, { code: 'ENV_REQUEST_SUPERSEDED' });
  await ready;
  const newer = await request(GEO_PROVIDERS[1].url, async () => Response.json({ success: true }));
  await rejected;
  assert.equal(oldSignal.aborted, true);
  assert.equal(newer.success, true);
});

test('location session reloads proxy and discards pooled connections before fetch', async () => {
  const calls = [];
  const fetchCurrent = createGeoNetworkFetch({
    forceReloadProxyConfig: async () => { calls.push('proxy'); },
    closeAllConnections: async () => { calls.push('close-location'); },
    fetch: async (_url, init) => { calls.push('fetch'); assert.equal(init.credentials, 'omit'); return 'result'; },
  });
  assert.equal(await fetchCurrent(GEO_PROVIDERS[1].url, { credentials: 'omit' }), 'result');
  assert.deepEqual(calls, ['proxy', 'close-location', 'fetch']);
});

test('main also gates HTTP200 provider quota errors across repeated bridge calls', async () => {
  const request = createEnvironmentService({ now: () => 1000 });
  let calls = 0;
  for (const { id, url } of GEO_PROVIDERS) {
    const fetchImpl = async () => {
      calls++;
      return Response.json(id === 'ipapi' ? { error: true, reason: 'RateLimited' }
        : { success: false, message: 'Rate limit exceeded' }, { headers: { 'Retry-After': '7200' } });
    };
    await assert.rejects(request(url, fetchImpl), { status: 429, retryAtMs: 7201000 });
    await assert.rejects(request(url, fetchImpl), { status: 429, retryAtMs: 7201000 });
  }
  assert.equal(calls, 2, 'each provider is contacted once, then protected in main');
});

test('cancelled proxy reload never closes a newer request socket or starts a stale request', async () => {
  const controller = new AbortController();
  const fetchCurrent = createGeoNetworkFetch({
    forceReloadProxyConfig: async () => { controller.abort(); },
    closeAllConnections: async () => { assert.fail('must not close after cancellation'); },
    fetch: async () => { assert.fail('must not fetch after cancellation'); },
  });
  await assert.rejects(fetchCurrent(GEO_PROVIDERS[1].url, { signal: controller.signal }), { name: 'AbortError' });
});

test('diagnostics selects safe status fields and discards location, IPs, proxy errors, paths and save assets', () => {
  const secret = 'private-IP-location-password-save';
  const report = networkDiagnostics({ enabled: true, connected: true, nowMs: 1234,
    geo: { source: 'ip', provider: 'ipwhois', detail: secret, ip: secret, latitude: 25,
      error: secret, attempts: [{ provider: 'ipapi', code: 'HTTP_403', atMs: 123, message: secret },
        { provider: 'ipwhois', code: 'OK', atMs: 124, raw: secret }], save: secret },
    weather: { weatherSource: 'simulated', weatherLocationSource: 'reference', weatherErrorCode: 'TIMEOUT',
      weatherPlace: secret, weatherError: secret, userData: secret },
  });
  assert.equal(report.includes(secret), false);
  assert.equal(report.includes('latitude'), false);
  assert.equal(JSON.parse(report).location.attempts[0].code, 'HTTP_403');
  assert.equal(JSON.parse(report).weather.code, 'TIMEOUT');
});
