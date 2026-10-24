// Approved a270e84 proposal, 2026-10-25. Integer weights have explicit denominators.
export const LOOT_CONFIG = Object.freeze({
  version: 1,
  denominator: 10000,
  weights: Object.freeze({ fish: 9820, old_shoe: 150, waterlogged_watch: 20, influencer_manual: 10 }),
  shoePrice: 1,
  unrepairedWatchPrice: 50,
  repairCost: 500,
  repairDenominator: 1000,
  repairWeights: Object.freeze({ failed: 400, ordinary: 550, luxury: 49, top: 1 }),
  ordinaryRange: Object.freeze([10, 200]),
  luxuryRange: Object.freeze([1000, 9999]),
  topPrice: 10000,
  failedPrice: 0,
  buffCharges: 3,
  buffMultiplier: 1.5,
});

export const ITEM_DEFINITIONS = Object.freeze({
  old_shoe: Object.freeze({ name: '没人要的破鞋', description: '虽然不合脚，好歹还能卖1金币。', sellable: true }),
  waterlogged_watch: Object.freeze({ name: '泡水的手表', description: '可直接卖50金币，或花500金币试修一次。', sellable: true }),
  influencer_manual: Object.freeze({ name: '网红修炼秘籍', description: '使用后新钓获并售出的前3条新鲜鱼，成交价增加50%。', sellable: false }),
});
