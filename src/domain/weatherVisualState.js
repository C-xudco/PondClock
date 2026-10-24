const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 97]);
const snowCodes = new Set([71, 73, 75, 77, 85, 86]);
const fogCodes = new Set([45, 48]);
const hailCodes = new Set([96, 99]);
const lightCodes = new Set([51, 56, 61, 66, 71, 77, 80, 85]);
const heavyCodes = new Set([55, 57, 65, 67, 75, 82, 86, 97]);

function localDaylight(timeZone, nowMs) {
  if (typeof timeZone !== "string") return null;
  try {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(nowMs));
    return hour >= 6 && hour < 18;
  } catch { return null; }
}

/** One conservative interpretation feeds sky, water and character together. */
export function toWeatherVisualState(snapshot, { nowMs = Date.now(), timeZone } = {}) {
  const code = snapshot?.weatherCode;
  const p = snapshot?.precipitation || {};
  const hasRain = (p.rainMm || 0) + (p.showersMm || 0) > 0;
  const hasSnow = (p.snowfallCm || 0) > 0;
  const knownCode = [0, 1, 2, 3, 45, 48].includes(code) || rainCodes.has(code) || snowCodes.has(code) || hailCodes.has(code);
  let kind = !knownCode ? "unknown" : hasRain && hasSnow ? "mixed"
    : hailCodes.has(code) ? "unknown" : hasSnow || snowCodes.has(code) ? "snow"
      : hasRain || rainCodes.has(code) ? "rain" : "none";
  // A missing code cannot be turned into clear weather by zero measurements.
  if (!knownCode && hasRain && hasSnow) kind = "mixed";
  let intensity = kind === "none" ? "none" : kind === "unknown" || kind === "mixed" ? "unknown"
    : lightCodes.has(code) ? "light" : heavyCodes.has(code) ? "heavy" : "moderate";
  let basis = knownCode ? "code" : "unknown";
  const amount = kind === "rain" ? (Number.isFinite(p.rainMm) && Number.isFinite(p.showersMm) ? p.rainMm + p.showersMm : null)
    : kind === "snow" ? p.snowfallCm : null;
  if (Number.isFinite(amount) && amount > 0 && Number.isFinite(p.intervalSeconds) && p.intervalSeconds > 0) {
    const perHour = amount * 3600 / p.intervalSeconds;
    const [lightMax, moderateMax] = kind === "snow" ? [0.2, 1] : [2.5, 7.5];
    intensity = perHour < lightMax ? "light" : perHour < moderateMax ? "moderate" : "heavy";
    basis = "measurement";
  }
  if (snapshot?.source === "simulated") basis = "simulated";
  const observedFresh = Number.isFinite(snapshot?.observedAtMs) && nowMs >= snapshot.observedAtMs - 15 * 60 * 1000
    && nowMs - snapshot.observedAtMs < 15 * 60 * 1000;
  const providerDay = observedFresh && typeof snapshot?.isDay === "boolean";
  const isDay = providerDay ? snapshot.isDay : localDaylight(timeZone, nowMs);
  const daylight = { isDay, basis: providerDay ? "provider" : isDay === null ? "unknown" : "location-clock" };
  const fog = knownCode ? fogCodes.has(code) : null;
  const obscured = code === 3 || fog || kind !== "none";
  const coverage = !knownCode ? "unknown" : obscured || (snapshot?.cloudCoverPct ?? 0) >= 85 ? "overcast"
    : code === 2 || (snapshot?.cloudCoverPct ?? 0) >= 25 ? "partly-cloudy" : "clear";
  const openSky = [0, 1, 2].includes(code) && kind === "none" && !fog && (snapshot?.cloudCoverPct ?? 0) < 65;
  const sunVisible = isDay === true && openSky;
  const moonVisible = isDay === false && openSky;
  return {
    sky: { coverage, fog },
    celestial: { sunVisible, moonVisible, starsVisible: moonVisible && coverage === "clear",
      reflectionVisible: sunVisible || moonVisible, directLightVisible: sunVisible },
    precipitation: { kind, intensity, basis },
    waterResponse: kind === "rain" ? "rain-impact" : kind === "snow" ? "snow-dissolve" : "none",
    fisherman: { rainGear: kind === "rain" || kind === "mixed", snowTarget: kind === "snow" ? 1 : kind === "mixed" ? 0.35 : 0 },
    daylight,
    quality: snapshot?.quality || "simulated",
  };
}
