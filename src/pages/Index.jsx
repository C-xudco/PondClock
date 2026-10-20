import { useCallback, useEffect, useRef, useState } from 'react';
import { Plane } from 'lucide-react';
import { useFishingGame } from '@/hooks/useFishingGame';
import { useClockWeather } from '@/hooks/useClockWeather';
import { useGeoRegion } from '@/hooks/useGeoRegion';
import { regionById } from '@/lib/gameUtils';
import { SPEECH } from '@/lib/speech';
import Pond from '@/components/pond/Pond';
import ClockPanel from '@/components/header/ClockPanel';
import DesktopBackdrop from '@/components/layout/DesktopBackdrop';
import ActionDock from '@/components/layout/ActionDock';
import PanelWindow from '@/components/layout/PanelWindow';
import BucketPanel from '@/components/panels/BucketPanel';
import CodexPanel from '@/components/panels/CodexPanel';
import ShopPanel from '@/components/panels/ShopPanel';
import TravelPanel from '@/components/panels/TravelPanel';
import SettingsPanel from '@/components/panels/SettingsPanel';
import { Button } from '@/components/ui/button';

const PANEL_TITLES = { bucket: '鱼篓', codex: '图鉴', shop: '渔具店', travel: '漫游', settings: '设置与存档' };
const devParam = (key) => import.meta.env.DEV ? new URLSearchParams(window.location.search).get(key) : null;
const DEMO_SPEECH = { idle: { text: SPEECH.idle[0], tone: 'idle' }, success: { text: SPEECH.success[0], tone: 'success' }, high: { text: SPEECH.high[0], tone: 'high' }, miss: { text: SPEECH.miss[0], tone: 'miss' } };

export default function Index() {
  const game = useFishingGame();
  const online = game.booted && !game.error && (game.settings?.onlineEnhancements ?? true);
  const geo = useGeoRegion(online);
  const env = useClockWeather(game.realRegion || game.currentRegion, geo, online);
  const [activePanel, setActivePanel] = useState(() => PANEL_TITLES[devParam('tab')] ? devParam('tab') : null);
  const initializing = useRef(false);
  const visitedGeo = useRef(null);
  const { initialize, visitGeo } = game;

  useEffect(() => {
    if (!game.booted || game.state || game.error || initializing.current || !geo.regionId || ['pending', 'disabled'].includes(geo.source)) return;
    initializing.current = true;
    void initialize(geo.regionId).finally(() => { initializing.current = false; });
  }, [game.booted, game.state, game.error, geo.regionId, geo.source, initialize]);
  useEffect(() => {
    if (!game.ready || geo.source !== 'ip' || !geo.regionId || visitedGeo.current === geo.regionId) return;
    if (game.realRegion === geo.regionId && game.unlockedRegions.includes(geo.regionId)) return;
    visitedGeo.current = geo.regionId;
    void visitGeo(geo.regionId).finally(() => { visitedGeo.current = null; });
  }, [game.ready, game.realRegion, game.unlockedRegions, geo.source, geo.regionId, visitGeo]);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') setActivePanel(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const togglePanel = useCallback((id) => setActivePanel((current) => current === id ? null : id), []);
  const disabled = game.busy || !!game.travel || !!game.error;
  const region = regionById(game.currentRegion);
  const demo = devParam('demo');
  const travelLeft = game.travel ? Math.max(0, Math.ceil((game.travel.arriveAtMs - game.nowMs) / 1000)) : 0;
  const travelProgress = game.travel ? Math.max(0, Math.min(100, (game.nowMs - game.travel.departAtMs) / (game.travel.arriveAtMs - game.travel.departAtMs) * 100)) : 0;

  const renderPanel = () => {
    switch (activePanel) {
      case 'bucket': return <BucketPanel bucket={game.bucket} currentRegion={game.currentRegion} nowMs={game.nowMs} onSellOne={game.sellOne} onSellAll={game.sellAll} disabled={disabled} />;
      case 'codex': return <CodexPanel codex={game.codex} pityCounter={game.pityCounter} currentRegion={game.currentRegion} />;
      case 'shop': return <ShopPanel coins={game.coins} rodLevel={game.rodLevel} baitCount={game.baitCount} baitLeft={game.baitLeft} onBuyRod={game.buyRod} onBuyBait={game.buyBait} disabled={disabled} />;
      case 'travel': return <TravelPanel coins={game.coins} currentRegion={game.currentRegion} unlockedRegions={game.unlockedRegions} realRegion={game.realRegion} geoSource={geo.source} onTravel={game.travelTo} onVisitReal={game.visitRealRegion} travel={game.travel} busy={game.busy || !!game.error} />;
      case 'settings': return <SettingsPanel game={game} onRefreshGeo={geo.refresh} />;
      default: return null;
    }
  };

  return <div className="relative min-h-screen w-full text-slate-100">
    <DesktopBackdrop />
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-3 py-6">
      {!game.ready ? <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center shadow-xl backdrop-blur-md">
        <h1 className="text-xl font-medium">水塘时钟</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{game.error || (game.booted ? '正在寻找你身边的水域，断网也能开始垂钓…' : '正在读取本地记忆…')}</p>
        {game.error && <div className="mt-5 flex justify-center gap-2"><Button size="sm" onClick={game.importSave}>导入备份存档</Button><Button size="sm" variant="outline" onClick={() => window.location.reload()}>重新读取</Button></div>}
      </section> : <>
        {game.error && <div role="alert" className="mb-3 rounded-xl bg-red-950/80 p-3 text-sm text-red-200">{game.error}<Button size="sm" variant="outline" className="ml-2" onClick={game.importSave}>导入备份</Button></div>}
        <ClockPanel {...env} regionName={region?.name || '未知水域'} />
        <div className="relative mt-3">
          <Pond status={game.travel ? 'idle' : demo === 'bite' ? 'bite' : game.status} windowLeft={demo === 'bite' ? 17 : game.windowLeft} weather={env.weather} hour={env.hour} speech={demo ? DEMO_SPEECH[demo] || null : game.speech} onCatch={disabled ? undefined : game.catchFish} onPoke={disabled ? null : game.pokeBobber} />
          {game.travel && <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-slate-950/55 backdrop-blur-sm"><div className="w-4/5 max-w-sm rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-center shadow-xl"><Plane size={28} className="mx-auto text-sky-300" /><p className="mt-3 text-sm">{regionById(game.travel.fromId)?.name} → {regionById(game.travel.toId)?.name}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-sky-100">{Math.floor(travelLeft / 60)}:{String(travelLeft % 60).padStart(2, '0')}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${travelProgress}%` }} /></div><p className="mt-3 text-xs text-slate-400">鱼篓随身携带，关闭窗口后航程仍继续。</p></div></div>}
        </div>
        <ActionDock coins={game.coins} activePanel={activePanel} onToggle={togglePanel} />
        <div className="mt-2 flex justify-between px-2 text-[10px] text-slate-500"><span>{game.busy ? '正在保存…' : '本地进度已保存'}</span><span>{game.travel ? '旅途中暂停垂钓' : game.status === 'bite' ? '浮漂下沉了，点击水塘收竿' : `静候鱼讯 · 约 ${game.waitLeft} 秒`}</span></div>
        {activePanel && <PanelWindow title={PANEL_TITLES[activePanel]} onClose={() => setActivePanel(null)}>{renderPanel()}</PanelWindow>}
      </>}
    </main>
  </div>;
}
