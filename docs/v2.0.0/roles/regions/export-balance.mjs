// Runtime-config report: does not mutate code, assets, user saves or configuration.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { FISH, REGIONS, QUALITIES } from '../../../../src/lib/gameConfig.js';
import { FISH_BALANCE, fishQualityWeights } from '../../../../src/config/balance.js';
import { quoteFish, MARKET_QUOTES } from '../../../../src/domain/market.js';
import { ROUTES } from '../../../../src/domain/routes.js';
import { LOOT_CONFIG, ITEM_DEFINITIONS } from '../../../../src/config/lootConfig.js';
import { itemSalePrice } from '../../../../src/domain/loot.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const specification = JSON.parse(fs.readFileSync(path.join(root, 'docs/focus-edition-plan/LOOT_RULES.json')));
for (const entry of specification.entries) {
  if (LOOT_CONFIG.weights[entry.id] !== entry.weight) throw Error(`Runtime loot differs: ${entry.id}`);
}
const fishProbability = LOOT_CONFIG.weights.fish / LOOT_CONFIG.denominator;
const nonFishDirectValue = Object.entries(LOOT_CONFIG.weights).filter(([id]) => id !== 'fish')
  .reduce((sum, [id, weight]) => sum + weight * (ITEM_DEFINITIONS[id].sellable === false ? 0
    : itemSalePrice({ type: id, status: 'found' })) / LOOT_CONFIG.denominator, 0);
const species = new Map(FISH.map(fish => [fish.id, fish]));
const range = values => [Math.min(...values), Math.max(...values)];
const values = new Map();
for (const region of REGIONS) for (const [id] of region.fish) {
  const fish = species.get(id), [left, right] = fish.wt.map(number => number * 100);
  const means = {};
  for (const quality of QUALITIES) {
    let mass = 0, value = 0;
    for (let cents = Math.ceil(left - .5); cents <= Math.floor(right + .5); cents++) {
      const probability = Math.max(0, Math.min(right, cents + .5) - Math.max(left, cents - .5)) / (right - left);
      if (!probability) continue;
      mass += probability;
      value += probability * quoteFish({ speciesId: id, quality: quality.id, weight: cents / 100, caughtAtMs: 1 }, region.id, 1).price;
    }
    if (Math.abs(mass - 1) > 1e-9) throw Error(`Weight mass: ${id}`);
    means[quality.id] = value;
  }
  values.set(`${id}:${region.id}`, means);
}

function state(region, { bait = false, pity = false, active = false, rareFactor } = {}) {
  const total = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
  const probabilities = Object.fromEntries(QUALITIES.map(quality => [quality.id, 0]));
  let fishMean = 0;
  for (const [id, speciesWeight] of region.fish) {
    const fish = species.get(id);
    const weights = fishQualityWeights(fish, region.id, { bait, pity: pity ? FISH_BALANCE.pityThreshold : 0, active });
    if (rareFactor !== undefined) {
      const rare = weights.find(entry => entry[0] === 'rare');
      rare[1] += fish.qw.rare * FISH_BALANCE.baseWeightScale * (rareFactor - FISH_BALANCE.rareFactors[region.id]);
    }
    const qualityTotal = weights.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [quality, weight] of weights) {
      const p = speciesWeight / total * weight / qualityTotal;
      probabilities[quality] += p;
      fishMean += p * values.get(`${id}:${region.id}`)[quality];
    }
  }
  return { fishMean, gross: fishProbability * fishMean + nonFishDirectValue, probabilities,
    high: probabilities.epic + probabilities.legendary };
}
function steady(region, bait, rareFactor) {
  const ordinary = state(region, { bait, rareFactor }), pity = state(region, { bait, pity: true, rareFactor });
  const survival = 1 - ordinary.high;
  const normalMass = (1 - survival ** FISH_BALANCE.pityThreshold) / ordinary.high;
  const tailMass = survival ** FISH_BALANCE.pityThreshold / pity.high;
  const tail = tailMass / (normalMass + tailMass);
  const fishMean = (1 - tail) * ordinary.fishMean + tail * pity.fishMean;
  return { fishMean, gross: fishProbability * fishMean + nonFishDirectValue, pityFraction: tail,
    probabilities: Object.fromEntries(QUALITIES.map(quality => [quality.id,
      (1 - tail) * ordinary.probabilities[quality.id] + tail * pity.probabilities[quality.id]])) };
}
if (process.argv.includes('--calibrate')) {
  const recommendation = Object.fromEntries(REGIONS.map(region => {
    let left = .05, right = 20;
    for (let i = 0; i < 60; i++) {
      const middle = (left + right) / 2;
      if (steady(region, false, middle).gross < 49.3) left = middle; else right = middle;
    }
    const rareFactor = Math.round((left + right) / 2 * 1000) / 1000;
    return [region.id, { rareFactor, noBait: steady(region, false, rareFactor).gross, bait: steady(region, true, rareFactor).gross }];
  }));
  console.log(JSON.stringify(recommendation));
  process.exit(0);
}

