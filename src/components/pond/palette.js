// 水塘场景配色：按昼夜阶段 + 天气派生低饱和写实色板
// 设计基调：静谧剪影 / 低饱和夜色 / 水面微光，避免卡通亮色
// 所有颜色集中在这里，换季换色只需改本文件

// 天空底色不透明度：0~1，调低可让桌面壁纸透出来（桌面端透明窗口用）
// 1 = 完全不透明；0.78 为当前"半透明桌面挂件"观感。
export const SKY_ALPHA = 0.6;

// 昼夜四段：夜 / 拂晓 / 白昼 / 黄昏
export const phaseOf = (hour) => {
  const h = (((Number(hour) || 0) % 24) + 24) % 24;
  if (h >= 20 || h < 5) return "night";
  if (h < 7) return "dawn";
  if (h < 17) return "day";
  return "dusk";
};

const BASE = {
  night: {
    skyTop: "#04070f",
    skyMid: "#0a1220",
    skyHorizon: "#1b2a3f",
    haze: "#33506b",
    horizonGlow: "#4f7d9e",
    horizonGlowOpacity: 0.14,
    mountainFar: "#101c2c",
    mountainNear: "#0a131f",
    ridgeLow: "#070e17",
    waterFar: "#24384d",
    waterMid: "#142436",
    waterNear: "#0a1622",
    bedSand: "#4a4a3f",
    bedShade: "#1e2c35",
    ink: "#04080e",
    inkSoft: "#0a1421",
    light: "#cfe1f0",
    lightSoft: "#8dabc2",
    glow: "#d6e6f5",
    starOpacity: 0.95,
    reflection: 0.4,
    shoreHighlight: "#8fb6cc",
    reed: "#040910",
    cloudColor: "#6f8aab",
    cloudOpacity: 0.18,
    sunCore: "#e8f0f8",
    sunEdge: "#b9cee0",
  },
  dawn: {
    skyTop: "#141a2e",
    skyMid: "#2a2c46",
    skyHorizon: "#6b5a63",
    haze: "#b08a80",
    horizonGlow: "#e6b08c",
    horizonGlowOpacity: 0.3,
    mountainFar: "#2b2c40",
    mountainNear: "#1a1c2c",
    ridgeLow: "#12131f",
    waterFar: "#565b72",
    waterMid: "#303a50",
    waterNear: "#1b2433",
    bedSand: "#6b6453",
    bedShade: "#293540",
    ink: "#0b1018",
    inkSoft: "#16202c",
    light: "#e5d9c8",
    lightSoft: "#a99b95",
    glow: "#f3cdae",
    starOpacity: 0.18,
    reflection: 0.4,
    shoreHighlight: "#c9a994",
    reed: "#0a0e15",
    cloudColor: "#c2a79f",
    cloudOpacity: 0.5,
    sunCore: "#f7d9b2",
    sunEdge: "#e5a982",
  },
  day: {
    skyTop: "#7d96ab",
    skyMid: "#9db2c0",
    skyHorizon: "#d3cebd",
    haze: "#e2ddcb",
    horizonGlow: "#f2e9d2",
    horizonGlowOpacity: 0.34,
    mountainFar: "#748d99",
    mountainNear: "#4d6773",
    ridgeLow: "#334b57",
    waterFar: "#8ba1a6",
    waterMid: "#5b7d81",
    waterNear: "#43666a",
    bedSand: "#b3a687",
    bedShade: "#5c716f",
    ink: "#1c2630",
    inkSoft: "#2c3843",
    light: "#f4f6f3",
    lightSoft: "#b9c8cb",
    glow: "#fbf1d8",
    starOpacity: 0,
    reflection: 0.24,
    shoreHighlight: "#d8d2be",
    reed: "#1a242b",
    cloudColor: "#f5f3ec",
    cloudOpacity: 0.8,
    sunCore: "#f7efd6",
    sunEdge: "#e2cf9f",
  },
  dusk: {
    skyTop: "#1a1930",
    skyMid: "#3a2c40",
    skyHorizon: "#8a5a4c",
    haze: "#c8866a",
    horizonGlow: "#e8a068",
    horizonGlowOpacity: 0.34,
    mountainFar: "#33293c",
    mountainNear: "#1d1a29",
    ridgeLow: "#15131f",
    waterFar: "#66565c",
    waterMid: "#383648",
    waterNear: "#212232",
    bedSand: "#6e6250",
    bedShade: "#2c323a",
    ink: "#080c12",
    inkSoft: "#121a25",
    light: "#e7d3c0",
    lightSoft: "#a68f8d",
    glow: "#f2bf92",
    starOpacity: 0.22,
    reflection: 0.44,
    shoreHighlight: "#c79a82",
    reed: "#06090f",
    cloudColor: "#c49a86",
    cloudOpacity: 0.52,
    sunCore: "#f9d2a2",
    sunEdge: "#e39a74",
  },
};

// 天气对配色的微调：只做视觉，不影响玩法
const WEATHER = {
  晴: { overcastOpacity: 0, cloudMul: 0, mistOpacity: 0, rainOpacity: 0, snowOpacity: 0, skyTint: null },
  多云: { overcastOpacity: 0.1, cloudMul: 1, mistOpacity: 0.05, rainOpacity: 0, snowOpacity: 0, skyTint: "#5d6b78" },
  小雨: { overcastOpacity: 0.3, cloudMul: 0.9, mistOpacity: 0.16, rainOpacity: 1, snowOpacity: 0, skyTint: "#46525e" },
  雪: { overcastOpacity: 0.26, cloudMul: 0.95, mistOpacity: 0.2, rainOpacity: 0, snowOpacity: 1, skyTint: "#9fb0c2" },
};

export const getPalette = (phase, weather) => {
  const base = BASE[phase] || BASE.night;
  const w = WEATHER[weather] || WEATHER["晴"];
  return {
    ...base,
    phase,
    weather,
    overcastOpacity: w.overcastOpacity,
    cloudMul: w.cloudMul,
    mistOpacity: w.mistOpacity,
    rainOpacity: w.rainOpacity,
    snowOpacity: w.snowOpacity,
    skyTint: w.skyTint,
    cloudOpacity: base.cloudOpacity * w.cloudMul,
    isNight: phase === "night",
    isLow: phase === "dawn" || phase === "dusk",
  };
};

// 太阳 / 月亮在天空中的位置（视角 0..1000 x 0..440）
export const sunMoonOf = (hour, phase) => {
  const h = (((Number(hour) || 0) % 24) + 24) % 24;
  if (phase === "night") {
    const t = Math.min(1, Math.max(0, ((((h - 18) % 24) + 24) % 24) / 12));
    return {
      kind: "moon",
      t,
      x: 300 + 470 * t,
      y: 152 - 92 * Math.sin(Math.PI * t),
      r: 12.5,
    };
  }
  // 白昼 / 拂晓 / 黄昏共用一个日轨：5 点东升，19 点西落
  const t = Math.min(1, Math.max(0, (h - 5) / 14));
  return {
    kind: "sun",
    t,
    x: 180 + 640 * t,
    y: 152 - 108 * Math.sin(Math.PI * t),
    r: phase === "day" ? 13 : 17,
  };
};
