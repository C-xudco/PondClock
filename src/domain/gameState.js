import { DEFAULT_REGION, BAIT_COST, REGIONS } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { DEFAULT_SETTINGS, GAME_VERSION, STORAGE_CONFIG } from '../config/storage.js';
import { quoteRoute } from './routes.js';
import { quoteSaleFish, quoteBucketSale } from './market.js';
import { validateSave } from './saveSchema.js';
import { LOOT_CONFIG } from '../config/lootConfig.js';
import { watchRepairOutcome, itemSalePrice } from './loot.js';
import { DEFAULT_APPEARANCE, appearanceProduct, ownsAppearanceStyle } from '../config/appearance.js';
import { createEditionFields } from './editionState.js';
import { applyEditionCommand, quoteTicketPayment, stopFishing } from './editionGameplay.js';

const requireRegion = (id) => { if (!REGIONS.some((r) => r.id === id)) throw new Error('未知水域'); return id; };

export function createNewGame(regionId = DEFAULT_REGION, nowMs = Date.now(), options = {}) {
  requireRegion(regionId);
  const randomSeed = options.randomSeed ?? globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return validateSave({ schemaVersion: STORAGE_CONFIG.schemaVersion, gameVersion: GAME_VERSION, revision: 0, createdAtMs: nowMs,
    lastEffectiveNowMs: nowMs, homeRegion: regionId, currentRegion: regionId, realRegion: null,
    unlockedRegions: [regionId], coins: FISHING_CONFIG.startCoins, rodLevel: 0,
    baitCount: FISHING_CONFIG.startBait, baitLeft: 0, bucket: [], codex: {}, pityCounter: 0, travel: null,
    items: [], catchSequence: 0, randomSeed, saleBuff: null, arrivalSequence: 0, arrivalConsumedSequence: 0, arrivalEvent: null,
    appearance: { ownedProducts: [], equipped: { ...DEFAULT_APPEARANCE.equipped } },
    settings: { ...DEFAULT_SETTINGS }, lastCommittedCommandId: null, recentCommittedCommandIds: [], ...createEditionFields() });
}

export function applyCommand(state, command, nowMs) {
  if (!command || typeof command.id !== 'string' || !command.id || command.id.length > 200) throw new Error('命令编号无效');
  if (state.recentCommittedCommandIds.includes(command.id)) return state;
  if (!Number.isFinite(nowMs)) throw new Error('时间无效');
  const now = Math.max(nowMs, state.lastEffectiveNowMs);
  let next = { ...state };
  const onGround = () => { if (state.travel) throw new Error('飞行途中，请抵达后操作'); };
  const edition = applyEditionCommand(state, command, now);
  if (edition !== undefined) {
    if (edition === state) return state;
    next = edition;
  } else switch (command.type) {
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
      next = stopFishing(next);
      next.currentRegion = state.realRegion;
      next.settings = { ...state.settings, sceneWeatherMode: 'fishing' };
      next.arrivalSequence = state.arrivalSequence + 1;
      next.arrivalEvent = { id: command.id, regionId: next.currentRegion, sequence: next.arrivalSequence };
      break;
    case 'START_TRAVEL': {
      onGround();
      if (state.travelReceiptIds.includes(command.id)) return state;
      const route = quoteRoute(state.currentRegion, command.toId);
      if (!route) throw new Error('请选择其他有效水域');
      const quote = quoteTicketPayment(state, route, command.payment);
      if (state.coins < quote.farePaid) throw new Error('金币不足');
      next = stopFishing(next);
      next.coins -= quote.farePaid;
      next.freeTravelTickets -= Number(quote.payment === 'free');
      if (quote.discountSourceItemUid) next.discounts = { ...state.discounts, ticket: null };
      next.travelReceiptIds = [...state.travelReceiptIds, command.id];
      next.travel = { id: command.id, fromId: state.currentRegion, toId: route.toId, departAtMs: now,
        arriveAtMs: now + route.durationMs, farePaid: quote.farePaid, routesVersion: route.ruleVersion,
        baseFare: quote.baseFare, payment: quote.payment, discountSourceItemUid: quote.discountSourceItemUid };
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
    case 'CATCH': throw new Error('收竿事件无效，请使用当前鱼讯收鱼');
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
      if (!item) throw new Error('这件道具已经使用或不存在');
      if (item.type === 'influencer_manual') {
        if (state.saleBuff?.remaining > 0) throw new Error('先用完当前秘籍的加成，新秘籍会为你保留');
        next.saleBuff = { version: LOOT_CONFIG.version, activationCatchSequence: state.catchSequence,
          remaining: LOOT_CONFIG.buffCharges, sourceItemUid: item.uid };
      } else if (item.type === 'sealed_bait_box') next.baitCount += 1;
      else if (['ferry_token', 'scratched_compass'].includes(item.type)) {
        const key = item.type === 'ferry_token' ? 'activeRod' : 'ticket';
        if (state.discounts[key]) throw new Error('同类九折优惠尚未使用，第二件道具会保留');
        next.discounts = { ...state.discounts, [key]: { sourceItemUid: item.uid } };
      } else throw new Error('这件物品可收藏或出售');
      next.items = state.items.filter((entry) => entry.uid !== item.uid);
      break;
    }
    case 'BUY_BAIT':
      onGround();
      if (state.coins < BAIT_COST) throw new Error('金币不足');
      next.coins -= BAIT_COST;
      next.baitCount += 1;
      break;
    case 'BUY_ROD': throw new Error('V2.0.0已移除鱼竿等级升级，主动竿和外观可在商店购买');
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