const conditions = REGIONS.flatMap(region => [false, true].flatMap(bait => [false, true].map(pity => ({
  regionId: region.id, bait, pity, ...state(region, { bait, pity }),
}))));
const stationary = REGIONS.flatMap(region => [false, true].map(bait => ({ regionId: region.id, bait, ...steady(region, bait) })));
const active = REGIONS.map(region => ({ regionId: region.id, ...state(region, { active: true }) }));
const activeHighAdvantage = active.every(row => {
  const ordinary = stationary.find(entry => entry.regionId === row.regionId && entry.bait);
  return ['rare', 'epic', 'legendary'].every(quality => row.probabilities[quality] > ordinary.probabilities[quality]);
});
const report = {
  date: '2026-10-27', scope: 'V2.0.0 runtime numerical configuration; fresh local immediate sale; no real-player profitability guarantee',
  regions: REGIONS.length, species: FISH.length, directedRoutes: ROUTES.length, marketCells: MARKET_QUOTES.length,
  fishProbability, nonFishDirectValue, target: 50, suggestedEngineeringTolerance: [45, 55],
  rule: FISH_BALANCE, summary: { stationaryGrossRange: range(stationary.map(row => row.gross)),
    noBaitGrossRange: range(stationary.filter(row => !row.bait).map(row => row.gross)),
    allStateGrossRange: range(conditions.map(row => row.gross)),
    activeFishMeanRange: range(active.map(row => row.fishMean)), activeHighAdvantage,
    ordinaryLegendaryRange: range(stationary.map(row => row.probabilities.legendary)),
    activeLegendaryRange: range(active.map(row => row.probabilities.legendary)),
    allWithinSuggestedTolerance: stationary.every(row => row.gross >= 45 && row.gross <= 55) },
  conditions, stationary, active,
  sourceHashes: Object.fromEntries(['src/lib/gameConfig.js','src/config/balance.js','src/data/focusRegions.js','src/config/lootConfig.js','src/domain/loot.js','src/domain/market.js','src/domain/routes.js'].map(file =>
    [file, createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),
  limitations: ['Model enumerates continuous-uniform2dp rounded weights; negligible32bit RNG quantization omitted',
    'Gross excludes paid bait/active permits/tickets, repairs, sales buff, cross-region arbitrage, gifts and coupon savings',
    'Pity rows are temporary states; target refers to long-run mean, not per-catch floor or cap',
    'No graphical, keyboard, native executable, network or installer verification is represented by this report'],
};
const csv = (rows, keys) => '\uFEFF' + [keys.join(','), ...rows.map(row => keys.map(key => JSON.stringify(row[key] ?? '')).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(directory, 'BALANCE_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(directory, 'REGION_YIELDS.csv'), csv(stationary.map(row => ({ ...row, rare: row.probabilities.rare, epic: row.probabilities.epic, legendary: row.probabilities.legendary })), ['regionId','bait','fishMean','gross','pityFraction','rare','epic','legendary']));
fs.writeFileSync(path.join(directory, 'ROUTES.csv'), csv(ROUTES, ['id','fromId','toId','distanceKm','price','durationMs','ruleVersion']));
fs.writeFileSync(path.join(directory, 'MARKETS.csv'), csv(MARKET_QUOTES, ['speciesId','regionId','supplyShare','maxSupplyShare','multiplier']));
console.log(JSON.stringify({ regions: report.regions, species: report.species, routes: report.directedRoutes, marketCells: report.marketCells, summary: report.summary }));
if (!report.summary.allWithinSuggestedTolerance || !activeHighAdvantage) process.exitCode = 1;
