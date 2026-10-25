// These modes affect scene presentation only, never weather observations or assets.
export const SCENE_WEATHER_MODES = Object.freeze([
  Object.freeze({ id: 'fishing', label: '钓鱼点天气', description: '跟随背景水域的代表地点' }),
  Object.freeze({ id: 'local', label: '现实所在地天气', description: '背景不变，晴雨跟随现实所在地' }),
  Object.freeze({ id: 'manual', label: '手动天气', description: '自选晴雨，仅改变画面' }),
]);

export const MANUAL_WEATHER_OPTIONS = Object.freeze([
  Object.freeze({ id: 'clear', label: '晴', weatherCode: 0, cloudCoverPct: 0 }),
  Object.freeze({ id: 'cloudy', label: '阴', weatherCode: 3, cloudCoverPct: 100 }),
  Object.freeze({ id: 'rain', label: '小雨', weatherCode: 61, cloudCoverPct: 100 }),
  Object.freeze({ id: 'snow', label: '小雪', weatherCode: 71, cloudCoverPct: 100 }),
]);

export const DEFAULT_SCENE_WEATHER_MODE = 'fishing';
export const DEFAULT_MANUAL_WEATHER = 'clear';
