// Independent review scenarios, authored separately from the implementing agents.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { APPEARANCE_PRODUCTS } from '../src/config/appearance.js';
import { GameSession } from '../src/application/gameSession.js';
import { selectSceneWeather } from '../src/domain/weatherPresentation.js';

const { createSaveRepository, checksum } = createRequire(import.meta.url)('../desktop/saveRepository.cjs');
const NOW = Date.UTC(2026, 9, 25, 5);
const fresh = () => ({ ...createNewGame('lingnan', NOW, { randomSeed: 471 }), coins: 10000 });
const command = (state, type, fields = {}) => applyCommand(state, { id: `review-${state.revision}-${type}`, type, ...fields }, NOW);
const permutations = (items) => items.length ? items.flatMap((item, i) => permutations(items.filter((_, index) => index !== i)).map((rest) => [item, ...rest])) : [[]];
const envelope = (snapshot) => JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1,
  revision: snapshot.revision, snapshot, checksum: checksum(snapshot) });

test('independent purchase-order audit: all120 shop orders have the same exact balance, rights and untouched equipment', () => {
  const price = APPEARANCE_PRODUCTS.reduce((sum, product) => sum + product.price, 0);
  const expectedIds = APPEARANCE_PRODUCTS.map((product) => product.id).sort();
  const original = fresh();
  let count = 0;
  for (const order of permutations(APPEARANCE_PRODUCTS)) {
    const result = order.reduce((state, product) => command(state, 'BUY_APPEARANCE', { productId: product.id }), fresh());
    assert.equal(result.coins, original.coins - price);
    assert.deepEqual([...result.appearance.ownedProducts].sort(), expectedIds);
    assert.deepEqual(result.appearance.equipped, original.appearance.equipped);
    assert.equal(result.randomSeed, original.randomSeed);
    assert.equal(result.rodLevel, original.rodLevel);
    count++;
  }
  assert.equal(count, 120);
});

test('independent ambiguous purchase audit: unreadable confirmation blocks more purchases until restart, never charges twice', async () => {
  let disk = fresh(), confirmationReadable = true, calls = 0;
  const repository = {
    loadSave: async () => { if (!confirmationReadable) throw new Error('confirmation unreadable'); return { snapshot: structuredClone(disk) }; },
    saveGame: async (next) => { calls++; disk = structuredClone(next); confirmationReadable = false; throw new Error('reply lost'); },
  };
  const session = new GameSession(repository, () => NOW, () => 0); await session.load();
  await assert.rejects(session.dispatch({ id: 'review-ambiguous', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' }), /保存未确认/);
  assert.equal(session.blocked, true);
  await assert.rejects(session.dispatch({ id: 'review-another', type: 'BUY_APPEARANCE', productId: 'jade_rod' }), /存档尚未准备好/);
  assert.equal(calls, 1);
  confirmationReadable = true;
  const restarted = new GameSession(repository, () => NOW, () => 0); await restarted.load();
  const recovered = await restarted.dispatch({ id: 'review-after-restart', type: 'BUY_APPEARANCE', productId: 'inkwash_pack' });
  assert.equal(recovered.coins, fresh().coins - APPEARANCE_PRODUCTS.find((item) => item.id === 'inkwash_pack').price);
  assert.deepEqual(recovered.appearance.ownedProducts, ['inkwash_pack']); assert.equal(calls, 1);
});

test('independent paid-rights recovery: malformed newer unowned equipment falls back to valid purchased slot without wiping it', async (t) => {
  const parent = path.resolve('tests/.tmp'); await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'style-supervisor-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), parent); assert.ok(path.basename(directory).startsWith('style-supervisor-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  let purchased = command(fresh(), 'BUY_APPEARANCE', { productId: 'inkwash_pack' });
  purchased = command(purchased, 'EQUIP_APPEARANCE', { slot: 'scene', styleId: 'inkwash' });
  const validRaw = envelope(purchased);
  const malformed = { ...purchased, revision: purchased.revision + 1,
    appearance: { ...purchased.appearance, ownedProducts: [] } };
  const malformedRaw = envelope(malformed);
  await fs.writeFile(path.join(directory, 'save-a.json'), validRaw);
  await fs.writeFile(path.join(directory, 'save-b.json'), malformedRaw);
  const loaded = await createSaveRepository({ directory, validate: validateSave }).load();
  assert.equal(loaded.recovery.recovered, true); assert.deepEqual(loaded.snapshot, purchased);
  assert.equal(await fs.readFile(path.join(directory, 'save-a.json'), 'utf8'), validRaw);
  assert.equal(await fs.readFile(path.join(directory, 'save-b.json'), 'utf8'), malformedRaw);
});

test('independent cross-city audit: weather-mode changes never mutate actual observations, background identity or economic state', () => {
  const snapshot = (code) => ({ weatherCode: code, isDay: true, observedAtMs: NOW, fetchedAtMs: NOW,
    temperatureC: code === 61 ? 22 : 25, cloudCoverPct: code === 61 ? 100 : 0, source: 'online', quality: 'complete',
    precipitation: { rainMm: code === 61 ? .1 : 0, showersMm: 0, snowfallCm: 0, totalMm: code === 61 ? .1 : 0, intervalSeconds: 900 } });
  const site = { regionId: 'lingnan', place: '珠江·沙面', address: '广东省广州市荔湾区', timeZone: 'Asia/Shanghai' };
  const local = { snapshot: snapshot(61), weatherPlace: '东莞', weatherLocationSource: 'ip' };
  const fishing = { site, sceneDefinition: { geometryId: 'lingnan' }, snapshot: snapshot(0) };
  const original = structuredClone({ local, fishing, economic: fresh() });
  for (const mode of ['local', 'manual', 'fishing', 'local', 'fishing']) {
    const result = selectSceneWeather({ settings: { sceneWeatherMode: mode, manualWeather: 'snow' },
      localWeather: local, fishingWeather: fishing, nowMs: NOW, localTimeZone: 'Asia/Shanghai' });
    assert.equal(result.site, site); assert.equal(result.sceneDefinition, fishing.sceneDefinition);
    assert.equal(result.visualState.precipitation.kind, mode === 'local' ? 'rain' : mode === 'manual' ? 'snow' : 'none');
    assert.equal(result.presentation.weatherPlace, mode === 'local' ? '东莞' : mode === 'fishing' ? '珠江·沙面' : null);
  }
  assert.deepEqual({ local, fishing, economic: fresh() }, original);
});
