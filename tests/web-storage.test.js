import test from "node:test";
import assert from "node:assert/strict";
import { createRepository } from "../src/storage/repository.js";
import { createNewGame } from "../src/domain/gameState.js";
import { STORAGE_CONFIG } from "../src/config/storage.js";

const NOW = Date.UTC(2026, 9, 20, 8);
const PRIMARY = STORAGE_CONFIG.webKey;
const BACKUP = `${PRIMARY}.backup`;
const initial = () => createNewGame("jiangnan", NOW);

function setup(t, entries = []) {
  const descriptors = new Map(["window", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const memory = new Map(entries);
  const writes = [];
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); memory.set(key, value); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { memory, writes, storage, repo: createRepository() };
}

test("Web storage saves two complete revisions and an identical retry writes nothing", async (t) => {
  const { memory, writes, repo } = setup(t);
  assert.equal((await repo.loadSave()).snapshot, null);
  const first = initial();
  await repo.saveGame(first);
  const second = { ...first, revision: 1, coins: first.coins + 10, lastEffectiveNowMs: NOW + 1 };
  await repo.saveGame(second);
  assert.deepEqual((await repo.loadSave()).snapshot, second);
  assert.equal(JSON.parse(memory.get(PRIMARY)).revision, 0);
  assert.equal(JSON.parse(memory.get(BACKUP)).revision, 1);
  assert.equal((await repo.saveGame(second)).status, "already-committed");
  assert.equal(writes.length, 2);
});

test("future schema in either Web slot blocks loading and writing without changing any bytes", async (t) => {
  const { memory, writes, repo } = setup(t);
  for (const futureKey of [PRIMARY, BACKUP]) {
    memory.clear();
    memory.set(futureKey, JSON.stringify({ ...initial(), schemaVersion: STORAGE_CONFIG.schemaVersion + 1, revision: 1 }));
    memory.set(futureKey === PRIMARY ? BACKUP : PRIMARY, JSON.stringify(initial()));
    const before = [...memory];
    await assert.rejects(repo.loadSave(), /较新版本/);
    await assert.rejects(repo.saveGame({ ...initial(), revision: 1 }), /较新版本/);
    assert.deepEqual([...memory], before);
  }
  assert.equal(writes.length, 0);
});

test("corrupt Web slot recovers the complete valid backup and reports recovery explicitly", async (t) => {
  const backup = { ...initial(), revision: 1, coins: 123 };
  const { memory, writes, repo } = setup(t, [[PRIMARY, "{broken"], [BACKUP, JSON.stringify(backup)]]);
  const result = await repo.loadSave();
  assert.deepEqual(result.snapshot, backup);
  assert.equal(result.recovery.recovered, true);
  assert.ok(result.recovery.message);
  assert.equal(memory.get(PRIMARY), "{broken");
  assert.equal(writes.length, 0);
});

test("two corrupt Web slots are retained and cannot be overwritten as a fresh game", async (t) => {
  const entries = [[PRIMARY, "bad primary"], [BACKUP, "bad backup"]];
  const { memory, writes, repo } = setup(t, entries);
  await assert.rejects(repo.loadSave(), /损坏/);
  await assert.rejects(repo.saveGame(initial()), /损坏/);
  assert.deepEqual([...memory], entries);
  assert.equal(writes.length, 0);
});

test("equal Web revisions with different balances are a conflict rather than an arbitrary winner", async (t) => {
  const one = { ...initial(), revision: 1, coins: 120 };
  const two = { ...initial(), revision: 1, coins: 999 };
  const { memory, repo } = setup(t, [[PRIMARY, JSON.stringify(one)], [BACKUP, JSON.stringify(two)]]);
  const before = [...memory];
  await assert.rejects(repo.loadSave(), /冲突/);
  await assert.rejects(repo.saveGame({ ...one, revision: 2 }), /冲突/);
  assert.deepEqual([...memory], before);
});

test("stale, skipped and backwards-time Web saves cannot overwrite the confirmed revision", async (t) => {
  const saved = { ...initial(), revision: 1, lastEffectiveNowMs: NOW + 1_000 };
  const { memory, repo } = setup(t, [[BACKUP, JSON.stringify(saved)]]);
  const before = [...memory];
  for (const attempted of [
    { ...saved, revision: 0 },
    { ...saved, revision: 3 },
    { ...saved, revision: 2, lastEffectiveNowMs: NOW },
  ]) await assert.rejects(repo.saveGame(attempted));
  assert.deepEqual([...memory], before);
});

test("Web quota failure preserves previous progress and remains readable", async (t) => {
  const first = initial();
  const { memory, storage, repo } = setup(t, [[PRIMARY, JSON.stringify(first)]]);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  await assert.rejects(repo.saveGame({ ...first, revision: 1, coins: 200 }), /QuotaExceededError/);
  assert.deepEqual((await repo.loadSave()).snapshot, first);
  assert.equal(memory.has(BACKUP), false);
});
