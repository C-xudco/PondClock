import { FISH, REGIONS, QUALITIES, RODS, BAIT_CATCHES } from '../lib/gameConfig.js';
import { GAME_VERSION, STORAGE_CONFIG } from '../config/storage.js';

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
  if (s.schemaVersion !== STORAGE_CONFIG.schemaVersion) fail('不支持的版本，请使用对应版本应用，原存档会保留');
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
  const ids = new Set();
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
      caughtAtMs, regionId: region(f.originRegionId || f.regionId), originRegionId: region(f.originRegionId || f.regionId) };
  });
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
  const settings = object(s.settings, '设置');
  if (typeof settings.onlineEnhancements !== 'boolean' || typeof settings.alwaysOnTop !== 'boolean') fail('设置字段');
  return {
    schemaVersion: s.schemaVersion, gameVersion: GAME_VERSION, revision: num(s.revision, '修订号', 0, true),
    createdAtMs, lastEffectiveNowMs: now, homeRegion, currentRegion, realRegion, unlockedRegions: [...unlockedRegions],
    coins: num(s.coins, '金币', 0, true), rodLevel, baitCount: num(s.baitCount, '鱼饵份数', 0, true), baitLeft,
    pityCounter: num(s.pityCounter, '保底次数', 0, true), bucket, codex, travel,
    settings: { onlineEnhancements: settings.onlineEnhancements, alwaysOnTop: settings.alwaysOnTop },
    lastCommittedCommandId, recentCommittedCommandIds: [...history],
  };
}
