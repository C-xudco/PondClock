import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { FISH, REGIONS } from '../src/lib/gameConfig.js';
import { FISH_BALANCE, fishQualityWeights } from '../src/config/balance.js';
import { matchDetailedRegionForCity } from '../src/data/focusRegions.js';
import { ROUTES, quoteRoute } from '../src/domain/routes.js';
import { MARKET_QUOTES } from '../src/domain/market.js';
import { SCENE_SITES } from '../src/data/sceneSites.js';

test('17-region graph is complete, distance-ordered and cannot book a self-loop', () => {
  assert.equal(REGIONS.length, 17);
  assert.equal(FISH.length, 56);
  assert.equal(ROUTES.length, 17 * 16);
  for (const from of REGIONS) {
    assert.equal(quoteRoute(from.id, from.id), null);
    const sorted = ROUTES.filter(route => route.fromId === from.id).sort((a, b) => a.distanceKm - b.distanceKm);
    assert.equal(sorted.length, 16);
    for (let i = 0; i < sorted.length; i++) {
      const route = sorted[i], reverse = quoteRoute(route.toId, route.fromId);
      assert.equal(route.ruleVersion, 2);
      assert.equal(reverse.durationMs, route.durationMs);
      assert.equal(reverse.price, route.price);
      assert.ok(route.durationMs >= 60000 && route.durationMs <= 180000);
      assert.ok(route.price >= 200 && route.price <= 6000);
      if (i) {
        assert.ok(route.durationMs >= sorted[i - 1].durationMs);
        assert.ok(route.price >= sorted[i - 1].price);
      }
    }
  }
  assert.equal(Math.min(...ROUTES.map(route => route.durationMs)), 60000);
  assert.equal(Math.max(...ROUTES.map(route => route.durationMs)), 180000);
});

test('market scarcity is derived from producing pools and each new region has its own weather identity', () => {
  assert.equal(MARKET_QUOTES.length, 56 * 17);
  for (const fish of FISH) {
    const quotes = MARKET_QUOTES.filter(row => row.speciesId === fish.id);
    assert.ok(quotes.some(row => Math.abs(row.multiplier - .8) < 1e-10));
    for (const row of quotes) {
      assert.ok(row.multiplier >= .8 && row.multiplier <= 2);
      if (row.supplyShare === 0) assert.equal(row.multiplier, 2);
    }
  }
  const keys = ['taihu', 'dongting', 'jialing', 'baiyangdian', 'jiaodong'];
  assert.equal(new Set(keys.map(key => SCENE_SITES[key].siteId)).size, 5);
  for (const id of keys) {
    assert.equal(SCENE_SITES[id].coordinateSource.precision, 'area-reference');
    assert.equal(SCENE_SITES[id].sceneId, `ink-${id}`);
  }
});

test('detailed IP matching requires an exact city and compatible province', () => {
  assert.equal(matchDetailedRegionForCity('Wuxi', 'Jiangsu'), 'taihu');
  assert.equal(matchDetailedRegionForCity('苏州市', '江苏省'), 'taihu');
  assert.equal(matchDetailedRegionForCity('Suzhou', 'Anhui'), null);
  assert.equal(matchDetailedRegionForCity('岳阳市', 'CN-HN'), 'dongting');
  assert.equal(matchDetailedRegionForCity('重庆', '重庆'), null);
  assert.equal(matchDetailedRegionForCity('Hechuan', 'Chongqing'), 'jialing');
  assert.equal(matchDetailedRegionForCity('', '河北'), null);
  assert.equal(matchDetailedRegionForCity('安新县', '河北省'), 'baiyangdian');
  assert.equal(matchDetailedRegionForCity('威海', '山东'), 'jiaodong');
  assert.equal(matchDetailedRegionForCity('威海', ''), null);
});

test('active qualities ignore ordinary bait/pity and numeric rod levels cannot alter the shared rule', () => {
  for (const region of REGIONS) for (const [id] of region.fish) {
    const fish = FISH.find(entry => entry.id === id);
    const active = fishQualityWeights(fish, region.id, { active: true });
    assert.deepEqual(fishQualityWeights(fish, region.id, { active: true, bait: true, pity: 999 }), active);
    assert.deepEqual(fishQualityWeights(fish, region.id, { rodLevel: 99 }), fishQualityWeights(fish, region.id));
  }
  assert.equal(FISH_BALANCE.activeMultipliers.epic, 4);
});

test('actual17-region report has current owned input hashes, calibrated means and all high-quality advantages', () => {
  const report = JSON.parse(fs.readFileSync(new URL('../docs/v2.0.0/roles/regions/BALANCE_CHECK.json', import.meta.url)));
  for (const file of ['src/lib/gameConfig.js', 'src/config/balance.js', 'src/data/focusRegions.js', 'src/domain/market.js', 'src/domain/routes.js']) {
    assert.equal(report.sourceHashes[file], createHash('sha256').update(fs.readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex'), file);
  }
  assert.equal(report.regions, 17);
  assert.equal(report.stationary.length, 34);
  assert.equal(report.conditions.length, 68);
  assert.equal(report.active.length, 17);
  for (const row of report.stationary) assert.ok(row.gross >= 45 && row.gross <= 55, row.regionId);
  for (const row of report.active) {
    const normal = report.stationary.find(entry => entry.regionId === row.regionId && entry.bait);
    for (const quality of ['rare', 'epic', 'legendary']) assert.ok(row.probabilities[quality] > normal.probabilities[quality], `${row.regionId}:${quality}`);
  }
});
