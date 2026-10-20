// A rule version identifies the coordinates, normalization and pricing together.
// In-progress flights save their quoted price/timestamps instead of re-quoting.
export const TRAVEL_CONFIG = Object.freeze({
  ruleVersion: 1,
  earthRadiusKm: 6371,
  minDurationMs: 60000,
  maxDurationMs: 180000,
  minPrice: 200,
  maxPrice: 6000,
  priceStep: 10,
});
