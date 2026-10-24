import { isWaterPoint, visualRandom } from "./scene.js";
export const PRECIPITATION_BUDGET = Object.freeze({
  rain: {
    light: 22,
    moderate: 38,
    heavy: 58
  },
  snow: {
    light: 18,
    moderate: 30,
    heavy: 44
  }
});
// One endpoint and cycle identity joins each falling particle to its water response.
export function createPrecipitation(geometry, kind, intensity = "light", seed = 77123) {
  if (!(kind in PRECIPITATION_BUDGET)) return [];
  const random = visualRandom(seed + geometry.id.split("").reduce((n, c) => n + c.charCodeAt(0), 0));
  const count = PRECIPITATION_BUDGET[kind][intensity] || PRECIPITATION_BUDGET[kind].light;
  return Array.from({
    length: count
  }, (_, index) => {
    let x = 0,
      y = 0,
      attempts = 0;
    do {
      x = 20 + random() * 940;
      y = geometry.horizonY + 8 + random() * (425 - geometry.horizonY);
      attempts += 1;
    } while (!isWaterPoint(geometry, x, y) && attempts < 100);
    if (!isWaterPoint(geometry, x, y)) {
      x = geometry.bobber.x;
      y = geometry.bobber.surfaceY;
    }
    const fallMs = kind === "rain" ? 650 + random() * 400 : 2700 + random() * 2100;
    const responseMs = kind === "rain" ? 760 : 1200;
    const cycleMs = fallMs + responseMs + random() * 650;
    return {
      id: `${geometry.id}@${geometry.revision}:${kind}:${index}`,
      kind,
      x,
      y,
      fallMs,
      responseMs,
      cycleMs,
      offsetMs: random() * cycleMs,
      drift: kind === "rain" ? -20 : 8 + random() * 24,
      size: kind === "rain" ? .65 + random() * .7 : 1.15 + random() * 1.6
    };
  });
}
export function precipitationFrame(particle, timeMs) {
  const total = Math.max(0, timeMs) + particle.offsetMs;
  const cycle = Math.floor(total / particle.cycleMs);
  const phaseMs = total - cycle * particle.cycleMs;
  const hitTimeMs = cycle * particle.cycleMs - particle.offsetMs + particle.fallMs;
  if (phaseMs < particle.fallMs) {
    const progress = phaseMs / particle.fallMs;
    const drift = particle.drift * (1 - progress);
    const sway = particle.kind === "snow" ? Math.sin(progress * Math.PI * 4 + particle.offsetMs) * 8 * Math.sin(progress * Math.PI) : 0;
    return {
      stage: "fall",
      cycle,
      x: particle.x - drift + sway,
      y: -18 + (particle.y + 18) * progress,
      contactX: particle.x,
      contactY: particle.y,
      hitTimeMs
    };
  }
  const ageMs = phaseMs - particle.fallMs;
  return {
    stage: ageMs < particle.responseMs ? "contact" : "rest",
    cycle,
    x: particle.x,
    y: particle.y,
    contactX: particle.x,
    contactY: particle.y,
    hitTimeMs,
    ageMs,
    progress: Math.min(1, ageMs / particle.responseMs)
  };
}
