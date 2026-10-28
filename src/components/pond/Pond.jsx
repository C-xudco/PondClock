import { useId, useMemo } from "react";
import { JUDGE } from "@/lib/gameConfig";
import { toWeatherVisualState } from "@/domain/weatherVisualState";
import SkyLayer from "./SkyLayer";
import WaterLayer from "./WaterLayer";
import MinimalSky from "./MinimalSky";
import MinimalWater from "./MinimalWater";
import Fisherman from "./Fisherman";
import Bobber from "./Bobber";
import WeatherLayer from "./WeatherLayer";
import SpeechBubble from "./SpeechBubble";
import { getPalette, sunMoonOf } from "./palette";
import { VIEW, BOBBER, geometryForAppearance, actorPlacementFor } from "./scene";
import { resolveAppearanceVisuals } from "../../data/appearanceVisuals";
import { useTween } from "./useTween";
import { useVisualClock } from "./useVisualClock";
import RegionalLandmark from './RegionalLandmark';

const SOURCE_LABEL = { online: "实时天气", cached: "缓存天气", simulated: "离线模拟", manual: "手动设置" };
const LEGACY_CODE = { 晴: 0, 多云: 2, 阴: 3, 小雨: 61, 雨: 63, 雪: 71, 小雪: 71 };
const POND_STYLES = `
@keyframes mc-ring{0%{transform:scale(.55);opacity:.26}100%{transform:scale(1.75);opacity:0}}
@keyframes mc-ring-fast{0%{transform:scale(.5);opacity:.5}100%{transform:scale(2.1);opacity:0}}
@keyframes mc-ring-slow{0%{transform:scale(.6);opacity:.3}100%{transform:scale(2.6);opacity:0}}
@keyframes mc-bubble-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.mc-ring{animation:mc-ring 4.6s ease-out infinite}
.mc-ring-fast{animation:mc-ring-fast 1.7s ease-out infinite}
.mc-ring-slow{animation:mc-ring-slow 2.6s ease-out infinite}
.mc-bubble{animation:mc-bubble-in .24s ease-out both}
.ink-pond .pond-label{background:rgba(243,240,226,.87);border:1px solid rgba(80,92,78,.2);color:#344c44;box-shadow:0 2px 6px #263d3315}
.minimal-pond .pond-label{background:rgba(14,26,36,.46);border:1px solid rgba(224,239,238,.12);color:#e2eae8;backdrop-filter:blur(3px)}
.ink-pond button:focus-visible{outline:2px solid #9e5745;outline-offset:-3px}
.minimal-pond button:focus-visible{outline:2px solid #b0d6d5;outline-offset:-3px}
@keyframes mc-twinkle{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes mc-flow{from{stroke-dashoffset:0}to{stroke-dashoffset:-400}}
.mc-twinkle{animation:mc-twinkle 6.5s ease-in-out infinite}
.mc-flow{animation:mc-flow 30s linear infinite}
@media(prefers-reduced-motion:reduce){.pond-scene *, .pond-scene *::before, .pond-scene *::after{animation:none!important;transition:none!important}}
`;

/**
 * Display only: the caller selects the committed region/site and its weather.
 * Weather is selected by the caller; choosing another source never changes the landscape site.
 */
