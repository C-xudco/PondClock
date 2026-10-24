import test from "node:test";
import assert from "node:assert/strict";
import { FISH, REGIONS, QUALITIES, BAIT_COST, BAIT_CATCHES, RODS } from "../src/lib/gameConfig.js";
import { ROUTES, quoteRoute, routeBounds, haversineKm } from "../src/domain/routes.js";
import { MARKET_QUOTES, marketFor, quoteFish, calcMarketPrice } from "../src/domain/market.js";
import { createNewGame, applyCommand } from "../src/domain/gameState.js";
import { validateSave } from "../src/domain/saveSchema.js";
import { catchOutcome } from "../src/domain/loot.js";

// Business invariants use deterministic inputs; no network, timers, or desktop writes.
const NOW = Date.UTC(2026, 9, 20, 8);
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const HOME = "jiangnan";
const AWAY = "dongbei";
let commandSequence = 0;

function command(type, fields = {}) {
  return { type, id: `test-command-${++commandSequence}`, ...fields };
}

function fishFixture(species = FISH[0], fields = {}) {
  return {
    uid: `fish-${species.id}`,
    speciesId: species.id,
    name: species.name,
    quality: "common",
    length: (species.len[0] + species.len[1]) / 2,
    weight: (species.wt[0] + species.wt[1]) / 2,
    caughtAtMs: NOW,
    regionId: HOME,
    originRegionId: HOME,
    catchSequence: 1,
    ...fields,
  };
}

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function richGame() {
  return { ...createNewGame(HOME, NOW, { randomSeed: 1 }), coins: 100_000, catchSequence: 2 };
}

function supplyShare(speciesId, region) {
  const total = region.fish.reduce((sum, [, weight]) => sum + weight, 0);
  return (region.fish.find(([id]) => id === speciesId)?.[1] ?? 0) / total;
}

function expectedFreshPrice(species, quality, weight, multiplier) {
  const average = (species.wt[0] + species.wt[1]) / 2 || 1;
  const factor = Math.min(2.5, Math.max(0.5, 0.7 + (weight / average) * 0.6));
  return Math.max(1, Math.round(species.basePrice * quality.mult * factor * multiplier));
}

test("route network contains every ordered pair exactly once and no self routes", () => {
  assert.equal(REGIONS.length, 12);
  assert.equal(ROUTES.length, 132);
  const keys = new Set(ROUTES.map((route) => `${route.fromId}->${route.toId}`));
  assert.equal(keys.size, 132);
  for (const from of REGIONS) {
    for (const to of REGIONS) {
      const route = quoteRoute(from.id, to.id);
      if (from.id === to.id) {
        assert.equal(route, null);
        continue;
      }
      assert.ok(keys.has(`${from.id}->${to.id}`));
      assert.equal(route.fromId, from.id);
      assert.equal(route.toId, to.id);
      assert.ok(Number.isFinite(route.distanceKm) && route.distanceKm > 0);
      assert.ok(Number.isInteger(route.durationMs));
      assert.ok(Number.isInteger(route.price));
    }
  }
  assert.equal(quoteRoute("unknown-region", HOME), null);
  assert.equal(quoteRoute(HOME, "unknown-region"), null);
});

test("geographical distance handles known equatorial and antipodal cases", () => {
  const zero = { latitude: 0, longitude: 0 };
  assert.equal(haversineKm(zero, zero), 0);
  assert.ok(Math.abs(haversineKm(zero, { latitude: 0, longitude: 1 }) - 111.1949266) < 0.000001);
  assert.ok(Math.abs(haversineKm(zero, { latitude: 0, longitude: 180 }) - 20_015.086796) < 0.000001);
  assert.throws(() => haversineKm(zero, { latitude: 91, longitude: 0 }));
  assert.throws(() => haversineKm(zero, { latitude: 0, longitude: Infinity }));
});

