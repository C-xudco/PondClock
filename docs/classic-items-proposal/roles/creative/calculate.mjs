// Proposal arithmetic only. No game state, application source or user saves written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, FISH, BAIT_COST, BAIT_CATCHES, BITE } from '../../../../src/lib/gameConfig.js';
import { LOOT_CONFIG } from '../../../../src/config/lootConfig.js';
import { quoteFish } from '../../../../src/domain/market.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const denominator = 10000;
const items = [
  { id: 'rusty_tin_can', name: '锈铁罐', weight: 70, sellPrice: 3, action: 'sell/keep' },
  { id: 'river_shell', name: '河蚌壳', weight: 60, sellPrice: 8, action: 'sell/keep' },
  { id: 'ferry_token', name: '渡口代币', weight: 30, sellPrice: 25, action: 'sell/keep' },
  { id: 'sealed_bait_box', name: '密封饵盒', weight: 100, sellPrice: 30, action: 'sell/use', grantsBaitUnits: 1 },
  { id: 'message_bottle', name: '漂流瓶', weight: 80, sellPrice: 12, action: 'sell/read' },
  { id: 'scratched_compass', name: '磨花指南针', weight: 60, sellPrice: 18, action: 'sell/route-preview' },
];
const oldItems = Object.fromEntries(Object.entries(LOOT_CONFIG.weights).filter(([id]) => id !== 'fish'));
const addedWeight = items.reduce((sum, item) => sum + item.weight, 0);
const oldItemWeight = Object.values(oldItems).reduce((sum, weight) => sum + weight, 0);
const fishWeight = denominator - oldItemWeight - addedWeight;
const weights = { fish: fishWeight, ...oldItems, ...Object.fromEntries(items.map(item => [item.id, item.weight])) };
if (Object.values(weights).reduce((sum, value) => sum + value, 0) !== denominator) throw new Error('Weights must be exhaustive');
const roundsPerHour = 3600 / ((BITE.minSeconds + BITE.maxSeconds) / 2);
const sellAllGrossPerRound = items.reduce((sum, item) => sum + item.weight / denominator * item.sellPrice, 0);
const baitStockReplacementPerRound = items.reduce((sum, item) => sum + item.weight / denominator *
  (item.grantsBaitUnits ? item.grantsBaitUnits * BAIT_COST : item.sellPrice), 0);
const baseScenario = REGIONS.map(region => {
  const total = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
  const conditionalFishCommonMidweight = region.fish.reduce((sum, [id, weight]) => {
    const species = FISH.find(fish => fish.id === id);
    const quote = quoteFish({ speciesId: id, quality: 'common', weight: (species.wt[0] + species.wt[1]) / 2,
      caughtAtMs: 1, originRegionId: region.id }, region.id, 1);
    return sum + weight / total * quote.price;
  }, 0);
  return { regionId: region.id, conditionalFishCommonMidweight,
    sellAllNewGrossPerRound: sellAllGrossPerRound,
    displacedFishQuotePerRound: addedWeight / denominator * conditionalFishCommonMidweight,
    liquidCoinDeltaPerRound: sellAllGrossPerRound - addedWeight / denominator * conditionalFishCommonMidweight };
});
const probabilityAtLeastOne = (probability, rounds) => 1 - (1 - probability) ** rounds;
const proposal = {
  proposalDate: '2026-10-26', status: 'DRAFT_AWAITING_USER_APPROVAL', implemented: false,
  input: { currentLootConfigVersion: LOOT_CONFIG.version, currentWeights: LOOT_CONFIG.weights,
    existingBaitCost: BAIT_COST, existingBaitCatches: BAIT_CATCHES, basicWaitSeconds: BITE },
  denominator, proposedWeights: weights, proposedItemWeight: oldItemWeight + addedWeight,
  newItemWeight: addedWeight, oldItemWeight, fishProbabilityDeltaPercentagePoints: -addedWeight / 100,
  existingAbsoluteItemProbabilitiesPreserved: Object.entries(oldItems).every(([id, weight]) => weights[id] === weight),
  items: items.map(item => ({ ...item, probability: item.weight / denominator,
    meanRounds: denominator / item.weight,
    illustrativeMeanHours: denominator / item.weight / roundsPerHour })),
  pacingScenario: {
    assumptions: 'Basic rod; 90s mean wait; every bite caught immediately; excludes reaction/window time, misses, suspension and boosts. Expectations are not guarantees.',
    roundsPerHour,
    anyItem: { probability: (oldItemWeight + addedWeight) / denominator,
      meanRounds: denominator / (oldItemWeight + addedWeight), meanMinutes: 60 / roundsPerHour * denominator / (oldItemWeight + addedWeight) },
    anyNewItem: { probability: addedWeight / denominator, meanRounds: denominator / addedWeight,
      meanMinutes: 60 / roundsPerHour * denominator / addedWeight,
      chanceIn30Minutes: probabilityAtLeastOne(addedWeight / denominator, roundsPerHour / 2),
      chanceIn60Minutes: probabilityAtLeastOne(addedWeight / denominator, roundsPerHour) },
  },
  economics: {
    sellAllNewGrossPerRound: sellAllGrossPerRound,
    sellAllNewGrossPerIllustrativeHour: sellAllGrossPerRound * roundsPerHour,
    allBaitUsedStockReplacementValuePerRound: baitStockReplacementPerRound,
    allBaitUsedStockReplacementValuePerIllustrativeHour: baitStockReplacementPerRound * roundsPerHour,
    liquidCoinDeltaFormula: '0.648 - 0.04 * F, where F is the old expected local sale quote conditional on a fish under the actual equipment/quality/weight/freshness/travel policy.',
    breakEvenConditionalFishPrice: sellAllGrossPerRound / (addedWeight / denominator),
    stockReplacementIsNotCash: true,
    commonMidweightLocalScenario: baseScenario,
    scenarioLimits: 'The common-quality/midweight scenario is a pricing illustration, not full gameplay earnings. No bait-quality/pity/rod/best-click/manual/late-sale simulation is claimed.',
  },
};
fs.writeFileSync(path.join(directory, 'PROPOSAL_CALC.json'), JSON.stringify(proposal, null, 2) + '\n');
console.log(JSON.stringify({ passedArithmetic: true, weightSum: Object.values(weights).reduce((a, b) => a + b),
  itemProbability: proposal.proposedItemWeight / denominator, newItemProbability: addedWeight / denominator,
  newLiquidGrossPerRound: sellAllGrossPerRound, baitStockReplacementPerRound,
  conditionalCommonMidweightRange: [Math.min(...baseScenario.map(row => row.conditionalFishCommonMidweight)), Math.max(...baseScenario.map(row => row.conditionalFishCommonMidweight))],
  chanceNewIn30Minutes: proposal.pacingScenario.anyNewItem.chanceIn30Minutes,
  chanceNewIn60Minutes: proposal.pacingScenario.anyNewItem.chanceIn60Minutes }));
