// Cosmetic assets are bundled locally. Prices are in earned game coins only.
// Catalogue IDs are persistent save identities; do not reuse them for other art.
const option = (id, name) => Object.freeze({ id, name });
export const APPEARANCE_OPTIONS = Object.freeze({
  scene: Object.freeze([option('minimal', '静水 · 简洁'), option('inkwash', '山水入墨')]),
  character: Object.freeze([option('minimal', '小小钓客'), option('inkwash', '水墨渔翁'),
    option('cloudwalker', '云游旅人'), option('ember', '暮色旅人'), option('whitecape', '白发行者')]),
  rod: Object.freeze([option('minimal', '朴素鱼竿'), option('inkwash', '墨竹鱼竿'),
    option('jade', '青玉鱼竿'), option('dawn', '晨光鱼竿')]),
});

const product = (id, name, description, price, grants) => Object.freeze({
  id, name, description, price, grants: Object.freeze(grants),
});
// Engineering defaults, adjustable together without changing ownership IDs.
export const APPEARANCE_PRODUCTS = Object.freeze([
  product('inkwash_pack', '山水入墨 · 美术拓展包', '十七地水墨画、渔翁立绘与墨竹鱼竿，可分别搭配。', 1800,
    { scene: 'inkwash', character: 'inkwash', rod: 'inkwash' }),
  product('cloudwalker_skin', '云游旅人', '雾白斗篷与天青围巾的原创小钓客。', 650, { character: 'cloudwalker' }),
  product('ember_skin', '暮色旅人', '暖赭斗篷与柔和灯光色的原创小钓客。', 650, { character: 'ember' }),
  product('whitecape_character_pack', '白发行者 · 人物拓展包', '白发披风钓客，晴雨同一人物；只改变立绘。', 650, { character: 'whitecape' }),
  product('jade_rod', '青玉鱼竿', '青玉色竿身与沉静银环，只改变外观。', 350, { rod: 'jade' }),
  product('dawn_rod', '晨光鱼竿', '浅金竿身与晨曦色细节，只改变外观。', 500, { rod: 'dawn' }),
]);

export const DEFAULT_APPEARANCE = Object.freeze({
  ownedProducts: Object.freeze([]),
  equipped: Object.freeze({ scene: 'minimal', character: 'minimal', rod: 'minimal' }),
});
export const appearanceProduct = (id) => APPEARANCE_PRODUCTS.find((entry) => entry.id === id) || null;
export const ownsAppearanceStyle = (appearance, slot, styleId) =>
  Boolean(Object.hasOwn(APPEARANCE_OPTIONS, slot) && APPEARANCE_OPTIONS[slot].some((entry) => entry.id === styleId) &&
    (styleId === DEFAULT_APPEARANCE.equipped[slot] || appearance.ownedProducts.some((id) => appearanceProduct(id)?.grants[slot] === styleId)));
export const ownedStyleIds = (appearance, slot) => Object.hasOwn(APPEARANCE_OPTIONS, slot)
  ? APPEARANCE_OPTIONS[slot].filter((entry) => ownsAppearanceStyle(appearance, slot, entry.id)).map((entry) => entry.id) : [];
