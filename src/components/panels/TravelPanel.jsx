import { Button } from "@/components/ui/button";
import { Plane, Check, Lock, MapPin, Home, Compass } from "lucide-react";
import { REGIONS } from "@/lib/gameConfig";
import { regionById } from "@/lib/gameUtils";

const GEO_HINT = {
  pending: "正在按 IP 属地匹配本地水域…",
  ip: "已按 IP 属地自动匹配本地水域",
  "ip-cached": "沿用上次 IP 匹配的本地水域",
  default: "未能匹配到具体水系，已使用默认水域",
  fallback: "定位失败，已使用默认水域",
  oversea: "当前为境外网络，已使用默认水域",
};

// 漫游面板：中国 12 处水域，解锁过的水域永久保留，随时免费往返
const TravelPanel = ({
  coins,
  currentRegion,
  unlockedRegions,
  homeRegion,
  geoSource,
  onTravel,
}) => {
  const home = regionById(homeRegion);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <Compass size={14} className="mt-0.5 shrink-0 text-sky-400" />
        <span>
          按中国水系与鱼群特征划分的 {REGIONS.length} 处水域，鱼种与概率各不相同。
          解锁后访问权永久保留、随时免费往返。
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">
        <span className="flex items-center gap-1 text-emerald-400">
          <Home size={13} />
          本地水域：{home?.name || "未知"}
        </span>
        {geoSource && <span className="text-slate-500">{GEO_HINT[geoSource] || "IP 属地跟随"}</span>}
      </div>

      <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
        {REGIONS.map((r) => {
          const unlocked = unlockedRegions.includes(r.id);
          const isCurrent = r.id === currentRegion;
          const isHome = r.id === homeRegion;
          const affordable = coins >= r.flightPrice;
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {isCurrent ? (
                    <MapPin size={16} className="shrink-0 text-emerald-400" />
                  ) : unlocked ? (
                    <Check size={16} className="shrink-0 text-sky-400" />
                  ) : (
                    <Lock size={16} className="shrink-0 text-slate-500" />
                  )}
                  <span className="font-medium">{r.name}</span>
                  {isHome && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                      本地
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {r.waterSystem}
                  {r.tier ? ` · 第 ${r.tier} 档水域` : ""}
                </div>
              </div>
              {isCurrent ? (
                <span className="shrink-0 text-sm text-emerald-400">当前水域</span>
              ) : (
                <Button
                  size="sm"
                  variant={unlocked ? "outline" : "default"}
                  disabled={!unlocked && !affordable}
                  onClick={() => onTravel(r.id)}
                  className="shrink-0"
                >
                  <Plane size={14} className="mr-1" />
                  {unlocked ? "前往" : `机票 ¥${r.flightPrice}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TravelPanel;
