import {
  SCENE_WEATHER_MODES, MANUAL_WEATHER_OPTIONS,
  DEFAULT_SCENE_WEATHER_MODE, DEFAULT_MANUAL_WEATHER,
} from '../config/weatherPresentation.js';
import { toWeatherVisualState } from './weatherVisualState.js';
import { displayWeather, simulatedSnapshot } from '../services/weatherSnapshot.js';

const SOURCE_LABELS = Object.freeze({ online: '联网天气', cached: '缓存天气', simulated: '天气待获取', manual: '手动设置' });
const WEATHER_ENTRY_FIELDS = Object.freeze([
  'weatherError', 'weatherErrorCode', 'weatherRefreshing', 'weatherLastAttemptAtMs', 'weatherRetryAtMs', 'refreshWeather',
]);

/** A display preset, deliberately rejected by the actual-weather cache validator. */
export function manualWeatherSnapshot(weatherId) {
  const preset = MANUAL_WEATHER_OPTIONS.find((option) => option.id === weatherId)
    || MANUAL_WEATHER_OPTIONS.find((option) => option.id === DEFAULT_MANUAL_WEATHER);
  return {
    schemaVersion: 2, provider: 'manual', locationKey: null,
    weatherCode: preset.weatherCode, cloudCoverPct: preset.cloudCoverPct,
    temperatureC: null, isDay: null, observedAtMs: null, fetchedAtMs: null,
    precipitation: { totalMm: null, rainMm: null, showersMm: null, snowfallCm: null, intervalSeconds: null },
    source: 'manual', quality: 'manual',
  };
}

/**
 * Select already available weather; this module never fetches, caches, commands or
 * changes the background. Local means the real IP city, not the broad fish region.
 */
export function selectSceneWeather({
  settings, localWeather, fishingWeather, nowMs = Date.now(),
  localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  const mode = SCENE_WEATHER_MODES.some((option) => option.id === settings?.sceneWeatherMode)
    ? settings.sceneWeatherMode : DEFAULT_SCENE_WEATHER_MODE;
  const isManual = mode === 'manual';
  const selection = mode === 'local' ? localWeather : fishingWeather;
  const sourceEntry = selection?.entry || selection?.weatherEntry || null;
  const snapshot = isManual ? manualWeatherSnapshot(settings?.manualWeather)
    : selection?.snapshot || sourceEntry?.snapshot || simulatedSnapshot({ key: null });
  const visualState = toWeatherVisualState(snapshot, {
    nowMs, timeZone: mode === 'local' ? localTimeZone : fishingWeather?.site?.timeZone || 'Asia/Shanghai',
  });
  if (isManual) visualState.precipitation.basis = 'manual';

  // Scene identity remains the committed fishing point in every mode.
  const result = { ...fishingWeather };
  for (const field of WEATHER_ENTRY_FIELDS) result[field] = isManual ? null : selection?.[field] ?? null;
  const entry = isManual ? { status: 'manual', snapshot, errorCode: null }
    : sourceEntry || { status: 'idle', snapshot, errorCode: null };
  const weatherPlace = isManual ? null
    : mode === 'local' ? localWeather?.weatherPlace || '现实所在地待识别'
      : fishingWeather?.site?.place || fishingWeather?.weatherPlace || '钓鱼点待确认';
  const reference = mode === 'local' && localWeather?.weatherLocationSource === 'reference';
  const originLabel = isManual ? '手动 · 仅画面'
    : `${mode === 'local' ? reference ? '现实参考' : '现实' : '钓点'} · ${weatherPlace}`;
  const sourceLabel = SOURCE_LABELS[snapshot.source] || '天气未知';
  const detail = isManual ? '自选天气只改变场景画面，不是天气观测；日夜仍按钓点时区。'
    : `${originLabel} · ${sourceLabel}${reference ? '；尚无IP坐标，使用参考城市，不代表已识别现实所在地' : ''}`;

  return {
    ...result, snapshot, entry, weatherEntry: entry, visualState,
    weather: displayWeather(snapshot.weatherCode), temperature: snapshot.temperatureC,
    weatherPlace, weatherSource: snapshot.source,
    weatherLocationSource: isManual ? 'manual' : mode === 'local' ? localWeather?.weatherLocationSource || 'unknown' : 'scene-site',
    weatherUpdatedAt: snapshot.observedAtMs, weatherFetchedAtMs: snapshot.fetchedAtMs,
    presentation: {
      mode, modeLabel: SCENE_WEATHER_MODES.find((option) => option.id === mode).label,
      isManual, originLabel, sourceLabel, weatherPlace, detail,
      locationSource: isManual ? 'manual' : mode === 'local' ? localWeather?.weatherLocationSource || 'unknown' : 'scene-site',
    },
  };
}
