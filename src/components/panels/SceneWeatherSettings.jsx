import { SCENE_WEATHER_MODES, MANUAL_WEATHER_OPTIONS } from '@/config/weatherPresentation.js';

export default function SceneWeatherSettings({ game, presentation }) {
  const mode = game.settings.sceneWeatherMode;
  return <section className="scene-weather-settings rounded-xl bg-white/5 p-3" aria-label="场景天气展示">
    <h3 className="font-medium text-sky-200">风景不动，晴雨由你</h3>
    <fieldset className="mt-3 space-y-2" disabled={game.busy}>
      <legend className="sr-only">场景天气来源</legend>
      {SCENE_WEATHER_MODES.map((option) => <label key={option.id} className={`weather-mode-option ${mode === option.id ? 'is-selected' : ''}`}>
        <input type="radio" name="scene-weather-mode" value={option.id} checked={mode === option.id} onChange={() => void game.updateSettings({ sceneWeatherMode: option.id })}/>
        <span className="min-w-0"><span className="block text-xs font-medium">{option.label}</span><span className="mt-1 block text-[11px] leading-relaxed text-slate-400">{option.description}</span></span>
      </label>)}
    </fieldset>
    {mode === 'manual' && <label className="mt-3 flex items-center justify-between gap-3 text-xs"><span>画面晴雨</span><select aria-label="手动场景天气" className="appearance-select" value={game.settings.manualWeather} disabled={game.busy} onChange={(event) => void game.updateSettings({ manualWeather: event.target.value })}>{MANUAL_WEATHER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
    <p role="status" className="mt-3 text-xs leading-relaxed text-slate-400">当前：{presentation?.originLabel || '钓鱼点天气'}</p>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">例如广州的背景，也能看东莞所在地的雨。漫游实际抵达后自动跟随新钓点；飞行途中保留出发地。上方时钟始终显示现实所在地，手动晴雨不改变真实天气数据。</p>
  </section>;
}
