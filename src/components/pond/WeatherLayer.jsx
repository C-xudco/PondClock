import { useMemo } from "react";

// 确定性伪随机：同一场天气每次渲染的雨雪位置一致（截图稳定，不闪烁）
const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// 天气层：只做视觉（雨 / 雪 / 雾），不拦截鼠标、不遮挡关键 UI
const WeatherLayer = ({ weather, night = false }) => {
  const particles = useMemo(() => {
    const isRain = weather === "小雨";
    const isSnow = weather === "雪";
    if (!isRain && !isSnow) return [];
    const r = seeded(isRain ? 48121 : 90210);
    const count = isRain ? 54 : 46;
    return Array.from({ length: count }, () => ({
      left: r() * 100,
      top: -12 - r() * 60,
      delay: -r() * (isRain ? 1.6 : 7),
      dur: isRain ? 0.55 + r() * 0.45 : 5 + r() * 4.5,
      size: isRain ? 0.9 + r() * 0.7 : 2.4 + r() * 3,
      len: isRain ? 9 + r() * 9 : 0,
      op: isRain ? 0.18 + r() * 0.28 : 0.5 + r() * 0.42,
    }));
  }, [weather]);

  const isRain = weather === "小雨";
  const isSnow = weather === "雪";
  if (!isRain && !isSnow) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[12] overflow-hidden">
      {/* 雨 / 雪 的湿冷空气感 */}
      <div
        className="absolute inset-0"
        style={{
          background: isRain
            ? "linear-gradient(180deg, rgba(30,44,56,.18) 0%, rgba(20,32,44,.05) 55%, rgba(16,26,36,.16) 100%)"
            : "linear-gradient(180deg, rgba(190,206,222,.1) 0%, rgba(190,206,222,.02) 60%, rgba(190,206,222,.08) 100%)",
        }}
      />
      {particles.map((p, i) =>
        isRain ? (
          <span
            key={`rain-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}px`,
              width: "1px",
              height: `${p.len}px`,
              opacity: p.op,
              background: night
                ? "linear-gradient(180deg, rgba(206,226,244,0) 0%, rgba(206,226,244,.95) 70%, rgba(206,226,244,0) 100%)"
                : "linear-gradient(180deg, rgba(232,242,250,0) 0%, rgba(232,242,250,.9) 70%, rgba(232,242,250,0) 100%)",
              transform: "rotate(7deg)",
              animation: `mc-fall ${p.dur}s linear ${p.delay}s infinite`,
            }}
          />
        ) : (
          <span
            key={`snow-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${p.left}%`,
              top: `${p.top}px`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.op,
              background: "radial-gradient(circle at 35% 30%, #ffffff, #dbe6f0)",
              boxShadow: "0 0 4px rgba(255,255,255,.45)",
              animation: `mc-snow ${p.dur}s linear ${p.delay}s infinite`,
            }}
          />
        )
      )}
    </div>
  );
};

export default WeatherLayer;
