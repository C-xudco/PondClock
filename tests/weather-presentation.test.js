import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_WEATHER_MODES, MANUAL_WEATHER_OPTIONS } from '../src/config/weatherPresentation.js';
import { selectSceneWeather, manualWeatherSnapshot } from '../src/domain/weatherPresentation.js';
import { validWeatherSnapshot } from '../src/services/weatherSnapshot.js';

const NOW = Date.UTC(2026, 9, 25, 4);
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const snapshot = (changes = {}) => ({
  schemaVersion: 2, provider: 'open-meteo', locationKey: 'fixture',
  weatherCode: 0, cloudCoverPct: 0, temperatureC: 23, isDay: true,
  observedAtMs: NOW, fetchedAtMs: NOW, source: 'online', quality: 'complete',
  precipitation: { totalMm: 0, rainMm: 0, showersMm: 0, snowfallCm: 0, intervalSeconds: 900 },
  ...changes,
});
const streams = () => {
  const localSnapshot = snapshot({ temperatureC: 28 });
  const sceneSnapshot = snapshot({ weatherCode: 71, cloudCoverPct: 100, temperatureC: -2,
    precipitation: { totalMm: 0.1, rainMm: 0, showersMm: 0, snowfallCm: 0.02, intervalSeconds: 900 } });
  return {
    localWeather: { weatherPlace: '广东省东莞市', weatherLocationSource: 'ip', snapshot: localSnapshot,
      entry: { status: 'ready', snapshot: localSnapshot }, weatherError: null, weatherRefreshing: false },
    fishingWeather: {
      site: { regionId: 'lingnan', siteId: 'zhujiang-shamian', place: '珠江·沙面', address: '广东省广州市荔湾区沙面', timeZone: 'Asia/Shanghai' },
      sceneDefinition: { geometryId: 'lingnan' }, weatherPlace: '珠江·沙面',
      snapshot: sceneSnapshot, entry: { status: 'ready', snapshot: sceneSnapshot },
      weatherError: null, weatherRefreshing: false,
    },
  };
};
const select = (settings, input = streams(), extra = {}) => selectSceneWeather({ settings, ...input, nowMs: NOW, localTimeZone: 'Asia/Shanghai', ...extra });

test('weather presentation exposes three modes and four explicit manual presets', () => {
  assert.deepEqual(SCENE_WEATHER_MODES.map((mode) => mode.id), ['fishing', 'local', 'manual']);
  assert.deepEqual(MANUAL_WEATHER_OPTIONS.map((preset) => preset.id), ['clear', 'cloudy', 'rain', 'snow']);
  assert.ok(Object.isFrozen(SCENE_WEATHER_MODES));
  assert.ok(MANUAL_WEATHER_OPTIONS.every(Object.isFrozen));
});

test('default and invalid modes use the committed fishing point without consulting local weather', () => {
  const input = streams();
  for (const settings of [undefined, {}, { sceneWeatherMode: 'future' }]) {
    const result = select(settings, input);
    assert.equal(result.snapshot, input.fishingWeather.snapshot);
    assert.equal(result.entry, input.fishingWeather.entry);
    assert.equal(result.site, input.fishingWeather.site);
    assert.equal(result.presentation.mode, 'fishing');
    assert.equal(result.presentation.originLabel, '钓点 · 珠江·沙面');
    assert.equal(result.temperature, -2);
    assert.equal(result.visualState.precipitation.kind, 'snow');
    assert.equal(result.visualState.celestial.sunVisible, false);
  }
});

test('Dongguan real weather can overlay Guangzhou background while retaining its address and geometry', () => {
  const input = streams();
  const result = select({ sceneWeatherMode: 'local' }, input);
  assert.equal(result.snapshot, input.localWeather.snapshot);
  assert.equal(result.entry, input.localWeather.entry);
  assert.equal(result.site, input.fishingWeather.site);
  assert.equal(result.site.address, '广东省广州市荔湾区沙面');
  assert.equal(result.sceneDefinition, input.fishingWeather.sceneDefinition);
  assert.equal(result.presentation.originLabel, '现实 · 广东省东莞市');
  assert.equal(result.presentation.sourceLabel, '联网天气');
  assert.equal(result.temperature, 28);
  assert.equal(result.weather, '晴');
  assert.equal(result.visualState.precipitation.kind, 'none');
  assert.equal(result.visualState.celestial.sunVisible, true);
});

test('manual presets jointly drive sky, precipitation, water contact, and protective gear', () => {
  const expectations = {
    clear: ['clear', 'none', 'none', true, false, 0],
    cloudy: ['overcast', 'none', 'none', false, false, 0],
    rain: ['overcast', 'rain', 'rain-impact', false, true, 0],
    snow: ['overcast', 'snow', 'snow-dissolve', false, false, 1],
  };
  for (const [id, expected] of Object.entries(expectations)) {
    const result = select({ sceneWeatherMode: 'manual', manualWeather: id });
    const visual = result.visualState;
    assert.deepEqual([visual.sky.coverage, visual.precipitation.kind, visual.waterResponse,
      visual.celestial.sunVisible, visual.fisherman.rainGear, visual.fisherman.snowTarget], expected);
    assert.equal(visual.precipitation.basis, 'manual');
    assert.equal(result.presentation.isManual, true);
    assert.equal(result.presentation.originLabel, '手动 · 仅画面');
    assert.equal(result.presentation.sourceLabel, '手动设置');
    assert.equal(result.weatherSource, 'manual');
  }
});

