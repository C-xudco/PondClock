// Approved a270e84 proposal, 2026-10-25. Integer weights have explicit denominators.
export const LOOT_CONFIG = Object.freeze({
  version: 1,
  denominator: 10000,
  dropRuleVersion: 2,
  weights: Object.freeze({ fish: 7400, old_shoe: 500, waterlogged_watch: 400, influencer_manual: 200,
    rusty_tin_can: 300, river_shell: 300, ferry_token: 300, sealed_bait_box: 300, scratched_compass: 300 }),
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
  rusty_tin_can: Object.freeze({ name: '锈铁罐', description: '河底捞起的旧铁罐，可卖3金币。', sellable: true, price: 3 }),
  river_shell: Object.freeze({ name: '河蚌壳', description: '水纹磨亮的小收藏，可卖8金币。', sellable: true, price: 8 }),
  ferry_token: Object.freeze({ name: '渡口代币', description: '使用后下次购买15次主动竿九折；同类不叠加。也可卖25金币。', sellable: true, price: 25 }),
  sealed_bait_box: Object.freeze({ name: '密封饵盒', description: '打开获得1包高级鱼饵（5条鱼），也可卖30金币。', sellable: true, price: 30 }),
  scratched_compass: Object.freeze({ name: '磨花指南针', description: '使用后下一张付费机票九折；同类不叠加。也可卖18金币。', sellable: true, price: 18 }),
});
