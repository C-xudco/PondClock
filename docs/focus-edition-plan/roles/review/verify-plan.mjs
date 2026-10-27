// Documentation-only cross-check. Writes REVIEW_CHECK.json here only.
// Original31-state method: focus_supervisor. Latest loot/price adaptation: Leader
// after reviewer usage interruption; do not claim new independent reviewer sign-off.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const hash = (relative) => createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const prior = 'docs/classic-items-proposal/roles/economy/';
const plan = 'docs/focus-edition-plan/';
const snapshot = json(`${prior}INPUT_SNAPSHOT.json`);
const pricing = json(`${prior}BALANCE_CANDIDATE.json`);
const economic = json(`${plan}roles/economy/ECONOMY_CHECK.json`);
const regionsDraft = json(`${plan}REGION_CANDIDATE.json`);
const loot = json(`${plan}LOOT_RULES.json`);
const fishRate = loot.entries.find(entry => entry.id === 'fish').weight / loot.denominator;
const itemContribution = loot.entries.filter(entry => entry.id !== 'fish')
  .reduce((sum, entry) => sum + entry.weight * entry.directSale / loot.denominator, 0);
assert(loot.entries.reduce((sum, entry) => sum + entry.weight, 0) === 10000, 'Loot total');
assert(fishRate === .74 && Math.abs(itemContribution - 4.57) < 1e-12, 'Latest loot differs');
assert(loot.entries.filter(entry => ['rusty_tin_can', 'river_shell', 'ferry_token', 'sealed_bait_box', 'scratched_compass'].includes(entry.id))
  .every(entry => entry.weight === 300), 'New item rates');
assert(loot.confirmedFerryBenefit.paymentRatio === .9 && !loot.confirmedFerryBenefit.sameKindStacks
  && loot.confirmedFerryBenefit.secondSourceItemRetained, 'Token benefit differs');

// Current candidate tables contain no commas within quoted fields.
function csv(relative) {
  const lines = read(relative).trim().split(/\r?\n/);
  const keys = lines.shift().split(',');
  return lines.map((line) => {
    const values = line.split(',').map((value) => value.replace(/^"|"$/g, ''));
    assert(values.length === keys.length, `Unexpected CSV format: ${relative}`);
    return Object.fromEntries(values.map((value, index) => [keys[index], value]));
  });
}

const prices = new Map(csv(`${prior}PRICE_CELLS.csv`).map((row) => [
  `${row.speciesId}:${row.regionId}:${row.quality}`, Number(row.newMean),
]));
const qualities = ['common', 'rare', 'epic', 'legendary'];
const speciesLookup = new Map(snapshot.FISH.map((fish) => [fish.id, fish]));
const priceSupply = new Map();
for (const region of snapshot.REGIONS) {
  const total = region.fish.reduce((sum, entry) => sum + entry[1], 0);
  for (const [id, weight] of region.fish) priceSupply.set(`${id}:${region.id}`, weight / total);
}
const priceMaximum = new Map(snapshot.FISH.map(fish => [fish.id,
  Math.max(...snapshot.REGIONS.map(region => priceSupply.get(`${fish.id}:${region.id}`) || 0))]));
const quoteCache = new Map();
let maxBaseQuoteDrift = 0;
function expectedQuote(id, regionId, quality, extraScale) {
  const key = `${id}:${regionId}:${quality}:${extraScale}`;
  if (quoteCache.has(key)) return quoteCache.get(key);
  const fish = speciesLookup.get(id);
  const priorBase = Math.max(fish.basePrice, Math.round(pricing.priceRule.offset + pricing.priceRule.slope * fish.basePrice));
  const base = Math.round(priorBase * extraScale);
  const mult = snapshot.QUALITIES.find(entry => entry.id === quality).mult;
  const scarcity = .8 + 1.2 * (1 - (priceSupply.get(`${id}:${regionId}`) || 0) / priceMaximum.get(id));
  const [lo, hi] = fish.wt;
  const average = (lo + hi) / 2 || 1;
  let value = 0, mass = 0;
  for (let cents = Math.ceil(lo * 100 - .5); cents <= Math.floor(hi * 100 + .5); cents++) {
    const portion = Math.max(0, Math.min(hi * 100, cents + .5) - Math.max(lo * 100, cents - .5)) / ((hi - lo) * 100);
    if (!portion) continue;
    // Preserve runtime multiplication order at exact half-coin rounding boundaries.
    const factor = Math.max(.5, Math.min(2.5, .7 + (((cents / 100) || average) / average) * .6));
    value += portion * Math.max(1, Math.round(base * mult * factor * scarcity));
    mass += portion;
  }
  assert(Math.abs(mass - 1) < 1e-9, 'Price weight mass');
  if (extraScale === 1) maxBaseQuoteDrift = Math.max(maxBaseQuoteDrift,
    Math.abs(value - prices.get(`${id}:${regionId}:${quality}`)));
  quoteCache.set(key, value);
  return value;
}

