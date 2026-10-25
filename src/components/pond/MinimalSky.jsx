import { HORIZON, VIEW, STARS, CLOUDS, FAR_REEDS } from "./minimalScene";
import { SKY_ALPHA } from "./palette";

// 天空层：渐变夜空 / 星月 / 柔光云 / 三层远山 / 远岸芦苇 / 天气色调
const MinimalSky = ({ p, sun, visualState: visual, uid }) => {
  const moon = sun.kind === "moon";
  const starOpacity = visual.celestial.starsVisible ? p.starOpacity : 0;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-mcSky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyTop} />
          <stop offset="58%" stopColor={p.skyMid} />
          <stop offset="100%" stopColor={p.skyHorizon} />
        </linearGradient>
        <radialGradient id={`${uid}-mcGlow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.85" />
          <stop offset="30%" stopColor={p.glow} stopOpacity="0.24" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-mcHorizonGlow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.horizonGlow} stopOpacity="0.95" />
          <stop offset="55%" stopColor={p.horizonGlow} stopOpacity="0.35" />
          <stop offset="100%" stopColor={p.horizonGlow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-mcMoonBody`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="70%" stopColor={p.sunCore} />
          <stop offset="100%" stopColor={p.sunEdge} />
        </radialGradient>
        {/* 云：径向渐变本身边缘就柔，再叠模糊，避免出现深色实心块 */}
        <radialGradient id={`${uid}-mcCloud`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.cloudColor} stopOpacity="0.9" />
          <stop offset="52%" stopColor={p.cloudColor} stopOpacity="0.42" />
          <stop offset="100%" stopColor={p.cloudColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-mcHaze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.haze} stopOpacity="0" />
          <stop offset="100%" stopColor={p.haze} stopOpacity="0.5" />
        </linearGradient>
        <filter id={`${uid}-mcBlur9`} x="-40%" y="-120%" width="180%" height="340%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${uid}-mcBlur4`} x="-40%" y="-160%" width="180%" height="420%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* 天空底色：半透明，让桌面/壁纸从天空透出来 */}
      <rect x="0" y="0" width={VIEW.w} height={HORIZON + 12} fill={`url(#${uid}-mcSky)`} opacity={SKY_ALPHA} />

      {/* 星星（夜 / 拂晓 / 黄昏可见） */}
      {starOpacity > 0.04 &&
        STARS.map((s, i) => (
          <circle
            key={`star-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.s}
            fill={p.light}
            fillOpacity={s.o * starOpacity}
            className="mc-twinkle"
            style={{ animationDelay: `${s.d}s` }}
          />
        ))}

      {/* 日月严格由统一天气状态控制；阴雨雪不泄露原版的固定日轮。 */}
      {(visual.celestial.sunVisible || visual.celestial.moonVisible) && <g data-celestial={moon ? "moon" : "sun"}>
      <circle
        cx={sun.x}
        cy={sun.y}
        r={moon ? 54 : p.isLow ? 108 : 82}
        fill={`url(#${uid}-mcGlow)`}
        opacity={moon ? 0.72 : 0.88}
      />
      <circle
        cx={sun.x}
        cy={sun.y}
        r={sun.r}
        fill={`url(#${uid}-mcMoonBody)`}
        opacity={moon ? 0.95 : 0.92}
      />
      {moon ? (
        <g opacity="0.16" fill={p.skyTop}>
          <circle cx={sun.x - 3.4} cy={sun.y - 3} r="2.1" />
          <circle cx={sun.x + 3.8} cy={sun.y + 3.4} r="1.5" />
          <circle cx={sun.x + 0.6} cy={sun.y + 6} r="0.9" />
          <circle cx={sun.x + 5.4} cy={sun.y - 4.6} r="0.8" />
        </g>
      ) : null}

      </g>}
      {/* 地平线暖光（日出 / 日落时最明显） */}
      <ellipse
        cx={sun.x}
        cy={HORIZON - 1}
        rx={390}
        ry={62}
        fill={`url(#${uid}-mcHorizonGlow)`}
        opacity={visual.celestial.directLightVisible ? p.horizonGlowOpacity : 0}
      />

      {/* 云层：只在多云 / 雨 / 雪出现，浅色低对比、边缘柔化 */}
      {p.cloudOpacity > 0.04 && (
        <g filter={`url(#${uid}-mcBlur9)`} opacity={p.cloudOpacity}>
          {CLOUDS.map((c, i) => (
            <g key={`cloud-${i}`} opacity={c.o}>
              <ellipse cx={c.x} cy={c.y} rx={c.w / 2} ry={c.h / 2} fill={`url(#${uid}-mcCloud)`} />
              <ellipse
                cx={c.x + c.w * 0.22}
                cy={c.y - c.h * 0.42}
                rx={c.w * 0.32}
                ry={c.h * 0.6}
                fill={`url(#${uid}-mcCloud)`}
              />
              <ellipse
                cx={c.x - c.w * 0.26}
                cy={c.y + c.h * 0.28}
                rx={c.w * 0.3}
                ry={c.h * 0.45}
                fill={`url(#${uid}-mcCloud)`}
              />
            </g>
          ))}
        </g>
      )}

      {/* 远景：远山 → 近山 → 低丘，三层递进 */}
      <path
        d="M -10 172 L -10 120 C 46 118 78 96 132 102 C 184 108 214 88 272 96 C 322 103 356 120 404 124 C 448 128 486 106 540 110 C 592 114 632 134 682 132 C 738 130 782 110 842 114 C 894 118 928 130 968 132 C 986 133 996 136 1010 138 L 1010 172 Z"
        fill={p.mountainFar}
        opacity="0.92"
      />
      <path
        d="M -10 172 L -10 146 C 52 142 96 124 152 132 C 208 140 244 152 300 150 C 366 147 412 132 470 138 C 536 145 586 158 650 154 C 716 150 764 138 826 144 C 884 150 928 156 972 158 C 990 159 1000 162 1010 164 L 1010 172 Z"
        fill={p.mountainNear}
        opacity="0.96"
      />
      <path
        d="M -10 173 L -10 160 C 90 156 160 162 250 158 C 340 154 420 160 520 157 C 620 154 700 160 800 157 C 880 155 950 160 1010 158 L 1010 173 Z"
        fill={p.ridgeLow}
        opacity="0.85"
      />

      {/* 山脚雾霭 */}
      <rect
        x="0"
        y={HORIZON - 62}
        width={VIEW.w}
        height="62"
        fill={`url(#${uid}-mcHaze)`}
        opacity="0.85"
      />

      {/* 远岸：一线陆地 + 芦苇剪影 */}
      <path
        d="M -10 165.5 C 180 163 380 162.5 560 163.5 C 740 164.5 890 163 1010 164.5 L 1010 176 L -10 177 Z"
        fill={p.inkSoft}
        opacity="0.9"
      />
      <path
        d="M -10 166.6 C 200 164.6 420 164.2 620 165.2 C 800 166 920 165 1010 165.8"
        fill="none"
        stroke={p.shoreHighlight}
        strokeWidth="0.9"
        opacity="0.3"
      />
      <g stroke={p.reed} strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.9">
        {FAR_REEDS.map(([x, y, h], i) => (
          <g key={`fr-${i}`}>
            <path d={`M ${x} ${y} Q ${x - 1.4} ${y - h * 0.6} ${x - 2.6} ${y - h}`} />
            <path d={`M ${x + 0.6} ${y} Q ${x + 1.6} ${y - h * 0.55} ${x + 2.8} ${y - h * 0.85}`} />
            <path d={`M ${x - 0.4} ${y} Q ${x - 0.2} ${y - h * 0.5} ${x + 0.4} ${y - h * 0.72}`} />
          </g>
        ))}
      </g>

      {/* 天气色调：阴 / 雨 / 雪统一压一层低饱和雾 */}
      {p.overcastOpacity > 0 && (
        <rect
          x="0"
          y="0"
          width={VIEW.w}
          height={HORIZON + 12}
          fill={p.skyTint || p.skyTop}
          opacity={p.overcastOpacity}
        />
      )}
      {p.mistOpacity > 0 && (
        <rect
          x="0"
          y={HORIZON - 50}
          width={VIEW.w}
          height="56"
          fill={p.haze}
          opacity={p.mistOpacity * 1.9}
          filter={`url(#${uid}-mcBlur4)`}
        />
      )}
    </g>
  );
};

export default MinimalSky;
