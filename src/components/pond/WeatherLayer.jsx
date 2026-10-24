import { useMemo } from "react";
import { createPrecipitation, precipitationFrame } from "./precipitation";
// A water response is derived from this falling particle's endpoint and timeline.
const WeatherLayer = ({
  visualState,
  geometry,
  uid,
  timeMs,
  reducedMotion
}) => {
  const {
    kind,
    intensity
  } = visualState.precipitation;
  const particles = useMemo(() => createPrecipitation(geometry, kind, intensity), [geometry, kind, intensity]);
  if (!particles.length) return null;
  return <g pointerEvents="none" data-layer="precipitation" data-particle-count={particles.length}>
    {particles.map(p => {
      const f = precipitationFrame(p, reducedMotion ? 1217 : timeMs);
      if (f.stage === "fall") return kind === "rain" ? <path key={p.id} data-particle={p.id} d={`M${f.x} ${f.y - 9}l-1.8 9`} stroke="#cbd9d9" strokeWidth={p.size} opacity=".72" strokeLinecap="round" /> : <circle key={p.id} data-particle={p.id} cx={f.x} cy={f.y} r={p.size} fill="#fffef6" opacity=".9" />;
      if (f.stage !== "contact" || reducedMotion || visualState.waterResponse === "none") return null;
      const progress = f.progress;
      const rain = visualState.waterResponse === "rain-impact";
      return <g key={p.id} clipPath={`url(#${uid}-water)`} data-contact-id={`${p.id}:${f.cycle}`} data-contact-x={p.x.toFixed(3)} data-contact-y={p.y.toFixed(3)} data-contact-age={f.ageMs.toFixed(1)} data-hit-time={f.hitTimeMs.toFixed(1)} data-contact-kind={rain ? "rain-impact" : "snow-dissolve"}>
        {rain ? <g fill="none" stroke="#dbe6de" opacity={(1 - progress) * .67}>
          {progress < .2 && <path d={`M${p.x - 3} ${p.y - 2}q3 -6 6 0`} strokeWidth="1" />}
          <ellipse cx={p.x} cy={p.y} rx={2 + progress * 17} ry={.65 + progress * 3.1} strokeWidth="1" />
        </g> : <g fill="#fbfff8" opacity={(1 - progress) * .8}>
          <ellipse cx={p.x} cy={p.y} rx={p.size * (1 - progress) + .25} ry={p.size * .5 * (1 - progress) + .1} />
          <ellipse cx={p.x} cy={p.y} rx={2.5 + progress * 3} ry={.7 + progress * .6} opacity={.25 * (1 - progress)} />
        </g>}
      </g>;
    })}
  </g>;
};
export default WeatherLayer;
