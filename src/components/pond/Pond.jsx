import { useMemo } from "react";
import { JUDGE } from "@/lib/gameConfig";
import SkyLayer from "./SkyLayer";
import WaterLayer from "./WaterLayer";
import Fisherman from "./Fisherman";
import Bobber from "./Bobber";
import WeatherLayer from "./WeatherLayer";
import SpeechBubble from "./SpeechBubble";
import { getPalette, phaseOf, sunMoonOf } from "./palette";
import { VIEW, BOBBER } from "./scene";
import { useTween } from "./useTween";

// 美术自检用覆盖（仅 dev 生效）：?hour=12 & ?weather=雪 & ?status=bite & ?wl=14 & ?say=文本&tone=high
// 生产构建里 import.meta.env.DEV 为 false，这段不会执行，Pond 仍严格以入参为准
const readDevOverrides = () => {
  if (!import.meta.env.DEV || typeof window === "undefined") return {};
  try {
    const q = new URLSearchParams(window.location.search);
    const hourNum = Number(q.get("hour"));
    const wlNum = Number(q.get("wl"));
    const status = q.get("status");
    const tone = q.get("tone");
    const say = q.get("say");
    return {
      hour: q.get("hour") !== null && Number.isFinite(hourNum) ? ((hourNum % 24) + 24) % 24 : undefined,
      weather: q.get("weather") || undefined,
      status: status === "bite" || status === "idle" ? status : undefined,
      windowLeft: q.get("wl") !== null && Number.isFinite(wlNum) ? Math.max(0, wlNum) : undefined,
      speech:
        say && ["idle", "success", "high", "miss"].includes(tone)
          ? { text: say, tone }
          : say
            ? { text: say, tone: "idle" }
            : undefined,
    };
  } catch {
    return {};
  }
};

const POND_STYLES = `
@keyframes mc-twinkle{0%,100%{opacity:.32}50%{opacity:1}}
@keyframes mc-flow{from{stroke-dashoffset:0}to{stroke-dashoffset:-720}}
@keyframes mc-ring{0%{transform:scale(.55);opacity:.26}55%{opacity:.1}100%{transform:scale(1.75);opacity:0}}
@keyframes mc-ring-fast{0%{transform:scale(.5);opacity:.34}100%{transform:scale(2.1);opacity:0}}
@keyframes mc-ring-slow{0%{transform:scale(.6);opacity:.2}100%{transform:scale(2.6);opacity:0}}
@keyframes mc-bubble-in{0%{opacity:0;transform:translateY(7px) scale(.94)}62%{opacity:1;transform:translateY(-1px) scale(1.015)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mc-bubble-tail-in{0%,40%{opacity:0}100%{opacity:1}}
@keyframes mc-fall{0%{transform:translate3d(0,-24px,0)}100%{transform:translate3d(-6px,260px,0)}}
@keyframes mc-snow{0%{transform:translate3d(0,-20px,0)}100%{transform:translate3d(16px,250px,0)}}
@keyframes mc-pop{0%{opacity:0;transform:translateY(-5px)}100%{opacity:1;transform:translateY(0)}}
.mc-twinkle{animation:mc-twinkle 6.5s ease-in-out infinite}
.mc-flow{animation:mc-flow 30s linear infinite}
.mc-ring{animation:mc-ring 4.6s ease-out infinite}
.mc-ring-fast{animation:mc-ring-fast 1.7s ease-out infinite}
.mc-ring-slow{animation:mc-ring-slow 2.6s ease-out infinite}
.mc-bubble{animation:mc-bubble-in .4s cubic-bezier(.22,.9,.3,1.18) both;transform-origin:bottom left}
.mc-bubble-tail{animation:mc-bubble-tail-in .4s ease-out both}
.mc-pop{animation:mc-pop .28s ease-out both}
`;