test("global distance scaling has exact 60/180 second limits, 200/6000 fares, and symmetric trips", () => {
  const distances = ROUTES.map((route) => route.distanceKm);
  assert.equal(routeBounds.minDistanceKm, Math.min(...distances));
  assert.equal(routeBounds.maxDistanceKm, Math.max(...distances));
  assert.ok(routeBounds.maxDistanceKm > routeBounds.minDistanceKm);
  assert.equal(Math.min(...ROUTES.map((route) => route.durationMs)), 60_000);
  assert.equal(Math.max(...ROUTES.map((route) => route.durationMs)), 180_000);
  assert.equal(Math.min(...ROUTES.map((route) => route.price)), 200);
  assert.equal(Math.max(...ROUTES.map((route) => route.price)), 6_000);
  for (const route of ROUTES) {
    const ratio = (route.distanceKm - routeBounds.minDistanceKm)
      / (routeBounds.maxDistanceKm - routeBounds.minDistanceKm);
    assert.equal(route.durationMs, Math.round(60_000 + 120_000 * ratio));
    assert.equal(route.price, Math.round((200 + 5_800 * ratio) / 10) * 10);
    const reverse = quoteRoute(route.toId, route.fromId);
    assert.equal(reverse.distanceKm, route.distanceKm);
    assert.equal(reverse.durationMs, route.durationMs);
    assert.equal(reverse.price, route.price);
  }
  const sorted = [...ROUTES].sort((a, b) => a.distanceKm - b.distanceKm);
  for (let index = 1; index < sorted.length; index++) {
    assert.ok(sorted[index].durationMs >= sorted[index - 1].durationMs);
    assert.ok(sorted[index].price >= sorted[index - 1].price);
  }
});

test("market matrix covers all species x regions from the habitat shares", () => {
  assert.ok(FISH.length >= 42);
  assert.equal(MARKET_QUOTES.length, FISH.length * REGIONS.length);
  assert.equal(new Set(MARKET_QUOTES.map((row) => `${row.speciesId}:${row.regionId}`)).size, FISH.length * REGIONS.length);
  for (const species of FISH) {
    const shares = REGIONS.map((region) => supplyShare(species.id, region));
    const maximum = Math.max(...shares);
    assert.ok(maximum > 0, `${species.id} must have a habitat`);
    for (const [index, region] of REGIONS.entries()) {
      const market = marketFor(species.id, region.id);
      const expected = 0.8 + 1.2 * (1 - shares[index] / maximum);
      assert.ok(Math.abs(market.multiplier - expected) < 1e-10, `${species.id}/${region.id}`);
      assert.ok(market.multiplier >= 0.8 && market.multiplier <= 2);
      if (shares[index] === 0) assert.equal(market.multiplier, 2);
    }
  }
});

test("fresh quotes use the sale region and round only after applying the market multiplier", () => {
  for (const species of FISH) {
    for (const quality of QUALITIES) {
      for (const region of REGIONS) {
        const fish = fishFixture(species, { quality: quality.id });
        const quote = quoteFish(fish, region.id, NOW);
        const multiplier = marketFor(species.id, region.id).multiplier;
        assert.equal(quote.price, expectedFreshPrice(species, quality, fish.weight, multiplier));
        assert.equal(quote.expired, false);
        assert.equal(quote.expiresAtMs, NOW + SEVEN_DAYS);
        assert.equal(calcMarketPrice(fish, region.id, NOW), quote.price);
        const otherOrigin = { ...fish, originRegionId: AWAY };
        assert.equal(quoteFish(otherOrigin, region.id, NOW).price, quote.price);
      }
    }
  }
});

test("every fish and quality becomes exactly 1 at seven days in every sale region", () => {
  for (const species of FISH) {
    for (const quality of QUALITIES) {
      const fish = fishFixture(species, { quality: quality.id });
      for (const region of REGIONS) {
        const before = quoteFish(fish, region.id, NOW + SEVEN_DAYS - 1);
        assert.equal(before.expired, false, `${species.id}/${quality.id}/${region.id}`);
        for (const at of [NOW + SEVEN_DAYS, NOW + SEVEN_DAYS + 1]) {
          const quote = quoteFish(fish, region.id, at);
          assert.equal(quote.expired, true);
          assert.equal(quote.price, 1);
        }
      }
    }
  }
});

test("missing or corrupt catch time cannot be converted into a newly fresh fish", () => {
  for (const caughtAtMs of [undefined, null, NaN, Infinity, "2026/10/20"]) {
    const quote = quoteFish(fishFixture(FISH[0], { caughtAtMs }), HOME, NOW);
    assert.equal(quote.price, 1);
    assert.equal(quote.expired, true);
  }
  assert.throws(() => quoteFish(fishFixture(), HOME, NaN));
});

test("new save unlocks only its actual initial region and is schema-valid", () => {
  const state = createNewGame(AWAY, NOW);
  assert.equal(state.homeRegion, AWAY);
  assert.equal(state.currentRegion, AWAY);
  assert.deepEqual(state.unlockedRegions, [AWAY]);
  assert.equal(state.travel, null);
  assert.ok(Number.isSafeInteger(state.coins) && state.coins >= 0);
  assert.equal(validateSave(structuredClone(state)).currentRegion, AWAY);
});

test("new games reject unknown regions rather than silently unlocking a default", () => {
  assert.throws(() => createNewGame("unknown-region", NOW));
});

