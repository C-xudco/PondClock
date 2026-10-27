// Documentation-only reproducible expectation model; never writes product or user saves.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { FISH, REGIONS, QUALITIES, RODS, BAIT_COST, BAIT_CATCHES, BAIT_QUALITY_BONUS, JUDGE, PITY_THRESHOLD } from "../../../../src/lib/gameConfig.js";
import { FISHING_CONFIG } from "../../../../src/config/fishing.js";
import { ECONOMY_CONFIG } from "../../../../src/config/economy.js";
import { quoteFish } from "../../../../src/domain/market.js";
const directory = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(directory, "INPUT_SNAPSHOT.json");
const sourceFiles = ["src/lib/gameConfig.js", "src/config/fishing.js", "src/config/economy.js", "src/domain/market.js", "src/domain/loot.js"];
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, JSON.stringify({ capturedOn: "2026-10-26", status: "PROPOSAL_INPUT_ONLY", FISH, REGIONS, QUALITIES, RODS, BAIT_COST, BAIT_CATCHES, BAIT_QUALITY_BONUS, JUDGE, PITY_THRESHOLD, FISHING_CONFIG, ECONOMY_CONFIG, sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha(fs.readFileSync(file))])) }, null, 2) + "\n");
const input = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const fish = input.FISH, regions = input.REGIONS, qualities = input.QUALITIES, rods = input.RODS, ec = input.ECONOMY_CONFIG;
const speciesMap = new Map(fish.map((s) => [s.id, s]));
const rareFactors = { jiangnan: 4.04, huaihe: 6, huanghe: 2.77, changjiang: 2.05, dongnan: 4.78, lingnan: 2.81, xinan: 3.63, yungui: 1.11, hainan: 3.56, dongbei: 3.01, xibei: 1, qingzang: 3.92 };
const candidate = { status: "DRAFT_AWAITING_USER_APPROVAL", implemented: false, target: "About50 earned coins per successful catch; fresh local immediate-sale gross, not a per-fish floor/cap", engineeringTolerance: [45, 55], priceRule: { formula: "max(oldBasePrice, round(20 + 0.55 * oldBasePrice))", offset: 20, slope: 0.55 }, qualityRule: { baseScale: 4, rareFactors, formula: "originalSpeciesWeight * baseScale * (quality=rare ? regionalRareFactor : 1), then add existing equipment bonus and apply existing pity multiplier" }, preserved: { fishPools: true, marketSupplyAndMultipliers: true, qualityPriceMultipliers: true, weightRanges: true, pityThreshold: input.PITY_THRESHOLD, pityMultiplier: input.FISHING_CONFIG.pityWeightMultiplier, baitCost: input.BAIT_COST, baitCatches: input.BAIT_CATCHES }, fishProbability: 0.972, nonFishDirectSalePerRound: 0.283, newItemDirectSalePerRound: 0.168 };
const oldPrices = Object.fromEntries(fish.map((s) => [s.id, s.basePrice]));
const newPrices = Object.fromEntries(fish.map((s) => [s.id, Math.max(s.basePrice, Math.round(20 + 0.55 * s.basePrice))]));
const weightGrids = new Map(fish.map((s) => {
  const [a, b] = s.wt.map((x) => 100 * x), out = [];
  for (let j = Math.ceil(a - 0.5); j <= Math.floor(b + 0.5); j++) {
    const p = Math.max(0, Math.min(b, j + 0.5) - Math.max(a, j - 0.5)) / (b - a);
    if (p > 0) out.push([j / 100, p]);
  }
  if (Math.abs(out.reduce((sum, [, p]) => sum + p, 0) - 1) > 1e-10) throw new Error("Weight mass mismatch");
  return [s.id, out];
}));
const shares = /* @__PURE__ */ new Map();
for (const region of regions) {
  const total = region.fish.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of region.fish) shares.set(`${id}:${region.id}`, w / total);
}
const maxima = new Map(fish.map((s) => [s.id, Math.max(...regions.map((r) => shares.get(`${s.id}:${r.id}`) || 0))]));
function multiplier(id, regionId) {
  const share = shares.get(`${id}:${regionId}`) || 0;
  return ec.abundantMultiplier + (ec.absentMultiplier - ec.abundantMultiplier) * (1 - share / maxima.get(id));
}
function price(id, regionId, qualityId, weight, prices) {
  const s = speciesMap.get(id), q = qualities.find((q2) => q2.id === qualityId), average = (s.wt[0] + s.wt[1]) / 2 || 1;
  const factor = Math.min(ec.weightFactorMax, Math.max(ec.weightFactorMin, ec.weightFactorBase + (weight || average) / average * ec.weightFactorRate));
  return Math.max(ec.minimumFreshPrice, Math.round(prices[id] * q.mult * factor * multiplier(id, regionId)));
}
function priceValues(prices) {
  return Object.fromEntries(regions.map((r) => [r.id, Object.fromEntries(fish.map((s) => [s.id, qualities.map((q) => weightGrids.get(s.id).reduce((sum, [w, p]) => sum + p * price(s.id, r.id, q.id, w, prices), 0))]))]));
}
const oldValues = priceValues(oldPrices), newValues = priceValues(newPrices);
function state(region, bonus, pity, proposed = false) {
  const values = proposed ? newValues : oldValues, total = region.fish.reduce((a, [, w]) => a + w, 0), probabilities = [0, 0, 0, 0];
  let expectedFish = 0;
  for (const [id, w] of region.fish) {
    const s = speciesMap.get(id);
    const weights = qualities.map((q) => s.qw[q.id] * (proposed ? 4 : 1) * (proposed && q.id === "rare" ? rareFactors[region.id] : 1) + bonus * (input.FISHING_CONFIG.qualityBonusRate[q.id] || 0));
    if (pity) {
      weights[2] *= input.FISHING_CONFIG.pityWeightMultiplier;
      weights[3] *= input.FISHING_CONFIG.pityWeightMultiplier;
    }
    const qt = weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 4; k++) {
      const p = w / total * weights[k] / qt;
      probabilities[k] += p;
      expectedFish += p * values[region.id][id][k];
    }
  }
  return { conditionalFishMean: expectedFish, highProbability: probabilities[2] + probabilities[3], qualityProbabilities: Object.fromEntries(qualities.map((q, k) => [q.id, probabilities[k]])), gross: (proposed ? 0.972 : 0.982) * expectedFish + (proposed ? 0.283 : 0.115) };
}
function stationary(region, bonus, proposed = false) {
  const normal = state(region, bonus, false, proposed), pity = state(region, bonus, true, proposed), survival = 1 - normal.highProbability;
  const normalMass = (1 - survival ** input.PITY_THRESHOLD) / normal.highProbability, tailMass = survival ** input.PITY_THRESHOLD / pity.highProbability, tailFraction = tailMass / (normalMass + tailMass);
  const conditionalFishMean = (1 - tailFraction) * normal.conditionalFishMean + tailFraction * pity.conditionalFishMean;
  return { conditionalFishMean, gross: (proposed ? 0.972 : 0.982) * conditionalFishMean + (proposed ? 0.283 : 0.115), pityActiveFraction: tailFraction, qualityProbabilities: Object.fromEntries(qualities.map((q) => [q.id, (1 - tailFraction) * normal.qualityProbabilities[q.id] + tailFraction * pity.qualityProbabilities[q.id]])) };
}
const conditions = [], steady = [];
for (const region of regions) for (let rodLevel = 0; rodLevel < rods.length; rodLevel++) for (const bait of [false, true]) for (const bestClick of [false, true]) {
  const bonus = rods[rodLevel].qualityBonus + (bait ? input.BAIT_QUALITY_BONUS : 0) + (bestClick ? input.JUDGE.qualityBonusBest : 0);
  const context = { regionId: region.id, regionName: region.name, rodLevel, rodName: rods[rodLevel].name, bait, bestClick, bonus };
  for (const pity of [false, true]) conditions.push({ ...context, pity, before: state(region, bonus, pity), after: state(region, bonus, pity, true) });
  const before = stationary(region, bonus), after = stationary(region, bonus, true);
  steady.push({ ...context, before, after, afterNetIfAllBaitPurchased: after.gross - (bait ? 0.972 * input.BAIT_COST / input.BAIT_CATCHES : 0) });
}
const summaries = regions.map((region) => {
  const rows = steady.filter((row) => row.regionId === region.id), states = conditions.filter((row) => row.regionId === region.id);
  return { regionId: region.id, name: region.name, rareFactor: rareFactors[region.id], beforeSteadyMin: Math.min(...rows.map((row) => row.before.gross)), beforeSteadyMax: Math.max(...rows.map((row) => row.before.gross)), afterSteadyMin: Math.min(...rows.map((row) => row.after.gross)), afterSteadyMax: Math.max(...rows.map((row) => row.after.gross)), afterAllStateMin: Math.min(...states.map((row) => row.after.gross)), afterAllStateMax: Math.max(...states.map((row) => row.after.gross)), baselineAfter: rows.find((row) => row.rodLevel === 0 && !row.bait && !row.bestClick).after.gross, topBaitAfter: rows.find((row) => row.rodLevel === 3 && row.bait && !row.bestClick).after.gross };
});
const matrix = [];
for (const s of fish) for (const r of regions) for (let k = 0; k < qualities.length; k++) {
  const mid = Math.round((s.wt[0] + s.wt[1]) / 2 * 100) / 100;
  matrix.push({ speciesId: s.id, name: s.name, regionId: r.id, quality: qualities[k].id, oldBasePrice: oldPrices[s.id], newBasePrice: newPrices[s.id], oldMidweightQuote: price(s.id, r.id, qualities[k].id, mid, oldPrices), newMidweightQuote: price(s.id, r.id, qualities[k].id, mid, newPrices), oldMean: oldValues[r.id][s.id][k], newMean: newValues[r.id][s.id][k] });
}
const sourceStillMatches = Object.entries(input.sourceHashes).every(([file, hash]) => sha(fs.readFileSync(file)) === hash);
let checkedQuotes = 0;
if (sourceStillMatches) {
  for (const row of matrix) {
    const s = speciesMap.get(row.speciesId), mid = Math.round((s.wt[0] + s.wt[1]) / 2 * 100) / 100;
    const real = quoteFish({ speciesId: s.id, quality: row.quality, weight: mid, caughtAtMs: 1 }, row.regionId, 1).price;
    if (real !== row.oldMidweightQuote) throw new Error("Primary-source pricing mismatch");
    checkedQuotes++;
  }
}
const normalStates = conditions.filter((row) => !row.pity);
const result = { proposalDate: "2026-10-26", status: "DRAFT_AWAITING_USER_APPROVAL", implemented: false, candidate, sourceStillMatches, primaryMidweightQuoteChecks: checkedQuotes, coverage: { stateRows: conditions.length, stationaryRows: steady.length, priceCells: matrix.length, regions: regions.length, rods: rods.length, baitStates: 2, bestStates: 2, pityStates: 2 }, summary: { beforeStateRange: [Math.min(...conditions.map((r) => r.before.gross)), Math.max(...conditions.map((r) => r.before.gross))], afterStateRange: [Math.min(...conditions.map((r) => r.after.gross)), Math.max(...conditions.map((r) => r.after.gross))], beforeStationaryRange: [Math.min(...steady.map((r) => r.before.gross)), Math.max(...steady.map((r) => r.before.gross))], afterStationaryRange: [Math.min(...steady.map((r) => r.after.gross)), Math.max(...steady.map((r) => r.after.gross))], allSteadyWithinEngineeringTolerance: steady.every((r) => r.after.gross >= 45 && r.after.gross <= 55), normalLegendaryMax: Math.max(...normalStates.map((r) => r.after.qualityProbabilities.legendary)), normalEpicMax: Math.max(...normalStates.map((r) => r.after.qualityProbabilities.epic)), basePricesChanged: fish.filter((s) => newPrices[s.id] !== s.basePrice).length, oldStockAffected: true, oldStockImpact: { maxMidweightIncrease: matrix.reduce((best, row) => row.newMidweightQuote - row.oldMidweightQuote > best.delta ? { speciesId: row.speciesId, regionId: row.regionId, quality: row.quality, before: row.oldMidweightQuote, after: row.newMidweightQuote, delta: row.newMidweightQuote - row.oldMidweightQuote } : best, { delta: -1 }), maxMeanIncrease: Math.max(...matrix.map((row) => row.newMean - row.oldMean)), maxMeanRatio: Math.max(...matrix.map((row) => row.newMean / row.oldMean)), meanCellsChanged: matrix.filter((row) => Math.abs(row.newMean - row.oldMean) > 1e-10).length }, allFreshQuotesNondecreasing: matrix.every((row) => row.newMidweightQuote >= row.oldMidweightQuote) }, regions: summaries, conditions, steady, method: { weights: "Uniform weight draw rounded to2dp, enumerated cent-bin probability masses including endpoint half-bins; no Monte Carlo.", pity: "Regenerative stationary distribution: normalMass=sum(k=0..29)(1-h0)^k, tailMass=(1-h0)^30/h1. Non-fish is a state-independent self-loop.", price: "Actual market formula and supply table frozen in INPUT_SNAPSHOT; all2400 representative original quote cells cross-checked against quoteFish while source hashes match.", precision: "Floating-point continuous-uniform expectation with exact game rounding bins. Neglects tiny32-bit RNG quantization; decimals beyond0.001 coin are not a promise.", baselineLoot: { fish: 0.982, nonFishDirectSale: 0.115 }, proposedLoot: { fish: 0.972, nonFishDirectSale: 0.283 }, notIncluded: ["Missed bites or failed catches", "Fish aged168h (still1)", "Manual bonus", "Cross-region sale premiums", "Watch repair wager or jackpots", "Coupon savings", "Bait/upgrades/tickets cost in gross"], netScenario: "Paid-bait comparison assumes all bait bought at120/5fish and all item drops sold; excludes initial free bait and bait-box usage. Marginal bait profitability is not guaranteed." } };
const csv = (rows, columns) => "\uFEFF" + [columns.join(","), ...rows.map((row) => columns.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(directory, "BALANCE_CANDIDATE.json"), JSON.stringify(candidate, null, 2) + "\n");
fs.writeFileSync(path.join(directory, "BALANCE_CHECK.json"), JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(path.join(directory, "REGION_SUMMARY.csv"), csv(summaries, Object.keys(summaries[0])));
fs.writeFileSync(path.join(directory, "PRICE_CELLS.csv"), csv(matrix, Object.keys(matrix[0])));
fs.writeFileSync(path.join(directory, "BASE_PRICES.csv"), csv(fish.map((s) => ({ speciesId: s.id, name: s.name, before: s.basePrice, after: newPrices[s.id], delta: newPrices[s.id] - s.basePrice })), ["speciesId", "name", "before", "after", "delta"]));
fs.writeFileSync(path.join(directory, "STATE_GRID.csv"), csv(conditions.map((r) => ({ ...r, beforeGross: r.before.gross, afterGross: r.after.gross, beforeFishMean: r.before.conditionalFishMean, afterFishMean: r.after.conditionalFishMean, afterCommon: r.after.qualityProbabilities.common, afterRare: r.after.qualityProbabilities.rare, afterEpic: r.after.qualityProbabilities.epic, afterLegendary: r.after.qualityProbabilities.legendary })), ["regionId", "rodLevel", "bait", "bestClick", "bonus", "pity", "beforeGross", "afterGross", "beforeFishMean", "afterFishMean", "afterCommon", "afterRare", "afterEpic", "afterLegendary"]));
fs.writeFileSync(path.join(directory, "STATIONARY_GRID.csv"), csv(steady.map((r) => ({ ...r, beforeGross: r.before.gross, afterGross: r.after.gross, afterPityFraction: r.after.pityActiveFraction })), ["regionId", "rodLevel", "bait", "bestClick", "bonus", "beforeGross", "afterGross", "afterNetIfAllBaitPurchased", "afterPityFraction"]));
console.log(JSON.stringify({ passedArithmetic: true, ...result.coverage, ...result.summary, regions: summaries }));
export {
  candidate,
  input,
  price,
  priceValues,
  result,
  state,
  stationary
};
