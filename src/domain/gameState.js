import { DEFAULT_REGION, RODS, BAIT_COST, BAIT_CATCHES, REGIONS, QUALITIES } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { DEFAULT_SETTINGS, GAME_VERSION, STORAGE_CONFIG } from '../config/storage.js';
import { quoteRoute } from './routes.js';
import { quoteSaleFish, quoteBucketSale } from './market.js';
import { validateSave } from './saveSchema.js';
import { LOOT_CONFIG } from '../config/lootConfig.js';
import { catchOutcome, watchRepairOutcome, itemSalePrice } from './loot.js';
import { DEFAULT_APPEARANCE, appearanceProduct, ownsAppearanceStyle } from '../config/appearance.js';

const requireRegion = (id) => { if (!REGIONS.some((r) => r.id === id)) throw new Error('未知水域'); return id; };
const rank = (id) => QUALITIES.find((q) => q.id === id)?.rank ?? -1;

export function createNewGame(regionId = DEFAULT_REGION, nowMs = Date.now(), options = {}) {
  requireRegion(regionId);
  const randomSeed = options.randomSeed ?? globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return validateSave({ schemaVersion: STORAGE_CONFIG.schemaVersion, gameVersion: GAME_VERSION, revision: 0, createdAtMs: nowMs,
    lastEffectiveNowMs: nowMs, homeRegion: regionId, currentRegion: regionId, realRegion: null,
    unlockedRegions: [regionId], coins: FISHING_CONFIG.startCoins, rodLevel: 0,
    baitCount: FISHING_CONFIG.startBait, baitLeft: 0, bucket: [], codex: {}, pityCounter: 0, travel: null,
    items: [], catchSequence: 0, randomSeed, saleBuff: null, arrivalSequence: 0, arrivalConsumedSequence: 0, arrivalEvent: null,
    appearance: { ownedProducts: [], equipped: { ...DEFAULT_APPEARANCE.equipped } },
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
      next.settings = { ...state.settings, sceneWeatherMode: 'fishing' };
      next.arrivalSequence = state.arrivalSequence + 1;
      next.arrivalEvent = { id: command.id, regionId: next.currentRegion, sequence: next.arrivalSequence };
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
      next.settings = { ...state.settings, sceneWeatherMode: 'fishing' };
      next.unlockedRegions = [...new Set([...state.unlockedRegions, next.currentRegion])];
      next.arrivalSequence = state.arrivalSequence + 1;
      next.arrivalEvent = { id: state.travel.id, regionId: next.currentRegion, sequence: next.arrivalSequence };
      next.travel = null;
      break;
    case 'CONSUME_ARRIVAL':
      if (!Number.isSafeInteger(command.sequence) || command.sequence > state.arrivalSequence || command.sequence < 1) throw new Error('到达事件无效');
      if (command.sequence <= state.arrivalConsumedSequence) return state;
      next.arrivalConsumedSequence = command.sequence;
      break;
    case 'CATCH': {
      onGround();
      if (command.expectedCatchSequence !== state.catchSequence + 1 || Object.hasOwn(command, 'fish') || Object.hasOwn(command, 'item')) throw new Error('收竿事件已处理或无效，请等待新鱼讯');
      if (command.bestClick !== undefined && typeof command.bestClick !== 'boolean') throw new Error('收竿时机无效');
      const outcome = catchOutcome(state, { bestClick: command.bestClick });
      next.catchSequence += 1;
      if (outcome.kind === 'item') {
        next.items = [...state.items, { ...outcome.item, caughtAtMs: now, originRegionId: state.currentRegion,
          repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null }];
        break;
      }
      const fish = outcome.fish;
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
      const quote = quoteSaleFish(fish, state, now);
      next.coins += quote.price;
      if (quote.buffApplied) next.saleBuff = { ...state.saleBuff, remaining: state.saleBuff.remaining - 1 };
      next.bucket = state.bucket.filter((f) => f.uid !== command.uid);
      break;
    }
    case 'SELL_ALL': {
      onGround();
      if (!state.bucket.length) return state;
      const quote = quoteBucketSale(state, now);
      next.coins += quote.price;
      if (state.saleBuff) next.saleBuff = { ...state.saleBuff, remaining: quote.buffRemaining };
      next.bucket = [];
      break;
    }
    case 'SELL_ITEM': {
      onGround();
      const item = state.items.find((entry) => entry.uid === command.uid);
      if (!item) throw new Error('这件物品已经处理或不存在');
      next.coins += itemSalePrice(item);
      next.items = state.items.filter((entry) => entry.uid !== item.uid);
      break;
    }
    case 'REPAIR_ITEM': {
      onGround();
      const item = state.items.find((entry) => entry.uid === command.uid);
      if (!item) throw new Error('这件物品已经处理或不存在');
      if (item.type !== 'waterlogged_watch' || item.status !== 'found') throw new Error('这块表已经修过或无法修理');
      if (state.coins < LOOT_CONFIG.repairCost) throw new Error('金币不足，修理需要500金币');
      const result = watchRepairOutcome(item);
      next.coins -= LOOT_CONFIG.repairCost;
      next.items = state.items.map((entry) => entry.uid === item.uid ? { ...item, status: 'repaired',
        repairAttempted: true, repairOutcome: result.kind, salePrice: result.salePrice, repairedAtMs: now, repairCommandId: command.id } : entry);
      break;
    }
    case 'USE_ITEM': {
      onGround();
      const item = state.items.find((entry) => entry.uid === command.uid);
      if (!item || item.type !== 'influencer_manual') throw new Error('这本秘籍已经使用或不存在');
      if (state.saleBuff?.remaining > 0) throw new Error('先用完当前秘籍的加成，新秘籍会为你保留');
      next.items = state.items.filter((entry) => entry.uid !== item.uid);
      next.saleBuff = { version: LOOT_CONFIG.version, activationCatchSequence: state.catchSequence,
        remaining: LOOT_CONFIG.buffCharges, sourceItemUid: item.uid };
      break;
    }
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
    case 'BUY_APPEARANCE': {
      onGround();
      const product = appearanceProduct(command.productId);
      if (!product) throw new Error('未知美术商品');
      // Ownership, not the bounded command history, prevents repeated charges.
      if (state.appearance.ownedProducts.includes(product.id)) return state;
      if (state.coins < product.price) throw new Error('金币不足');
      next.coins -= product.price;
      next.appearance = { ...state.appearance, ownedProducts: [...state.appearance.ownedProducts, product.id] };
      break;
    }
    case 'EQUIP_APPEARANCE': {
      onGround();
      if (!ownsAppearanceStyle(state.appearance, command.slot, command.styleId)) throw new Error('请先拥有对应美术外观');
      if (state.appearance.equipped[command.slot] === command.styleId) return state;
      next.appearance = { ...state.appearance, equipped: { ...state.appearance.equipped, [command.slot]: command.styleId } };
      break;
    }
    case 'SETTINGS': {
      const patch = command.patch || {};
      if (Object.keys(patch).some((key) => !Object.hasOwn(DEFAULT_SETTINGS, key))) throw new Error('未知设置');
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