test("new startup IP/VPN region is permanently unlocked for free without teleportation", () => {
  const original = freezeDeep(createNewGame(HOME, NOW));
  const next = applyCommand(original, command("GEO_VISIT", { regionId: AWAY }), NOW + 1);
  assert.equal(next.realRegion, AWAY);
  assert.equal(next.homeRegion, HOME);
  assert.equal(next.currentRegion, HOME);
  assert.equal(next.coins, original.coins);
  assert.deepEqual(new Set(next.unlockedRegions), new Set([HOME, AWAY]));
  const repeat = applyCommand(next, command("GEO_VISIT", { regionId: AWAY }), NOW + 2);
  assert.equal(repeat.unlockedRegions.filter((id) => id === AWAY).length, 1);
  assert.deepEqual(original.unlockedRegions, [HOME]);
});

test("flying to a free IP-unlocked region still charges the origin/destination route", () => {
  const state = applyCommand(richGame(), command("GEO_VISIT", { regionId: AWAY }), NOW);
  const route = quoteRoute(HOME, AWAY);
  const takeoff = command("START_TRAVEL", { toId: AWAY });
  const next = applyCommand(freezeDeep(state), takeoff, NOW + 1);
  assert.equal(next.coins, state.coins - route.price);
  assert.equal(next.currentRegion, HOME);
  assert.equal(next.travel.fromId, HOME);
  assert.equal(next.travel.toId, AWAY);
  assert.equal(next.travel.arriveAtMs - next.travel.departAtMs, route.durationMs);
  assert.equal(next.travel.farePaid, route.price);
  const duplicate = applyCommand(next, takeoff, NOW + 2);
  assert.deepEqual(duplicate, next);
});

test("real-location entry is free, preserves home, and only uses the recorded IP region", () => {
  const state = applyCommand(richGame(), command("GEO_VISIT", { regionId: AWAY }), NOW);
  const entry = command("REAL_VISIT");
  const next = applyCommand(freezeDeep(state), entry, NOW + 1);
  assert.equal(next.currentRegion, AWAY);
  assert.equal(next.realRegion, AWAY);
  assert.equal(next.homeRegion, HOME);
  assert.equal(next.coins, state.coins);
  assert.deepEqual(applyCommand(next, entry, NOW + 2), next);
  let forged;
  try {
    forged = applyCommand(state, command("REAL_VISIT", { toId: "qingzang", regionId: "qingzang" }), NOW + 1);
  } catch {
    forged = state;
  }
  assert.notEqual(forged.currentRegion, "qingzang");
  assert.equal(forged.coins, state.coins);
});

test("invalid and unaffordable departures do not change the input state", () => {
  const state = freezeDeep(createNewGame(HOME, NOW));
  const snapshot = structuredClone(state);
  for (const toId of [AWAY, HOME, "unknown-region"]) {
    assert.throws(() => applyCommand(state, command("START_TRAVEL", { toId }), NOW + 1));
    assert.deepEqual(state, snapshot);
  }
});

test("travel blocks a second takeoff, fishing, and selling until arrival", () => {
  const state = applyCommand(richGame(), command("START_TRAVEL", { toId: AWAY }), NOW);
  for (const action of [
    command("START_TRAVEL", { toId: "huaihe" }),
    command("CATCH", { fish: fishFixture() }),
    command("SELL_ONE", { uid: "missing" }),
    command("SELL_ALL"),
    command("REAL_VISIT"),
  ]) {
    assert.throws(() => applyCommand(freezeDeep(state), action, NOW + 1));
  }
});

test("new startup IP region during a flight unlocks for free without cancelling the flight", () => {
  const flying = applyCommand(richGame(), command("START_TRAVEL", { toId: AWAY }), NOW);
  const visit = applyCommand(freezeDeep(flying), command("GEO_VISIT", { regionId: "qingzang" }), NOW + 1);
  assert.equal(visit.realRegion, "qingzang");
  assert.equal(visit.homeRegion, HOME);
  assert.equal(visit.currentRegion, HOME);
  assert.equal(visit.coins, flying.coins);
  assert.deepEqual(visit.travel, flying.travel);
  assert.ok(visit.unlockedRegions.includes("qingzang"));
});

