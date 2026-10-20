import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { GameSession } from "../src/application/gameSession.js";
import { createNewGame } from "../src/domain/gameState.js";
import { validateSave } from "../src/domain/saveSchema.js";
import { FISH, BAIT_COST } from "../src/lib/gameConfig.js";
import { quoteFish } from "../src/domain/market.js";
import { quoteRoute } from "../src/domain/routes.js";

const NOW = Date.UTC(2026, 9, 20, 8);
const HOME = "jiangnan";
const AWAY = "dongbei";
const clone = (value) => structuredClone(value);
const { createSaveRepository } = createRequire(import.meta.url)("../desktop/saveRepository.cjs");

function seed() {
  return { ...createNewGame(HOME, NOW), coins: 20_000 };
}

function fishFixture() {
  const species = FISH[0];
  return {
    uid: "session-fish", speciesId: species.id, name: species.name, quality: "common",
    length: (species.len[0] + species.len[1]) / 2,
    weight: (species.wt[0] + species.wt[1]) / 2,
    caughtAtMs: NOW, regionId: HOME, originRegionId: HOME,
  };
}

function repository(initial = null) {
  return {
    disk: clone(initial), writes: [], reads: 0,
    async loadSave() { this.reads += 1; return { snapshot: clone(this.disk) }; },
    async saveGame(next) {
      this.writes.push(clone(next));
      this.disk = clone(next);
      return { snapshot: clone(next) };
    },
  };
}

function setup(repo = repository(seed())) {
  const time = { wall: NOW, mono: 0 };
  const session = new GameSession(repo, () => time.wall, () => time.mono);
  return { repo, session, time };
}

test("initialization publishes only after save acknowledgment, then stays idempotent", async () => {
  const repo = repository();
  let announceStarted;
  const started = new Promise((resolve) => { announceStarted = resolve; });
  let acknowledge;
  repo.saveGame = async function saveGame(next) {
    this.writes.push(clone(next));
    announceStarted();
    return new Promise((resolve) => {
      acknowledge = () => { this.disk = clone(next); resolve({ snapshot: clone(next) }); };
    });
  };
  const { session } = setup(repo);
  const notices = [];
  session.subscribe((snapshot) => notices.push(snapshot));
  const initializing = session.initialize(AWAY);
  await started;
  assert.equal(session.snapshot, null);
  assert.equal(notices.length, 0);
  acknowledge();
  const saved = await initializing;
  assert.equal(saved.currentRegion, AWAY);
  assert.equal(repo.disk.currentRegion, AWAY);
  assert.equal(notices.length, 1);
  assert.deepEqual(await session.initialize(HOME), saved);
  assert.equal(repo.writes.length, 1);
});

test("initialization that reached disk survives a lost reply without creating another save", async () => {
  const repo = repository();
  repo.saveGame = async function saveGame(next) {
    this.writes.push(clone(next));
    this.disk = clone(next);
    throw new Error("reply lost after durable write");
  };
  const { session } = setup(repo);
  const saved = await session.initialize(AWAY);
  assert.equal(saved.currentRegion, AWAY);
  assert.equal(saved.revision, 0);
  assert.equal(session.blocked, false);
  assert.equal(repo.reads, 1);
  await session.initialize(HOME);
  assert.equal(repo.writes.length, 1);
});

test("a clearly failed first write leaves no game and allows an explicit retry", async () => {
  const repo = repository();
  const originalSave = repo.saveGame;
  repo.saveGame = async () => { throw new Error("read-only volume"); };
  const { session } = setup(repo);
  await assert.rejects(session.initialize(HOME));
  assert.equal(session.snapshot, null);
  assert.equal(repo.disk, null);
  assert.equal(session.blocked, false);
  repo.saveGame = originalSave;
  const saved = await session.initialize(HOME);
  assert.equal(saved.currentRegion, HOME);
});

test("a durable purchase with a lost reply is reconciled and cannot be charged twice after restart", async () => {
  const repo = repository(seed());
  const { session } = setup(repo);
  await session.load();
  const before = clone(session.snapshot);
  repo.saveGame = async function saveGame(next) {
    this.writes.push(clone(next));
    this.disk = clone(next);
    throw new Error("reply lost after rename");
  };
  const buy = { type: "BUY_BAIT", id: "durable-bait-purchase" };
  const saved = await session.dispatch(buy);
  assert.equal(saved.coins, before.coins - BAIT_COST);
  assert.equal(saved.baitCount, before.baitCount + 1);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(session.blocked, false);
  assert.deepEqual(await session.dispatch(buy), saved);
  const { session: restarted } = setup(repo);
  await restarted.load();
  assert.deepEqual(await restarted.dispatch(buy), saved);
  assert.equal(repo.writes.length, 1);
});

