import { Button } from '@/components/ui/button';
import { GAME_VERSION } from '@/config/storage.js';
import { networkDiagnostics } from '@/services/networkDiagnostics.js';
import WaterWeatherViewer from './WaterWeatherViewer';
import SceneWeatherSettings from './SceneWeatherSettings';

export default function SettingsPanel({ game, geo, weather, presentation, desktop, onChangeTop, onRefreshGeo }) {
  const lastGeo = geo?.fetchedAtMs ? new Date(geo.fetchedAtMs).toLocaleString('zh-CN') : null;
  const nextRetry = geo?.retryAtMs > Date.now() ? new Date(geo.retryAtMs).toLocaleTimeString('zh-CN') : null;
  const weatherRetry = weather?.weatherRetryAtMs > Date.now() ? new Date(weather.weatherRetryAtMs).toLocaleTimeString('zh-CN') : null;
  const geoSource = ({ ip: '本次IP识别成功', 'ip-cached': '使用历史位置缓存', oversea: '已识别境外出口，无对应水域', default: '省份尚未匹配', fallback: '尚未获取所在地', disabled: '联网已关闭' })[geo?.source] || '等待识别';
  const providerName = ({ ipapi: 'ipapi', ipwhois: 'IPWhois' })[geo?.provider];
  return <div className="space-y-3 text-sm">
    <SceneWeatherSettings game={game} presentation={presentation}/>
    <div className="rounded-xl bg-white/5 p-3" aria-label="鱼讯声音设置">
      <h3 className="font-medium text-sky-200">浮漂有声</h3>
      <label className="mt-3 flex items-center justify-between gap-3"><span>咬钩时播放咕咚声</span><input type="checkbox" aria-label="咬钩提示音" checked={game.settings.biteSoundEnabled} disabled={game.busy} onChange={(event) => game.updateSettings({ biteSoundEnabled: event.target.checked })} /></label>
      <label className="mt-3 flex items-center justify-between gap-3"><span>后台也提醒</span><input type="checkbox" aria-label="后台鱼讯声音" checked={game.settings.backgroundBiteSound} disabled={game.busy} onChange={(event) => game.updateSettings({ backgroundBiteSound: event.target.checked })} /></label>
      <label className="mt-3 block text-xs">音量 · {game.settings.biteSoundVolume}%<input className="mt-2 w-full" aria-label="鱼讯音量" type="range" min="0" max="100" defaultValue={game.settings.biteSoundVolume} onPointerUp={(event) => game.updateSettings({ biteSoundVolume: Number(event.target.value) })} onKeyUp={(event) => game.updateSettings({ biteSoundVolume: Number(event.target.value) })} /></label>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">同一次鱼讯只响一次，过期不会补播。声音随安装包提供，断网也可用。</p>
      {game.audioBlocked && <p role="status" className="mt-2 text-xs text-amber-200">系统暂未允许声音，点击下方按钮开启。</p>}
      <Button className="mt-3" size="sm" variant="outline" onClick={() => void game.enableAudio()}>开启声音</Button>
    </div>
    <WaterWeatherViewer currentRegion={game.currentRegion} online={game.settings.onlineEnhancements} />
    {desktop?.enabled && <div className="rounded-xl bg-white/5 p-3">
      <p className="font-medium text-sky-200">桌面悬浮挂件</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">拖动顶部时钟条移动，位置会记住。“—”缩到任务栏，“×”保存后退出。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void desktop.action('compact')}>小挂件</Button>
        <Button size="sm" variant="outline" onClick={() => void desktop.action('comfortable')}>展开显示</Button>
        <Button size="sm" variant="outline" onClick={() => void desktop.action('resetPosition')}>移回屏幕</Button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-4"><span>保持在其他窗口前面</span><input type="checkbox" checked={desktop.info?.alwaysOnTop ?? game.settings.alwaysOnTop} disabled={game.busy} onChange={(e) => void onChangeTop(e.target.checked)} className="h-4 w-4 accent-sky-400" /></label>
    </div>}
    <div className="rounded-xl bg-white/5 p-3">
      <label className="flex cursor-pointer items-center justify-between gap-4"><span>联网识别所在地与天气</span><input type="checkbox" checked={game.settings.onlineEnhancements} disabled={game.busy} onChange={(e) => game.updateSettings({ onlineEnhancements: e.target.checked })} className="h-4 w-4 accent-sky-400" /></label>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">切回挂件或网络恢复时自动检查，保持打开时每 2 分钟复查。按当前网络出口识别，VPN 地区也会免费解锁。</p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">定位依次使用 ipapi / IPWhois，失败自动换备用；天气来自 Open-Meteo。联网时这些服务会看到公网IP，天气还会收到大致坐标；本机不保存完整IP。</p>
      <p role="status" className="mt-2 text-xs text-sky-200">IP地区：{geo?.refreshing ? '正在重新识别…' : geoSource}{providerName ? ` · ${providerName}` : ''}</p>
      <p className="mt-1 text-xs text-slate-300">{geo?.detail || '暂未识别到具体所在地'}</p>
      {lastGeo && <p className="mt-1 text-[11px] text-slate-500">上次识别：{lastGeo}{geo?.cached ? ' · 缓存结果' : ''}</p>}
      {geo?.error && <p className="mt-2 text-xs text-amber-200">{geo.error}{nextRetry ? `，${nextRetry} 后自动重试` : ''}</p>}
      <Button className="mt-3" size="sm" variant="outline" disabled={!game.settings.onlineEnhancements} onClick={() => void onRefreshGeo()}>{geo?.refreshing ? '重新发起识别' : '立即识别所在地'}</Button>
      <div className="mt-3 border-t border-white/10 pt-3">
        <p role="status" className="text-xs text-sky-200">天气：{weather?.weatherRefreshing ? '获取中' : ({ online: '联网天气', cached: '缓存天气', simulated: '暂用模拟晴雨' })[weather?.weatherSource] || '等待获取'} · {weather?.weatherPlace || '参考城市'}</p>
        <p className="mt-1 text-[11px] text-slate-500">{weather?.weatherLocationSource === 'reference' ? '尚无IP坐标，使用参考城市；这不代表已定位。' : weather?.weatherLocationSource === 'ip-cached' ? '地点来自历史IP缓存，重新识别后更新。' : '地点来自本次IP坐标。'}模拟天气不表示IP一定失败。</p>
        {weather?.weatherUpdatedAt && <p className="mt-1 text-[11px] text-slate-500">天气时刻：{new Date(weather.weatherUpdatedAt).toLocaleString('zh-CN')}</p>}
        {!game.settings.onlineEnhancements ? <p className="mt-2 text-xs text-slate-400">联网已关闭，保留缓存或模拟画面。</p> : weather?.weatherError && <p className="mt-2 text-xs text-amber-200">{weather.weatherError}{weatherRetry ? `，${weatherRetry} 后可自动重试` : ''}</p>}
        <Button className="mt-3" size="sm" variant="outline" disabled={!game.settings.onlineEnhancements || weather?.weatherRefreshing} onClick={() => void weather?.refreshWeather()}>刷新天气</Button>
      </div>
      <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">查看联网诊断</summary><p className="my-2 leading-relaxed">可选中下面文字复制给开发者。仅含版本、服务状态和时间，不含IP、位置或存档。</p><textarea aria-label="联网诊断" readOnly value={networkDiagnostics({ geo, weather, enabled: game.settings.onlineEnhancements })} onFocus={(e) => e.target.select()} className="h-40 w-full resize-none rounded-lg bg-slate-950 p-2 font-mono text-[10px] text-slate-300" /></details>
    </div>
    <div className="rounded-xl bg-white/5 p-3"><p className="font-medium text-emerald-200">专注版 · 本机记忆与备份</p><p className="mt-2 text-xs leading-relaxed text-slate-400">鱼获、金币、计划、通票和旅途自动保存。专注版保留独立进度，首次会复制兼容的旧版存档。换电脑前可导出备份；导入会替换当前进度，并保留备用存档。</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={game.busy} onClick={game.exportSave}>导出存档</Button><Button size="sm" variant="outline" disabled={game.busy} onClick={game.importSave}>导入存档</Button></div></div>
    <p className="text-[11px] leading-relaxed text-slate-500">水塘时钟 {GAME_VERSION} · 单机游戏，无账号与线上交易。天气：Open-Meteo；地理坐标：GeoNames。断网仍可玩。</p>
  </div>;
}
