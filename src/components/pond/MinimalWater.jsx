import {
  HORIZON,
  VIEW,
  RIPPLES,
  GLINTS,
  RIPPLE_SETS,
  PEBBLES,
  SHORE_PATH,
  BANK_PATH,
  SHALLOW_PATH,
  FOREGROUND_ROCK,
  BANK_GRASS,
} from "./minimalScene";

// 草丛：几片弯向水面的叶子 + 偶尔一根草穗
const Grass = ({ x, y, h, p, i }) => (
  <g fill="none" stroke={p.reed} strokeLinecap="round">
    <path d={`M ${x} ${y} Q ${x - 2.5} ${y - h * 0.5} ${x - 7} ${y - h}`} strokeWidth="1.3" />
    <path d={`M ${x + 1.5} ${y} Q ${x + 3} ${y - h * 0.45} ${x + 6.5} ${y - h * 0.8}`} strokeWidth="1.2" />
    <path d={`M ${x - 0.5} ${y} Q ${x - 0.8} ${y - h * 0.35} ${x + 1.5} ${y - h * 0.62}`} strokeWidth="1" />
    <path d={`M ${x + 0.8} ${y} Q ${x + 0.2} ${y - h * 0.55} ${x - 2.5} ${y - h * 0.86}`} strokeWidth="0.9" />
    {i % 3 === 0 && (
      <path d={`M ${x - 0.4} ${y} L ${x - 1.6} ${y - h * 1.15}`} strokeWidth="0.9" opacity="0.8" />
    )}
  </g>
);

// 芦苇：细长弯叶 + 穗
const Reed = ({ x, y, h, p }) => (
  <g fill="none" stroke={p.reed} strokeLinecap="round">
    <path d={`M ${x} ${y} Q ${x - 3} ${y - h * 0.55} ${x - 5} ${y - h}`} strokeWidth="1.5" />
    <path d={`M ${x + 2} ${y} Q ${x + 3} ${y - h * 0.5} ${x + 6} ${y - h * 0.82}`} strokeWidth="1.3" />
    <path d={`M ${x - 0.6} ${y} Q ${x - 1.2} ${y - h * 0.45} ${x - 2.2} ${y - h * 0.72}`} strokeWidth="1" />
    <ellipse cx={x - 4.2} cy={y - h * 0.98} rx="1.3" ry="2.6" strokeWidth="0.9" />
  </g>
);

