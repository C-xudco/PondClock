import { DEFAULT_REGION, RODS, BAIT_COST, BAIT_CATCHES, REGIONS, QUALITIES } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { DEFAULT_SETTINGS, GAME_VERSION, STORAGE_CONFIG } from '../config/storage.js';
import { quoteRoute } from './routes.js';
import { quoteFish } from './market.js';
import { validateSave } from './saveSchema.js';

const requireRegion = (id) => { if (!REGIONS.some((r) => r.id === id)) throw new Error('未知水域'); return id; };
const rank = (id) => QUALITIES.find((q) => q.id === id)?.rank ?? -1;

export function createNewGame(regionId = DEFAULT_REGION, nowMs = Date.now()) {
  requireRegion(regionId);
  return validateSave({ schemaVersion: STORAGE_CONFIG.schemaVersion, gameVersion: GAME_VERSION, revision: 0, createdAtMs: nowMs,
    lastEffectiveNowMs: nowMs, homeRegion: regionId, currentRegion: regionId, realRegion: null,
    unlockedRegions: [regionId], coins: FISHING_CONFIG.startCoins, rodLevel: 0,
    baitCount: FISHING_CONFIG.startBait, baitLeft: 0, bucket: [], codex: {}, pityCounter: 0, travel: null,
    settings: { ...DEFAULT_SETTINGS }, lastCommittedCommandId: null, recentCommittedCommandIds: [] });
}

export function applyCommand(state, command, nowMs) {
  if (!command || typeof command.id !== 'string' || !command.id || command.id.length > 200) throw new Error('命令编号无效');
  if (state.recentCommittedCommandIds.includes(command.id)) return state;
  if (!Number.isFinite(nowMs)) throw new Error('时间无效');
  const now = Math.max(nowMs, state.lastEffectiveNowMs);
  let next = { ...state };
  const onGround = () => { if (state.travel) throw new Error('飞行途中，请抵达后操作'); };
  switch (command.type) {
    case 'GEO_VISIT': {
      const id = requireRegion(command.regionId);
      if (state.realRegion === id && state.unlockedRegions.includes(id)) return state;
      next.realRegion = id;
      next.unlockedRegions = [...new Set([...state.unlockedRegions, id])];
      break;
    }
    case 'REAL_VISIT':
      onGround();
      if (!state.realRegion) throw new Error('本次尚未取得有效 IP 地区');
      if (state.currentRegion === state.realRegion) return state;
      next.currentRegion = state.realRegion;
      break;
    case 'START_TRAVEL': {
      onGround();
      const route = quoteRoute(state.currentRegion, command.toId);
      if (!route) throw new Error('请选择其他有效水域');
      if (state.coins < route.price) throw new Error('金币不足');
      next.coins -= route.price;
      next.travel = { id: command.id, fromId: state.currentRegion, toId: route.toId, departAtMs: now,
        arriveAtMs: now + route.durationMs, farePaid: route.price, routesVersion: route.ruleVersion };
      break;
    }
    case 'ARRIVE':
      if (!state.travel || now < state.travel.arriveAtMs) return state;
      next.currentRegion = state.travel.toId;
      next.unlockedRegions = [...new Set([...state.unlockedRegions, next.currentRegion])];
      next.travel = null;
      break;
    case 'CATCH': {
      onGround();
      const fish = command.fish;
      const habitat = REGIONS.find((r) => r.id === state.currentRegion);
      if (!fish || fish.regionId !== state.currentRegion || !habitat.fish.some(([id]) => id === fish.speciesId) || state.bucket.some((f) => f.uid === fish.uid)) throw new Error('鱼获无效');
      const captured = { ...fish, caughtAtMs: now, originRegionId: state.currentRegion };
      next.bucket = [...state.bucket, captured];
      const prev = state.codex[fish.speciesId];
      next.codex = { ...state.codex, [fish.speciesId]: { maxLength: Math.max(prev?.maxLength || 0, fish.length),
        maxWeight: Math.max(prev?.maxWeight || 0, fish.weight), bestQuality: rank(prev?.bestQuality) > rank(fish.quality) ? prev.bestQuality : fish.quality,
        firstCaughtAtMs: prev?.firstCaughtAtMs ?? now, catchCount: (prev?.catchCount || 0) + 1 } };
      next.pityCounter = ['epic', 'legendary'].includes(fish.quality) ? 0 : state.pityCounter + 1;
      if (state.baitLeft > 0) next.baitLeft -= 1;
      else if (state.baitCount > 0) { next.baitCount -= 1; next.baitLeft = BAIT_CATCHES - 1; }
      break;
    }
    case 'SELL_ONE': {
      onGround();
      const fish = state.bucket.find((f) => f.uid === command.uid);
      if (!fish) throw new Error('这条鱼已经卖出或不存在');
      next.coins += quoteFish(fish, state.currentRegion, now).price;
      next.bucket = state.bucket.filter((f) => f.uid !== command.uid);
      break;
    }
    case 'SELL_ALL':
      onGround();
      if (!state.bucket.length) return state;
      next.coins += state.bucket.reduce((sum, f) => sum + quoteFish(f, state.currentRegion, now).price, 0);
      next.bucket = [];
      break;
    case 'BUY_BAIT':
      onGround();
      if (state.coins < BAIT_COST) throw new Error('金币不足');
      next.coins -= BAIT_COST;
      next.baitCount += 1;
      break;
    case 'BUY_ROD': {
      onGround();
      const rod = RODS[state.rodLevel + 1];
      if (!rod) throw new Error('已经是最高级鱼竿');
      if (state.coins < rod.cost) throw new Error('金币不足');
      next.coins -= rod.cost;
      next.rodLevel += 1;
      break;
    }
    case 'SETTINGS': {
      const patch = command.patch || {};
      if (Object.keys(patch).some((key) => !['onlineEnhancements', 'alwaysOnTop'].includes(key))) throw new Error('未知设置');
      next.settings = { ...state.settings, ...patch };
      break;
    }
    default: throw new Error('未知命令');
  }
  next.revision = state.revision + 1;
  next.lastEffectiveNowMs = now;
  next.lastCommittedCommandId = command.id;
  next.recentCommittedCommandIds = [...state.recentCommittedCommandIds, command.id].slice(-STORAGE_CONFIG.commandHistorySize);
  return validateSave(next);
}
