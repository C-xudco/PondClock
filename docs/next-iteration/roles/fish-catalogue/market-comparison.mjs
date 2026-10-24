// Uses the real old/new quoteFish implementations; does not maintain a second price formula.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as currentConfig from '../../../../src/lib/gameConfig.js';
import * as currentMarket from '../../../../src/domain/market.js';
import { FISH_SOURCES } from '../../../../src/data/fishSources.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const baselineRevision = 'a270e84';
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const baselineText = (file) => execFileSync('git', ['show', `${baselineRevision}:${file}`], { cwd: root, encoding: 'utf8' });
export async function loadApprovedBaseline() {
  const configUrl = dataUrl(baselineText('src/lib/gameConfig.js'));
  const economyUrl = dataUrl(baselineText('src/config/economy.js'));
  const marketSource = baselineText('src/domain/market.js')
    .replace('"../lib/gameConfig.js"', JSON.stringify(configUrl))
    .replace('"../config/economy.js"', JSON.stringify(economyUrl));
  const [config, market] = await Promise.all([import(configUrl), import(dataUrl(marketSource))]);
  return { config, market, revision: baselineRevision };
}

const nowMs = Date.UTC(2026, 9, 25, 0);
const sample = (species, quality) => ({
  speciesId: species.id, quality, weight: (species.wt[0] + species.wt[1]) / 2, caughtAtMs: nowMs,
});
function matrix({ config, market }) {
  return market.MARKET_QUOTES.map((quote) => {
    const species = config.FISH.find((fish) => fish.id === quote.speciesId);
    return { fishId: species.id, name: species.name, regionId: quote.regionId,
      supplyShare: quote.supplyShare, multiplier: quote.multiplier,
      ...Object.fromEntries(config.QUALITIES.map((quality) => [quality.id,
        market.quoteFish(sample(species, quality.id), quote.regionId, nowMs).price])),
    };
  });
}
function yieldPerFish(config, market, origin, filter = () => true) {
  const total = origin.fish.reduce((sum, [, weight]) => sum + weight, 0);
  return origin.fish.reduce((sum, [id, weight]) => {
    if (!filter(id)) return sum;
    const species = config.FISH.find((fish) => fish.id === id);
    const qualityTotal = Object.values(species.qw).reduce((a, b) => a + b, 0);
    return sum + weight / total * config.QUALITIES.reduce((value, quality) => value
      + species.qw[quality.id] / qualityTotal * market.quoteFish(sample(species, quality.id), origin.id, nowMs).price, 0);
  }, 0);
}

