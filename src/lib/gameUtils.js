import {
  FISH,
  REGIONS,
  QUALITIES,
  PROVINCE_TO_REGION,
  PITY_THRESHOLD,
  DEFAULT_REGION,
} from "./gameConfig.js";
import { FISHING_CONFIG } from "../config/fishing.js";
import { quoteFish } from "../domain/market.js";

// ===== 基础随机与查表 =====
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export const fishById = (id) => FISH.find((f) => f.id === id) || null;
export const regionById = (id) => REGIONS.find((r) => r.id === id) || null;
export const qualityById = (id) => QUALITIES.find((q) => q.id === id) || QUALITIES[0];

// 通用加权随机：[值, 权重] 数组；权重全为 0 / 空数组时返回最后一项或 undefined
export function weightedPick(pairs) {
  if (!pairs || pairs.length === 0) return undefined;
  const total = pairs.reduce((s, p) => s + (Number(p[1]) > 0 ? Number(p[1]) : 0), 0);
  if (!(total > 0)) return pairs[pairs.length - 1][0];
  let roll = Math.random() * total;
  for (const [value, w] of pairs) {
    const weight = Number(w) > 0 ? Number(w) : 0;
    if (weight <= 0) continue;
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

// ===== 随机产出引擎：种类 → 品质 → 个体尺寸（三套分布互不干扰）=====
// mods: { qualityBonus: 鱼竿+鱼饵加成, bestClickBonus: 预留-最佳区间加成, pity: 保底计数 }
// 加成只提升稀有权重（普通档不动），每点加成对应的权重增量见 QUALITY_BONUS_RATE。
const QUALITY_BONUS_RATE = FISHING_CONFIG.qualityBonusRate;
const PITY_WEIGHT_MULT = FISHING_CONFIG.pityWeightMultiplier;

const sampleRange = (range, digits) => {
  const [min, max] = Array.isArray(range) && range.length === 2 ? range : [0, 0];
  const v = min + Math.random() * (max - min);
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
};

export function rollFish(regionId, mods = {}) {
  const region = regionById(regionId) || regionById(DEFAULT_REGION) || REGIONS[0];
  const species = fishById(weightedPick(region.fish)) || FISH[0];

  const bonus = Math.max(0, Number(mods.qualityBonus) || 0) + Math.max(0, Number(mods.bestClickBonus) || 0);
  let qw = QUALITIES.map((q) => [q.id, Math.max(0, Number(species.qw?.[q.id]) || 0)]);
  if (bonus > 0) {
    qw = qw.map(([q, w]) => (QUALITY_BONUS_RATE[q] ? [q, w + bonus * QUALITY_BONUS_RATE[q]] : [q, w]));
  }
  // 保底节奏：距上次高品质达到阈值时，大幅提升史诗/传说权重
  if ((Number(mods.pity) || 0) >= PITY_THRESHOLD) {
    qw = qw.map(([q, w]) => (q === "epic" || q === "legendary" ? [q, w * PITY_WEIGHT_MULT] : [q, w]));
  }
  const quality = weightedPick(qw) || "common";

  return {
    uid: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    speciesId: species.id,
    name: species.name,
    quality,
    length: sampleRange(species.len, 1),
    weight: sampleRange(species.wt, 2),
    caughtAtMs: Date.now(),
    regionId: region.id,
  };
}

// 卖价 = 基础价 × 品质倍率 × 个体重量系数（中等体重约 1.3 倍）
export const calcSellPrice = (fish, regionId = fish?.regionId || DEFAULT_REGION, nowMs = Date.now()) => quoteFish(fish, regionId, nowMs).price;

// 图鉴更新：只记三项最佳 + 首获时间 + 累计次数，与资产解耦
export function updateCodex(codex, fish) {
  const prev = codex[fish.speciesId] || {
    maxLength: 0, maxWeight: 0, bestQuality: "common",
    firstCaughtAtMs: fish.caughtAtMs, catchCount: 0,
  };
  const better = qualityById(fish.quality).rank > qualityById(prev.bestQuality).rank;
  return {
    ...codex,
    [fish.speciesId]: {
      maxLength: Math.max(prev.maxLength, fish.length),
      maxWeight: Math.max(prev.maxWeight, fish.weight),
      bestQuality: better ? fish.quality : prev.bestQuality,
      firstCaughtAtMs: prev.firstCaughtAtMs,
      catchCount: prev.catchCount + 1,
    },
  };
}

// ===== 省份 → 区域 =====
const PROVINCE_SUFFIXES = [
  "特别行政区", "维吾尔自治区", "壮族自治区", "回族自治区", "自治区", "省", "市",
];

function normalizeProvinceToken(token) {
  if (typeof token !== "string") return "";
  let s = token.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  for (const suffix of PROVINCE_SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) {
      s = s.slice(0, -suffix.length);
      break;
    }
  }
  return s;
}

// 子串匹配只用"中文键或较长的拼音键"，避免两位 ISO 省码（如 hb / hn）误伤城市名
const isSubstringKey = (key) => /[\u4e00-\u9fa5]/.test(key) || key.length >= 4;
const PROVINCE_KEYS_BY_LENGTH = Object.keys(PROVINCE_TO_REGION)
  .filter(isSubstringKey)
  .sort((a, b) => b.length - a.length);

// 支持多参数（如 regionForProvince("浙江", "杭州")），取第一个能识别的 token；
// 支持全称/简称/拼音/带城市后缀的字符串；无法识别时回落到默认本地水域。
export function matchRegionForProvince(...tokens) {
  const flat = tokens.flat(Infinity);
  for (const token of flat) {
    if (typeof token !== "string") continue;
    const raw = token.trim().toLowerCase();
    if (!raw) continue;
    const normalized = normalizeProvinceToken(raw).replace(/^cn[-_]/, "");
    const candidates = [raw, normalized].filter(Boolean);
    for (const candidate of candidates) {
      if (PROVINCE_TO_REGION[candidate]) return PROVINCE_TO_REGION[candidate];
    }
    const hit = PROVINCE_KEYS_BY_LENGTH.find((key) => normalized.includes(key));
    if (hit) return PROVINCE_TO_REGION[hit];
  }
  return null;
}

export const regionForProvince = (...tokens) => matchRegionForProvince(...tokens) || DEFAULT_REGION;

// ===== 鱼种 → 区域 =====
// 返回包含该鱼种的全部区域（配置顺序）
export function fishRegions(fishId) {
  return REGIONS.filter((region) => region.fish.some(([id]) => id === fishId));
}