// 水体层：浅层精细（远水天光 → 倒影 → 碎光 → 可见沙石湖床 → 近岸 → 前景）
const MinimalWater = ({ p, sun, visualState: visual, uid }) => {
  const refl = visual.celestial.reflectionVisible ? p.reflection : 0;
  const cx = sun.x;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-mcWater`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.waterFar} />
          <stop offset="46%" stopColor={p.waterMid} />
          <stop offset="100%" stopColor={p.waterNear} />
        </linearGradient>
        <linearGradient id={`${uid}-mcSkyReflect`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyHorizon} stopOpacity="0.62" />
          <stop offset="100%" stopColor={p.skyHorizon} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-mcMirrorHalo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.light} stopOpacity="0.34" />
          <stop offset="45%" stopColor={p.light} stopOpacity="0.12" />
          <stop offset="100%" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-mcMirrorCore`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.light} stopOpacity="0.5" />
          <stop offset="50%" stopColor={p.light} stopOpacity="0.18" />
          <stop offset="100%" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-mcBed`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.bedShade} stopOpacity="0" />
          <stop offset="18%" stopColor={p.bedShade} stopOpacity="0.34" />
          <stop offset="48%" stopColor={p.bedSand} stopOpacity="0.72" />
          <stop offset="100%" stopColor={p.bedSand} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`${uid}-mcBedTint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.waterNear} stopOpacity="0" />
          <stop offset="35%" stopColor={p.waterNear} stopOpacity="0.26" />
          <stop offset="100%" stopColor={p.waterNear} stopOpacity="0.52" />
        </linearGradient>
        <linearGradient id={`${uid}-mcBankFill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.inkSoft} />
          <stop offset="45%" stopColor={p.ink} />
          <stop offset="100%" stopColor={p.ink} />
        </linearGradient>
        <linearGradient id={`${uid}-mcBankLight`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.bedSand} stopOpacity="0.22" />
          <stop offset="34%" stopColor={p.bedSand} stopOpacity="0.05" />
          <stop offset="100%" stopColor={p.bedSand} stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-mcSoft7`} x="-25%" y="-90%" width="150%" height="280%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`${uid}-mcSoft3`} x="-25%" y="-90%" width="150%" height="280%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${uid}-mcSoft1`} x="-15%" y="-90%" width="130%" height="280%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <clipPath id={`${uid}-mcWaterClip`}>
          <rect x="0" y={HORIZON} width={VIEW.w} height={VIEW.h - HORIZON} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-mcWaterClip)`}>
        {/* 水面底色：远浅近深 */}
        <rect x="0" y={HORIZON} width={VIEW.w} height={VIEW.h - HORIZON} fill={`url(#${uid}-mcWater)`} />

        {/* 远水反射天空的亮带（空气透视） */}
        <rect
          x="0"
          y={HORIZON}
          width={VIEW.w}
          height="116"
          fill={`url(#${uid}-mcSkyReflect)`}
          opacity="0.38"
        />

        {/* 远岸倒影：贴着地平线的深色带 */}
        <rect x="0" y={HORIZON} width={VIEW.w} height="10" fill={p.inkSoft} opacity="0.32" />
        <rect
          x="0"
          y={HORIZON + 8}
          width={VIEW.w}
          height="16"
          fill={p.inkSoft}
          opacity="0.11"
        />

        {/* 日 / 月倒影：柔光 + 碎片化横向波光（无硬边光锥） */}
        <g opacity={refl} data-celestial={refl ? "reflection" : undefined}>
          {/* 大范围柔光：垂直椭圆，无边界 */}
          <ellipse
            cx={cx}
            cy={HORIZON + 128}
            rx={124}
            ry={126}
            fill={`url(#${uid}-mcMirrorHalo)`}
            opacity="0.55"
          />
          {/* 中央光柱：模糊椭圆，越往下越散 */}
          <ellipse
            cx={cx}
            cy={HORIZON + 92}
            rx={30}
            ry={90}
            fill={`url(#${uid}-mcMirrorCore)`}
            filter={`url(#${uid}-mcSoft7)`}
            opacity="0.85"
          />
          <ellipse
            cx={cx}
            cy={HORIZON + 44}
            rx={15}
            ry={42}
            fill={`url(#${uid}-mcMirrorCore)`}
            filter={`url(#${uid}-mcSoft3)`}
            opacity="0.7"
          />
          {/* 碎光：一截截横向高光，越近越宽越散 */}
          <g filter={`url(#${uid}-mcSoft1)`}>
            {GLINTS.map((g, i) => {
              const spread = 16 + g.dy * 0.52;
              const w = g.w * (0.6 + g.dy / 260);
              return (
                <rect
                  key={`glint-${i}`}
                  x={cx + g.off * spread - w / 2}
                  y={HORIZON + 4 + g.dy}
                  width={w}
                  height={g.h}
                  rx={g.h / 2}
                  fill={p.light}
                  opacity={g.o}
                  className={i % 6 === 0 ? "mc-twinkle" : undefined}
                  style={i % 6 === 0 ? { animationDelay: `${g.d}s` } : undefined}
                />
              );
            })}
          </g>
        </g>

        {/* 浅滩沙石湖床：靠岸可透视到的浅水区（上缘渐隐，不出现硬边） */}
        <path d={SHALLOW_PATH} fill={`url(#${uid}-mcBed)`} />
        {/* 沙床上缘再加一道柔化光，压掉生硬的"沙洲线" */}
        <path
          d="M -10 350 C 110 340 240 331 380 329 C 530 327 660 338 780 358"
          fill="none"
          stroke={p.bedSand}
          strokeWidth="20"
          opacity="0.26"
          filter={`url(#${uid}-mcSoft7)`}
        />
        {/* 沙床上的水下光斑（caustics） */}
        <g fill="none" stroke={p.light} strokeLinecap="round" opacity="0.1">
          <path d="M 40 376 C 110 368 168 382 232 374" strokeWidth="1.3" />
          <path d="M 268 396 C 340 388 402 402 470 394" strokeWidth="1.1" />
          <path d="M 96 414 C 156 408 216 420 286 412" strokeWidth="1" />
          <path d="M 420 366 C 486 360 548 370 614 364" strokeWidth="1.1" />
          <path d="M 330 430 C 396 426 452 436 516 430" strokeWidth="0.9" />
          <path d="M 560 410 C 620 404 670 414 720 408" strokeWidth="0.9" />
        </g>
        {/* 卵石 / 小石块 */}
        {PEBBLES.map((s, i) => (
          <ellipse
            key={`pebble-${i}`}
            cx={s.x}
            cy={s.y}
            rx={s.rx}
            ry={s.ry}
            fill={s.light ? p.bedSand : p.bedShade}
            opacity={s.o}
          />
        ))}
        {/* 水体给沙床罩一层水色，保持"在水下"的观感 */}
        <rect
          x="0"
          y={HORIZON + 160}
          width={VIEW.w}
          height={VIEW.h - HORIZON - 160}
          fill={`url(#${uid}-mcBedTint)`}
        />

        {/* 近岸浅滩晕：沿右岸一圈亮沙 */}
        <g filter={`url(#${uid}-mcSoft7)`} opacity="0.42">
          <path d={SHORE_PATH} fill="none" stroke={p.bedSand} strokeWidth="40" opacity="0.32" />
        </g>
        {/* 近岸反光：岸线外侧一圈微亮的水面 */}
        <g filter={`url(#${uid}-mcSoft3)`} opacity="0.22">
          <path
            d={SHORE_PATH}
            fill="none"
            stroke={p.light}
            strokeWidth="7"
            transform="translate(-7 6)"
            opacity="0.5"
          />
        </g>

        {/* 水面细波纹（轻微模糊，避免"划痕感"） */}
        <g fill="none" stroke={p.light} strokeLinecap="round" filter={`url(#${uid}-mcSoft1)`}>
          {RIPPLES.map((r, i) => (
            <path
              key={`ripple-${i}`}
              d={`M ${r.x} ${r.y} Q ${r.x + r.w / 2} ${r.y + r.bend} ${r.x + r.w} ${r.y}`}
              strokeWidth={0.8 + (r.y - 180) / 300}
              opacity={r.o}
            />
          ))}
        </g>
        {/* 两组细波纹椭圆：局部水面扰动 */}
        {RIPPLE_SETS.map((set, si) => (
          <g key={`rset-${si}`} fill="none" stroke={p.light} strokeLinecap="round">
            {set.rings.map(([rx, ry], ri) => (
              <ellipse
                key={`ring-${si}-${ri}`}
                cx={set.x}
                cy={set.y}
                rx={rx}
                ry={ry}
                strokeWidth="0.75"
                opacity={0.11 - ri * 0.025}
              />
            ))}
          </g>
        ))}

        {/* 缓慢流动的横向光带（让水面"活"起来） */}
        <g fill="none" stroke={p.lightSoft} strokeLinecap="round" opacity="0.18">
          <path
            d="M -120 208 Q 120 202 360 208 T 840 210"
            strokeWidth="1.3"
            strokeDasharray="34 220"
            className="mc-flow"
            style={{ animationDuration: "26s" }}
          />
          <path
            d="M -180 268 Q 140 261 420 268 T 960 272"
            strokeWidth="1.6"
            strokeDasharray="52 300"
            className="mc-flow"
            style={{ animationDuration: "34s", animationDelay: "-9s" }}
          />
          <path
            d="M -220 318 Q 160 312 480 318 T 1000 322"
            strokeWidth="1.8"
            strokeDasharray="70 340"
            className="mc-flow"
            style={{ animationDuration: "44s", animationDelay: "-17s" }}
          />
        </g>

        {/* 近岸岸体 */}
        <path d={BANK_PATH} fill={`url(#${uid}-mcBankFill)`} />
        {/* 岸面顶部的月光/天光（与水面拉开层次） */}
        <path d={BANK_PATH} fill={`url(#${uid}-mcBankLight)`} />
        {/* 岸面湿边 + 水线高光 */}
        <path
          d={SHORE_PATH}
          fill="none"
          stroke={p.shoreHighlight}
          strokeWidth="1.6"
          opacity="0.34"
        />
        <path
          d={SHORE_PATH}
          fill="none"
          stroke={p.lightSoft}
          strokeWidth="0.8"
          opacity="0.2"
          transform="translate(0 3.5)"
        />
        {/* 岸上碎石 / 石块 */}
        <g opacity="0.5">
          <ellipse cx="906" cy="252" rx="7" ry="2.6" fill={p.bedShade} />
          <ellipse cx="944" cy="244" rx="5" ry="2" fill={p.bedShade} />
          <ellipse cx="972" cy="258" rx="9" ry="3.2" fill={p.bedShade} />
          <ellipse cx="816" cy="268" rx="4.5" ry="1.8" fill={p.bedShade} />
          <ellipse cx="836" cy="256" rx="3" ry="1.4" fill={p.bedShade} />
        </g>
        {/* 岸草 */}
        {BANK_GRASS.map(([x, y, h], i) => (
          <Grass key={`grass-${i}`} x={x} y={y} h={h} p={p} i={i} />
        ))}
        {/* 岸边小石堆（右侧前景） */}
        <g fill={p.ink}>
          <ellipse cx="930" cy="430" rx="46" ry="18" />
          <ellipse cx="978" cy="414" rx="30" ry="13" />
          <ellipse cx="892" cy="436" rx="28" ry="12" />
        </g>
        <g fill="none" stroke={p.shoreHighlight} strokeLinecap="round" opacity="0.18">
          <path d="M 900 416 Q 930 410 958 416" strokeWidth="1" />
          <path d="M 956 404 Q 976 400 996 404" strokeWidth="0.9" />
        </g>
        <Reed x={948} y={424} h={30} p={p} />
        <Reed x={974} y={418} h={24} p={p} />
        <Reed x={906} y={432} h={20} p={p} />

        {/* 左前景礁石 + 芦苇，做前中后景层次 */}
        <g fill={p.ink}>
          <path d={FOREGROUND_ROCK} />
          <ellipse cx="86" cy="440" rx="34" ry="12" />
        </g>
        <Reed x={26} y={404} h={46} p={p} />
        <Reed x={44} y={398} h={38} p={p} />
        <Reed x={60} y={410} h={30} p={p} />
        <Reed x={78} y={432} h={22} p={p} />
        <Grass x={94} y={436} h={14} p={p} i={1} />

        {/* 水面薄雾（天气层叠加，越靠岸越淡） */}
        {p.mistOpacity > 0 && (
          <rect
            x="0"
            y={HORIZON + 6}
            width={VIEW.w}
            height="70"
            fill={p.haze}
            opacity={p.mistOpacity}
            filter={`url(#${uid}-mcSoft7)`}
          />
        )}
      </g>
    </g>
  );
};

export default MinimalWater;
