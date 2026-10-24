import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SERVICES_CONFIG } from "../src/config/services.js";
import { SCENE_SITES } from "../src/data/sceneSites.js";
import { SCENE_DEFINITIONS } from "../src/config/sceneDefinitions.js";
import { REGIONS } from "../src/lib/gameConfig.js";
import { toWeatherVisualState } from "../src/domain/weatherVisualState.js";
import { buildSnapshotWeatherUrl, parseWeatherSnapshot, readSnapshotCache, writeSnapshotCache,
  weatherLocationKey, snapshotLocation, simulatedSnapshot, displayWeather } from "../src/services/weatherSnapshot.js";
import { createWeatherScheduler } from "../src/services/weatherScheduler.js";
import { createRegionWeatherStore } from "../src/services/regionWeatherStore.js";
import { createEnvironmentRequester } from "../src/services/environment.js";
const require = createRequire(import.meta.url);
const { createEnvironmentService, validateEnvironmentUrl } = require("../desktop/environment.cjs");

const NOW = Date.UTC(2026, 9, 25, 4);
const location = snapshotLocation({ latitude: 53.48, longitude: 122.355 });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const memory = () => { const map = new Map(); return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value), map }; };
function payload(loc = location, extra = {}) {
  return { latitude: loc.latitude, longitude: loc.longitude,
    current_units: { temperature_2m: "°C", cloud_cover: "%", precipitation: "mm", rain: "mm", showers: "mm", snowfall: "cm" },
    current: { time: NOW / 1000, interval: 900, weather_code: 71, temperature_2m: -2, is_day: 1,
      cloud_cover: 100, precipitation: 0.1, rain: 0, showers: 0, snowfall: 0.02, ...extra } };
}
const snapshot = (loc = location, extra = {}) => parseWeatherSnapshot(payload(loc, extra), loc, NOW);

