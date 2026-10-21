import { Button } from '@/components/ui/button';
import { GAME_VERSION } from '@/config/storage.js';

export default function SettingsPanel({ game, geo, desktop, onChangeTop, onRefreshGeo }) {
  const lastGeo = geo?.fetchedAtMs ? new Date(geo.fetchedAtMs).toLocaleString('zh-CN') : null;
  const nextRetry = geo?.retryAtMs > Date.now() ? new Date(geo.retryAtMs).toLocaleTimeString('zh-CN') : null;
  return <div className="space-y-3 text-sm">
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
      <p role="status" className="mt-2 text-xs text-slate-300">{geo?.refreshing ? '正在重新识别…' : geo?.detail || '暂未识别到具体所在地'}</p>
      {lastGeo && <p className="mt-1 text-[11px] text-slate-500">上次识别：{lastGeo}{geo?.cached ? ' · 缓存结果' : ''}</p>}
      {geo?.error && <p className="mt-2 text-xs text-amber-200">{geo.error}{nextRetry ? `，${nextRetry} 后自动重试` : ''}</p>}
      <Button className="mt-3" size="sm" variant="outline" disabled={!game.settings.onlineEnhancements} onClick={() => void onRefreshGeo()}>{geo?.refreshing ? '重新发起识别' : '立即识别所在地'}</Button>
    </div>
    <div className="rounded-xl bg-white/5 p-3"><p className="font-medium text-emerald-200">本机记忆与备份</p><p className="mt-2 text-xs leading-relaxed text-slate-400">鱼获、金币、图鉴和旅途自动保存。换电脑前可导出存档；导入会替换当前进度，并保留备用存档。</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={game.busy} onClick={game.exportSave}>导出存档</Button><Button size="sm" variant="outline" disabled={game.busy} onClick={game.importSave}>导入存档</Button></div></div>
    <p className="text-[11px] leading-relaxed text-slate-500">水塘时钟 {GAME_VERSION} · 单机游戏，无账号与线上交易。天气：Open-Meteo；地理坐标：GeoNames。断网仍可玩。</p>
  </div>;
}