test("an explicitly failed transaction preserves confirmed assets and can be retried", async () => {
  const repo = repository(seed());
  const { session } = setup(repo);
  await session.load();
  const before = clone(session.snapshot);
  const originalSave = repo.saveGame;
  repo.saveGame = async () => { throw new Error("disk is full before write"); };
  const buy = { type: "BUY_BAIT", id: "retryable-purchase" };
  await assert.rejects(session.dispatch(buy));
  assert.deepEqual(session.snapshot, before);
  assert.deepEqual(repo.disk, before);
  assert.equal(session.blocked, false);
  repo.saveGame = originalSave;
  const saved = await session.dispatch(buy);
  assert.equal(saved.coins, before.coins - BAIT_COST);
  assert.equal(saved.revision, before.revision + 1);
});

test("failed write plus failed reconciliation blocks all subsequent economic commands", async () => {
  const repo = repository(seed());
  const { session } = setup(repo);
  await session.load();
  const before = clone(session.snapshot);
  let attempts = 0;
  repo.saveGame = async () => { attempts += 1; throw new Error("write result unknown"); };
  repo.loadSave = async () => { throw new Error("cannot read recovery slots"); };
  await assert.rejects(session.dispatch({ type: "BUY_BAIT", id: "unknown-write" }));
  assert.equal(session.blocked, true);
  assert.deepEqual(session.snapshot, before);
  await assert.rejects(session.dispatch({ type: "BUY_ROD", id: "forbidden-after-uncertainty" }));
  assert.equal(attempts, 1);
});

test("reconciliation with no durable save cannot silently recreate an existing game", async () => {
  const repo = repository(seed());
  const { session } = setup(repo);
  await session.load();
  repo.saveGame = async () => { throw new Error("save disappeared"); };
  repo.loadSave = async () => ({ snapshot: null });
  await assert.rejects(session.dispatch({ type: "BUY_BAIT", id: "missing-durable-state" }));
  assert.equal(session.blocked, true);
  await assert.rejects(session.dispatch({ type: "BUY_BAIT", id: "must-not-recreate" }));
});

