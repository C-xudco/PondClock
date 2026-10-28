import { useEffect, useState } from "react";
import { Fish, Trophy } from "lucide-react";
import { PITY_THRESHOLD, REGIONS } from "@/lib/gameConfig";
import { qualityById, fishById, regionById, fishRegions } from "@/lib/gameUtils";
import { FISH_SOURCES } from '@/data/fishSources';

// 图鉴：只记最长/最重/最佳品质三项最佳，按水域筛选，卖鱼不影响记录
const CodexPanel = ({ codex, pityCounter, currentRegion }) => {
  const [regionId, setRegionId] = useState(currentRegion || REGIONS[0]?.id);

  useEffect(() => {
    if (currentRegion) setRegionId(currentRegion);
  }, [currentRegion]);

  const region = regionById(regionId) || REGIONS[0];
  const speciesList = (region?.fish || []).map(([id]) => fishById(id)).filter(Boolean);
  const caught = speciesList.filter((sp) => codex[sp.id]).length;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <Trophy size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <span>
          距上次高品质已捕获 {pityCounter} 条，满 {PITY_THRESHOLD} 条将提升高稀有概率 ·
          图鉴只记最佳记录，卖鱼不影响
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REGIONS.map((r) => {
          const active = r.id === regionId;
          const total = (r.fish || []).length;
          const got = (r.fish || []).filter(([id]) => codex[id]).length;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRegionId(r.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-sky-400/60 bg-sky-400/15 text-sky-200"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {r.name}
              <span className="ml-1 text-[10px] text-slate-500">
                {got}/{total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {region?.name} · {region?.waterSystem}
        </span>
        <span>
          本水域图鉴 {caught}/{speciesList.length}
        </span>
      </div>

      <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {speciesList.map((sp) => {
          const rec = codex[sp.id];
          const bq = rec ? qualityById(rec.bestQuality) : null;
          const habitats = fishRegions(sp.id)
            .map((r) => r.name)
            .join("、");
          return (
            <div
              key={sp.id}
              className={`rounded-lg border p-3 ${
                rec ? "border-white/10 bg-white/5" : "border-white/5 bg-black/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <Fish size={16} className={rec ? "text-cyan-300" : "text-slate-600"} />
                <span className="font-medium">{rec ? sp.name : "？？？"}</span>
                {rec && <span className={`text-xs ${bq.text}`}>{bq.name}</span>}
              </div>
              {FISH_SOURCES[sp.id]?.scientificName && <p className="mt-1 text-[10px] italic text-slate-400">{FISH_SOURCES[sp.id].scientificName}</p>}
              {rec ? (
                <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                  <div>
                    最长 {rec.maxLength}cm · 最重 {rec.maxWeight}kg
                  </div>
                  <div>
                    累计 {rec.catchCount} 条 · 首获 {new Date(rec.firstCaughtAtMs).toLocaleDateString('zh-CN')}
                  </div>
                  <div className="text-slate-500">偏好水域：{habitats || "未知"}</div>
                  {sp.habitat && <div className="text-slate-500">生境：{sp.habitat}</div>}
                </div>
              ) : (
                <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                  <div>尚未捕获。{sp.habitat ? `习性：${sp.habitat}` : "换个水域试试？"}</div>
                  <div className="text-slate-700">偏好水域：{habitats || "未知"}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CodexPanel;
