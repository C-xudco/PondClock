import { Button } from '@/components/ui/button';
import { qualityById, regionById } from '@/lib/gameUtils';
import { quoteFish } from '@/domain/market';

const remaining = (ms) => ms >= 86400000 ? `${Math.ceil(ms / 86400000)} 天内` : ms >= 3600000 ? `${Math.ceil(ms / 3600000)} 小时内` : `${Math.max(1, Math.ceil(ms / 60000))} 分钟内`;

const BucketPanel = ({ bucket, currentRegion, nowMs, onSellOne, onSellAll, disabled }) => {
  const quotes = bucket.map((fish) => ({ fish, quote: quoteFish(fish, currentRegion, nowMs) }));
  const total = quotes.reduce((sum, item) => sum + item.quote.price, 0);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-400">按{regionById(currentRegion)?.name}行情出售，图鉴永久保留。</p><Button size="sm" variant="outline" onClick={onSellAll} disabled={disabled || !bucket.length}>全部卖出 · ¥{total}</Button></div>
    <p className="rounded-lg bg-amber-300/5 px-3 py-2 text-xs text-amber-200/70">鱼获保鲜 7 天，关闭软件仍计时。到期后，无论品质每条均为 ¥1。</p>
    {!bucket.length ? <p className="py-8 text-center text-sm text-slate-400">鱼篓空空如也，等浮漂下沉后点击收竿吧。</p> : <div className="max-h-80 space-y-2 overflow-y-auto">{quotes.map(({ fish, quote }) => {
      const q = qualityById(fish.quality);
      return <div key={fish.uid} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3"><div><div className={`text-sm font-medium ${q.text}`}>{q.name}·{fish.name}<span className="ml-2 text-xs text-slate-400">{fish.length}cm / {fish.weight}kg</span></div><p className="mt-1 text-xs text-slate-500">{regionById(fish.originRegionId || fish.regionId)?.name} · {quote.expired ? '已过保鲜期 · 固定 ¥1' : `${remaining(quote.expiresAtMs - nowMs)}到期 · 当地行情 ×${quote.multiplier.toFixed(2)}`}</p></div><Button size="sm" variant="outline" disabled={disabled} onClick={() => onSellOne(fish.uid)} className="shrink-0">卖 ¥{quote.price}</Button></div>;
    })}</div>}
  </div>;
};
export default BucketPanel;
