import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironmentRequester, parseGeoResponse, readGeoCache, writeGeoCache, fetchGeo,
  weatherLocation, buildWeatherUrl, weatherForCode, parseWeatherResponse, fetchWeather,
  readWeatherCache, writeWeatherCache, simulatedWeather, validCoordinates,
} from '../src/services/environment.js';
import { SERVICES_CONFIG } from '../src/config/services.js';
import { DEFAULT_REGION } from '../src/lib/gameConfig.js';

const NOW = 1792468800000;
const store = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
};
const geoPayload = { country_code: 'CN', region: '浙江省', city: '杭州', latitude: 30.25, longitude: 120.16 };
const location = weatherLocation('jiangnan', { ...geoPayload, detail: '杭州' });
const weatherPayload = (extra = {}) => ({
  latitude: location.latitude, longitude: location.longitude,
  current_units: { temperature_2m: '°C' },
  current: { temperature_2m: 19.24, weather_code: 61, time: NOW / 1000 }, ...extra,
});

test('CN and HK/MO/TW fresh matches alone are marked ip', () => {
  const cn = parseGeoResponse(geoPayload);
  assert.equal(cn.regionId, 'jiangnan');
  assert.equal(cn.source, 'ip');
  assert.equal(cn.cached, false);
  assert.equal(cn.latitude, 30.25);
  for (const [country, expected] of [['HK', 'lingnan'], ['MO', 'lingnan'], ['TW', 'dongnan']]) {
    const result = parseGeoResponse({ country_code: country, region: 'Unknown English region' });
    assert.equal(result.regionId, expected);
    assert.equal(result.source, 'ip');
  }
});

test('all 34 province names have an actual mapping rather than accidental default', () => {
  const provinces = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
    '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
    '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃',
    '青海', '宁夏', '新疆', '香港', '澳门', '台湾'];
  for (const province of provinces) assert.equal(parseGeoResponse({ country_code: 'CN', region: province }).source, 'ip', province);
});

test('unknown CN and overseas responses never masquerade as a fresh successful match', () => {
  const unknown = parseGeoResponse({ country_code: 'CN', region: 'Unknown', city: 'Unknown' });
  assert.equal(unknown.regionId, DEFAULT_REGION);
  assert.equal(unknown.source, 'default');
  const overseas = parseGeoResponse({ country_code: 'US', region: 'Washington', latitude: 47.6, longitude: -122.3 });
  assert.equal(overseas.source, 'oversea');
  assert.equal(overseas.latitude, 47.6);
  assert.equal(parseGeoResponse({ country_code: 'CN', region: '浙江', latitude: '30', longitude: 120 }).latitude, undefined);
  assert.throws(() => parseGeoResponse({ country_code: 'CN-invalid', region: '浙江' }), /国家字段/);
  for (const invalid of [null, [], {}, { error: true }, { country_code: 23 }]) assert.throws(() => parseGeoResponse(invalid));
});

test('geo cache is versioned, validated, expires, and always downgrades ip to ip-cached', () => {
  const storage = store();
  const current = parseGeoResponse(geoPayload);
  writeGeoCache(storage, current, NOW);
  const cached = readGeoCache(storage, NOW + 1000);
  assert.equal(cached.source, 'ip-cached');
  assert.equal(cached.cached, true);
  assert.equal(cached.regionId, current.regionId);
  assert.equal(readGeoCache(storage, NOW + SERVICES_CONFIG.geo.cacheMaxAgeMs + 1), null);
  assert.equal(readGeoCache(storage, NOW - 1), null);
  storage.setItem(SERVICES_CONFIG.geo.cacheKey, '{broken');
  assert.equal(readGeoCache(storage, NOW), null);
  storage.setItem(SERVICES_CONFIG.geo.cacheKey, JSON.stringify({ version: 1, source: 'ip', regionId: 'invalid', fetchedAtMs: NOW }));
  assert.equal(readGeoCache(storage, NOW), null);
  assert.doesNotThrow(() => writeGeoCache({ setItem() { throw new Error('storage unavailable'); } }, current, NOW));
});