test("12 scene sites preserve IDs, each has its own documented weather point and immutable route-independent scene", () => {
  assert.deepEqual(Object.keys(SCENE_SITES).sort(), REGIONS.map((region) => region.id).sort());
  for (const [regionId, site] of Object.entries(SCENE_SITES)) {
    assert.equal(site.regionId, regionId);
    assert.equal(SCENE_DEFINITIONS[regionId].siteId, site.siteId);
    assert.match(site.coordinateSource.url, /^https:\/\//);
    assert.equal(site.coordinateSource.checkedOn, "2026-10-25");
    assert.equal(site.timeZone, "Asia/Shanghai");
    assert.ok(Number.isFinite(site.weatherLocation.latitude));
  }
  assert.ok(SCENE_SITES.dongbei.weatherLocation.latitude > 53);
  assert.ok(SCENE_SITES.hainan.weatherLocation.latitude < 19.2);
  assert.ok(SCENE_SITES.xibei.weatherLocation.longitude < 85);
  assert.notEqual(weatherLocationKey(30.0001, 120), weatherLocationKey(30.0002, 120));
});

test("v2 request retains exact coordinates and unit-bearing raw fields; missing or wrong units remain unknown", () => {
  const url = new URL(buildSnapshotWeatherUrl(location));
  assert.equal(url.searchParams.get("precipitation_unit"), "mm");
  assert.match(url.searchParams.get("current"), /is_day,cloud_cover,precipitation,rain,showers,snowfall/);
  const complete = snapshot();
  assert.equal(complete.quality, "complete");
  assert.equal(complete.weatherCode, 71);
  assert.equal(complete.precipitation.snowfallCm, 0.02);
  assert.equal(complete.precipitation.intervalSeconds, 900);
  const raw = payload();
  raw.current_units.snowfall = "mm";
  delete raw.current.is_day;
  const partial = parseWeatherSnapshot(raw, location, NOW);
  assert.equal(partial.precipitation.snowfallCm, null);
  assert.equal(partial.isDay, null);
  assert.equal(partial.quality, "partial");
  assert.equal(displayWeather(97), "雷雨");
  assert.equal(displayWeather(999), "天气未知");
});

test("v2 snapshots reject wrong positions, invalid epochs, Fahrenheit and null temperature", () => {
  for (const value of [null, [], { ...payload(), latitude: 10 }, { ...payload(), current_units: { temperature_2m: "°F" } },
    payload(location, { temperature_2m: null }), payload(location, { time: NOW / 1000 + 3600 }),
    payload(location, { time: NOW / 1000 - 7 * 3600 })]) assert.throws(() => parseWeatherSnapshot(value, location, NOW));
});

test("independent v2 cache validates observation/fetch age, exact identity, structure and never writes simulation", () => {
  const store = memory();
  writeSnapshotCache(store, location, snapshot(), NOW);
  assert.equal(readSnapshotCache(store, location, NOW + 1).source, "cached");
  assert.equal(readSnapshotCache(store, location, NOW - 1), null);
  assert.equal(readSnapshotCache(store, location, NOW + 6 * 3600000 + 1), null);
  assert.equal(readSnapshotCache(store, snapshotLocation({ latitude: 53.4801, longitude: 122.355 }), NOW), null);
  const cachedKey = [...store.map.keys()][0];
  store.map.set(cachedKey, JSON.stringify({ ...snapshot(), precipitation: { ...snapshot().precipitation, snowfallCm: -1 } }));
  assert.equal(readSnapshotCache(store, location, NOW), null);
  const blank = memory();
  writeSnapshotCache(blank, location, simulatedSnapshot(location), NOW);
  assert.equal(blank.map.size, 0);
  assert.equal(simulatedSnapshot(location).temperatureC, null);
  assert.doesNotThrow(() => writeSnapshotCache({ setItem() { throw Error("full"); } }, location, snapshot(), NOW));
});

test("overcast light snow gates sun and reflection together, equips snow, and uses dissolve instead of rain impact", () => {
  const snow = toWeatherVisualState(snapshot(), { nowMs: NOW, timeZone: "Asia/Shanghai" });
  assert.equal(snow.sky.coverage, "overcast");
  assert.equal(snow.celestial.sunVisible, false);
  assert.equal(snow.celestial.reflectionVisible, false);
  assert.equal(snow.precipitation.kind, "snow");
  assert.equal(snow.precipitation.intensity, "light");
  assert.equal(snow.waterResponse, "snow-dissolve");
  assert.equal(snow.fisherman.snowTarget, 1);
  const rain = toWeatherVisualState(snapshot(location, { weather_code: 61, rain: 0.1, snowfall: 0 }), { nowMs: NOW });
  assert.equal(rain.waterResponse, "rain-impact");
  assert.equal(rain.fisherman.rainGear, true);
  assert.equal(rain.fisherman.snowTarget, 0);
});

test("mixed/hail/unknown are conservative; fog is not snow; cache daylight derives from the scene timezone", () => {
  const mixed = toWeatherVisualState(snapshot(location, { rain: 0.1 }), { nowMs: NOW });
  assert.equal(mixed.precipitation.kind, "mixed");
  assert.equal(mixed.waterResponse, "none");
  for (const code of [96, 99, 999]) {
    const result = toWeatherVisualState(snapshot(location, { weather_code: code, snowfall: 0 }), { nowMs: NOW });
    assert.equal(result.precipitation.kind, "unknown");
    assert.equal(result.celestial.sunVisible, false);
  }
  const fog = toWeatherVisualState(snapshot(location, { weather_code: 45, snowfall: 0 }), { nowMs: NOW });
  assert.equal(fog.sky.fog, true);
  assert.equal(fog.precipitation.kind, "none");
  const clear = snapshot(location, { weather_code: 0, cloud_cover: 0, precipitation: 0, snowfall: 0 });
  assert.equal(toWeatherVisualState(clear, { nowMs: NOW }).celestial.sunVisible, true);
  const old = { ...clear, source: "cached", isDay: false };
  const derived = toWeatherVisualState(old, { nowMs: NOW + 3600000, timeZone: "Asia/Shanghai" });
  assert.deepEqual(derived.daylight, { isDay: true, basis: "location-clock" });
  assert.equal(toWeatherVisualState(old, { nowMs: NOW + 3600000 }).daylight.isDay, null);
});

test("transport concurrency <=2 and >=1s start spacing hold across distinct scene requests", async () => {
  let now = NOW;
  const started = [];
  const waits = [];
  const scheduler = createWeatherScheduler({ now: () => now, autoWake: false,
    fetchSnapshot: async (loc) => { started.push({ key: loc.key, at: now }); const wait = deferred(); waits.push(wait); return wait.promise; } });
  for (let i = 0; i < 4; i++) scheduler.enqueue({ key: String(i), location: { key: String(i) } });
  await flush();
  assert.equal(started.length, 1);
  now += 999; scheduler.pump(); await flush(); assert.equal(started.length, 1);
  now++; scheduler.pump(); await flush(); assert.equal(started.length, 2);
  now += 1000; scheduler.pump(); await flush(); assert.equal(started.length, 2);
  waits[0].resolve({}); await flush();
  assert.equal(started.length, 3);
  assert.ok(started.every((value, i) => !i || value.at - started[i - 1].at >= 1000));
  scheduler.dispose(); waits.forEach((wait) => wait.resolve({})); await flush();
});

test("a renderer timeout and cancellation retain transport slots until the actual bridge operation settles", async () => {
  const actual = [deferred(), deferred(), deferred()];
  let calls = 0;
  const scheduler = createWeatherScheduler({ autoWake: false, config: { ...SERVICES_CONFIG.weather, startIntervalMs: 0 },
    fetchSnapshot: (_loc, { onTransport }) => {
      const index = calls++;
      onTransport(actual[index].promise);
      return Promise.reject(Object.assign(Error("wait timeout"), { code: "ENV_TIMEOUT" }));
    } });
  for (let i = 0; i < 3; i++) scheduler.enqueue({ key: String(i), location: { key: String(i) } });
  await flush();
  assert.equal(calls, 2);
  assert.equal(scheduler.getState().activeCount, 2);
  scheduler.setEnabled(false); scheduler.setEnabled(true); scheduler.pump(); await flush();
  assert.equal(calls, 2);
  actual[0].resolve({}); actual[1].resolve({}); await flush();
  assert.equal(scheduler.getState().activeCount, 0);
  scheduler.dispose();
});

test("rolling total26 and point3 budgets include manual/reconnection attempts and survive scheduler recreation", async () => {
  let now = NOW;
  const storage = memory();
  const config = { ...SERVICES_CONFIG.weather, startIntervalMs: 0 };
  let calls = 0;
  const fetchSnapshot = async () => { calls++; return {}; };
  let scheduler = createWeatherScheduler({ now: () => now, storage, config, autoWake: false, fetchSnapshot });
  for (let i = 0; i < 26; i++) { await scheduler.enqueue({ key: `point-${i}`, location: {} }); await flush(); }
  scheduler.enqueue({ key: "point-extra", location: {} }); await flush(); assert.equal(calls, 26);
  scheduler.dispose();
  scheduler = createWeatherScheduler({ now: () => now, storage, config, autoWake: false, fetchSnapshot });
  scheduler.enqueue({ key: "point-extra", location: {} }); await flush(); assert.equal(calls, 26);
  now += config.budgetWindowMs; scheduler.pump(); await flush(); assert.equal(calls, 27);
  scheduler.dispose();
  const pointQueue = createWeatherScheduler({ now: () => now, config, autoWake: false, fetchSnapshot });
  for (let i = 0; i < 3; i++) { await pointQueue.enqueue({ key: "same", location: {} }); await flush(); }
  pointQueue.enqueue({ key: "same", location: {} }); await flush(); assert.equal(calls, 30);
  pointQueue.dispose();
});

test("HTTP429 cools every point, preserves longer RetryAfter across remount, and cannot be bypassed by enable/focus", async () => {
  let now = NOW;
  let calls = 0;
  const storage = memory();
  const config = { ...SERVICES_CONFIG.weather, startIntervalMs: 0 };
  const fetchSnapshot = async () => { calls++; throw Object.assign(Error("HTTP 429"), { status: 429, retryAtMs: NOW + 1800000 }); };
  let scheduler = createWeatherScheduler({ now: () => now, storage, config, autoWake: false, fetchSnapshot });
  await scheduler.enqueue({ key: "a", location: {} }); await flush();
  scheduler.enqueue({ key: "b", location: {} });
  scheduler.setEnabled(false); scheduler.setEnabled(true); await flush(); assert.equal(calls, 1);
  scheduler.dispose();
  scheduler = createWeatherScheduler({ now: () => now, storage, config, autoWake: false, fetchSnapshot });
  scheduler.enqueue({ key: "c", location: {} }); now += 900000; scheduler.pump(); await flush(); assert.equal(calls, 1);
  now += 900000; scheduler.pump(); await flush(); assert.equal(calls, 2);
  scheduler.dispose();
});

test("header +12 scene prefetch is nonblocking, cached, view-only and follows separate real/game targets", async () => {
  let calls = 0;
  const store = createRegionWeatherStore({ now: () => NOW, storage: memory(),
    schedulerOptions: { autoWake: false }, config: { ...SERVICES_CONFIG.weather, startIntervalMs: 0 },
    fetchSnapshot: async (loc) => { calls++; return snapshot(loc, { weather_code: loc.latitude > 50 ? 71 : 61, snowfall: loc.latitude > 50 ? 0.02 : 0, rain: loc.latitude > 50 ? 0 : 0.1 }); } });
  store.setHeaderLocation({ latitude: 30.25, longitude: 120.16, place: "现实杭州" });
  assert.equal(calls, 0);
  store.setEnabled(true);
  await store.prefetchAll();
  assert.equal(calls, 13);
  assert.equal(store.getRegionEntry("dongbei").snapshot.weatherCode, 71);
  assert.equal(store.getHeaderEntry().snapshot.weatherCode, 61);
  const headerBefore = store.getHeaderEntry().targetKey;
  store.setCurrentRegion("dongbei"); store.setViewerRegion("hainan");
  await store.prefetchAll("geo-start");
  assert.equal(store.getHeaderEntry().targetKey, headerBefore);
  assert.equal(calls, 13);
  assert.equal(store.getSnapshot().entries[store.getRegionEntry("hainan").targetKey], store.getRegionEntry("hainan"));
  store.dispose();
});

test("a superseded header reply cannot publish to the new header and disabled generations reject late transport", async () => {
  const calls = [];
  const oneSite = { jiangnan: SCENE_SITES.jiangnan };
  const store = createRegionWeatherStore({ sites: oneSite, now: () => NOW,
    schedulerOptions: { autoWake: false }, config: { ...SERVICES_CONFIG.weather, startIntervalMs: 0 },
    fetchSnapshot: (loc, { onTransport }) => { const wait = deferred(); onTransport(wait.promise); calls.push({ loc, wait }); return wait.promise; } });
  store.setHeaderLocation({ latitude: 30, longitude: 120, place: "A" }); store.setEnabled(true); await flush();
  store.setHeaderLocation({ latitude: 40, longitude: 116, place: "B" });
  const old = calls.find((call) => call.loc.latitude === 30);
  old.wait.resolve(snapshot(old.loc, { temperature_2m: 12 })); await flush();
  assert.equal(store.getHeaderEntry().snapshot.temperatureC, null);
  assert.match(store.getHeaderEntry().targetKey, /40,116$/);
  store.setEnabled(false);
  for (const call of calls) call.wait.resolve(snapshot(call.loc));
  await flush();
  assert.notEqual(store.getHeaderEntry().snapshot.source, "online");
  store.dispose();
});

test("actual bridge observer outlives renderer timeout; HTTP200 weather quota receives origin-wide gating", async () => {
  const wait = deferred();
  let tracked;
  let settled = false;
  const request = createEnvironmentRequester({ desktop: { requestEnvironment: () => wait.promise } });
  await assert.rejects(request(buildSnapshotWeatherUrl(location), { timeoutMs: 5,
    onTransport: (promise) => { tracked = promise; promise.finally(() => { settled = true; }); } }), { name: "AbortError" });
  assert.equal(settled, false);
  wait.resolve({ success: true }); await tracked; assert.equal(settled, true);
  let calls = 0;
  const quota = createEnvironmentRequester({ desktop: null, now: () => NOW,
    fetchImpl: async () => { calls++; return Response.json({ error: true, reason: "API quota exceeded" }); } });
  await assert.rejects(quota(buildSnapshotWeatherUrl(location)), { status: 429 });
  await assert.rejects(quota(buildSnapshotWeatherUrl(snapshotLocation({ latitude: 20, longitude: 110 }))), { status: 429 });
  assert.equal(calls, 1);
});

test("offline-online replaces aborted same-key jobs after transport settles without a stuck queued entry", async () => {
  const calls = [];
  const store = createRegionWeatherStore({ sites: { jiangnan: SCENE_SITES.jiangnan }, now: () => NOW,
    schedulerOptions: { autoWake: false }, config: { ...SERVICES_CONFIG.weather, startIntervalMs: 0 },
    fetchSnapshot: (loc, { onTransport, signal }) => {
      const actual = deferred();
      onTransport(actual.promise);
      calls.push({ loc, actual });
      return new Promise((resolve, reject) => {
        actual.promise.then(resolve, reject);
        signal.addEventListener("abort", () => reject(Object.assign(Error("aborted UI wait"), { name: "AbortError" })), { once: true });
      });
    } });
  store.setEnabled(true); await flush(); assert.equal(calls.length, 1);
  store.offline(); store.resume("online"); await flush();
  assert.equal(calls.length, 1);
  assert.equal(store.getDiagnostics().activeCount, 1);
  calls[0].actual.resolve(snapshot(calls[0].loc)); await flush();
  assert.equal(calls.length, 2);
  calls[1].actual.resolve(snapshot(calls[1].loc)); await flush();
  assert.equal(store.getRegionEntry("jiangnan").status, "ready");
  assert.equal(store.getRegionEntry("jiangnan").snapshot.source, "online");
  assert.equal(store.getDiagnostics().activeCount, 0);
  const previous = store.getSnapshot();
  store.setHeaderLocation({ latitude: 30, longitude: 120, place: "same" });
  const afterFirstHeader = store.getSnapshot();
  assert.notEqual(previous, afterFirstHeader);
  store.setHeaderLocation({ latitude: 30, longitude: 120, place: "same" });
  assert.equal(store.getSnapshot(), afterFirstHeader);
  store.dispose();
  calls.slice(2).forEach((call) => call.actual.resolve(snapshot(call.loc)));
});

test("main accepts only existing single-point extended weather fields and guards HTTP200 weather quotas", async () => {
  const url = buildSnapshotWeatherUrl(location);
  assert.equal(validateEnvironmentUrl(url).href, url);
  const batch = new URL(url); batch.searchParams.set("latitude", "30,40");
  assert.throws(() => validateEnvironmentUrl(batch.href));
  const unapproved = new URL(url); unapproved.searchParams.set("current", "temperature_2m,arbitrary_field");
  assert.throws(() => validateEnvironmentUrl(unapproved.href));
  const request = createEnvironmentService({ now: () => NOW });
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ error: true, reason: "API quota exceeded" }, { headers: { "Retry-After": "1800" } }); };
  await assert.rejects(request(url, fetchImpl), { status: 429, retryAtMs: NOW + 1800000 });
  await assert.rejects(request(buildSnapshotWeatherUrl(snapshotLocation({ latitude: 20, longitude: 110 })), fetchImpl), { status: 429 });
  assert.equal(calls, 1);
});