test("arrival uses its persisted deadline once, including a long offline period", () => {
  const departure = applyCommand(richGame(), command("START_TRAVEL", { toId: AWAY }), NOW);
  const arrive = command("ARRIVE");
  let early;
  try {
    early = applyCommand(freezeDeep(departure), arrive, departure.travel.arriveAtMs - 1);
  } catch {
    early = departure;
  }
  assert.equal(early.currentRegion, HOME);
  assert.equal(early.coins, departure.coins);
  assert.deepEqual(early.travel, departure.travel);
  const restored = validateSave(JSON.parse(JSON.stringify(departure)));
  const arrived = applyCommand(restored, arrive, departure.travel.arriveAtMs + SEVEN_DAYS);
  assert.equal(arrived.currentRegion, AWAY);
  assert.equal(arrived.travel, null);
  assert.equal(arrived.coins, departure.coins);
  assert.ok(arrived.unlockedRegions.includes(AWAY));
  const duplicate = applyCommand(arrived, arrive, departure.travel.arriveAtMs + SEVEN_DAYS + 1);
  assert.deepEqual(duplicate, arrived);
});

test("one-by-one and batch selling agree while expired fish override local premiums", () => {
  const fish = [
    fishFixture(FISH[0], { uid: "fresh", caughtAtMs: NOW }),
    fishFixture(FISH[1], { uid: "expired", quality: "legendary", caughtAtMs: NOW - SEVEN_DAYS, catchSequence: 2 }),
  ];
  const base = { ...richGame(), bucket: fish };
  const originalCodex = structuredClone(base.codex);
  const expected = fish.reduce((sum, item) => sum + quoteFish(item, HOME, NOW).price, 0);
  const all = applyCommand(freezeDeep(base), command("SELL_ALL"), NOW);
  let each = base;
  for (const item of fish) each = applyCommand(each, command("SELL_ONE", { uid: item.uid }), NOW);
  assert.equal(all.coins, base.coins + expected);
  assert.equal(each.coins, all.coins);
  assert.deepEqual(all.bucket, []);
  assert.deepEqual(each.bucket, []);
  assert.deepEqual(all.codex, originalCodex);
});

test("sale replay remains idempotent after JSON save/restore", () => {
  const state = { ...richGame(), bucket: [fishFixture()] };
  const sale = command("SELL_ONE", { uid: state.bucket[0].uid });
  const sold = applyCommand(state, sale, NOW);
  const restored = validateSave(JSON.parse(JSON.stringify(sold)));
  assert.deepEqual(applyCommand(restored, sale, NOW + 1), restored);
  assert.equal(restored.lastCommittedCommandId, sale.id);
  assert.ok(restored.recentCommittedCommandIds.includes(sale.id));
});

test("sale credits the actual current region and cannot reset age by changing regions", () => {
  const fresh = fishFixture(FISH[0], { uid: "imported-fresh" });
  const expired = fishFixture(FISH[0], { uid: "imported-expired", caughtAtMs: NOW - SEVEN_DAYS });
  const visited = applyCommand(richGame(), command("GEO_VISIT", { regionId: AWAY }), NOW);
  const local = applyCommand(visited, command("REAL_VISIT"), NOW);
  const state = { ...local, bucket: [fresh, expired] };
  const originQuote = quoteFish(fresh, HOME, NOW).price;
  const localQuote = quoteFish(fresh, AWAY, NOW).price;
  assert.notEqual(originQuote, localQuote, "fixture must distinguish sale region from origin");
  const sold = applyCommand(freezeDeep(state), command("SELL_ALL"), NOW);
  assert.equal(sold.coins - state.coins, localQuote + 1);
});

test("commands keep the saved logical time when the supplied wall clock goes backwards", () => {
  const state = {
    ...richGame(),
    lastEffectiveNowMs: NOW + SEVEN_DAYS,
    bucket: [fishFixture()],
  };
  const sold = applyCommand(freezeDeep(state), command("SELL_ALL"), NOW);
  assert.equal(sold.coins, state.coins + 1);
  assert.equal(sold.lastEffectiveNowMs, state.lastEffectiveNowMs);
});

test("a different command cannot resell an already removed fish", () => {
  const fish = fishFixture();
  const sold = applyCommand({ ...richGame(), bucket: [fish] }, command("SELL_ONE", { uid: fish.uid }), NOW);
  const snapshot = structuredClone(sold);
  assert.throws(() => applyCommand(freezeDeep(sold), command("SELL_ONE", { uid: fish.uid }), NOW + 1));
  assert.deepEqual(sold, snapshot);
});

test("catch is persisted with codex and consumes bait once; replay cannot duplicate the fish", () => {
  const state = createNewGame(HOME, NOW, { randomSeed: 1 });
  const fish = catchOutcome(state).fish;
  const action = command("CATCH", { expectedCatchSequence: 1 });
  const caught = applyCommand(freezeDeep(state), action, NOW);
  assert.equal(caught.bucket.length, 1);
  assert.equal(caught.bucket[0].uid, fish.uid);
  assert.equal(caught.codex[fish.speciesId].catchCount, 1);
  assert.equal(caught.baitCount, state.baitCount - 1);
  assert.equal(caught.baitLeft, BAIT_CATCHES - 1);
  assert.deepEqual(applyCommand(caught, action, NOW + 1), caught);
  assert.equal(validateSave(JSON.parse(JSON.stringify(caught))).bucket[0].caughtAtMs, NOW);
});

