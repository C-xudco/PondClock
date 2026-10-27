// v2 proposal arithmetic only; writes documentation data, never game state.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RODS, BAIT_COST, BAIT_CATCHES, BITE } from '../../../../src/lib/gameConfig.js';
import { LOOT_CONFIG } from '../../../../src/config/lootConfig.js';
import { ROUTES } from '../../../../src/domain/routes.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const denominator = 10000;
const items = [
  { id: 'rusty_tin_can', name: '锈铁罐', weight: 20, sellPrice: 3, action: 'sell/keep' },
  { id: 'river_shell', name: '河蚌壳', weight: 20, sellPrice: 8, action: 'sell/keep' },
  { id: 'ferry_token', name: '渡口代币', weight: 20, sellPrice: 25, action: 'sell/activate-rod-discount', benefit: 'rodUpgrade10' },
  { id: 'sealed_bait_box', name: '密封饵盒', weight: 20, sellPrice: 30, action: 'sell/use', grantsBaitUnits: 1 },
  { id: 'scratched_compass', name: '磨花指南针', weight: 20, sellPrice: 18, action: 'sell/activate-ticket-discount', benefit: 'ticket10' },
];
const oldItems = Object.fromEntries(Object.entries(LOOT_CONFIG.weights).filter(([id]) => id !== 'fish'));
const addedWeight = items.reduce((sum, item) => sum + item.weight, 0);
const oldItemWeight = Object.values(oldItems).reduce((sum, weight) => sum + weight, 0);
const fishWeight = denominator - oldItemWeight - addedWeight;
const weights = { fish: fishWeight, ...oldItems, ...Object.fromEntries(items.map(item => [item.id, item.weight])) };
if (addedWeight !== 100 || fishWeight !== 9720 || Object.values(weights).reduce((sum, value) => sum + value, 0) !== denominator) throw new Error('v2 arithmetic differs from the user revision');
const roundsPerHour = 3600 / ((BITE.minSeconds + BITE.maxSeconds) / 2);
const newCashGrossPerRound = items.reduce((sum, item) => sum + item.weight / denominator * item.sellPrice, 0);
const baitStockReplacementPerRound = items.reduce((sum, item) => sum + item.weight / denominator *
  (item.grantsBaitUnits ? item.grantsBaitUnits * BAIT_COST : item.sellPrice), 0);
const oldDirectCashGrossPerRound = oldItems.old_shoe / denominator * LOOT_CONFIG.shoePrice
  + oldItems.waterlogged_watch / denominator * LOOT_CONFIG.unrepairedWatchPrice;
const probabilityAtLeastOne = (probability, rounds) => 1 - (1 - probability) ** rounds;
const discountedPrice = basePrice => {
  if (!Number.isSafeInteger(basePrice) || basePrice <= 0 || !Number.isSafeInteger(basePrice * 9 + 5)) throw new Error('Invalid controlled base price');
  return Math.floor((basePrice * 9 + 5) / 10);
};
const ticketQuotes = ROUTES.map(route => ({ fromId: route.fromId, toId: route.toId,
  basePrice: route.price, payablePrice: discountedPrice(route.price), discount: route.price - discountedPrice(route.price),
  durationMs: route.durationMs }));
const rodQuotes = RODS.slice(1).map((rod, index) => ({ fromLevel: index, toLevel: index + 1, name: rod.name,
  basePrice: rod.cost, payablePrice: discountedPrice(rod.cost), discount: rod.cost - discountedPrice(rod.cost) }));
