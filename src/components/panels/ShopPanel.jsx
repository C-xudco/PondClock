import { Button } from "@/components/ui/button";
import { useState } from 'react';
import AppearanceShop from './AppearanceShop';
import { Anvil, Bug } from "lucide-react";
import { RODS, BAIT_COST, BAIT_CATCHES, BAIT_QUALITY_BONUS, BITE } from "@/lib/gameConfig";

// 外观和渔具分区，外观不会影响已有鱼竿等级或钓鱼数值。
const ShopPanel = ({ game, coins, rodLevel, baitCount, baitLeft, onBuyRod, onBuyBait, disabled }) => {
  const [section, setSection] = useState('appearance');
  const rod = RODS[rodLevel];
  const next = RODS[rodLevel + 1];
  const rodWait = Math.round(((BITE.minSeconds + BITE.maxSeconds) / 2) * rod.intervalMult);
  return (
    <div>
      <div className="shop-sections" role="group" aria-label="商店分区">
        <button type="button" aria-pressed={section === 'appearance'} onClick={() => setSection('appearance')}>美术与外观</button>
        <button type="button" aria-pressed={section === 'gear'} onClick={() => setSection('gear')}>渔具与鱼饵</button>
      </div>
      {section === 'appearance' ? <AppearanceShop game={game} disabled={disabled}/> : <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="space-y-2 rounded-lg bg-white/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Anvil size={16} className="text-slate-300" />
          鱼竿升级
        </h3>
        <p className="text-sm text-slate-400">
          当前：{rod.name} · 平均约 {rodWait} 秒一竿
        </p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-400">
          <li>判定窗口 +{rod.windowBonus} 秒</li>
          <li>咬钩间隔 ×{rod.intervalMult}（越短越频繁）</li>
          <li>品质权重加成 +{rod.qualityBonus}</li>
        </ul>
        {next ? (
          <>
            <p className="text-xs text-slate-500">
              升级后平均约 {Math.round(((BITE.minSeconds + BITE.maxSeconds) / 2) * next.intervalMult)} 秒一竿，
              窗口 +{next.windowBonus} 秒、品质加成 +{next.qualityBonus}
            </p>
            <Button size="sm" onClick={onBuyRod} disabled={disabled || coins < next.cost}>
              升级到「{next.name}」 ¥{next.cost}
            </Button>
          </>
        ) : (
          <p className="text-sm text-amber-400">已是最高级鱼竿</p>
        )}
      </div>
      <div className="space-y-2 rounded-lg bg-white/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Bug size={16} className="text-emerald-300" />
          高级鱼饵
        </h3>
        <p className="text-sm text-slate-400">
          库存：{baitCount} 份
          {baitLeft > 0 && <span className="ml-2 text-emerald-400">使用中（剩 {baitLeft} 次）</span>}
        </p>
        <p className="text-xs text-slate-400">
          每份可用 {BAIT_CATCHES} 次钓鱼，品质权重 +{BAIT_QUALITY_BONUS}；钓到鱼时自动消耗，
          用尽后自动启用下一份。
        </p>
        <Button size="sm" onClick={onBuyBait} disabled={disabled || coins < BAIT_COST}>
          购买鱼饵 ¥{BAIT_COST}
        </Button>
      </div>
    </div>}
    </div>
  );
};

export default ShopPanel;
