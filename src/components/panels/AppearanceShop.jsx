import { Brush, Check, Coins, Shirt, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APPEARANCE_OPTIONS, APPEARANCE_PRODUCTS, ownsAppearanceStyle } from '@/config/appearance.js';

const SLOT_LABELS = { scene: '场景插画', character: '人物皮肤', rod: '鱼竿外观' };
const slotIcon = { scene: Brush, character: Shirt, rod: WandSparkles };

export default function AppearanceShop({ game, disabled }) {
  const appearance = game.appearance;
  if (!appearance) return null;
  return <section className="appearance-shop space-y-4" aria-label="外观资源商城">
    <div className="shop-intro">
      <p className="shop-eyebrow">留住喜欢的风景</p>
      <h3 className="text-base font-medium">你的水塘，你的画风</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">用卖鱼所得的金币收藏美术包。场景、人物与鱼竿可以自由搭配，外观不改变钓鱼能力。所有资源随包提供，离线也能使用。</p>
    </div>
    <div className="space-y-3" aria-label="可购买的外观">
      {APPEARANCE_PRODUCTS.map((product) => {
        const owned = appearance.ownedProducts.includes(product.id);
        const isPack = product.id === 'inkwash_pack';
        return <article key={product.id} className={`appearance-product ${isPack ? 'appearance-featured' : ''}`} data-product-id={product.id}>
          <div className={`appearance-preview preview-${product.id}`} aria-hidden="true" style={isPack ? { backgroundImage: `url('${import.meta.env.BASE_URL}art/inkwash/jiangnan-v1.jpg')` } : undefined}>
            {isPack ? <span className="preview-seal">墨</span> : <span className="preview-symbol">{product.grants.character ? <Shirt size={25}/> : <WandSparkles size={25}/>}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">{product.name}</h4>{owned && <span className="appearance-owned"><Check size={11}/> 已收藏</span>}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{product.description}</p>
            <p className="mt-1 text-[11px] text-slate-500">{Object.entries(product.grants).map(([slot, style]) => APPEARANCE_OPTIONS[slot].find((entry) => entry.id === style)?.name).join(' / ')}</p>
            <Button className="mt-2" size="sm" variant={owned ? 'outline' : 'default'} aria-label={owned ? `已收藏${product.name}` : `购买${product.name}`} disabled={disabled || owned || game.coins < product.price} onClick={() => void game.buyAppearance(product.id)}>
              {owned ? '已收藏 · 下方搭配' : <><Coins size={12} className="mr-1"/>{product.price} 金币</>}
            </Button>
            {!owned && game.coins < product.price && <span className="ml-2 text-[10px] text-slate-500">还差 {product.price - game.coins} 金币</span>}
          </div>
        </article>;
      })}
    </div>
    <section className="appearance-wardrobe" aria-label="我的外观搭配">
      <h3 className="text-sm font-medium">我的搭配</h3>
      <p className="mt-1 text-xs text-slate-400">购买后在这里装备。原初风格永久免费，可以随时换回。</p>
      {Object.entries(APPEARANCE_OPTIONS).map(([slot, options]) => {
        const Icon = slotIcon[slot];
        return <label key={slot} className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="flex shrink-0 items-center gap-2"><Icon size={14}/>{SLOT_LABELS[slot]}</span>
          <select className="appearance-select min-w-0 max-w-[64%]" aria-label={SLOT_LABELS[slot]} value={appearance.equipped[slot]} disabled={disabled} onChange={(event) => void game.equipAppearance(slot, event.target.value)}>
            {options.map((option) => <option key={option.id} value={option.id} disabled={!ownsAppearanceStyle(appearance, slot, option.id)}>{option.name}{ownsAppearanceStyle(appearance, slot, option.id) ? '' : ' · 未收藏'}</option>)}
          </select>
        </label>;
      })}
    </section>
  </section>;
}
