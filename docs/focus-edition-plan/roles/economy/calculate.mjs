// Proposal calculator only: no product, storage, build or release mutations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = path.dirname(fileURLToPath(import.meta.url));
const previousDirectory = path.resolve(dir, '../../../classic-items-proposal/roles/economy');
const inputFile = path.join(previousDirectory, 'INPUT_SNAPSHOT.json');
const candidateFile = path.join(previousDirectory, 'BALANCE_CANDIDATE.json');
const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const previousCandidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
const ec = input.ECONOMY_CONFIG;
const speciesById = new Map(input.FISH.map(species => [species.id, species]));
const range = values => [Math.min(...values), Math.max(...values)];

// Read the sole team drop specification; derived tables here do not introduce a second authored rule.
const lootFile = path.resolve(dir, '../../LOOT_RULES.json');
const lootSpecification = JSON.parse(fs.readFileSync(lootFile, 'utf8'));
const loot = {
  denominator: lootSpecification.denominator,
  weights: Object.fromEntries(lootSpecification.entries.map(entry => [entry.id, entry.weight])),
  directSalePrices: Object.fromEntries(lootSpecification.entries.filter(entry => entry.id !== 'fish')
    .map(entry => [entry.id, entry.directSale])),
  manualUnsellable: true,
  excluded: lootSpecification.deferred,
  source: '../../LOOT_RULES.json',
  sourcePriceStatus: lootSpecification.directSalePricesStatus,
};
const itemWeights = Object.entries(loot.weights).filter(([kind]) => kind !== 'fish');
const directItemGross = itemWeights.reduce((sum, [kind, weight]) =>
  sum + weight / loot.denominator * loot.directSalePrices[kind], 0);
const fishProbability = loot.weights.fish / loot.denominator;
if (Object.values(loot.weights).reduce((a, b) => a + b, 0) !== loot.denominator) throw Error('Loot total');
if (Math.abs(directItemGross - 4.57) > 1e-12) throw Error('Direct item gross');

const shares = new Map();
for (const region of input.REGIONS) {
  const total = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [id, weight] of region.fish) shares.set(`${id}:${region.id}`, weight / total);
}
const maximumShare = new Map(input.FISH.map(species => [species.id,
  Math.max(...input.REGIONS.map(region => shares.get(`${species.id}:${region.id}`) || 0))]));

function basePrice(species, extraScale) {
  const previousDraft = Math.max(species.basePrice,
    Math.round(previousCandidate.priceRule.offset + previousCandidate.priceRule.slope * species.basePrice));
  return Math.round(previousDraft * extraScale);
}

const quoteCache = new Map();
function meanQuote(species, region, quality, extraScale) {
  const key = `${species.id}:${region.id}:${quality.id}:${extraScale}`;
  if (quoteCache.has(key)) return quoteCache.get(key);
  const [left, right] = species.wt.map(value => value * 100);
  const average = (species.wt[0] + species.wt[1]) / 2 || 1;
  const scarcity = ec.abundantMultiplier + (ec.absentMultiplier - ec.abundantMultiplier)
    * (1 - (shares.get(`${species.id}:${region.id}`) || 0) / maximumShare.get(species.id));
  let expected = 0;
  let mass = 0;
  for (let cents = Math.ceil(left - .5); cents <= Math.floor(right + .5); cents++) {
    const probability = Math.max(0, Math.min(right, cents + .5) - Math.max(left, cents - .5)) / (right - left);
    if (!probability) continue;
    const weight = cents / 100;
    const factor = Math.min(ec.weightFactorMax, Math.max(ec.weightFactorMin,
      ec.weightFactorBase + (weight || average) / average * ec.weightFactorRate));
    expected += probability * Math.max(ec.minimumFreshPrice,
      Math.round(basePrice(species, extraScale) * quality.mult * factor * scarcity));
    mass += probability;
  }
  if (Math.abs(mass - 1) > 1e-9) throw Error('Weight distribution');
  quoteCache.set(key, expected);
  return expected;
}

