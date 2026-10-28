// Keep the v1 Web key: it is the discovery address, not the serialized schema.
import { DEFAULT_SCENE_WEATHER_MODE, DEFAULT_MANUAL_WEATHER } from './weatherPresentation.js';
export const STORAGE_CONFIG = Object.freeze({ schemaVersion: 4, commandHistorySize: 128, webKey: 'pondclock.focus.save.v1' });
export const GAME_VERSION = '2.0.0';
export const EDITION_ID = 'first-focus';
export const DEFAULT_SETTINGS = Object.freeze({ onlineEnhancements: true, alwaysOnTop: true,
  biteSoundEnabled: true, biteSoundVolume: 35, backgroundBiteSound: true,
  sceneWeatherMode: DEFAULT_SCENE_WEATHER_MODE, manualWeather: DEFAULT_MANUAL_WEATHER });

