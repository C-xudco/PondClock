import { FISH, REGIONS, QUALITIES, RODS, BAIT_CATCHES } from '../lib/gameConfig.js';
import { DEFAULT_SETTINGS, GAME_VERSION, STORAGE_CONFIG } from '../config/storage.js';
import { LOOT_CONFIG, ITEM_DEFINITIONS } from '../config/lootConfig.js';
import { stableSeed, watchRepairOutcome } from './loot.js';
import { APPEARANCE_OPTIONS, APPEARANCE_PRODUCTS, DEFAULT_APPEARANCE, ownsAppearanceStyle } from '../config/appearance.js';
import { SCENE_WEATHER_MODES, MANUAL_WEATHER_OPTIONS } from '../config/weatherPresentation.js';

const regionIds = new Set(REGIONS.map((r) => r.id));
const fishIds = new Set(FISH.map((f) => f.id));
const qualityIds = new Set(QUALITIES.map((q) => q.id));
const fail = (message) => { throw new Error(`存档无效：${message}`); };
const object = (v, name) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(name); return v; };
const num = (v, name, min = 0, integer = false) => {
  if (!Number.isFinite(v) || v < min || v > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(v))) fail(name);
  return v;
};
const text = (v, name) => { if (typeof v !== 'string' || !v || v.length > 200) fail(name); return v; };
const region = (v) => { if (!regionIds.has(v)) fail('未知水域'); return v; };
const quality = (v) => { if (!qualityIds.has(v)) fail('未知品质'); return v; };