const activeFactors = { common: 1, rare: 1.25, epic: 3.5, legendary: 5 };
function fishState(region, bait, pity, active, extraScale) {
  const totalSpeciesWeight = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
  const probabilities = { common: 0, rare: 0, epic: 0, legendary: 0 };
  let fishMean = 0;
  for (const [id, speciesWeight] of region.fish) {
    const species = speciesById.get(id);
    const qualityWeights = input.QUALITIES.map(quality => {
      let weight = species.qw[quality.id] * previousCandidate.qualityRule.baseScale
        * (quality.id === 'rare' ? previousCandidate.qualityRule.rareFactors[region.id] : 1)
        + (bait ? input.BAIT_QUALITY_BONUS : 0) * (input.FISHING_CONFIG.qualityBonusRate[quality.id] || 0);
      if (pity && ['epic', 'legendary'].includes(quality.id)) weight *= input.FISHING_CONFIG.pityWeightMultiplier;
      if (active) weight *= activeFactors[quality.id];
      return weight;
    });
    const total = qualityWeights.reduce((a, b) => a + b, 0);
    input.QUALITIES.forEach((quality, index) => {
      const probability = speciesWeight / totalSpeciesWeight * qualityWeights[index] / total;
      probabilities[quality.id] += probability;
      fishMean += probability * meanQuote(species, region, quality, extraScale);
    });
  }
  return { fishMean, probabilities, high: probabilities.epic + probabilities.legendary };
}

function normalSteady(region, bait, extraScale) {
  const normal = fishState(region, bait, false, false, extraScale);
  const pity = fishState(region, bait, true, false, extraScale);
  const survival = 1 - normal.high;
  const normalMass = (1 - survival ** input.PITY_THRESHOLD) / normal.high;
  const tailMass = survival ** input.PITY_THRESHOLD / pity.high;
  const tail = tailMass / (normalMass + tailMass);
  const fishMean = (1 - tail) * normal.fishMean + tail * pity.fishMean;
  return {
    fishMean,
    gross: fishProbability * fishMean + directItemGross,
    probabilities: Object.fromEntries(input.QUALITIES.map(quality => [quality.id,
      (1 - tail) * normal.probabilities[quality.id] + tail * pity.probabilities[quality.id]])),
  };
}

const waitMean = 90, manualResponse = 2, biteWindow = 20;
function hourly(gross) {
  return {
    manual: 3600 / (waitMean + manualResponse) * gross,
    automatic: [.2, .3, .4].map(probability => ({
      probability,
      grossPerBite: probability * gross,
      grossPerHour: 3600 / (waitMean + biteWindow) * probability * gross,
      ratioToManual: probability * (waitMean + manualResponse) / (waitMean + biteWindow),
    })),
  };
}
const widths = { white: .2, red: .25, yellow: .3, green: .25 };
const uniformStopSuccess = widths.red * .1 + widths.yellow * .5 + widths.green;
const bundlePrice = 450, discountedBundlePrice = Math.round(bundlePrice * .9), charges = 15;
function activeEconomy(row) {
  const grossGreen = charges * row.fishMean;
  const grossUniform = charges * uniformStopSuccess * row.fishMean;
  return {
    ...row,
    allGreenBundleGross: grossGreen,
    uniformStopBundleGross: grossUniform,
    atFullPrice: { cost: bundlePrice, allGreenNet: grossGreen - bundlePrice,
      uniformStopNet: grossUniform - bundlePrice, breakEvenSuccess: bundlePrice / grossGreen },
    withFerryToken: { cost: discountedBundlePrice, savedExpense: bundlePrice - discountedBundlePrice,
      allGreenNet: grossGreen - discountedBundlePrice,
      uniformStopNet: grossUniform - discountedBundlePrice,
      breakEvenSuccess: discountedBundlePrice / grossGreen },
    ferryTokenOpportunityCostComparedWithDirectSale: 25,
    effectiveExpenseSavingOverSellingToken: bundlePrice - discountedBundlePrice - 25,
  };
}

