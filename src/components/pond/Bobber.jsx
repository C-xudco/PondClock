import { BOBBER } from "./scene";

// 浮漂配色：拟真立式漂（上红下白 + 深色细环 + 顶部细天线与顶珠）
const FLOAT = {
  red: "#cf5142",
  redDark: "#9a3a30",
  white: "#efe9db",
  whiteShade: "#c3bdae",
  ring: "#16222c",
  stem: "#1b2733",
  bead: "#e08a5c",
  sheen: "#f6f1e6",
};

// 立式浮漂：只画水面以上部分（水下被 clip 裁掉），咬钩时整体下沉
const Bobber = ({ p, biting, sinkT = 0 }) => {
  const { x, surfaceY } = BOBBER;
  const sink = BOBBER.sink * sinkT;
  const clipId = "mcBobberClip";

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x - 40} y={surfaceY - 90} width="80" height="90" />
        </clipPath>
        <radialGradient id="mcFloatWarm" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#e8b184" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e8b184" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mcFloatBiteGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.light} stopOpacity="0.5" />
          <stop offset="100%" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 极轻微的暖色光晕：夜间把浮漂从深色水面里"挑"出来，不做成发光球 */}
      <ellipse
        cx={x}
        cy={surfaceY - 16}
        rx={12}
        ry={22}
        fill="url(#mcFloatWarm)"
        opacity={biting ? 0.85 : 0.7}
      />

      {/* 漂身倒影（水下的淡淡暗影，帮助浮漂"落在"水面上） */}
      <path
        d={`M ${x - 2.4} ${surfaceY + 1} L ${x + 2.4} ${surfaceY + 1} L ${x + 4} ${surfaceY + 13} L ${
          x - 4
        } ${surfaceY + 13} Z`}
        fill={p.light}
        opacity="0.06"
      />

      {/* 咬钩时水面泛光 */}
      <ellipse
        cx={x}
        cy={surfaceY + 1}
        rx="32"
        ry="7.5"
        fill="url(#mcFloatBiteGlow)"
        opacity={biting ? 0.85 : 0}
      />

      {/* 水面波纹：待机时缓缓一圈；咬钩时连续扩散、更明显 */}
      <ellipse
        cx={x}
        cy={surfaceY + 0.5}
        rx="14"
        ry="3.8"
        fill="none"
        stroke={p.lightSoft}
        strokeWidth="0.8"
        opacity="0.2"
        className="mc-ring"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animationDelay: "-1.6s",
        }}
      />
      {biting && (
        <>
          <ellipse
            cx={x}
            cy={surfaceY + 0.5}
            rx="16"
            ry="4.3"
            fill="none"
            stroke={p.light}
            strokeWidth="0.75"
            opacity="0.28"
            className="mc-ring mc-ring-fast"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          <ellipse
            cx={x}
            cy={surfaceY + 0.5}
            rx="17"
            ry="4.6"
            fill="none"
            stroke={p.light}
            strokeWidth="0.7"
            opacity="0.2"
            className="mc-ring mc-ring-fast"
            style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: "0.55s" }}
          />
          <ellipse
            cx={x}
            cy={surfaceY + 0.5}
            rx="18"
            ry="5"
            fill="none"
            stroke={p.lightSoft}
            strokeWidth="0.65"
            opacity="0.14"
            className="mc-ring mc-ring-slow"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        </>
      )}

      {/* 浮漂本体（水下部分被裁） */}
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(0 ${sink.toFixed(2)})`}>
          {/* 天线 */}
          <path
            d={`M ${x - 0.5} ${surfaceY - 24} L ${x - 0.32} ${surfaceY - 36.6} L ${
              x + 0.32
            } ${surfaceY - 36.6} L ${x + 0.5} ${surfaceY - 24} Z`}
            fill={FLOAT.stem}
          />
          {/* 顶部小珠 */}
          <circle cx={x} cy={surfaceY - 37.2} r="1.85" fill={FLOAT.bead} />
          <circle cx={x - 0.55} cy={surfaceY - 37.9} r="0.6" fill={FLOAT.sheen} opacity="0.8" />

          {/* 漂身：白色下段（略微鼓腹） */}
          <path
            d={`M ${x - 1.85} ${surfaceY - 10} Q ${x - 2.7} ${surfaceY - 1} ${x - 2.75} ${
              surfaceY + 7.5
            } L ${x + 2.75} ${surfaceY + 7.5} Q ${x + 2.7} ${surfaceY - 1} ${x + 1.85} ${
              surfaceY - 10
            } Z`}
            fill={FLOAT.white}
          />
          {/* 白色段暗面 */}
          <path
            d={`M ${x + 0.4} ${surfaceY - 10} Q ${x + 1.5} ${surfaceY - 1} ${x + 1.9} ${
              surfaceY + 7.5
            } L ${x + 2.75} ${surfaceY + 7.5} Q ${x + 2.7} ${surfaceY - 1} ${x + 1.85} ${
              surfaceY - 10
            } Z`}
            fill={FLOAT.whiteShade}
            opacity="0.55"
          />

          {/* 漂身：红色上段（向天线收细） */}
          <path
            d={`M ${x - 1.85} ${surfaceY - 10} Q ${x - 1.2} ${surfaceY - 17} ${x - 0.72} ${
              surfaceY - 24
            } L ${x + 0.72} ${surfaceY - 24} Q ${x + 1.2} ${surfaceY - 17} ${x + 1.85} ${
              surfaceY - 10
            } Z`}
            fill={FLOAT.red}
          />
          <path
            d={`M ${x + 0.3} ${surfaceY - 10} Q ${x + 0.9} ${surfaceY - 17} ${x + 0.7} ${
              surfaceY - 24
            } L ${x + 0.72} ${surfaceY - 24} Q ${x + 1.2} ${surfaceY - 17} ${x + 1.85} ${
              surfaceY - 10
            } Z`}
            fill={FLOAT.redDark}
            opacity="0.75"
          />

          {/* 深色细环：红白交界 / 上头 / 腰部 */}
          <rect x={x - 2.15} y={surfaceY - 11} width="4.3" height="1.55" rx="0.5" fill={FLOAT.ring} />
          <rect x={x - 1.1} y={surfaceY - 25} width="2.2" height="1.1" rx="0.4" fill={FLOAT.ring} />
          <rect
            x={x - 2.55}
            y={surfaceY + 4.2}
            width="5.1"
            height="1.05"
            rx="0.4"
            fill={FLOAT.ring}
            opacity="0.85"
          />

          {/* 高光：左侧一道细反光，避免"塑料感" */}
          <path
            d={`M ${x - 1.2} ${surfaceY - 22} Q ${x - 1.9} ${surfaceY - 13} ${x - 1.65} ${
              surfaceY + 5.5
            }`}
            fill="none"
            stroke={FLOAT.sheen}
            strokeWidth="0.66"
            opacity="0.42"
          />
          <path
            d={`M ${x - 0.4} ${surfaceY - 36} L ${x - 0.4} ${surfaceY - 25}`}
            fill="none"
            stroke={FLOAT.sheen}
            strokeWidth="0.42"
            opacity="0.45"
          />
          {/* 漂尾红段顶端的暖色反光 */}
          <path
            d={`M ${x - 0.75} ${surfaceY - 23} Q ${x - 1.25} ${surfaceY - 17} ${x - 1.6} ${
              surfaceY - 11.5
            }`}
            fill="none"
            stroke="#f3c9a2"
            strokeWidth="0.5"
            opacity="0.45"
          />
        </g>
      </g>

      {/* 水线一点高光，压住浮漂与水面 */}
      <rect
        x={x - 6}
        y={surfaceY - 0.3}
        width="12"
        height="1"
        rx="0.5"
        fill={p.light}
        opacity={biting ? 0.34 : 0.2}
      />

      {/* 咬钩溅起的小水点 */}
      {biting && (
        <g fill={p.light} opacity={0.34 * sinkT}>
          <ellipse cx={x - 6.5} cy={surfaceY - 2.8} rx="1.5" ry="0.9" />
          <ellipse cx={x + 7.6} cy={surfaceY - 3.6} rx="1.1" ry="0.7" />
          <ellipse cx={x + 3.2} cy={surfaceY - 4.8} rx="0.9" ry="0.6" />
        </g>
      )}
    </g>
  );
};

export default Bobber;