test('successive geo requests can follow a changed VPN rather than reusing cache', async () => {
  let calls = 0;
  const requestJson = async () => ({ country_code: 'CN', region: calls++ === 0 ? '广东' : '黑龙江' });
  assert.equal((await fetchGeo({ requestJson })).regionId, 'lingnan');
  assert.equal((await fetchGeo({ requestJson })).regionId, 'dongbei');
  assert.equal(calls, 2);
});

test('desktop request bridge is preferred and bridge failure never uses renderer fetch', async () => {
  let bridgeCalls = 0;
  let fetchCalls = 0;
  const request = createEnvironmentRequester({
    desktop: { requestEnvironment: async () => { bridgeCalls++; return geoPayload; } },
    fetchImpl: async () => { fetchCalls++; throw new Error('must not run'); },
  });
  assert.deepEqual(await request(SERVICES_CONFIG.geo.url), geoPayload);
  assert.equal(bridgeCalls, 1);
  assert.equal(fetchCalls, 0);
  const failed = createEnvironmentRequester({
    desktop: { requestEnvironment: async () => { throw new Error('bridge offline'); } },
    fetchImpl: async () => { fetchCalls++; },
  });
  await assert.rejects(failed(SERVICES_CONFIG.geo.url), /bridge offline/);
  assert.equal(fetchCalls, 0);
});

test('Web requests omit credentials, use no-store, and reject HTTP or malformed JSON', async () => {
  const request = createEnvironmentRequester({ desktop: null, fetchImpl: async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    return Response.json(geoPayload);
  } });
  assert.deepEqual(await request(SERVICES_CONFIG.geo.url), geoPayload);
  const failed = createEnvironmentRequester({ desktop: null, fetchImpl: async () => new Response('', { status: 503 }) });
  await assert.rejects(failed(SERVICES_CONFIG.geo.url), /HTTP 503/);
  const malformed = createEnvironmentRequester({ desktop: null, fetchImpl: async () => new Response('{bad') });
  await assert.rejects(malformed(SERVICES_CONFIG.geo.url));
  await assert.rejects(request('https://example.com/json/'), /Unknown environment service/);
  await assert.rejects(request('https://ipapi.co/json/?extra=1'), /Unknown environment service/);
});

test('HTTP 429 cools down for at least 15 minutes and honors longer Retry-After', async () => {
  let now = NOW;
  let calls = 0;
  const request = createEnvironmentRequester({ desktop: null, now: () => now, fetchImpl: async () => {
    calls++;
    return new Response('', { status: 429, headers: { 'Retry-After': '1800' } });
  } });
  await assert.rejects(request(SERVICES_CONFIG.geo.url), /429/);
  now += 15 * 60 * 1000;
  await assert.rejects(request(SERVICES_CONFIG.geo.url), /429/);
  assert.equal(calls, 1);
  now += 15 * 60 * 1000;
  await assert.rejects(request(SERVICES_CONFIG.geo.url), /429/);
  assert.equal(calls, 2);
});

test('desktop serialized 429 also receives a cooldown', async () => {
  let calls = 0;
  const request = createEnvironmentRequester({ now: () => NOW,
    desktop: { requestEnvironment: async () => { calls++; throw new Error('暂不可用（HTTP 429）。'); } } });
  await assert.rejects(request(SERVICES_CONFIG.geo.url), /429/);
  await assert.rejects(request(SERVICES_CONFIG.geo.url), /429/);
  assert.equal(calls, 1);
});

test('timeout and caller abort settle even if a desktop request never resolves', async () => {
  const request = createEnvironmentRequester({ desktop: { requestEnvironment: () => new Promise(() => {}) } });
  await assert.rejects(request(SERVICES_CONFIG.geo.url, { timeoutMs: 10 }), { name: 'AbortError' });
  const controller = new AbortController();
  const pending = request(SERVICES_CONFIG.geo.url, { signal: controller.signal, timeoutMs: 5000 });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(request(SERVICES_CONFIG.geo.url, { signal: controller.signal }), { name: 'AbortError' });
});