function scenario(id, extraScale, status) {
  const normalRows = input.REGIONS.flatMap(region => [false, true].map(bait => ({
    regionId: region.id, bait, ...normalSteady(region, bait, extraScale),
  })));
  const activeRows = input.REGIONS.map(region => activeEconomy({ regionId: region.id,
    ...fishState(region, false, false, true, extraScale) }));
  const higherQuality = activeRows.every(active => {
    const ordinary = normalRows.find(normal => normal.regionId === active.regionId && normal.bait);
    return ['rare', 'epic', 'legendary'].every(quality => active.probabilities[quality] > ordinary.probabilities[quality]);
  });
  if (!higherQuality) throw Error('Active high-quality advantage');
  const normalGrossRange = range(normalRows.map(row => row.gross));
  return {
    id, status, extraPriceScale: extraScale, implemented: false,
    normalRows, activeRows,
    summary: {
      normalSuccessfulCatchGrossRange: normalGrossRange,
      normalNoBaitGrossRange: range(normalRows.filter(row => !row.bait).map(row => row.gross)),
      allNormalWithinSuggested45to55Tolerance: normalRows.every(row => row.gross >= 45 && row.gross <= 55),
      meetsAverageAbout50Target: normalRows.every(row => row.gross >= 45 && row.gross <= 55),
      hourlyAtNormalRangeEndpoints: normalGrossRange.map(gross => ({ grossPerSuccess: gross, ...hourly(gross) })),
      activeSuccessfulFishGrossRange: range(activeRows.map(row => row.fishMean)),
      activeAllGreenBundleGross: range(activeRows.map(row => row.allGreenBundleGross)),
      activeUniformStopBundleGross: range(activeRows.map(row => row.uniformStopBundleGross)),
      activeFullPrice: {
        allGreenNet: range(activeRows.map(row => row.atFullPrice.allGreenNet)),
        uniformStopNet: range(activeRows.map(row => row.atFullPrice.uniformStopNet)),
        breakEvenSuccess: range(activeRows.map(row => row.atFullPrice.breakEvenSuccess)),
      },
      activeWithFerryToken: {
        allGreenNet: range(activeRows.map(row => row.withFerryToken.allGreenNet)),
        uniformStopNet: range(activeRows.map(row => row.withFerryToken.uniformStopNet)),
        breakEvenSuccess: range(activeRows.map(row => row.withFerryToken.breakEvenSuccess)),
      },
      allActiveHigherThanOrdinaryWithBait: higherQuality,
      activeQualityProbabilityRanges: Object.fromEntries(input.QUALITIES.map(quality => [quality.id,
        range(activeRows.map(row => row.probabilities[quality.id]))])),
    },
  };
}
const unchangedPriorDraftPrices = scenario('new-loot-with-unchanged-prior-draft-prices', 1,
  'UNBALANCED_TO_50_TARGET; prior draft prices themselves remain unapproved');
const optionalPriceScale120 = scenario('optional-extra-price-scale-1.2', 1.2,
  'ADDITIONAL_PRICE_CHANGE_AWAITING_USER_APPROVAL; not automatically adopted');
