// Independent, documentation-only verification. Writes REVIEW_CHECK.json here only.
// Price-cell means are reused frozen inputs: this is not a new price-formula audit.
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

function distribution(region, bait, pity, active) {
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
      value += probability * prices.get(`${id}:${region.id}:${quality}`);
    });
  }
  return { probabilities, value, high: probabilities[2] + probabilities[3] };
}

// Independent 31-state iteration, instead of the author's regenerative closed form.
let maxEconomicDrift = 0;
let maxIterations = 0;
let ordinaryConditions = 0;
const grossValues = [];
assert(economic.assumptions.editionOneLoot.fishProbability === 0.974, 'Unexpected fish rate');
assert(economic.assumptions.editionOneLoot.nonFishDirectSalePerSuccess === 0.233, 'Unexpected item contribution');
for (const region of snapshot.REGIONS) {
  for (const bait of [false, true]) {
    const normal = distribution(region, bait, false, false);
    const pity = distribution(region, bait, true, false);
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
    const mean = 0.974 * ((1 - state[30]) * normal.value + state[30] * pity.value) + 0.233;
    const reported = economic.normalRows.find((row) => row.regionId === region.id && row.bait === bait);
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
let activeConditions = 0;
for (const region of snapshot.REGIONS) {
  const active = distribution(region, false, false, true);
  const reported = economic.activeRows.find((row) => row.regionId === region.id);
  const ordinary = economic.normalRows.find((row) => row.regionId === region.id && row.bait);
  maxEconomicDrift = Math.max(maxEconomicDrift, Math.abs(active.value - reported.fishMean));
  assert(active.probabilities[2] > ordinary.probabilities.epic, 'Active epic probability is not higher');
  assert(active.probabilities[3] > ordinary.probabilities.legendary, 'Active legendary probability is not higher');
  activeConditions += 1;
}
assert(maxEconomicDrift < 1e-8, 'Economic result differs');
const uniformStopSuccess = 0.25 * 0.1 + 0.30 * 0.5 + 0.25;
assert(Math.abs(uniformStopSuccess - economic.assumptions.uniformStopSuccess) < 1e-12, 'Gauge probability differs');
assert(9740 + 150 + 20 + 10 + 4 * 20 === 10000, 'Loot denominator differs');

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
  `${plan}SPEC.md`, `${plan}REGIONS.md`, `${plan}REGION_CANDIDATE.json`,
  `${plan}ROUTES_CANDIDATE.csv`, `${plan}MARKETS_CANDIDATE.csv`,
  `${plan}roles/gameplay/README.md`, `${plan}roles/economy/README.md`,
  `${plan}roles/economy/calculate.mjs`, `${plan}roles/economy/ECONOMY_CHECK.json`,
  `${prior}INPUT_SNAPSHOT.json`, `${prior}BALANCE_CANDIDATE.json`, `${prior}PRICE_CELLS.csv`,
  'src/lib/gameConfig.js', 'src/data/regionLocations.js',
];
const result = {
  date: '2026-10-27',
  status: 'INDEPENDENT_DOCUMENT_CHECKS_PASSED_PENDING_IMPLEMENTATION',
  editionScope: 'All new requirements belong to Edition One. Edition Two is undefined.',
  implemented: false,
  applicationStarted: false,
  economics: {
    fishRate: 0.974, itemDirectContribution: 0.233,
    ordinaryConditions, activeConditions, maxAbsoluteDrift: maxEconomicDrift,
    maxStationaryIterations: maxIterations,
    ordinaryGrossRange: [Math.min(...grossValues), Math.max(...grossValues)],
    activeEpicAndLegendaryBothAboveOrdinaryWithBait: true,
    uniformStopSuccess,
    method: 'Independent 31-state iteration; frozen price CSV reused, not a new price-formula audit',
  },
  regions: {
    count: regions.length, species: species.length, directedRoutes: routes.length,
    marketCells: market.length, maximumDistanceDriftKm: maxDistanceDrift,
    maximumMarketMultiplierDrift: maxMarketDrift,
  },
  reviewedFileHashes: Object.fromEntries(reviewedFiles.map((file) => [file, hash(file)])),
  reviewScriptSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  limitations: [
    'Explicit approval is still required for recommended product parameters.',
    'Economic calibration only covers the previous 12 regions; full 17-region gross-50 balance has not passed.',
    'Candidate geography uses approximate planning coordinates; ecological sources and hook-fishing evidence remain bounded.',
    'No code implementation, migration, keyboard/UI, native EXE, installer or release acceptance is claimed.',
    'Reviewed file hashes are an as-of-run snapshot; rerun after any reviewed document or input changes.',
  ],
};
fs.writeFileSync(path.join(directory, 'REVIEW_CHECK.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: result.status, economics: result.economics, regions: result.regions }));
