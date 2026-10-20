import { useCallback, useEffect, useState } from "react";
import { useFishingGame } from "@/hooks/useFishingGame";
import { useClockWeather } from "@/hooks/useClockWeather";
import { useGeoRegion } from "@/hooks/useGeoRegion";
import { regionById } from "@/lib/gameUtils";
import { SPEECH } from "@/lib/speech";
import Pond from "@/components/pond/Pond";
import ClockPanel from "@/components/header/ClockPanel";
import DesktopBackdrop from "@/components/layout/DesktopBackdrop";
import ActionDock from "@/components/layout/ActionDock";
import PanelWindow from "@/components/layout/PanelWindow";
import BucketPanel from "@/components/panels/BucketPanel";
import CodexPanel from "@/components/panels/CodexPanel";
import ShopPanel from "@/components/panels/ShopPanel";
import TravelPanel from "@/components/panels/TravelPanel";

// 开发调试参数：?demo=bite|idle|success|high|miss，用于截图检查各状态视觉
// 生产构建中 import.meta.env.DEV 为 false，这段逻辑会被移除
const readDemo = () => {
  if (!import.meta.env.DEV) return null;
  try {
    return new URLSearchParams(window.location.search).get("demo");
  } catch {
    return null;
  }
};

const DEMO_SPEECH = {
  idle: { text: SPEECH.idle[0], tone: "idle" },
  success: { text: SPEECH.success[0], tone: "success" },
  high: { text: SPEECH.high[0], tone: "high" },
  miss: { text: SPEECH.miss[0], tone: "miss" },
};

const PANEL_TITLES = { bucket: "鱼篓", codex: "图鉴", shop: "渔具店", travel: "漫游" };
const PANEL_IDS = Object.keys(PANEL_TITLES);

// 开发调试参数：?tab=bucket|codex|shop|travel 直接展开对应面板；生产环境默认全部收起
const readInitialPanel = () => {
  if (!import.meta.env.DEV) return null;
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return PANEL_IDS.includes(tab) ? tab : null;
  } catch {
    return null;
  }
};

// 《水塘时钟》主页面：桌面挂机钓鱼 + 时钟 + 收集
// 布局：透明桌面底层 → 半透明天空水塘 → 半透明时钟条 → 功能坞 → 点击展开的面板
const Index = () => {
  const env = useClockWeather();
  const geo = useGeoRegion();
  const game = useFishingGame(geo.regionId);
  const region = regionById(game.currentRegion);
  const [activePanel, setActivePanel] = useState(readInitialPanel);

  const demo = readDemo();
  const pondStatus = demo === "bite" ? "bite" : game.status;
  const pondWindowLeft = demo === "bite" ? 17 : game.windowLeft;
  const pondSpeech = demo ? DEMO_SPEECH[demo] || null : game.speech;

  // 同一个按钮再点一次收起；Esc 也能收起
  const togglePanel = useCallback((id) => {
    setActivePanel((current) => (current === id ? null : id));
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const renderPanelContent = () => {
    switch (activePanel) {
      case "bucket":
        return (
          <BucketPanel
            bucket={game.bucket}
            onSellOne={game.sellOne}
            onSellAll={game.sellAll}
          />
        );
      case "codex":
        return (
          <CodexPanel
            codex={game.codex}
            pityCounter={game.pityCounter}
            currentRegion={game.currentRegion}
          />
        );
      case "shop":
        return (
          <ShopPanel
            coins={game.coins}
            rodLevel={game.rodLevel}
            baitCount={game.baitCount}
            baitLeft={game.baitLeft}
            onBuyRod={game.buyRod}
            onBuyBait={game.buyBait}
          />
        );
      case "travel":
        return (
          <TravelPanel
            coins={game.coins}
            currentRegion={game.currentRegion}
            unlockedRegions={game.unlockedRegions}
            homeRegion={game.homeRegion}
            geoSource={geo.source}
            onTravel={game.travelTo}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen w-full text-slate-100">
      <DesktopBackdrop />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-3 py-6">
        <ClockPanel {...env} regionName={region?.name || "未知水域"} />
        <div className="mt-3">
          <Pond
            status={pondStatus}
            windowLeft={pondWindowLeft}
            weather={env.weather}
            hour={env.hour}
            speech={pondSpeech}
            onCatch={game.catchFish}
            onPoke={game.pokeBobber}
          />
        </div>
        <ActionDock coins={game.coins} activePanel={activePanel} onToggle={togglePanel} />
        {activePanel ? (
          <PanelWindow title={PANEL_TITLES[activePanel]} onClose={() => setActivePanel(null)}>
            {renderPanelContent()}
          </PanelWindow>
        ) : null}
      </div>
    </div>
  );
};

export default Index;
