// V2.0.0 numerical rules. Species identity and supply are maintained separately.
// Ordinary target: fresh local fish + direct-sale items, per successful catch.
export const FISH_BALANCE = Object.freeze({
  ruleVersion: 2,
  basePriceOffset: 20,
  basePriceSlope: 0.55,
  finalPriceScale: 1.2,
  baseWeightScale: 4,
  baitQualityBonus: 6,
  pityThreshold: 30,
  pityWeightMultiplier: 5,
  qualityBonusRate: Object.freeze({ rare: 1, epic: 0.3, legendary: 0.1 }),
  activeMultipliers: Object.freeze({ common: 1, rare: 1.25, epic: 4, legendary: 5 }),
  rareFactors: Object.freeze({
    jiangnan: 4.736, huaihe: 8, huanghe: 3.408, changjiang: 2.616,
    dongnan: 3.075, lingnan: 3.349, xinan: 4.185, yungui: 1.584,
    hainan: 4.07, dongbei: 3.564, xibei: 0.841, qingzang: 4.163,
    taihu: 1.625, dongting: 1.771, jialing: 1.319, baiyangdian: 8, jiaodong: 3.856,
  }),
});

export function fishBasePrice(originalBasePrice) {
  return Math.round(Math.max(originalBasePrice,
    Math.round(FISH_BALANCE.basePriceOffset + FISH_BALANCE.basePriceSlope * originalBasePrice))
    * FISH_BALANCE.finalPriceScale);
}

// Active fishing never borrows ordinary bait or its pity counter. Numeric rod
// levels deliberately do not occur in this interface.
export function fishQualityWeights(species, regionId, { bait = false, pity = 0, active = false } = {}) {
  const rareFactor = FISH_BALANCE.rareFactors[regionId] || 1;
  return Object.entries(species.qw).map(([quality, base]) => {
    let weight = base * FISH_BALANCE.baseWeightScale * (quality === 'rare' ? rareFactor : 1);
    if (!active && bait) weight += FISH_BALANCE.baitQualityBonus * (FISH_BALANCE.qualityBonusRate[quality] || 0);
    if (!active && pity >= FISH_BALANCE.pityThreshold && ['epic', 'legendary'].includes(quality)) {
      weight *= FISH_BALANCE.pityWeightMultiplier;
    }
    if (active) weight *= FISH_BALANCE.activeMultipliers[quality] || 1;
    return [quality, weight];
  });
}