test("different catch commands cannot duplicate a fish UID or introduce an out-of-region fish", () => {
  const fish = catchOutcome(createNewGame(HOME, NOW, { randomSeed: 1 })).fish;
  const caught = applyCommand(createNewGame(HOME, NOW, { randomSeed: 1 }), command("CATCH", { expectedCatchSequence: 1 }), NOW);
  assert.throws(() => applyCommand(freezeDeep(caught), command("CATCH", { expectedCatchSequence: 1 }), NOW + 1));
  const habitat = REGIONS.find((region) => region.id === HOME).fish.map(([id]) => id);
  const foreignSpecies = FISH.find((species) => !habitat.includes(species.id));
  assert.ok(foreignSpecies);
  assert.throws(() => applyCommand(caught, command("CATCH", { expectedCatchSequence: 2, fish: fishFixture(foreignSpecies) }), NOW + 1));
  assert.equal(caught.bucket.length, 1);
  assert.equal(caught.codex[fish.speciesId].catchCount, 1);
});

test("equipment purchases deduct exactly once and reject insufficient funds", () => {
  const state = richGame();
  const bait = command("BUY_BAIT");
  const withBait = applyCommand(freezeDeep(state), bait, NOW);
  assert.equal(withBait.coins, state.coins - BAIT_COST);
  assert.equal(withBait.baitCount, state.baitCount + 1);
  assert.deepEqual(applyCommand(withBait, bait, NOW + 1), withBait);
  const withRod = applyCommand(withBait, command("BUY_ROD"), NOW + 2);
  assert.equal(withRod.rodLevel, 1);
  assert.equal(withRod.coins, withBait.coins - RODS[1].cost);
  const empty = freezeDeep({ ...state, coins: 0 });
  assert.throws(() => applyCommand(empty, command("BUY_BAIT"), NOW));
  assert.throws(() => applyCommand(empty, command("BUY_ROD"), NOW));
});

test("unknown commands and missing command IDs cannot modify game assets", () => {
  const state = freezeDeep(richGame());
  assert.throws(() => applyCommand(state, command("UNKNOWN"), NOW));
  assert.throws(() => applyCommand(state, { type: "BUY_BAIT" }, NOW));
});

test("schema rejects future versions, corrupt assets, IDs, fish times, and duplicate fish", () => {
  const cases = [
    { schemaVersion: 999 },
    { coins: -1 },
    { coins: NaN },
    { coins: Infinity },
    { coins: 1.25 },
    { currentRegion: "unknown-region" },
    { homeRegion: "unknown-region" },
    { unlockedRegions: [HOME, "unknown-region"] },
    { rodLevel: 999 },
    { baitCount: -1 },
    { bucket: [fishFixture(FISH[0], { speciesId: "unknown-fish" })] },
    { bucket: [fishFixture(FISH[0], { quality: "unknown-quality" })] },
    { bucket: [fishFixture(FISH[0], { caughtAtMs: "2026/10/20" })] },
    { bucket: [fishFixture(), fishFixture()] },
  ];
  for (const fields of cases) {
    assert.throws(() => validateSave({ ...createNewGame(HOME, NOW), ...fields }), JSON.stringify(fields));
  }
});

test("valid logical save time survives a system clock rollback without rejecting existing fish", () => {
  const logicalNow = Date.now() + 24 * 60 * 60 * 1_000;
  const state = {
    ...createNewGame(HOME, logicalNow),
    catchSequence: 1,
    bucket: [fishFixture(FISH[0], { caughtAtMs: logicalNow })],
  };
  const restored = validateSave(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.bucket[0].caughtAtMs, logicalNow);
  assert.equal(restored.lastEffectiveNowMs, logicalNow);
});

test("schema rejects inconsistent flight endpoints, deadlines, and negative paid fare", () => {
  const flying = applyCommand(richGame(), command("START_TRAVEL", { toId: AWAY }), NOW);
  for (const fields of [
    { toId: "unknown-region" },
    { fromId: AWAY },
    { arriveAtMs: NOW - 1 },
    { farePaid: -1 },
  ]) {
    assert.throws(() => validateSave({ ...flying, travel: { ...flying.travel, ...fields } }));
  }
});