// Shared by renderer and main process; no React, browser storage, aliases, or platform imports.
export function validateSave(input) {
  const s = object(input, '根对象');
  const legacy = s.schemaVersion === 1;
  const legacyAppearance = legacy || s.schemaVersion === 2;
  if (!legacyAppearance && s.schemaVersion !== STORAGE_CONFIG.schemaVersion) fail('不支持的版本，请使用对应版本应用，原存档会保留');
  const now = num(s.lastEffectiveNowMs, '逻辑时间');
  const createdAtMs = num(s.createdAtMs, '创建时间');
  if (createdAtMs > now) fail('创建时间晚于逻辑时间');
  const unlockedRegions = s.unlockedRegions;
  if (!Array.isArray(unlockedRegions) || !unlockedRegions.length || unlockedRegions.length > REGIONS.length || new Set(unlockedRegions).size !== unlockedRegions.length) fail('解锁地区');
  unlockedRegions.forEach(region);
  const homeRegion = region(s.homeRegion);
  const currentRegion = region(s.currentRegion);
  const realRegion = s.realRegion == null ? null : region(s.realRegion);
  if (!unlockedRegions.includes(homeRegion) || !unlockedRegions.includes(currentRegion) || (realRegion && !unlockedRegions.includes(realRegion))) fail('所在地区尚未解锁');
  const rodLevel = num(s.rodLevel, '鱼竿等级', 0, true);
  if (rodLevel >= RODS.length) fail('鱼竿等级越界');
  const baitLeft = num(s.baitLeft, '鱼饵余次', 0, true);
  if (baitLeft >= BAIT_CATCHES) fail('鱼饵余次越界');
  if (!Array.isArray(s.bucket) || s.bucket.length > 100000) fail('鱼篓');
  // Migration is deterministic and does not mint any asset or reset capture time.
  const legacyOrder = legacy ? [...s.bucket].sort((a, b) => a.caughtAtMs - b.caughtAtMs || (String(a.uid) < String(b.uid) ? -1 : String(a.uid) > String(b.uid) ? 1 : 0)) : [];
  const legacySequences = new Map(legacyOrder.map((fish, index) => [fish.uid, index + 1]));
  const legacyTotal = legacy ? Object.values(object(s.codex, '图鉴')).reduce((sum, entry) => sum + num(entry.catchCount, '捕获次数', 1, true), 0) : 0;
  const catchSequence = num(legacy ? Math.max(s.bucket.length, legacyTotal) : s.catchSequence, '捕获序号', 0, true);
  const randomSeed = num(legacy ? stableSeed(`v1:${createdAtMs}:${homeRegion}`) : s.randomSeed, '随机种子', 0, true);
  if (randomSeed > 0xffffffff) fail('随机种子越界');
  const ids = new Set();
  const sequences = new Set();
  const captureSequence = (value) => {
    const sequence = num(value, '鱼获序号', 1, true);
    if (sequence > catchSequence || sequences.has(sequence)) fail('鱼获序号关系');
    sequences.add(sequence);
    return sequence;
  };
  const bucket = s.bucket.map((value) => {
    const f = object(value, '鱼获');
    const uid = text(f.uid, '鱼获编号');
    if (ids.has(uid)) fail('重复鱼获编号');
    ids.add(uid);
    if (!fishIds.has(f.speciesId)) fail('未知鱼种');
    const caughtAtMs = num(f.caughtAtMs, '捕获时间');
    if (caughtAtMs > now) fail('捕获时间晚于存档逻辑时间');
    return { uid, speciesId: f.speciesId, name: FISH.find((sp) => sp.id === f.speciesId).name,
      quality: quality(f.quality), length: num(f.length, '体长'), weight: num(f.weight, '重量'),
      caughtAtMs, regionId: region(f.originRegionId || f.regionId), originRegionId: region(f.originRegionId || f.regionId),
      catchSequence: captureSequence(legacy ? legacySequences.get(uid) : f.catchSequence) };
  });
  const rawItems = legacy ? [] : s.items;
  if (!Array.isArray(rawItems) || rawItems.length > 100000) fail('物品库存');
  const items = rawItems.map((value) => {
    const item = object(value, '物品');
    const uid = text(item.uid, '物品编号');
    if (ids.has(uid)) fail('重复物品编号');
    ids.add(uid);
    if (!Object.hasOwn(ITEM_DEFINITIONS, item.type)) fail('未知物品');
    const caughtAtMs = num(item.caughtAtMs, '物品捕获时间');
    if (caughtAtMs > now) fail('物品捕获时间晚于逻辑时间');
    const base = { uid, type: item.type, caughtAtMs, originRegionId: region(item.originRegionId),
      catchSequence: captureSequence(item.catchSequence), status: item.status, repairSeed: null,
      repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null };
    if (item.type === 'waterlogged_watch') {
      base.repairSeed = num(item.repairSeed, '修表种子', 0, true);
      if (base.repairSeed > 0xffffffff) fail('修表种子越界');
      if (item.status === 'repaired') {
        const expected = watchRepairOutcome({ ...base, status: 'found' });
        if (item.repairAttempted !== true || item.repairOutcome !== expected.kind || item.salePrice !== expected.salePrice) fail('修表结果关系');
        base.repairAttempted = true;
        base.repairOutcome = expected.kind;
        base.salePrice = expected.salePrice;
        base.repairedAtMs = num(item.repairedAtMs, '修理时间');
        if (base.repairedAtMs < caughtAtMs || base.repairedAtMs > now) fail('修理时间关系');
        base.repairCommandId = text(item.repairCommandId, '修理凭据');
      } else if (item.status !== 'found') fail('物品状态');
    } else if (item.status !== 'found' || item.repairSeed !== null) fail('物品状态');
    if (base.status === 'found' && (item.repairAttempted !== false || item.repairOutcome !== null || item.salePrice !== null || item.repairedAtMs !== null || item.repairCommandId !== null)) fail('未修理物品字段');
    return base;
  });
  let saleBuff = null;
  if (!legacy && s.saleBuff != null) {
    const buff = object(s.saleBuff, '秘籍状态');
    const activationCatchSequence = num(buff.activationCatchSequence, '秘籍使用边界', 0, true);
    const remaining = num(buff.remaining, '秘籍剩余次数', 0, true);
    const sourceItemUid = text(buff.sourceItemUid, '秘籍凭据');
    if (activationCatchSequence > catchSequence || remaining > LOOT_CONFIG.buffCharges || ids.has(sourceItemUid) || buff.version !== LOOT_CONFIG.version) fail('秘籍状态关系');
    saleBuff = { version: LOOT_CONFIG.version, activationCatchSequence, remaining, sourceItemUid };
  }
  const arrivalSequence = num(legacy ? 0 : s.arrivalSequence, '到达事件序号', 0, true);
  const arrivalConsumedSequence = num(legacy ? 0 : s.arrivalConsumedSequence, '到达消费水位', 0, true);
  let arrivalEvent = null;
  if (!legacy && s.arrivalEvent != null) {
    const event = object(s.arrivalEvent, '到达事件');
    const sequence = num(event.sequence, '到达序号', 1, true);
    if (sequence !== arrivalSequence) fail('到达序号关系');
    arrivalEvent = { id: text(event.id, '到达凭据'), sequence, regionId: region(event.regionId) };
  }
  if (arrivalConsumedSequence > arrivalSequence || (arrivalSequence > 0 && !arrivalEvent)) fail('到达消费水位关系');
  const codex = {};
  for (const [id, value] of Object.entries(object(s.codex, '图鉴'))) {
    if (!fishIds.has(id)) fail('未知图鉴鱼种');
    const c = object(value, '图鉴记录');
    const firstCaughtAtMs = num(c.firstCaughtAtMs, '首次捕获时间');
    if (firstCaughtAtMs > now) fail('首获时间晚于逻辑时间');
    codex[id] = { maxLength: num(c.maxLength, '最长'), maxWeight: num(c.maxWeight, '最重'),
      bestQuality: quality(c.bestQuality), firstCaughtAtMs, catchCount: num(c.catchCount, '捕获次数', 1, true) };
  }
  let travel = null;
  if (s.travel != null) {
    const t = object(s.travel, '航程');
    const fromId = region(t.fromId), toId = region(t.toId);
    const departAtMs = num(t.departAtMs, '起飞时间'), arriveAtMs = num(t.arriveAtMs, '抵达时间');
    if (fromId === toId || fromId !== currentRegion || departAtMs > now || arriveAtMs <= departAtMs || !Number.isSafeInteger(arriveAtMs)) fail('航程时间或地区关系');
    travel = { id: text(t.id, '航程编号'), fromId, toId, departAtMs, arriveAtMs,
      farePaid: num(t.farePaid, '已付票价', 0, true), routesVersion: num(t.routesVersion, '航线版本', 1, true) };
  }
  const history = s.recentCommittedCommandIds;
  if (!Array.isArray(history) || history.length > STORAGE_CONFIG.commandHistorySize || new Set(history).size !== history.length) fail('命令记录');
  history.forEach((id) => text(id, '命令编号'));
  const lastCommittedCommandId = s.lastCommittedCommandId == null ? null : text(s.lastCommittedCommandId, '最后命令');
  if ((history.at(-1) || null) !== lastCommittedCommandId) fail('最后命令与记录不一致');
  const rawSettings = object(s.settings, '设置');
  const settings = { ...(legacy ? DEFAULT_SETTINGS : {}), ...rawSettings };
  if (legacyAppearance) {
    // Old schemas never owned these fields; ignore lookalike injected values.
    settings.sceneWeatherMode = DEFAULT_SETTINGS.sceneWeatherMode;
    settings.manualWeather = DEFAULT_SETTINGS.manualWeather;
  }
  if (typeof settings.onlineEnhancements !== 'boolean' || typeof settings.alwaysOnTop !== 'boolean') fail('设置字段');
  if (typeof settings.biteSoundEnabled !== 'boolean' || typeof settings.backgroundBiteSound !== 'boolean') fail('音频设置');
  const biteSoundVolume = num(settings.biteSoundVolume, '音量', 0, true);
  if (biteSoundVolume > 100) fail('音量越界');
  if (!SCENE_WEATHER_MODES.some((entry) => entry.id === settings.sceneWeatherMode) || !MANUAL_WEATHER_OPTIONS.some((entry) => entry.id === settings.manualWeather)) fail('场景天气设置');
  const appearance = legacyAppearance ? { ownedProducts: [], equipped: { ...DEFAULT_APPEARANCE.equipped } } : object(s.appearance, '美术外观');
  if (!Array.isArray(appearance.ownedProducts) || appearance.ownedProducts.length > APPEARANCE_PRODUCTS.length ||
      new Set(appearance.ownedProducts).size !== appearance.ownedProducts.length ||
      appearance.ownedProducts.some((id) => !APPEARANCE_PRODUCTS.some((entry) => entry.id === id))) fail('美术商品所有权');
  object(appearance.equipped, '已装配外观');
  if (Object.keys(appearance.equipped).some((slot) => !Object.hasOwn(APPEARANCE_OPTIONS, slot))) fail('外观分类');
  for (const slot of Object.keys(APPEARANCE_OPTIONS)) {
    if (!ownsAppearanceStyle(appearance, slot, appearance.equipped[slot])) fail('外观尚未拥有或分类错误');
  }
  return {
    schemaVersion: STORAGE_CONFIG.schemaVersion, gameVersion: GAME_VERSION, revision: num(s.revision, '修订号', 0, true),
    createdAtMs, lastEffectiveNowMs: now, homeRegion, currentRegion, realRegion, unlockedRegions: [...unlockedRegions],
    coins: num(s.coins, '金币', 0, true), rodLevel, baitCount: num(s.baitCount, '鱼饵份数', 0, true), baitLeft,
    pityCounter: num(s.pityCounter, '保底次数', 0, true), bucket, codex, travel, items, catchSequence, randomSeed, saleBuff,
    arrivalSequence, arrivalConsumedSequence, arrivalEvent,
    appearance: { ownedProducts: [...appearance.ownedProducts], equipped: { ...appearance.equipped } },
    settings: { onlineEnhancements: settings.onlineEnhancements, alwaysOnTop: settings.alwaysOnTop,
      biteSoundEnabled: settings.biteSoundEnabled, biteSoundVolume, backgroundBiteSound: settings.backgroundBiteSound,
      sceneWeatherMode: settings.sceneWeatherMode, manualWeather: settings.manualWeather },
    lastCommittedCommandId, recentCommittedCommandIds: [...history],
  };
}

// Generic CJS repository callers can discover the shared validator's schema.
validateSave.supportedSchemaVersion = STORAGE_CONFIG.schemaVersion;