test('weather uses valid IP coordinates even if the game travels elsewhere', () => {
  const a = weatherLocation('jiangnan', { ...geoPayload, detail: '杭州' });
  const b = weatherLocation('qingzang', { ...geoPayload, detail: '杭州' });
  assert.deepEqual(a, b);
  assert.equal(a.latitude, 30.25);
  assert.equal(a.place, '杭州');
  const regional = weatherLocation('qingzang', { latitude: null, longitude: 20 });
  assert.equal(regional.place, '拉萨');
  assert.ok(validCoordinates(regional.latitude, regional.longitude));
  assert.equal(weatherLocation('invalid').place, '南京');
});

test('weather URL requests only current Celsius temperature and WMO code', () => {
  const url = new URL(buildWeatherUrl(location));
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.equal(url.searchParams.get('current'), 'temperature_2m,weather_code');
  assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.throws(() => buildWeatherUrl({ latitude: 91, longitude: 100 }));
});

test('WMO codes map to the existing simple scene effects', () => {
  for (const [code, label] of [[0, '晴'], [2, '多云'], [45, '多云'], [61, '小雨'], [95, '小雨'], [73, '雪'], [86, '雪']]) {
    assert.equal(weatherForCode(code), label);
  }
  assert.throws(() => weatherForCode(999));
  assert.throws(() => weatherForCode('61'));
});

test('weather responses validate coordinates, age, units, fields, and return observation epoch', async () => {
  const result = parseWeatherResponse(weatherPayload(), location, NOW);
  assert.equal(result.temperature, 19.2);
  assert.equal(result.weather, '小雨');
  assert.equal(result.weatherSource, 'online');
  assert.equal(result.weatherUpdatedAt, NOW);
  assert.equal(result.locationKey, location.key);
  const actual = await fetchWeather(location, { requestJson: async () => weatherPayload(), now: () => NOW });
  assert.deepEqual(actual, result);
  for (const payload of [null, [], { error: true }, weatherPayload({ latitude: 99 }),
    weatherPayload({ longitude: -120 }), weatherPayload({ current: { time: NOW / 1000, weather_code: 0, temperature_2m: null } }),
    weatherPayload({ current: { time: (NOW - SERVICES_CONFIG.weather.cacheMaxAgeMs - 1000) / 1000, weather_code: 0, temperature_2m: 20 } }),
    weatherPayload({ current: { time: (NOW + 60 * 60 * 1000) / 1000, weather_code: 0, temperature_2m: 20 } }),
    weatherPayload({ current_units: { temperature_2m: '°F' } })]) {
    assert.throws(() => parseWeatherResponse(payload, location, NOW));
  }
});

test('weather cache is isolated by coordinates, expires, and never claims live weather', () => {
  const storage = store();
  const weather = parseWeatherResponse(weatherPayload(), location, NOW);
  writeWeatherCache(storage, location, weather);
  assert.equal(readWeatherCache(storage, location, NOW + 1000).weatherSource, 'cached');
  assert.equal(readWeatherCache(storage, weatherLocation('qingzang'), NOW), null);
  assert.equal(readWeatherCache(storage, location, NOW + SERVICES_CONFIG.weather.cacheMaxAgeMs + 1), null);
  assert.equal(readWeatherCache(storage, location, NOW - 1), null);
  const broken = { getItem: () => '{bad' };
  assert.equal(readWeatherCache(broken, location, NOW), null);
  assert.doesNotThrow(() => writeWeatherCache({ setItem() { throw new Error('full'); } }, location, weather));
});

test('offline simulation exposes its source and no invented temperature', () => {
  const result = simulatedWeather(location, NOW);
  assert.equal(result.weatherSource, 'simulated');
  assert.equal(result.temperature, null);
  assert.equal(result.weatherUpdatedAt, null);
  assert.equal(result.weatherPlace, '杭州');
  assert.ok(['晴', '多云', '小雨'].includes(result.weather));
  assert.deepEqual(simulatedWeather(location, NOW), result);
});
