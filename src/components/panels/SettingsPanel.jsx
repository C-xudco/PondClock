import { Button } from '@/components/ui/button';
import { GAME_VERSION } from '@/config/storage.js';

export default function SettingsPanel({ game, onRefreshGeo }) {
  const changeTop = async (checked) => {
    const result = await game.updateSettings({ alwaysOnTop: checked });
    if (result && window.pondDesktop) await window.pondDesktop.windowAction(checked ? 'alwaysOnTop:on' : 'alwaysOnTop:off');
  };
  return <div className="space-y-4 text-sm">
    <div className="rounded-xl bg-white/5 p-4"><p className="font-medium text-emerald-200">进度会自动保存在这台电脑</p><p className="mt-2 text-xs leading-relaxed text-slate-400">鱼获、金币、图鉴和旅途都会记住。换电脑前可导出存档；导入会替换当前进度，并保留备用存档。</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={game.busy} onClick={game.exportSave}>导出存档</Button><Button size="sm" variant="outline" disabled={game.busy} onClick={game.importSave}>导入存档</Button></div></div>
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-white/5 p-4"><span>联网获取所在地和当地天气<span className="mt-1 block text-xs text-slate-500">IP 所在水域会免费解锁，VPN 结果也接受。</span></span><input type="checkbox" checked={game.settings.onlineEnhancements} disabled={game.busy} onChange={(e) => game.updateSettings({ onlineEnhancements: e.target.checked })} className="h-4 w-4 accent-sky-400" /></label>
    {window.pondDesktop && <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 p-4"><span>窗口总在最前</span><input type="checkbox" checked={game.settings.alwaysOnTop} disabled={game.busy} onChange={(e) => void changeTop(e.target.checked)} className="h-4 w-4 accent-sky-400" /></label>}
    <Button size="sm" variant="outline" disabled={!game.settings.onlineEnhancements} onClick={onRefreshGeo}>重新识别所在地</Button>
    <p className="text-xs leading-relaxed text-slate-500">水塘时钟 {GAME_VERSION} · 单机游戏，无账号与线上交易。天气：Open-Meteo；地理坐标：GeoNames。断网仍可玩，天气会显示缓存或离线状态。</p>
  </div>;
}
