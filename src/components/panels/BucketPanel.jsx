import { Button } from '@/components/ui/button';
import { qualityById, regionById } from '@/lib/gameUtils';
import { quoteSaleFish, quoteBucketSale } from '@/domain/market';
import { itemName, itemSalePrice } from '@/domain/loot';
import { LOOT_CONFIG, ITEM_DEFINITIONS } from '@/config/lootConfig';

const remaining = (ms) => ms >= 86400000 ? `${Math.ceil(ms / 86400000)} 天内` : ms >= 3600000 ? `${Math.ceil(ms / 3600000)} 小时内` : `${Math.max(1, Math.ceil(ms / 60000))} 分钟内`;
export default function BucketPanel({ game, disabled }) {
  const { bucket, items, currentRegion, nowMs, saleBuff } = game;
  const total = quoteBucketSale(game.state, nowMs);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-400">按{regionById(currentRegion)?.name}行情出售，图鉴永久保留。</p><Button size="sm" variant="outline" onClick={game.sellAll} disabled={disabled || !bucket.length}>全部卖出 · ¥{total.price}</Button></div>
    <p className="ink-note">鱼获保鲜 7 天，关闭软件仍计时。到期后每条固定 ¥1。</p>
    {!!saleBuff?.remaining && <p className="ink-note ink-buff" role="status">小网红 · 剩余 {saleBuff.remaining} 次：使用后钓获的新鲜鱼出售 +50%。批卖按捕获先后结算。</p>}
    <h3 className="ink-section-title">鱼获 <span>{bucket.length}</span></h3>
    {!bucket.length ? <p className="py-4 text-center text-sm text-slate-400">鱼篓空空，等浮漂下沉后收竿吧。</p> : <div className="space-y-2">{bucket.map((fish) => {
      const quote = quoteSaleFish(fish, game.state, nowMs), quality = qualityById(fish.quality);
      return <div key={fish.uid} className="ink-list-row"><div className="min-w-0"><div className={`text-sm font-medium ${quality.text}`}>{quality.name}·{fish.name}<span className="ml-2 text-xs text-slate-400">{fish.length}cm / {fish.weight}kg</span></div><p className="mt-1 text-xs text-slate-500">{regionById(fish.originRegionId || fish.regionId)?.name} · {quote.expired ? '已过期 · 固定 ¥1' : `${remaining(quote.expiresAtMs - nowMs)}到期 · 行情 ×${quote.multiplier.toFixed(2)}`}</p>{quote.buffApplied && <p className="mt-1 text-xs text-emerald-200">单条出售可享网红加价 · 原价 ¥{quote.marketPrice}</p>}</div><Button size="sm" variant="outline" disabled={disabled} onClick={() => game.sellOne(fish.uid)} className="shrink-0">卖 ¥{quote.price}</Button></div>;
    })}</div>}
    <h3 className="ink-section-title">水底拾物 <span>{items.length}</span></h3>
    {!items.length ? <p className="py-3 text-center text-xs text-slate-400">偶尔也能钓到破鞋、泡水表或网红秘籍。</p> : <div className="space-y-2">{items.map((item) => {
      const manual = item.type === 'influencer_manual', watch = item.type === 'waterlogged_watch', repairable = watch && item.status === 'found';
      const price = manual ? null : itemSalePrice(item);
      return <article key={item.uid} className="rounded-xl border border-white/10 p-3" data-item-type={item.type}>
        <h4 className="text-sm font-medium">{itemName(item)}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{repairable || !watch ? ITEM_DEFINITIONS[item.type].description : `已试修一次 · ${item.repairOutcome === 'failed' ? '未能修好，可清理残骸' : `鉴定价 ¥${price}`}，结果已保存。`}</p>
        {repairable && <p className="mt-2 text-xs leading-relaxed text-slate-500">仅修一次：40% 失败（¥0），55% 普通表（¥10–200），4.9% 名贵表（¥1000–9999），0.1% 顶级表（¥10000）。</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {manual ? <Button size="sm" disabled={disabled || saleBuff?.remaining > 0} onClick={() => game.useItem(item.uid)}>{saleBuff?.remaining > 0 ? '当前状态用尽后可使用' : '使用秘籍 · 前3条 +50%'}</Button> : <Button size="sm" variant="outline" disabled={disabled} onClick={() => game.sellItem(item.uid)}>{price === 0 ? '清理残骸' : '直接出售'} · ¥{price}</Button>}
          {repairable && <Button size="sm" variant="outline" disabled={disabled || game.coins < LOOT_CONFIG.repairCost} onClick={() => game.repairItem(item.uid)}>试修一次 · ¥{LOOT_CONFIG.repairCost}</Button>}
        </div>
      </article>;
    })}</div>}
  </div>;
}
