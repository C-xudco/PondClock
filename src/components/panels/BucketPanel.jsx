import { Button } from "@/components/ui/button";
import { qualityById, calcSellPrice } from "@/lib/gameUtils";

// 鱼篓：待卖鱼列表，卖出只加金币，不影响图鉴最佳记录
const BucketPanel = ({ bucket, onSellOne, onSellAll }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-slate-400">卖出只增加金币，图鉴最佳记录会保留。</p>
      <Button size="sm" variant="outline" onClick={onSellAll} disabled={!bucket.length}>
        全部卖出（{bucket.length} 条）
      </Button>
    </div>
    {bucket.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-400">鱼篓空空如也，等浮漂下沉后点击收竿吧！</p>
    ) : (
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {bucket.map((f) => {
          const q = qualityById(f.quality);
          return (
            <div key={f.uid} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <div>
                <span className={`font-medium ${q.text}`}>{q.name}·{f.name}</span>
                <span className="ml-2 text-xs text-slate-400">{f.length}cm / {f.weight}kg</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => onSellOne(f.uid)}>
                卖 ¥{calcSellPrice(f)}
              </Button>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default BucketPanel;
