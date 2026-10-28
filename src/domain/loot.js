import { FISH, REGIONS } from '../lib/gameConfig.js';
import { fishQualityWeights } from '../config/balance.js';
import { LOOT_CONFIG, ITEM_DEFINITIONS } from '../config/lootConfig.js';

export function stableSeed(value) {
  let seed = 2166136261;
  for (const character of String(value)) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

// Each named stream is independent: dialogue, number of price previews and retry IDs
// cannot advance asset randomness. Persisted seed + capture sequence fixes the result.
export function assetRandom(seed, namespace) {
  let value = stableSeed(`${seed}:${namespace}`);
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ value >>> 15, value | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

const unit = (value) => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机输入必须在[0,1)内');
  return value;
};
const slotChoice = (slot, denominator, weights) => {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= denominator) throw new Error('随机槽位越界');
  let boundary = 0;
  for (const [kind, weight] of Object.entries(weights)) {
    boundary += weight;
    if (slot < boundary) return kind;
  }
  throw new Error('掉落权重不完整');
};
export const lootKindForSlot = (slot) => slotChoice(slot, LOOT_CONFIG.denominator, LOOT_CONFIG.weights);
export const repairKindForSlot = (slot) => slotChoice(slot, LOOT_CONFIG.repairDenominator, LOOT_CONFIG.repairWeights);
export const integerInRange = ([minimum, maximum], value) => minimum + Math.floor(unit(value) * (maximum - minimum + 1));

// Rejection sampling avoids modulo/float-bin bias: all advertised integer slots
// have the same number of uint32 values, including the one 10000-coin repair slot.
export function randomIntegerBelow(random, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 0x100000000) throw new Error('随机区间无效');
  const limit = Math.floor(0x100000000 / maximum) * maximum;
  for (;;) {
    const value = Math.floor(unit(random()) * 0x100000000);
    if (value < limit) return value % maximum;
  }
}

export function repairForSlot(slot, priceUnit = 0) {
  const kind = repairKindForSlot(slot);
  const salePrice = kind === 'ordinary' ? integerInRange(LOOT_CONFIG.ordinaryRange, priceUnit)
    : kind === 'luxury' ? integerInRange(LOOT_CONFIG.luxuryRange, priceUnit)
      : kind === 'top' ? LOOT_CONFIG.topPrice : LOOT_CONFIG.failedPrice;
  return { kind, salePrice };
}

function weighted(pairs, value) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = unit(value) * total;
  for (const [id, weight] of pairs) {
    threshold -= weight;
    if (threshold < 0) return id;
  }
  return pairs.at(-1)[0];
}

const roundedRange = (range, value, precision) => {
  const factor = 10 ** precision;
  return Math.round((range[0] + unit(value) * (range[1] - range[0])) * factor) / factor;
};

export function catchOutcome(state, { active = false, useBait, attemptSeed } = {}) {
  const sequence = state.catchSequence + 1;
  const prefix = attemptSeed == null ? `${state.randomSeed}:catch:${sequence}` : `${attemptSeed}:catch:${sequence}`;
  const random = (channel) => assetRandom(prefix, channel)();
  const kind = active ? 'fish' : lootKindForSlot(randomIntegerBelow(assetRandom(prefix, 'loot-kind'), LOOT_CONFIG.denominator));
  const uid = `catch:${state.randomSeed}:${sequence}`;
  if (kind !== 'fish') return { kind: 'item', item: {
    uid, type: kind, status: 'found', catchSequence: sequence,
    repairSeed: kind === 'waterlogged_watch' ? stableSeed(`${prefix}:watch-repair`) : null,
  } };
  const habitat = REGIONS.find((region) => region.id === state.currentRegion);
  const speciesId = weighted(habitat.fish, random('fish-species'));
  const species = FISH.find((fish) => fish.id === speciesId);
  const bait = !active && (useBait ?? state.fishing?.useBait ?? false) && (state.baitLeft > 0 || state.baitCount > 0);
  const weights = fishQualityWeights(species, state.currentRegion, { bait, pity: active ? 0 : state.pityCounter, active });
  return { kind: 'fish', fish: {
    uid, speciesId, name: species.name, quality: weighted(weights, random('fish-quality')),
    length: roundedRange(species.len, random('fish-length'), 1), weight: roundedRange(species.wt, random('fish-weight'), 2),
    regionId: state.currentRegion, originRegionId: state.currentRegion, catchSequence: sequence,
  } };
}

export function watchRepairOutcome(item) {
  if (item.type !== 'waterlogged_watch' || item.status !== 'found') throw new Error('这块表已经修过或无法修理');
  const prefix = `${item.repairSeed}:${item.uid}`;
  const kind = repairKindForSlot(randomIntegerBelow(assetRandom(prefix, 'repair-kind'), LOOT_CONFIG.repairDenominator));
  const range = kind === 'ordinary' ? LOOT_CONFIG.ordinaryRange : kind === 'luxury' ? LOOT_CONFIG.luxuryRange : null;
  const salePrice = range ? range[0] + randomIntegerBelow(assetRandom(prefix, 'repair-price'), range[1] - range[0] + 1)
    : kind === 'top' ? LOOT_CONFIG.topPrice : LOOT_CONFIG.failedPrice;
  return { kind, salePrice };
}

export function itemSalePrice(item) {
  if (!ITEM_DEFINITIONS[item?.type]) throw new Error('未知物品');
  if (item.type === 'influencer_manual') throw new Error('秘籍只能使用，不能出售');
  if (item.type === 'old_shoe') return LOOT_CONFIG.shoePrice;
  if (item.type !== 'waterlogged_watch') return ITEM_DEFINITIONS[item.type].price;
  return item.status === 'found' ? LOOT_CONFIG.unrepairedWatchPrice : item.salePrice;
}

export function itemName(item) {
  if (item.type !== 'waterlogged_watch' || item.status === 'found') return ITEM_DEFINITIONS[item.type]?.name || '未知物品';
  return { failed: '没修好的手表', ordinary: '普通机械表', luxury: '名贵机械表', top: '顶级机械表' }[item.repairOutcome] || '手表';
}