export function buildMarketComparison(baseline, current = { config: currentConfig, market: currentMarket }) {
  const before = matrix(baseline), after = matrix(current);
  const oldIds = new Set(baseline.config.FISH.map((fish) => fish.id));
  const oldPriceDeltas = before.flatMap((old) => {
    const updated = after.find((row) => row.fishId === old.fishId && row.regionId === old.regionId);
    const oldFish = baseline.config.FISH.find((fish) => fish.id === old.fishId);
    const newFish = current.config.FISH.find((fish) => fish.id === old.fishId);
    return baseline.config.QUALITIES.map((quality) => ({
      fishId: old.fishId, name: old.name, regionId: old.regionId, quality: quality.id,
      basePriceBefore: oldFish.basePrice, basePriceAfter: newFish.basePrice,
      supplyBefore: old.supplyShare, supplyAfter: updated.supplyShare,
      multiplierBefore: old.multiplier, multiplierAfter: updated.multiplier,
      priceBefore: old[quality.id], priceAfter: updated[quality.id],
      priceDelta: updated[quality.id] - old[quality.id],
    }));
  });
  const regionYields = current.config.REGIONS.map((region) => {
    const original = baseline.config.REGIONS.find((old) => old.id === region.id);
    const beforeYield = yieldPerFish(baseline.config, baseline.market, original);
    const afterYield = yieldPerFish(current.config, current.market, region);
    const total = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
    const addedWeight = region.fish.filter(([id]) => !oldIds.has(id)).reduce((sum, [, weight]) => sum + weight, 0);
    return { regionId: region.id, fishCountBefore: original.fish.length, fishCountAfter: region.fish.length,
      totalWeightBefore: original.fish.reduce((sum, [, weight]) => sum + weight, 0), totalWeightAfter: total,
      newFishShare: addedWeight / total, localExpectedBefore: beforeYield, localExpectedAfter: afterYield,
      expectedDelta: afterYield - beforeYield, expectedPercent: (afterYield / beforeYield - 1) * 100,
      newFishExpectedContribution: yieldPerFish(current.config, current.market, region, (id) => !oldIds.has(id)),
    };
  });
  const newParameters = current.config.FISH.filter((fish) => !oldIds.has(fish.id)).map((fish) => ({
    fishId: fish.id, name: fish.name, scientificName: FISH_SOURCES[fish.id].scientificName,
    basePrice: fish.basePrice, lengthMinCm: fish.len[0], lengthMaxCm: fish.len[1],
    weightMinKg: fish.wt[0], weightMaxKg: fish.wt[1], qualityWeights: JSON.stringify(fish.qw),
    producingWeights: current.config.REGIONS.flatMap((region) => region.fish
      .filter(([id]) => id === fish.id).map(([, weight]) => `${region.id}:${weight}`)).join('|'),
    sourceFids: FISH_SOURCES[fish.id].sourceFids.join('|'), evidenceTier: FISH_SOURCES[fish.id].evidenceTier,
    rationale: FISH_SOURCES[fish.id].balanceReason,
  }));
  const changed = oldPriceDeltas.filter((row) => row.priceDelta !== 0);
  return { before, after, oldPriceDeltas, regionYields, newParameters,
    summary: { date: '2026-10-25', baselineRevision: baseline.revision,
      fishCountBefore: baseline.config.FISH.length, fishCountAfter: current.config.FISH.length,
      marketCellsBefore: before.length, marketCellsAfter: after.length,
      oldPriceQualityCells: oldPriceDeltas.length, changedOldPriceQualityCells: changed.length,
      affectedOldFishIds: [...new Set(changed.map((row) => row.fishId))],
      oldBasePriceChanges: oldPriceDeltas.filter((row) => row.basePriceBefore !== row.basePriceAfter).length,
      largestOldPriceIncrease: Math.max(0, ...changed.map((row) => row.priceDelta)),
      largestOldPriceDecrease: Math.min(0, ...changed.map((row) => row.priceDelta)),
      assumptions: ['实际旧/新quoteFish，中等体重，原品质权重，无鱼竿/鱼饵/保底/秘籍加成',
        '收益是条件于钓获一条鱼的期望，不含趣味物品掉落、等待时间、机票及往返成本',
        '区间是游戏生成范围，权重是游戏配置，不是野外种群丰度或最大体型',
        '旧鱼原ID、basePrice、len/wt、品质权重保留；供应占比变化仍可能改变地区报价'],
    },
  };
}

const csv = (rows) => {
  const columns = Object.keys(rows[0]);
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return '\ufeff' + [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildMarketComparison(await loadApprovedBaseline());
  const output = new URL('./implementation/', import.meta.url);
  await fs.mkdir(output, { recursive: true });
  for (const [name, rows] of [
    ['market-before.csv', result.before], ['market-after.csv', result.after],
    ['old-fish-price-deltas.csv', result.oldPriceDeltas], ['region-yield-comparison.csv', result.regionYields],
    ['new-fish-parameters.csv', result.newParameters],
  ]) await fs.writeFile(new URL(name, output), csv(rows));
  await fs.writeFile(new URL('market-diff-report.json', output), JSON.stringify(result.summary, null, 2) + '\n');
  console.log(JSON.stringify({ ...result.summary, regionYields: result.regionYields }, null, 2));
}
