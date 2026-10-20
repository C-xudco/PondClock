import { REGIONS } from "../lib/gameConfig.js";
import { REGION_LOCATIONS } from "../data/regionLocations.js";
import { TRAVEL_CONFIG } from "../config/travel.js";

const radians = (degrees) => (degrees * Math.PI) / 180;

function validateLocation(point) {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    throw new TypeError("A route requires valid latitude/longitude coordinates");
  }
}

export function haversineKm(from, to) {
  validateLocation(from);
  validateLocation(to);
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  // Floating-point error can otherwise put an antipodal result outside [0, 1].
  return 2 * TRAVEL_CONFIG.earthRadiusKm * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

const regionIds = REGIONS.map((region) => region.id);
if (new Set(regionIds).size !== regionIds.length) throw new Error("Duplicate route region IDs");
for (const id of regionIds) validateLocation(REGION_LOCATIONS[id]);

// Compute each geographical pair once, then expose both directed travel quotes.
const pairs = regionIds.flatMap((fromId, index) => regionIds.slice(index + 1).map((toId) => ({
  fromId,
  toId,
  distanceKm: haversineKm(REGION_LOCATIONS[fromId], REGION_LOCATIONS[toId]),
})));
if (!pairs.length) throw new Error("At least two regions are needed for travel");

export const routeBounds = Object.freeze({
  minDistanceKm: Math.min(...pairs.map((pair) => pair.distanceKm)),
  maxDistanceKm: Math.max(...pairs.map((pair) => pair.distanceKm)),
});
if (!(routeBounds.maxDistanceKm > routeBounds.minDistanceKm)) {
  throw new Error("Travel normalization requires distinct minimum and maximum distances");
}

const pairLookup = new Map();
for (const pair of pairs) {
  pairLookup.set(`${pair.fromId}:${pair.toId}`, pair.distanceKm);
  pairLookup.set(`${pair.toId}:${pair.fromId}`, pair.distanceKm);
}

export const ROUTES = Object.freeze(regionIds.flatMap((fromId) => regionIds
  .filter((toId) => toId !== fromId)
  .map((toId) => {
    const distanceKm = pairLookup.get(`${fromId}:${toId}`);
    const distanceRatio = Math.min(1, Math.max(0,
      (distanceKm - routeBounds.minDistanceKm)
        / (routeBounds.maxDistanceKm - routeBounds.minDistanceKm)));
    const durationMs = Math.round(TRAVEL_CONFIG.minDurationMs
      + (TRAVEL_CONFIG.maxDurationMs - TRAVEL_CONFIG.minDurationMs) * distanceRatio);
    const price = Math.round((TRAVEL_CONFIG.minPrice
      + (TRAVEL_CONFIG.maxPrice - TRAVEL_CONFIG.minPrice) * distanceRatio)
      / TRAVEL_CONFIG.priceStep) * TRAVEL_CONFIG.priceStep;
    return Object.freeze({
      id: `${fromId}:${toId}`,
      fromId,
      toId,
      distanceKm,
      distanceRatio,
      durationMs,
      price,
      ruleVersion: TRAVEL_CONFIG.ruleVersion,
    });
  })));

const routeLookup = new Map(ROUTES.map((route) => [route.id, route]));

// Invalid IDs and same-region travel are not bookable routes.
export const quoteRoute = (fromId, toId) => routeLookup.get(`${fromId}:${toId}`) || null;
