// Keep the v1 Web key: it is the discovery address, not the serialized schema.
export const STORAGE_CONFIG = Object.freeze({ schemaVersion: 2, commandHistorySize: 128, webKey: 'pondclock.save.v1' });
export const GAME_VERSION = '1.2.0';
export const DEFAULT_SETTINGS = Object.freeze({ onlineEnhancements: true, alwaysOnTop: true,
  biteSoundEnabled: true, biteSoundVolume: 35, backgroundBiteSound: true });

