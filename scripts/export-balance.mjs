import fs from 'node:fs/promises';
import { FISH, REGIONS, QUALITIES } from '../src/lib/gameConfig.js';
import { ROUTES } from '../src/domain/routes.js';
import { MARKET_QUOTES, quoteFish } from '../src/domain/market.js';

const output = new URL('../docs/generated/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const csv = (rows) => '\ufeff' + rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
await fs.writeFile(new URL('routes.csv', output), csv([
  ['fromId', 'toId', 'distanceKm', 'durationMs', 'price'],
  ...ROUTES.map((r) => [r.fromId, r.toId, r.distanceKm.toFixed(3), r.durationMs, r.price]),
]));
const now = 1700000000000;
const sample = (species, quality) => ({ speciesId: species.id, quality, weight: (species.wt[0] + species.wt[1]) / 2, caughtAtMs: now });
await fs.writeFile(new URL('markets.csv', output), csv([
  ['fishId', 'regionId', 'supplyShare', 'multiplier', ...QUALITIES.map((q) => q.id)],
  ...MARKET_QUOTES.map((m) => { const species = FISH.find((f) => f.id === m.speciesId); return [m.speciesId, m.regionId, m.supplyShare.toFixed(4), m.multiplier.toFixed(4), ...QUALITIES.map((q) => quoteFish(sample(species, q.id), m.regionId, now).price)]; }),
]));
const expectation = (origin, sale) => {
  const total = origin.fish.reduce((sum, [, w]) => sum + w, 0);
  return origin.fish.reduce((sum, [id, weight]) => {
    const species = FISH.find((f) => f.id === id);
    const qualityTotal = Object.values(species.qw).reduce((a, b) => a + b, 0);
    return sum + weight / total * QUALITIES.reduce((acc, q) => acc + species.qw[q.id] / qualityTotal * quoteFish(sample(species, q.id), sale, now).price, 0);
  }, 0);
};
await fs.writeFile(new URL('trade-estimates.csv', output), csv([
  ['origin', 'saleRegion', 'homeExpectedPerFish', 'awayExpectedPerFish', 'fare', 'netGainFor20Fish', 'breakEvenFishCount'],
  ...ROUTES.map((r) => { const origin = REGIONS.find((g) => g.id === r.fromId); const home = expectation(origin, r.fromId), away = expectation(origin, r.toId), gain = away - home; return [r.fromId, r.toId, home.toFixed(2), away.toFixed(2), r.price, (20 * gain - r.price).toFixed(2), gain > 0 ? Math.ceil(r.price / gain) : 'no premium']; }),
]));
const matrix = (select) => '| 出发\\到达 | ' + REGIONS.map((r) => r.id).join(' | ') + ' |\n|' + Array(REGIONS.length + 1).fill('---').join('|') + '|\n' + REGIONS.map((from) => `| ${from.id} | ` + REGIONS.map((to) => { const route = ROUTES.find((r) => r.fromId === from.id && r.toId === to.id); return route ? select(route) : '—'; }).join(' | ') + ' |').join('\n');
await fs.writeFile(new URL('BALANCE.md', output), `# 自动导出的首版数值\n\n数据来源为实际配置，不另维护手填矩阵。12水域、${ROUTES.length}有向航段、${MARKET_QUOTES.length}市场格。\n\n## 机票（金币）\n\n${matrix((r) => r.price)}\n\n## 航程（秒，显示向上取整）\n\n${matrix((r) => Math.ceil(r.durationMs / 1000))}\n\nmarkets.csv含各品质中位体重个体报价；trade-estimates.csv只估算原始品质权重、中位体重、无鱼饵/鱼竿/保底的20条鱼单程增值减票价。不是完整挂机收益模拟，不包含捕获等待和回程成本；真实游戏个体重量/品质会变化。过期鱼统一1，所有市场溢价失效。\n`);
console.log(`Exported ${ROUTES.length} routes, ${MARKET_QUOTES.length} market cells and trade estimates.`);