const Pond = ({
  status, windowLeft = 0, weather, hour = 12, speech = null,
  onCatch, onPoke = null, regionId = "jiangnan",
  sceneDefinition, sceneSite, visualState, weatherEntry, entry,
  appearance, weatherPresentation, actorPose = 0,
}) => {
  const rawId = useId();
  const uid = `ink-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const actualRegion = sceneDefinition?.regionId || sceneSite?.regionId || regionId;
  const equipped = resolveAppearanceVisuals(appearance);
  const ink = equipped.scene === 'inkwash';
  const geometry = geometryForAppearance(sceneDefinition?.geometryId || actualRegion, equipped.scene);
  const actorPlacement = actorPlacementFor(geometry);
  const snapshot = (weatherEntry || entry)?.snapshot;
  // Compatibility with old callers is explicit and isolated. Production supplies visualState.
  const fallback = useMemo(() => {
    const nowMs = Date.now();
    return toWeatherVisualState({
      weatherCode: LEGACY_CODE[weather] ?? null,
      isDay: hour >= 6 && hour < 18,
      observedAtMs: nowMs,
      source: "simulated",
      quality: "legacy",
    }, { nowMs, timeZone: sceneSite?.timeZone });
  }, [weather, hour, sceneSite?.timeZone]);
  const visual = visualState || fallback;
  const biting = status === "bite";
  const pose = useTween(biting ? 1 : actorPose, 260);
  const palette = useMemo(
    () => getPalette(visual.daylight.isDay === false ? "night" : "day",
      visual.precipitation.kind === 'rain' ? '小雨' : visual.precipitation.kind === 'snow' ? '雪'
        : visual.sky.coverage === 'clear' ? '晴' : '多云'),
    [visual.daylight.isDay, visual.precipitation.kind, visual.sky.coverage],
  );
  const sun = useMemo(() => sunMoonOf(visual.daylight.isDay === false ? 23 : 12, palette.phase), [visual.daylight.isDay, palette.phase]);
  const precipitation = visual.precipitation.kind;
  const { timeMs, reducedMotion } = useVisualClock(
    precipitation === "rain" || precipitation === "snow",
    `${geometry.id}:${precipitation}:${visual.precipitation.intensity}`,
  );
  const span = Math.max(1, JUDGE?.windowSeconds || 20);
  const leftPct = Math.max(0, Math.min(100, windowLeft / span * 100));
  const circumference = 2 * Math.PI * 15.5;
  const source = snapshot?.source || "simulated";
  const temperature = Number.isFinite(snapshot?.temperatureC) ? `${Math.round(snapshot.temperatureC)}°` : "";
  const place = sceneSite?.place || "秦淮河 · 文德桥";
  const weatherText = weather || "天气未知";
  const labelTitle = [sceneSite?.address, weatherPresentation?.detail || sceneSite?.weatherReferenceLabel,
    snapshot?.observedAtMs ? new Date(snapshot.observedAtMs).toLocaleString("zh-CN") : ""].filter(Boolean).join(" · ");

  return (
    <div className={`pond-scene ${ink ? 'ink-pond' : 'minimal-pond'} relative select-none overflow-hidden rounded-2xl border shadow-lg`}
      style={ink ? { borderColor: "#788b6b55", background: "#e6e9de", fontFamily: '"KaiTi","STKaiti","FangSong",serif' }
        : { borderColor: '#c0d4dc26', background: 'transparent' }}
      data-scene-style={equipped.scene} data-character-style={equipped.character} data-rod-style={equipped.rod}
      data-scene-region={actualRegion} data-scene-site={sceneSite?.siteId || ""}
      data-sky={visual.sky.coverage} data-precipitation={precipitation}
      data-water-response={visual.waterResponse} data-weather-source={source}
      data-reduced-motion={reducedMotion ? "true" : "false"}>
      <style>{POND_STYLES}</style>
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="block h-auto w-full"
        role="img" aria-label="水塘垂钓场景" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id={`${uid}-water`}><path d={geometry.waterPath}/></clipPath>
        </defs>
        {ink ? <>
          <image href={`${import.meta.env.BASE_URL}${geometry.asset}`} width={VIEW.w} height={VIEW.h} preserveAspectRatio="none" data-scene-art={actualRegion}/>
          <SkyLayer visualState={visual} geometry={geometry} uid={uid}/>
          <WaterLayer visualState={visual} geometry={geometry} uid={uid}/>
        </> : <g data-scene-art={`minimal-${actualRegion}`}>
          <MinimalSky p={palette} sun={sun} visualState={visual} uid={uid}/>
          <MinimalWater p={palette} sun={sun} visualState={visual} uid={uid}/>
          <RegionalLandmark regionId={actualRegion} p={palette}/>
        </g>}
        <WeatherLayer key={geometry.id} visualState={visual} geometry={geometry} uid={uid} timeMs={timeMs} reducedMotion={reducedMotion}/>
        <Fisherman key={`${geometry.id}:${equipped.character}`} p={palette} pose={pose} visualState={visual} geometry={geometry} character={equipped.character} rod={equipped.rod}/>
        <Bobber p={palette} biting={biting} sinkT={pose} uid={uid}/>
      </svg>

      <div className="pond-label pointer-events-none absolute bottom-[5%] left-[2.5%] z-10 max-w-[70%] rounded-md px-2 py-1"
        title={labelTitle}>
        <div className="truncate text-[12px] leading-[1.35]">{place}</div>
        {sceneSite?.address && <div className="mt-0.5 truncate text-[10px] leading-[1.35]" title={sceneSite.address}>{sceneSite.address}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] leading-[1.35]">
          <span>{weatherText}{temperature ? ` · ${temperature}` : ""}</span>
          <span style={{ color: ink ? (source === "simulated" ? "#986b46" : "#5e7361") : '#b1c9ca' }}>{weatherPresentation?.originLabel}</span>
          <span style={{ color: ink ? (source === "simulated" ? "#986b46" : "#5e7361") : '#b1c9ca' }}>{weatherPresentation?.sourceLabel || SOURCE_LABEL[source] || "天气未知"}</span>
        </div>
      </div>
      {speech ? <SpeechBubble speech={speech} placement={actorPlacement} sceneStyle={equipped.scene}/> : null}
      {!biting && <div className="pond-label pointer-events-none absolute left-[2.5%] top-[4%] rounded-full px-2 py-1 text-[10px] tracking-widest">{status === 'stopped' ? '暂歇片刻' : status === 'casting' ? '挥竿探鱼' : status === 'active' ? '凝神收竿' : '静候鱼汛'}</div>}

      {!biting && onPoke ? <>
        <button type="button" onClick={onPoke} aria-label="点击浮漂" title="轻轻点一下浮漂"
          className="absolute z-20 -translate-x-1/2 cursor-pointer rounded-full bg-transparent"
          style={{ left: `${BOBBER.x / VIEW.w * 100}%`, top: `${(BOBBER.surfaceY - BOBBER.height - 12) / VIEW.h * 100}%`, width: "10%", height: "17%" }}/>
        <button type="button" onClick={onPoke} aria-label="点击渔翁" title="和渔翁说句话"
          className="absolute z-20 cursor-pointer rounded-lg bg-transparent"
          style={{ left: `${actorPlacement.image.x / VIEW.w * 100}%`, top: `${actorPlacement.image.y / VIEW.h * 100}%`, width: `${actorPlacement.image.width / VIEW.w * 100}%`, height: `${actorPlacement.image.height / VIEW.h * 100}%` }}/>
      </> : null}
      {biting ? <>
        <div className="pointer-events-none absolute z-20 -translate-x-1/2" style={{ left: "52.8%", bottom: "36%" }}>
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border shadow-md"
            style={ink ? { background: "#f5f0dfe8", color: "#984c3d", borderColor: "#af7868" }
              : { background: '#1b2d3be6', color: '#e5eeec', borderColor: '#a0bec280' }}>
            <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#a8774c33" strokeWidth="1.8"/>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#a55340" strokeWidth="1.8" strokeLinecap="round"
                strokeDasharray={circumference.toFixed(1)} strokeDashoffset={(circumference * (1 - leftPct / 100)).toFixed(1)}/>
            </svg>
            <span className="text-[15px] font-semibold tabular-nums">{windowLeft}</span>
          </div>
          <span className="pond-label mt-1 block rounded px-1.5 py-0.5 text-center text-[10px]">点击收竿</span>
        </div>
        <button type="button" onClick={onCatch} aria-label="点击收竿"
          className="absolute inset-0 z-30 h-full w-full cursor-pointer rounded-2xl bg-transparent ring-2 ring-inset"
          style={{ "--tw-ring-color": "#a5534066" }}/>
      </> : null}
    </div>
  );
};
export default Pond;