function distribution(region, bait, pity, active, extraScale = 1) {
  const probabilities = [0, 0, 0, 0];
  let value = 0;
  const speciesTotal = region.fish.reduce((total, entry) => total + entry[1], 0);
  for (const [id, speciesWeight] of region.fish) {
    const fish = speciesLookup.get(id);
    const weights = qualities.map((quality, index) => {
      let weight = 4 * fish.qw[quality]
        * (index === 1 ? pricing.qualityRule.rareFactors[region.id] : 1)
        + (bait ? 6 : 0) * [0, 1, 0.3, 0.1][index];
      if (pity && index >= 2) weight *= 5;
      if (active) weight *= [1, 1.25, 3.5, 5][index];
      return weight;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    qualities.forEach((quality, index) => {
      const probability = speciesWeight / speciesTotal * weights[index] / total;
      probabilities[index] += probability;
      value += probability * expectedQuote(id, region.id, quality, extraScale);
    });
  }
  return { probabilities, value, high: probabilities[2] + probabilities[3] };
}

// Independent 31-state iteration, instead of the author's regenerative closed form.
let maxEconomicDrift = 0;
let maxIterations = 0;
let ordinaryConditions = 0;
let activeConditions = 0;
const scenarioChecks = [];
assert(economic.editionOneLoot.fishProbability === fishRate, 'Unexpected fish rate');
assert(Math.abs(economic.editionOneLoot.nonFishDirectSalePerSuccess - itemContribution) < 1e-12, 'Unexpected item contribution');
const activeConfig = economic.engineeringSuggestionsNotApproved.active;
const uniformStopSuccess = .25 * .1 + .30 * .5 + .25;
assert(Math.abs(uniformStopSuccess - activeConfig.uniformStopSuccess) < 1e-12, 'Gauge differs');
assert(activeConfig.discountedBundlePrice === Math.round(activeConfig.bundlePrice * .9), 'Discount differs');
for (const model of Object.values(economic.scenarios)) {
const grossValues = [];
for (const region of snapshot.REGIONS) {
  for (const bait of [false, true]) {
    const normal = distribution(region, bait, false, false, model.extraPriceScale);
    const pity = distribution(region, bait, true, false, model.extraPriceScale);
    let state = Array(31).fill(0);
    state[0] = 1;
    let iteration = 0;
    for (; iteration < 10000; iteration += 1) {
      const next = Array(31).fill(0);
      state.forEach((probability, index) => {
        const high = index === 30 ? pity.high : normal.high;
        next[0] += probability * high;
        next[Math.min(30, index + 1)] += probability * (1 - high);
      });
      const difference = Math.max(...state.map((value, index) => Math.abs(value - next[index])));
      state = next;
      if (difference < 1e-14) break;
    }
    assert(iteration < 10000, 'Stationary distribution did not converge');
    maxIterations = Math.max(maxIterations, iteration);
    const mean = fishRate * ((1 - state[30]) * normal.value + state[30] * pity.value) + itemContribution;
    const reported = model.normalRows.find((row) => row.regionId === region.id && row.bait === bait);
    assert(reported, 'Missing ordinary condition');
    maxEconomicDrift = Math.max(maxEconomicDrift, Math.abs(mean - reported.gross));
    qualities.forEach((quality, index) => {
      const probability = (1 - state[30]) * normal.probabilities[index] + state[30] * pity.probabilities[index];
      maxEconomicDrift = Math.max(maxEconomicDrift, Math.abs(probability - reported.probabilities[quality]));
    });
    grossValues.push(mean);
    ordinaryConditions += 1;
  }
}
for (const region of snapshot.REGIONS) {
  const active = distribution(region, false, false, true, model.extraPriceScale);
  const reported = model.activeRows.find((row) => row.regionId === region.id);
  const ordinary = model.normalRows.find((row) => row.regionId === region.id && row.bait);
  maxEconomicDrift = Math.max(maxEconomicDrift, Math.abs(active.value - reported.fishMean));
  assert(active.probabilities[1] > ordinary.probabilities.rare, 'Active rare probability is not higher');
  assert(active.probabilities[2] > ordinary.probabilities.epic, 'Active epic probability is not higher');
  assert(active.probabilities[3] > ordinary.probabilities.legendary, 'Active legendary probability is not higher');
  for (const [section, cost] of [['atFullPrice', activeConfig.bundlePrice], ['withFerryToken', activeConfig.discountedBundlePrice]]) {
    const green = activeConfig.charges * active.value;
    const random = green * uniformStopSuccess;
    maxEconomicDrift = Math.max(maxEconomicDrift, Math.abs(reported[section].allGreenNet - (green - cost)),
      Math.abs(reported[section].uniformStopNet - (random - cost)), Math.abs(reported[section].breakEvenSuccess - cost / green));
  }
  const tokenSale = loot.entries.find(entry => entry.id === 'ferry_token').directSale;
  assert(reported.effectiveExpenseSavingOverSellingToken === activeConfig.bundlePrice - activeConfig.discountedBundlePrice - tokenSale,
    'Coupon opportunity cost differs');
  activeConditions += 1;
}
scenarioChecks.push({id: model.id, extraPriceScale: model.extraPriceScale,
  ordinaryGrossRange: [Math.min(...grossValues), Math.max(...grossValues)],
  allWithinSuggested45to55Tolerance: grossValues.every(value => value >= 45 && value <= 55)});
}
assert(maxEconomicDrift < 1e-8, `Economic result differs: max=${maxEconomicDrift}, frozenQuote=${maxBaseQuoteDrift}`);
assert(maxBaseQuoteDrift < 1e-8, 'Frozen price means differ');

const { REGIONS, FISH } = await import(pathToFileURL(path.join(root, 'src/lib/gameConfig.js')).href);
const { REGION_LOCATIONS } = await import(pathToFileURL(path.join(root, 'src/data/regionLocations.js')).href);
const regions = [...REGIONS, ...regionsDraft.newRegions];
const species = [...FISH, ...regionsDraft.newSpecies];
const locations = { ...REGION_LOCATIONS, ...Object.fromEntries(regionsDraft.newRegions.map((region) => [region.id, region])) };
const routes = csv(`${plan}ROUTES_CANDIDATE.csv`);
const market = csv(`${plan}MARKETS_CANDIDATE.csv`);
const routeLookup = new Map(routes.map((route) => [route.id, route]));
const distance = (from, to) => {
  const radians = Math.PI / 180;
  const latitude = (to.latitude - from.latitude) * radians;
  const longitude = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitude / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(longitude / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const pairs = regions.flatMap((from) => regions.filter((to) => from.id !== to.id).map((to) => ({
  id: `${from.id}:${to.id}`, km: distance(locations[from.id], locations[to.id]),
})));
const minimum = Math.min(...pairs.map((pair) => pair.km));
const maximum = Math.max(...pairs.map((pair) => pair.km));
assert(routes.length === 272 && routeLookup.size === 272, 'Route coverage/uniqueness differs');
let maxDistanceDrift = 0;
for (const pair of pairs) {
  const row = routeLookup.get(pair.id);
  assert(row, `Missing route ${pair.id}`);
  const ratio = (pair.km - minimum) / (maximum - minimum);
  maxDistanceDrift = Math.max(maxDistanceDrift, Math.abs(pair.km - Number(row.distanceKm)));
  assert(Number(row.durationMs) === Math.round(60000 + 120000 * ratio), `Duration differs: ${pair.id}`);
  assert(Number(row.price) === Math.round((200 + 5800 * ratio) / 10) * 10, `Fare differs: ${pair.id}`);
}
assert(maxDistanceDrift < 1e-8, 'Geographic distance differs');
const shares = new Map();
const maximumShare = new Map();
for (const region of regions) {
  const total = region.fish.reduce((sum, entry) => sum + entry[1], 0);
  for (const [id, weight] of region.fish) {
    assert(species.some((fish) => fish.id === id) && weight > 0, 'Invalid pool reference');
    const share = weight / total;
    shares.set(`${id}:${region.id}`, share);
    maximumShare.set(id, Math.max(maximumShare.get(id) || 0, share));
  }
}
assert(market.length === 56 * 17, 'Market size differs');
assert(new Set(market.map((row) => `${row.speciesId}:${row.regionId}`)).size === 56 * 17, 'Market duplicates');
let maxMarketDrift = 0;
for (const row of market) {
  const share = shares.get(`${row.speciesId}:${row.regionId}`) || 0;
  const max = maximumShare.get(row.speciesId);
  const multiplier = 0.8 + 1.2 * (1 - share / max);
  assert(Math.abs(share - Number(row.supplyShare)) < 1e-12, 'Market share differs');
  assert(Math.abs(max - Number(row.maxSupplyShare)) < 1e-12, 'Maximum market share differs');
  maxMarketDrift = Math.max(maxMarketDrift, Math.abs(multiplier - Number(row.multiplier)));
}
assert(maxMarketDrift < 1e-12, 'Market multiplier differs');

const reviewedFiles = [
  `${plan}SPEC.md`, `${plan}REGIONS.md`, `${plan}REGION_CANDIDATE.json`, `${plan}LOOT_RULES.json`,
  `${plan}ROUTES_CANDIDATE.csv`, `${plan}MARKETS_CANDIDATE.csv`,
  `${plan}roles/gameplay/README.md`, `${plan}roles/economy/README.md`, `${plan}roles/economy/README-v2.md`,
  `${plan}roles/economy/calculate.mjs`, `${plan}roles/economy/ECONOMY_CHECK.json`,
  `${prior}INPUT_SNAPSHOT.json`, `${prior}BALANCE_CANDIDATE.json`, `${prior}PRICE_CELLS.csv`,
  'src/lib/gameConfig.js', 'src/data/regionLocations.js',
];
const result = {
  date: '2026-10-27',
  status: 'SEPARATE_METHOD_CHECKS_PASSED_PENDING_INDEPENDENT_REVIEW_AND_IMPLEMENTATION',
  latestRevisionReview: {originalReviewer: 'focus_supervisor', latestAdaptationAndExecution: 'Leader after reviewer usage interruption',
    independentReviewerFinalSignOffForV2: false},
  editionScope: 'All new requirements belong to Edition One. Edition Two is undefined.',
  implemented: false,
  applicationStarted: false,
  economics: {
    fishRate, itemDirectContribution: itemContribution,
    ordinaryConditions, activeConditions, maxAbsoluteDrift: maxEconomicDrift,
    maxStationaryIterations: maxIterations,
    scenarioChecks, maximumFrozenPriceMeanDrift: maxBaseQuoteDrift,
    activeEpicAndLegendaryBothAboveOrdinaryWithBait: true,
    uniformStopSuccess,
    method: 'Separate31-state iteration; expected quotes enumerated by Leader and scale1 cross-checked against frozen price CSV; no new independent reviewer sign-off',
  },
  regions: {
    count: regions.length, species: species.length, directedRoutes: routes.length,
    marketCells: market.length, maximumDistanceDriftKm: maxDistanceDrift,
    maximumMarketMultiplierDrift: maxMarketDrift,
  },
  reviewedFileHashes: Object.fromEntries(reviewedFiles.map((file) => [file, hash(file)])),
  reviewScriptSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  limitations: [
    'Latest v2 was completed by Leader after reviewer usage interruption; new independent reviewer final sign-off is outstanding.',
    'Explicit approval is still required for recommended product parameters.',
    'Economic calibration only covers the previous 12 regions; full 17-region gross-50 balance has not passed.',
    'Candidate geography uses approximate planning coordinates; ecological sources and hook-fishing evidence remain bounded.',
    'No code implementation, migration, keyboard/UI, native EXE, installer or release acceptance is claimed.',
    'Reviewed file hashes are an as-of-run snapshot; rerun after any reviewed document or input changes.',
  ],
};
fs.writeFileSync(path.join(directory, 'REVIEW_CHECK.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, economics: result.economics, regions: result.regions }));
