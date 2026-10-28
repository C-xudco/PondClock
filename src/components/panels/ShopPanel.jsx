import { Button } from "@/components/ui/button";
import { useState } from 'react';
import AppearanceShop from './AppearanceShop';
import { Fish, Bug } from "lucide-react";
import { BAIT_COST, BAIT_CATCHES } from "@/lib/gameConfig";
import { quoteActivePass } from '@/config/activeFishing';

// 外观和渔具分区，外观不会影响已有鱼竿等级或钓鱼数值。
const ShopPanel = ({ game, coins, baitCount, baitLeft, onBuyBait, disabled }) => {
  const [section, setSection] = useState('appearance');
  const quote = quoteActivePass(game.state);
  const remaining = game.activePass?.remaining || 0;
  const uncompleted = game.state?.fishing?.phase === 'gauge';
  return (
    <div>
      <div className="shop-sections" role="group" aria-label="商店分区">
        <button type="button" aria-pressed={section === 'appearance'} onClick={() => setSection('appearance')}>美术与外观</button>
        <button type="button" aria-pressed={section === 'gear'} onClick={() => setSection('gear')}>渔具与鱼饵</button>
      </div>
      {section === 'appearance' ? <AppearanceShop game={game} disabled={disabled}/> : <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="space-y-2 rounded-lg bg-white/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <Fish size={16} className="text-slate-300" />
          主动竿 · 十五次探鱼
        </h3>
        <p className="text-sm text-slate-400">
          剩余 {remaining} 次收鱼机会
        </p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-400">
          <li>平均2–3次挥杆遇鱼，空挥不扣次数</li>
          <li>进入收鱼条扣一次，绿区必中，失败也扣次</li>
          <li>主动鱼品质权重更高，操作结果不保证盈利</li>
        </ul>
        {quote.discounted && <p className="text-xs text-amber-200">渡口代币九折 · 原价 ¥{quote.basePrice}，本组 ¥{quote.price}；成交才耗优惠。</p>}
        <Button size="sm" onClick={game.buyActivePass} disabled={disabled || remaining > 0 || uncompleted || coins < quote.price}>
          {remaining > 0 || uncompleted ? '用完当前一组后再购买' : `购买15次 · ¥${quote.price}`}
        </Button>
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
          每份作用于 {BAIT_CATCHES} 条成功鱼获。开启后使用，物品、失手和主动探鱼不消耗。
        </p>
        <Button size="sm" onClick={onBuyBait} disabled={disabled || coins < BAIT_COST}>
          购买鱼饵 ¥{BAIT_COST}
        </Button>
        <label className="mt-2 flex items-center justify-between gap-3 text-xs"><span>普通钓鱼使用高级饵</span><input type="checkbox" aria-label="使用高级鱼饵" checked={!!game.state?.fishing?.useBait} disabled={disabled} onChange={event => game.setUseBait(event.target.checked)}/></label>
      </div>
    </div>}
    </div>
  );
};

export default ShopPanel;