const proposal = {
  proposalDate: '2026-10-26', revision: 'v2', status: 'DRAFT_AWAITING_USER_APPROVAL', implemented: false,
  supersedes: { readme: 'README-v1.md', calculation: 'PROPOSAL_CALC-v1.json', script: 'calculate-v1.mjs' },
  userRevision: { deferMessageBottle: true, eachNewItemProbability: 0.002, compass: 'next valid airfare90%', token: 'next numeric rod upgrade90%', sameTypeNoStack: true, grossTarget: { averageCoins: 50, isUpperCap: false, scope: 'Successful catch, fresh fish sold immediately at current local quote plus direct item sale' } },
  input: { currentLootConfigVersion: LOOT_CONFIG.version, currentWeights: LOOT_CONFIG.weights,
    baitCost: BAIT_COST, baitCatches: BAIT_CATCHES, basicWaitSeconds: BITE },
  salePricesAreDraftRecommendations: true,
  denominator, proposedWeights: weights, proposedItemWeight: oldItemWeight + addedWeight,
  newItemWeight: addedWeight, oldItemWeight, relativeFishCountChange: fishWeight / LOOT_CONFIG.weights.fish - 1,
  existingAbsoluteItemProbabilitiesPreserved: Object.entries(oldItems).every(([id, weight]) => weights[id] === weight),
  items: items.map(item => ({ ...item, probability: item.weight / denominator,
    meanRounds: denominator / item.weight, illustrativeMeanHours: denominator / item.weight / roundsPerHour })),
  pacingScenario: {
    assumptions: 'Basic rod90s mean; all bites caught immediately; excludes window/reaction time, misses, boosts and suspension. Expectations are not guarantees.',
    roundsPerHour,
    anyItem: { probability: (oldItemWeight + addedWeight) / denominator,
      meanRounds: denominator / (oldItemWeight + addedWeight), meanMinutes: 60 / roundsPerHour * denominator / (oldItemWeight + addedWeight) },
    anyNewItem: { probability: addedWeight / denominator, meanRounds: denominator / addedWeight,
      meanMinutes: 60 / roundsPerHour * denominator / addedWeight,
      chanceIn30Minutes: probabilityAtLeastOne(addedWeight / denominator, roundsPerHour / 2),
      chanceIn60Minutes: probabilityAtLeastOne(addedWeight / denominator, roundsPerHour) },
  },
  discountRecommendations: {
    slots: ['ticket10', 'rodUpgrade10'], numerator: 9, denominator: 10,
    rounding: 'Positive integer half-up: floor((basePrice*9+5)/10), equivalent to Math.round(basePrice*9/10).',
    durationChanges: false, fishingStatsChanges: false,
    ticketRange: { baseMin: Math.min(...ticketQuotes.map(row => row.basePrice)), baseMax: Math.max(...ticketQuotes.map(row => row.basePrice)),
      payableMin: Math.min(...ticketQuotes.map(row => row.payablePrice)), payableMax: Math.max(...ticketQuotes.map(row => row.payablePrice)),
      discountMin: Math.min(...ticketQuotes.map(row => row.discount)), discountMax: Math.max(...ticketQuotes.map(row => row.discount)) },
    ticketQuotes, rodQuotes,
    activation: 'Consume inventory uid and create a sourceItemUid/type/ruleVersion pending entitlement in one commit. Duplicate same-type activation rejects and preserves the second item.',
    payment: 'Check discounted payable balance; commit coins+travel or numeric upgrade+clear only the matching entitlement. View/invalid request/insufficient funds/save failure never consume it. Unknown receipts reconcile the original command.',
    noExpiry: true, atMaxRodActivation: 'reject and preserve token', alreadyPendingAtMaxLevel: 'preserve on load; show no available upgrade',
    realVisitConsumesTicketCoupon: false,
    sourceUIDMustBeAbsentFromInventory: true, twoBenefitsCannotShareSourceUID: true,
  },
  economics: {
    newDirectCashGrossPerRound: newCashGrossPerRound,
    oldDirectCashGrossPerRound,
    allItemDirectCashGrossPerRound: newCashGrossPerRound + oldDirectCashGrossPerRound,
    newDirectCashGrossPerIllustrativeHour: newCashGrossPerRound * roundsPerHour,
    baitStockReplacementValuePerRound: baitStockReplacementPerRound,
    directCashDeltaFormula: '0.168 -0.01*F; F is the old conditional expected fish sale quote, not the total per-success gross target.',
    breakEvenConditionalFishPrice: newCashGrossPerRound / (addedWeight / denominator),
    excludesFishQuotes: true, excludesRepairGambling: true, excludesManualBonus: true,
    couponSavingsAreConditionalNotCash: true, baitReplacementIsNotCash: true,
    totalGross50TargetCompleted: false,
    broaderEconomyTarget: 'User confirmed average about50coins, not a cap, for successful catches sold immediately fresh at local quotes plus direct item sales. The economics role handles fish-quality tuning. New-item0.168 and old-item0.115 contributions do not prove the average50target achieved.',
  },
};
fs.writeFileSync(path.join(directory, 'PROPOSAL_CALC.json'), JSON.stringify(proposal, null, 2) + '\n');
console.log(JSON.stringify({ revision: 'v2', weightSum: Object.values(weights).reduce((a, b) => a + b), fishWeight,
  totalItemProbability: proposal.proposedItemWeight / denominator, eachNewItemProbability: 0.002,
  newDirectCashGrossPerRound: newCashGrossPerRound, oldDirectCashGrossPerRound, baitStockReplacementPerRound,
  ticketRange: proposal.discountRecommendations.ticketRange, rodQuotes,
  chanceNewIn30Minutes: proposal.pacingScenario.anyNewItem.chanceIn30Minutes,
  chanceNewIn60Minutes: proposal.pacingScenario.anyNewItem.chanceIn60Minutes }));