const result = {
  date: '2026-10-27', revision: 'v2-latest-loot-and-active-token',
  status: 'PLANNING_ONLY_AWAITING_IMPLEMENTATION_APPROVAL', implemented: false,
  scope: 'All requirements here are Edition One. Edition Two undefined.',
  inputs: [inputFile, candidateFile, lootFile].map(file => ({
    path: path.relative(dir, file).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  })),
  editionOneLoot: { ...loot, itemDirectPrices: loot.directSalePrices, fishProbability, nonFishDirectSalePerSuccess: directItemGross },
  confirmedLatestRequirements: {
    loot, fishProbability, itemProbability: 1 - fishProbability, directItemGross,
    ferryToken: { action: 'Next purchase of15 active-rod gauge chances gets10% discount',
      sameTypeDoesNotStack: true, activeDiscountSlotMaximum: 1,
      rejectSecondActivationWithoutConsumingItem: true },
    compass: { action: 'Next valid paid flight gets10% discount', sameTypeDoesNotStack: true },
    activeChanceCount: '15 gauge activations, empty swings do not consume',
    ordinarySuccessfulCatchGrossTarget: 'About50 fresh local immediate-sale coins including direct item sales',
  },
  engineeringSuggestionsNotApproved: {
    priorPriceFormula: 'max(originalBasePrice, round(20 +0.55*originalBasePrice))',
    optionalExtraPriceFormula: 'round(priorDraftBasePrice*1.2)',
    qualityRule: previousCandidate.qualityRule,
    ordinary: { waitMean, waitRangeSeconds: [55, 125], manualResponse, biteWindow,
      defaultAutoSuccess: .3, noRodUpgradeBonuses: true, noIdleAcceleration: true },
    focus: { planMinutes: 25, dailyEffectiveMinutes: 100, baitPacksPerCompletedPlan: 1, fishUsesPerPack: 5 },
    active: { fishOnly: true, normalPityUnaffected: true, noOrdinaryBaitConsumption: true,
      activeFactors, widths, uniformStopSuccess, bundlePrice, discountedBundlePrice, charges,
      meanSwings: 2.5, swingAnimationSeconds: 3, gaugeTimeoutSeconds: 6,
      fixedTimeoutBundleSeconds: charges * (2.5 * 3 + 6) },
    payoutTolerance: '45-55 is suggested engineering tolerance, not an extra user limit',
  },
  hourlyIfTarget50Reached: hourly(50),
  scenarios: { unchangedPriorDraftPrices, optionalPriceScale120 },
  limitations: [
    'Latest loot rates and token use have user confirmation; implementing them is not authorized by this planning calculation.',
    'Scenario1 keeps prior unapproved proposal prices, not currently shipped raw game prices.',
    'Scenario2 extra20% fish-price increase is an additional unapproved change; old fresh stock is also repriced if adopted.',
    'Only12 existing regions modelled; adding5 regions requires recomputing the entire market-supply matrix and quotations.',
    'Active fish-only/high-quality mechanics and450/15 price are pending engineering suggestions, not separately approved.',
    'Coins are fresh local immediate-sale gross: no automatic sale, rewards cashout, repairs, sales-buff or cross-region arbitrage.',
    'Coupon45 is expense saved, not direct catch income. It replaces selling token for25, so marginal cash advantage is20 when actually used.',
    'All-green is a skill upper case; uniform stop42.5% is a mathematical control, not observed player skill.',
    '202.5s assumes all15 gauges run the full6 seconds; earlier skill stops can be faster and repeat purchases can earn substantially more per hour.',
    'Unused second token remains inventory; no81% multiplier, no cached indefinite discount for multiple bundles.',
    'Continuous-uniform weight rounding model neglects tiny32-bit RNG quantization; far decimals are not promises.',
  ],
};
if (!result.hourlyIfTarget50Reached.automatic.every(row => row.ratioToManual < .4)) throw Error('Auto ratio');
if (Math.abs(Object.values(widths).reduce((sum, width) => sum + width, 0) - 1) > 1e-12) throw Error('Gauge widths');
fs.writeFileSync(path.join(dir, 'ECONOMY_CHECK.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  arithmeticChecks: 'PASSED_PROPOSAL_ARITHMETIC_ONLY', fishProbability, directItemGross,
  unchangedPriorDraftPrices: unchangedPriorDraftPrices.summary,
  optionalPriceScale120: optionalPriceScale120.summary,
}));
