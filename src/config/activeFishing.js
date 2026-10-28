export const ACTIVE_FISHING_CONFIG = Object.freeze({
  bundlePrice: 450, charges: 15, swingMs: 3000, gaugeTimeoutMs: 6000,
  oneWayMs: 1500, automaticSuccess: 0.3, waitMinimumMs: 55000,
  waitMaximumMs: 125000, biteWindowMs: 20000,
  bands: Object.freeze([
    { from: 0, to: 1000, id: 'white', success: 0, label: '白 · 0%' },
    { from: 1000, to: 2250, id: 'red', success: .1, label: '红 · 10%' },
    { from: 2250, to: 3750, id: 'yellow', success: .5, label: '黄 · 50%' },
    { from: 3750, to: 6250, id: 'green', success: 1, label: '绿 · 100%' },
    { from: 6250, to: 7750, id: 'yellow', success: .5, label: '黄 · 50%' },
    { from: 7750, to: 9000, id: 'red', success: .1, label: '红 · 10%' },
    { from: 9000, to: 10001, id: 'white', success: 0, label: '白 · 0%' },
  ]),
});
export function gaugePosition(elapsedMs) {
  const cycle = Math.max(0, elapsedMs) % (ACTIVE_FISHING_CONFIG.oneWayMs * 2);
  return Math.round(10000 * (cycle <= ACTIVE_FISHING_CONFIG.oneWayMs
    ? cycle / ACTIVE_FISHING_CONFIG.oneWayMs : 2 - cycle / ACTIVE_FISHING_CONFIG.oneWayMs));
}
export const gaugeBand = (position) => ACTIVE_FISHING_CONFIG.bands.find(band => position >= band.from && position < band.to);
export function quoteActivePass(state) {
  const price = ACTIVE_FISHING_CONFIG.bundlePrice;
  return { basePrice: price, price: state.discounts?.activeRod ? Math.round(price * .9) : price,
    discounted: Boolean(state.discounts?.activeRod), charges: ACTIVE_FISHING_CONFIG.charges };
}
