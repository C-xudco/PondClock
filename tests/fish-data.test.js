import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../src/lib/gameConfig.js';
import { FISH_SOURCES, FISH_REFERENCES, FISH_SOURCE_SNAPSHOT } from '../src/data/fishSources.js';
import { catchOutcome } from '../src/domain/loot.js';
import { quoteFish, MARKET_QUOTES } from '../src/domain/market.js';
import { loadApprovedBaseline, buildMarketComparison } from '../docs/next-iteration/roles/fish-catalogue/market-comparison.mjs';

const baseline = await loadApprovedBaseline();
const newIds = Object.keys(FISH_SOURCES);
const byId = new Map(config.FISH.map((fish) => [fish.id, fish]));

test('approved fish expansion preserves every old fish value and non-fish config', () => {
  assert.equal(config.FISH.length, baseline.config.FISH.length + 8);
  assert.equal(byId.size, config.FISH.length);
  for (const fish of baseline.config.FISH) assert.deepEqual(byId.get(fish.id), fish, fish.id);
  for (const key of Object.keys(baseline.config).filter((key) => !['FISH', 'REGIONS'].includes(key))) {
    assert.deepEqual(config[key], baseline.config[key], key);
  }
  for (const original of baseline.config.REGIONS) {
    const current = config.REGIONS.find((region) => region.id === original.id);
    assert.deepEqual({ ...current, fish: original.fish }, original, original.id);
    for (const pair of original.fish) assert.deepEqual(current.fish.find(([id]) => id === pair[0]), pair);
  }
});

test('eight new species have independent identities and research-backed producing basins only', () => {
  assert.equal(newIds.length, 8);
  assert.equal(new Set(newIds.map((id) => FISH_SOURCES[id].scientificName)).size, 8);
  assert.equal(FISH_SOURCE_SNAPSHOT.sha256, '21b81697c65c5564b301ed70768c57181a9b402ac7bcec1d9cb386771774d46d');
  for (const id of newIds) {
    const species = byId.get(id), source = FISH_SOURCES[id];
    assert.ok(species, id);
    assert.equal(source.evidenceTier, 'R1');
    assert.equal(source.exactLandmarkVerified, false);
    assert.ok(source.sourceFids.every((fid) => /^F\d{4}$/.test(fid)));
    assert.ok(source.references.every((ref) => FISH_REFERENCES[ref].type.startsWith('original-research')));
    assert.deepEqual(source.sourceUrls, source.references.map((ref) => FISH_REFERENCES[ref].url));
    assert.deepEqual(config.REGIONS.filter((region) => region.fish.some(([fishId]) => fishId === id)).map((region) => region.id).sort(),
      source.regionEvidence.map((entry) => entry.regionId).sort(), id);
    assert.ok(Math.abs(Object.values(species.qw).reduce((sum, value) => sum + value, 0) - 100) < 1e-9);
    assert.ok(Number.isSafeInteger(species.basePrice) && species.basePrice > 0);
    assert.ok(species.len[0] > 0 && species.len[1] > species.len[0]);
    assert.ok(species.wt[0] > 0 && species.wt[1] > species.wt[0]);
  }
  for (const region of config.REGIONS) {
    assert.equal(new Set(region.fish.map(([id]) => id)).size, region.fish.length, region.id);
    assert.ok(region.fish.every(([id, weight]) => byId.has(id) && Number.isSafeInteger(weight) && weight > 0));
  }
  assert.equal(byId.has('heibangouyu'), false, 'official suitability alone is not a sampled record');
});

test('real persistent catch streams can produce each new species in every configured basin', () => {
  for (const region of config.REGIONS) {
    const expected = new Set(region.fish.map(([id]) => id).filter((id) => newIds.includes(id)));
    const seen = new Set();
    for (let seed = 1; seed <= 4096 && seen.size < expected.size; seed++) {
      const state = { randomSeed: seed, catchSequence: 0, currentRegion: region.id,
        rodLevel: 0, baitLeft: 0, baitCount: 0, pityCounter: 0 };
      const outcome = catchOutcome(state);
      assert.deepEqual(catchOutcome(state), outcome, 'replaying the persisted seed must preserve the result');
      if (outcome.kind !== 'fish' || !expected.has(outcome.fish.speciesId)) continue;
      const caught = outcome.fish, species = byId.get(caught.speciesId);
      seen.add(caught.speciesId);
      assert.equal(caught.name, species.name);
      assert.equal(caught.originRegionId, region.id);
      assert.ok(caught.length >= species.len[0] && caught.length <= species.len[1]);
      assert.ok(caught.weight >= species.wt[0] && caught.weight <= species.wt[1]);
    }
    assert.deepEqual([...seen].sort(), [...expected].sort(), region.id);
  }
});

test('full old/new market comparison covers all old prices, all new markets and seven-day expiry', () => {
  const report = buildMarketComparison(baseline);
  assert.equal(report.before.length, 42 * 12);
  assert.equal(report.after.length, 50 * 12);
  assert.equal(MARKET_QUOTES.length, report.after.length);
  assert.equal(report.oldPriceDeltas.length, 42 * 12 * 4);
  assert.equal(report.summary.oldBasePriceChanges, 0);
  assert.equal(report.newParameters.length, 8);
  assert.equal(report.regionYields.length, 12);
  for (const row of report.oldPriceDeltas) assert.ok(row.priceAfter >= 1 && Number.isSafeInteger(row.priceAfter));
  const caughtAtMs = Date.UTC(2026, 9, 25);
  for (const id of newIds) {
    for (const region of config.REGIONS) {
      for (const quality of config.QUALITIES) {
        const fish = { speciesId: id, quality: quality.id, weight: byId.get(id).wt[1], caughtAtMs };
        assert.ok(quoteFish(fish, region.id, caughtAtMs).price > 0);
        assert.equal(quoteFish(fish, region.id, caughtAtMs + 168 * 60 * 60 * 1000).price, 1);
      }
    }
  }
});
