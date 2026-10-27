// Keep the v1 Web key: it is the discovery address, not the serialized schema.
import { DEFAULT_SCENE_WEATHER_MODE, DEFAULT_MANUAL_WEATHER } from './weatherPresentation.js';
export const STORAGE_CONFIG = Object.freeze({ schemaVersion: 3, commandHistorySize: 128, webKey: 'pondclock.save.v1' });
export const GAME_VERSION = '1.3.1';
export const DEFAULT_SETTINGS = Object.freeze({ onlineEnhancements: true, alwaysOnTop: true,
  biteSoundEnabled: true, biteSoundVolume: 35, backgroundBiteSound: true,
  sceneWeatherMode: DEFAULT_SCENE_WEATHER_MODE, manualWeather: DEFAULT_MANUAL_WEATHER });