test('manual weather never fabricates temperature, observations, provider measurements or cacheable data', () => {
  for (const preset of MANUAL_WEATHER_OPTIONS) {
    const manual = manualWeatherSnapshot(preset.id);
    assert.equal(manual.temperatureC, null);
    assert.equal(manual.observedAtMs, null);
    assert.equal(manual.fetchedAtMs, null);
    assert.equal(manual.isDay, null);
    assert.ok(Object.values(manual.precipitation).every((value) => value === null));
    assert.equal(validWeatherSnapshot(manual, { key: null }, NOW), false);
  }
  const result = select({ sceneWeatherMode: 'manual', manualWeather: 'bogus' });
  assert.equal(result.weather, '晴');
  assert.equal(result.weatherPlace, null);
  assert.equal(result.refreshWeather, null);
  assert.match(result.presentation.detail, /不是天气观测/);
});

test('manual clear is sunny by day and moonlit at night, keeping real clock and manual selection separate', () => {
  const input = streams();
  const night = Date.UTC(2026, 9, 25, 15);
  const result = select({ sceneWeatherMode: 'manual', manualWeather: 'clear' }, input, { nowMs: night });
  assert.equal(result.visualState.daylight.isDay, false);
  assert.equal(result.visualState.daylight.basis, 'location-clock');
  assert.equal(result.visualState.celestial.sunVisible, false);
  assert.equal(result.visualState.celestial.moonVisible, true);
  assert.equal(input.localWeather.snapshot.isDay, true);
});

test('missing local weather stays unknown instead of silently using fishing-point snow or inventing sun', () => {
  const input = streams();
  input.localWeather = undefined;
  const result = select({ sceneWeatherMode: 'local' }, input);
  assert.equal(result.weather, '天气未知');
  assert.equal(result.temperature, null);
  assert.equal(result.weatherSource, 'simulated');
  assert.equal(result.presentation.sourceLabel, '天气待获取');
  assert.equal(result.visualState.sky.coverage, 'unknown');
  assert.equal(result.visualState.celestial.sunVisible, false);
  assert.equal(result.visualState.precipitation.kind, 'unknown');
  assert.equal(result.site, input.fishingWeather.site);
});

test('cached and reference-city weather keep truthful source and coordinates status', () => {
  const input = streams();
  input.localWeather.snapshot.source = 'cached';
  input.localWeather.weatherLocationSource = 'reference';
  input.localWeather.weatherPlace = '广州参考城市';
  input.localWeather.weatherError = '定位尚未成功';
  const result = select({ sceneWeatherMode: 'local' }, input);
  assert.equal(result.weatherSource, 'cached');
  assert.equal(result.weatherLocationSource, 'reference');
  assert.equal(result.presentation.originLabel, '现实参考 · 广州参考城市');
  assert.equal(result.presentation.sourceLabel, '缓存天气');
  assert.match(result.presentation.detail, /不代表已识别现实所在地/);
  assert.equal(result.weatherError, '定位尚未成功');
});

test('selection is pure: frozen clocks, site, settings, entries and snapshots stay unchanged; callbacks are not invoked', () => {
  let requests = 0;
  const input = streams();
  input.localWeather.refreshWeather = input.fishingWeather.refreshWeather = () => { requests += 1; throw Error('unexpected request'); };
  const original = JSON.stringify(input);
  freeze(input);
  for (const mode of SCENE_WEATHER_MODES) {
    for (const preset of MANUAL_WEATHER_OPTIONS) {
      const settings = freeze({ sceneWeatherMode: mode.id, manualWeather: preset.id });
      const result = select(settings, input);
      assert.equal(result.site, input.fishingWeather.site);
      assert.equal(result.sceneDefinition, input.fishingWeather.sceneDefinition);
    }
  }
  assert.equal(JSON.stringify(input), original);
  assert.equal(requests, 0);
});

test('travel destination data alone does not switch source; only committed fishing point changes the result', () => {
  const input = streams();
  input.fishingWeather.destination = { place: '黑龙江·北极村' };
  let result = select({ sceneWeatherMode: 'fishing' }, input);
  assert.equal(result.weatherPlace, '珠江·沙面');
  const arrived = { ...input, fishingWeather: { ...input.fishingWeather,
    site: { ...input.fishingWeather.site, regionId: 'dongbei', place: '黑龙江·北极村' } } };
  result = select({ sceneWeatherMode: 'fishing' }, arrived);
  assert.equal(result.weatherPlace, '黑龙江·北极村');
  assert.equal(result.site.regionId, 'dongbei');
  assert.equal(input.localWeather.weatherPlace, '广东省东莞市');
});