// 水塘主场景：天空 / 水面 / 剪影渔人 / 立式浮漂 / 天气 / 气泡 / 交互 HUD
const Pond = ({ status, windowLeft = 0, weather = "晴", hour = 12, speech = null, onCatch, onPoke = null }) => {
  const dev = readDevOverrides();
  const effHour = dev.hour ?? hour;
  const effWeather = dev.weather ?? weather;
  const effStatus = dev.status ?? status;
  const effWindowLeft = dev.windowLeft ?? windowLeft;
  const effSpeech = dev.speech ?? speech ?? null;

  const biting = effStatus === "bite";
  const t = useTween(biting, 380);
  const phase = phaseOf(effHour);
  const palette = useMemo(() => getPalette(phase, effWeather), [phase, effWeather]);
  const sun = useMemo(() => sunMoonOf(effHour, phase), [effHour, phase]);

  const span = Math.max(1, JUDGE?.windowSeconds || 20);
  const leftPct = Math.max(0, Math.min(100, (effWindowLeft / span) * 100));
  const ringC = 2 * Math.PI * 15.5;

  return (
    <div
      className={`relative select-none overflow-hidden rounded-2xl border border-white/10 bg-transparent shadow-2xl backdrop-blur-[2px] ${
        biting ? "cursor-pointer" : ""
      }`}
    >
      <style>{POND_STYLES}</style>

      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="block h-auto w-full"
        role="img"
        aria-label="水塘垂钓场景"
        preserveAspectRatio="xMidYMid meet"
      >
        <SkyLayer p={palette} sun={sun} />
        <WaterLayer p={palette} sun={sun} />
        <Fisherman p={palette} pose={t} />
        <Bobber p={palette} biting={biting} sinkT={t} />

        {/* 四周压暗，把视线收到"水面—浮漂—渔人"这条线上 */}
        <defs>
          <radialGradient id="mcVignette" cx="0.5" cy="0.44" r="0.74">
            <stop offset="52%" stopColor={palette.ink} stopOpacity="0" />
            <stop offset="100%" stopColor={palette.ink} stopOpacity={palette.isNight ? 0.6 : 0.34} />
          </radialGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width={VIEW.w}
          height={VIEW.h}
          fill="url(#mcVignette)"
          pointerEvents="none"
        />
      </svg>

      {/* 天气：雨 / 雪 / 雾（纯视觉，不拦截点击） */}
      <WeatherLayer weather={effWeather} night={phase === "night"} />

      {/* 对话气泡 */}
      {effSpeech ? <SpeechBubble speech={effSpeech} /> : null}

      {/* 待机时点击浮漂：小人会劝"别急"；10 秒内连点 5 次会吐槽"准空军" */}
      {!biting && onPoke ? (
        <button
          type="button"
          onClick={onPoke}
          aria-label="点击浮漂"
          title="轻轻点一下浮漂"
          className="group absolute z-20 -translate-x-1/2 cursor-pointer bg-transparent focus:outline-none"
          style={{
            left: `${(BOBBER.x / VIEW.w) * 100}%`,
            top: `${((BOBBER.surfaceY - BOBBER.height - 10) / VIEW.h) * 100}%`,
            width: "8%",
            height: `${((BOBBER.height + 26) / VIEW.h) * 100}%`,
          }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/0 transition-colors group-hover:border-white/25 group-active:border-white/45" />
        </button>
      ) : null}

      {/* 咬钩：倒计时贴近浮漂上方，环形进度 + 秒数，点击水塘任意处收竿 */}
      {biting ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{ left: "48.5%", bottom: "36.5%" }}
        >
          <div className="flex flex-col items-center gap-1 mc-pop">
            <div
              className="relative flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_6px_18px_rgba(0,0,0,.45)] backdrop-blur-sm"
              style={{
                borderColor: "rgba(226,150,130,.42)",
                background: "rgba(22,16,19,.66)",
              }}
            >
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="rgba(255,255,255,.12)"
                  strokeWidth="1.8"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#e79c86"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeDasharray={ringC.toFixed(1)}
                  strokeDashoffset={(ringC * (1 - leftPct / 100)).toFixed(1)}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <span className="text-[15px] font-semibold leading-none tabular-nums text-rose-50">
                {effWindowLeft}
              </span>
            </div>
            <span className="rounded-full bg-black/35 px-1.5 py-[2px] text-[9px] leading-none tracking-[0.14em] text-rose-50/75 backdrop-blur-[2px]">
              点击收竿
            </span>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-[2.5%] top-[4%] z-20 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/30 px-3 py-1.5 backdrop-blur-[2px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/70" />
          <span className="text-[11px] tracking-[0.16em] text-slate-200/70">挂机垂钓中</span>
        </div>
      )}

      {/* 咬钩时整块水塘都能点，外加一圈内高亮 */}
      {biting ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[15] rounded-2xl ring-2 ring-inset ring-rose-200/20" />
          <button
            type="button"
            onClick={onCatch}
            aria-label="点击收竿"
            className="absolute inset-0 z-30 h-full w-full cursor-pointer bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200/40"
          />
          {/* 浮漂处的极淡点击提示环，随咬钩呼吸 */}
          <span
            className="pointer-events-none absolute z-[16] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-200/25"
            style={{
              left: `${(BOBBER.x / VIEW.w) * 100}%`,
              top: `${((BOBBER.surfaceY - 18) / VIEW.h) * 100}%`,
              animation: "mc-target 1.6s ease-out infinite",
            }}
          />
        </>
      ) : null}
      <style>{`@keyframes mc-target{0%{transform:translate(-50%,-50%) scale(.7);opacity:.55}70%{opacity:.12}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}`}</style>
    </div>
  );
};

export default Pond;
