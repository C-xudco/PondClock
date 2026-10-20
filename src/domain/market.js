import { FISH, REGIONS, QUALITIES, DEFAULT_REGION } from "../lib/gameConfig.js";
import { ECONOMY_CONFIG } from "../config/economy.js";

const speciesLookup = new Map(FISH.map((species) => [species.id, species]));
const qualityLookup = new Map(QUALITIES.map((quality) => [quality.id, quality]));
const regionIds = new Set(REGIONS.map((region) => region.id));
if (speciesLookup.size !== FISH.length || regionIds.size !== REGIONS.length) {
  throw new Error("Market species and region IDs must be unique");
}

const supply = new Map();
for (const region of REGIONS) {
  const ids = new Set();
  const totalWeight = region.fish.reduce((sum, [id, weight]) => {
    if (!speciesLookup.has(id) || ids.has(id) || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Invalid fish supply in region ${region.id}: ${id}`);
    }
    ids.add(id);
    return sum + weight;
  }, 0);
  if (!(totalWeight > 0)) throw new Error(`Region ${region.id} has no fish supply`);
  for (const [speciesId, weight] of region.fish) {
    supply.set(`${speciesId}:${region.id}`, weight / totalWeight);
  }
}

// Derived once from the sole habitat-weight table; never maintain a second matrix.
export const MARKET_QUOTES = Object.freeze(FISH.flatMap((species) => {
  const maxSupplyShare = Math.max(...REGIONS.map((region) => supply.get(`${species.id}:${region.id}`) || 0));
  if (!(maxSupplyShare > 0)) throw new Error(`Fish ${species.id} has no producing region`);
  return REGIONS.map((region) => {
    const supplyShare = supply.get(`${species.id}:${region.id}`) || 0;
    const multiplier = ECONOMY_CONFIG.abundantMultiplier
      + (ECONOMY_CONFIG.absentMultiplier - ECONOMY_CONFIG.abundantMultiplier)
      * (1 - supplyShare / maxSupplyShare);
    return Object.freeze({
      speciesId: species.id, regionId: region.id, supplyShare, maxSupplyShare, multiplier,
    });
  });
}));

const marketLookup = new Map(MARKET_QUOTES.map((quote) => [`${quote.speciesId}:${quote.regionId}`, quote]));
export const marketFor = (speciesId, regionId) => marketLookup.get(`${speciesId}:${regionId}`) || null;

function unroundedBasePrice(fish, species) {
  const quality = qualityLookup.get(fish.quality) || QUALITIES[0];
  const averageWeight = (species.wt[0] + species.wt[1]) / 2 || 1;
  // Preserve the prototype's weight curve and missing-weight fallback.
  const factor = Math.min(ECONOMY_CONFIG.weightFactorMax,
    Math.max(ECONOMY_CONFIG.weightFactorMin,
      ECONOMY_CONFIG.weightFactorBase
        + ((Number(fish.weight) || averageWeight) / averageWeight) * ECONOMY_CONFIG.weightFactorRate));
  return species.basePrice * quality.mult * factor;
}

/**
 * regionId is the sale location; capture location never changes a fish's age.
 * Omitting it supports both originRegionId and the prototype's regionId field.
 * Invalid capture times are expired instead of silently becoming newly caught.
 * basePrice is the old rounded sale quote; price rounds the raw amount × market
 * multiplier once, so low-value fish do not accumulate two rounding errors.
 */
export function quoteFish(fish, regionId = fish?.originRegionId || fish?.regionId || DEFAULT_REGION, nowMs = Date.now()) {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new TypeError("Market time must be epoch milliseconds");
  if (!regionIds.has(regionId)) throw new RangeError(`Unknown sale region: ${regionId}`);
  const caughtAtMs = fish?.caughtAtMs;
  const validTime = Number.isFinite(caughtAtMs) && caughtAtMs >= 0;
  const expiresAtMs = validTime ? caughtAtMs + ECONOMY_CONFIG.freshnessMs : null;
  const expired = !validTime || nowMs >= expiresAtMs;
  // Expiry overrides every fish type, quality, weight and regional premium.
  if (expired) return {
    price: ECONOMY_CONFIG.expiredPrice,
    basePrice: ECONOMY_CONFIG.expiredPrice,
    multiplier: 1,
    expired: true,
    expiresAtMs,
  };
  const species = speciesLookup.get(fish?.speciesId);
  if (!species) return { price: 0, basePrice: 0, multiplier: 0, expired: false, expiresAtMs };
  const multiplier = marketFor(species.id, regionId).multiplier;
  const rawPrice = unroundedBasePrice(fish, species);
  return {
    price: Math.max(ECONOMY_CONFIG.minimumFreshPrice, Math.round(rawPrice * multiplier)),
    basePrice: Math.max(ECONOMY_CONFIG.minimumFreshPrice, Math.round(rawPrice)),
    multiplier,
    expired: false,
    expiresAtMs,
  };
}

export const calcMarketPrice = (fish, regionId, nowMs) => quoteFish(fish, regionId, nowMs).price;
