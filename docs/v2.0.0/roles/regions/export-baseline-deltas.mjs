// Reproduce changed quotes against the preserved pre-V2 source, not a second old formula.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FISH, QUALITIES } from '../../../../src/lib/gameConfig.js';
import { quoteFish } from '../../../../src/domain/market.js';
import { ROUTES } from '../../../../src/domain/routes.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../..');
const baseline = '874cdac';
const oldSource = file => execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' });
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const configUrl = url(oldSource('src/lib/gameConfig.js'));
const economyUrl = url(oldSource('src/config/economy.js'));
const lootUrl = url(oldSource('src/config/lootConfig.js'));
const locationsUrl = url(oldSource('src/data/regionLocations.js'));
const travelUrl = url(oldSource('src/config/travel.js'));
const marketUrl = url(oldSource('src/domain/market.js').replaceAll('"../lib/gameConfig.js"', JSON.stringify(configUrl))
  .replaceAll('"../config/economy.js"', JSON.stringify(economyUrl)).replaceAll('"../config/lootConfig.js"', JSON.stringify(lootUrl)));
const routesUrl = url(oldSource('src/domain/routes.js').replaceAll('"../lib/gameConfig.js"', JSON.stringify(configUrl))
  .replaceAll('"../data/regionLocations.js"', JSON.stringify(locationsUrl)).replaceAll('"../config/travel.js"', JSON.stringify(travelUrl)));
const old = await import(configUrl), oldMarket = await import(marketUrl), oldRoutes = await import(routesUrl);
const fresh = old.FISH.flatMap(fish => old.REGIONS.flatMap(region => QUALITIES.map(quality => {
  const sample = { speciesId: fish.id, quality: quality.id, weight: Math.round((fish.wt[0] + fish.wt[1]) / 2 * 100) / 100, caughtAtMs: 1 };
  const before = oldMarket.quoteFish(sample, region.id, 1).price;
  const after = quoteFish(sample, region.id, 1).price;
  const expiredBefore = oldMarket.quoteFish(sample, region.id, 168 * 3600000 + 1).price;
  const expiredAfter = quoteFish(sample, region.id, 168 * 3600000 + 1).price;
  if (expiredBefore !== 1 || expiredAfter !== 1) throw Error('Old freshness override changed');
  return { speciesId: fish.id, name: fish.name, regionId: region.id, quality: quality.id, before, after, delta: after - before, expiredBefore, expiredAfter };
})));
const routeMap = new Map(ROUTES.map(route => [route.id, route]));
const routes = oldRoutes.ROUTES.map(route => ({ id: route.id, beforePrice: route.price, afterPrice: routeMap.get(route.id).price,
  beforeDurationMs: route.durationMs, afterDurationMs: routeMap.get(route.id).durationMs }));
const csv = rows => '\uFEFF' + [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).map(value => JSON.stringify(value)).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(directory, 'OLD_FRESH_QUOTE_DELTAS.csv'), csv(fresh));
fs.writeFileSync(path.join(directory, 'OLD_ROUTE_DELTAS.csv'), csv(routes));
const result = { date: '2026-10-27', baseline, status: 'SOURCE_COMPARISON_ONLY_NOT_SAVE_MIGRATION_TEST',
  oldSpecies: old.FISH.length, currentSpecies: FISH.length, oldRegions: old.REGIONS.length,
  oldFreshCells: fresh.length, freshChanged: fresh.filter(row => row.delta !== 0).length,
  freshDecreased: fresh.filter(row => row.delta < 0).length, largestMidweightIncrease: Math.max(...fresh.map(row => row.delta)),
  maxMidweightRatio: Math.max(...fresh.map(row => row.after / row.before)), expiredAllStillOne: true,
  oldRoutes: routes.length, repricedRoutes: routes.filter(row => row.beforePrice !== row.afterPrice).length,
  retimedRoutes: routes.filter(row => row.beforeDurationMs !== row.afterDurationMs).length,
  policy: 'Fresh legacy stock uses new prices; no reroll of UID, species, size, quality or age. Already-paid trips retain saved payment/departure/arrival.',
};
fs.writeFileSync(path.join(directory, 'BASELINE_DELTAS.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