test("concurrent sales are serialized so one fish is sold exactly once", async () => {
  const initial = { ...seed(), bucket: [fishFixture()] };
  const repo = repository(initial);
  const { session } = setup(repo);
  await session.load();
  const results = await Promise.allSettled([
    session.dispatch({ type: "SELL_ONE", id: "sale-1", uid: "session-fish" }),
    session.dispatch({ type: "SELL_ONE", id: "sale-2", uid: "session-fish" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(session.snapshot.coins, initial.coins + quoteFish(initial.bucket[0], HOME, NOW).price);
  assert.equal(session.snapshot.bucket.length, 0);
  assert.equal(repo.writes.length, 1);
});

test("an invalid queued command does not stop a later valid command", async () => {
  const { repo, session } = setup();
  await session.load();
  const results = await Promise.allSettled([
    session.dispatch({ type: "SELL_ONE", id: "invalid-first", uid: "missing" }),
    session.dispatch({ type: "BUY_BAIT", id: "valid-next" }),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(repo.writes.length, 1);
  assert.equal(session.blocked, false);
});

test("effective time continues after wall-clock forward and backward changes", () => {
  const { session, time } = setup();
  assert.equal(session.now(), NOW);
  time.wall = NOW + 100;
  time.mono = 100;
  assert.equal(session.now(), NOW + 100);
  time.wall = NOW + 86_400_000;
  time.mono = 200;
  assert.equal(session.now(), NOW + 86_400_000);
  time.wall = NOW - 86_400_000;
  time.mono = 300;
  assert.equal(session.now(), NOW + 86_400_100);
  time.mono = 450;
  assert.equal(session.now(), NOW + 86_400_250);
});

test("restoring a logical time ahead of the wall clock keeps advancing monotonically", async () => {
  const initial = { ...seed(), lastEffectiveNowMs: NOW + 86_400_000 };
  const { session, time } = setup(repository(initial));
  await session.load();
  assert.equal(session.now(), initial.lastEffectiveNowMs);
  time.mono = 250;
  assert.equal(session.now(), initial.lastEffectiveNowMs + 250);
  const saved = await session.dispatch({ type: "BUY_BAIT", id: "after-clock-rollback" });
  assert.equal(saved.lastEffectiveNowMs, initial.lastEffectiveNowMs + 250);
});

test("catch and arrival both persist before notification and can recover lost acknowledgments", async () => {
  const repo = repository(seed());
  const { session, time } = setup(repo);
  await session.load();
  const notifications = [];
  session.subscribe((state) => {
    assert.equal(repo.disk.revision, state.revision);
    notifications.push(state.lastCommittedCommandId);
  });
  await session.dispatch({ type: "CATCH", id: "persist-catch", fish: fishFixture() });
  assert.equal(repo.disk.bucket.length, 1);
  assert.equal(repo.disk.codex[FISH[0].id].catchCount, 1);
  const flight = await session.dispatch({ type: "START_TRAVEL", id: "persist-takeoff", toId: AWAY });
  assert.equal(repo.disk.travel.farePaid, quoteRoute(HOME, AWAY).price);
  time.wall = flight.travel.arriveAtMs + 1;
  time.mono += 1;
  repo.saveGame = async function saveGame(next) {
    this.writes.push(clone(next));
    this.disk = clone(next);
    throw new Error("arrival ack lost after disk write");
  };
  const arrival = await session.dispatch({ type: "ARRIVE", id: "persist-arrival" });
  assert.equal(arrival.currentRegion, AWAY);
  assert.equal(repo.disk.travel, null);
  assert.equal(repo.disk.coins, flight.coins);
  assert.deepEqual(notifications, ["persist-catch", "persist-takeoff", "persist-arrival"]);
});

test("a rejected or mismatched save acknowledgment is reconciled before success is published", async () => {
  const repo = repository(seed());
  const { session } = setup(repo);
  await session.load();
  const before = clone(session.snapshot);
  repo.saveGame = async () => ({ snapshot: clone(before) });
  await assert.rejects(session.dispatch({ type: "BUY_BAIT", id: "bad-ack" }));
  assert.deepEqual(session.snapshot, before);
  assert.equal(session.blocked, false);
});

test("UI subscriber exceptions cannot turn a confirmed disk commit into an unknown transaction", async () => {
  const { repo, session } = setup();
  await session.load();
  session.subscribe(() => { throw new Error("broken UI subscriber"); });
  const before = clone(session.snapshot);
  const saved = await session.dispatch({ type: "BUY_BAIT", id: "ui-exception-after-commit" });
  assert.equal(saved.coins, before.coins - BAIT_COST);
  assert.equal(repo.disk.coins, saved.coins);
  assert.equal(session.blocked, false);
});

test("actual schema, file repository and session preserve catches and paid flights across restart", async (t) => {
  const temporaryRoot = path.resolve("tests", ".tmp");
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, "pondclock-session-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("pondclock-session-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const files = createSaveRepository({ directory, validate: validateSave });
  await files.save(seed());
  let loseReply = false;
  const adapter = {
    loadSave: () => files.load(),
    saveGame: async (next) => {
      const result = await files.save(next);
      if (loseReply) { loseReply = false; throw new Error("lost reply after actual file commit"); }
      return result;
    },
  };
  const { session } = setup(adapter);
  await session.load();
  const caught = await session.dispatch({ type: "CATCH", id: "real-repository-catch", fish: fishFixture() });
  assert.equal(caught.bucket.length, 1);
  loseReply = true;
  const takeoff = { type: "START_TRAVEL", id: "real-repository-flight", toId: AWAY };
  const flight = await session.dispatch(takeoff);
  assert.equal(flight.coins, seed().coins - quoteRoute(HOME, AWAY).price);
  assert.equal(session.blocked, false);
  const reopenedFiles = createSaveRepository({ directory, validate: validateSave });
  const restarted = new GameSession({
    loadSave: () => reopenedFiles.load(), saveGame: (next) => reopenedFiles.save(next),
  }, () => flight.travel.arriveAtMs + 1, () => 0);
  await restarted.load();
  assert.deepEqual(await restarted.dispatch(takeoff), restarted.snapshot);
  const arrived = await restarted.dispatch({ type: "ARRIVE", id: "real-repository-arrival" });
  assert.equal(arrived.currentRegion, AWAY);
  assert.equal(arrived.travel, null);
  assert.equal(arrived.bucket[0].caughtAtMs, NOW);
  assert.equal(arrived.coins, flight.coins);
  assert.equal(arrived.codex[FISH[0].id].catchCount, 1);
  const stored = (await reopenedFiles.load()).snapshot;
  assert.deepEqual(stored, arrived);
  assert.equal(stored.revision, 3);
});
