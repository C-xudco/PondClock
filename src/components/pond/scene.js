// 水塘场景几何常量 + 确定性装饰点生成
// 说明：整个场景用一个 1000 x 440 的 SVG 坐标系绘制，容器按该比例自适应，
// 因此所有元素（天空 / 水面 / 岸 / 人物 / 浮漂 / 气泡锚点）共用一套坐标，缩放不会错位。

export const VIEW = { w: 1000, h: 440 };

// 地平线：之上为天空与远山，之下为水面
export const HORIZON = 170;

// 岸线路径（水陆分界，复用于岸体填充 / 湿边高光 / 浅滩晕染）
// 由右缘入画，向左下延伸到画面底：近岸在右侧，人物站在岸上
export const SHORE_PATH =
  "M 1000 176 C 940 198 890 210 856 231 C 812 244 780 259 764 282 " +
  "C 750 304 756 328 746 354 C 734 384 712 414 698 452";

// 岸体（含右侧画外延伸，保证任何宽度都不露缝）
export const BANK_PATH = `${SHORE_PATH} L 1010 452 Z`;

// 近岸浅滩上缘：向右延伸进岸体下方，避免出现生硬的垂直切边
export const SHALLOW_PATH =
  "M -10 350 C 110 340 240 331 380 329 C 530 327 660 338 780 358 " +
  "C 870 373 950 381 1010 384 L 1010 452 L -10 452 Z";

// 左前景小洲 / 礁石
export const FOREGROUND_ROCK =
  "M -10 452 L -10 398 C 22 392 46 400 60 412 C 72 422 78 434 80 452 Z";

// 人物：站在右岸岸面上，侧身面向左（scale 整体放大，便于看清剪影）
export const FISHER = {
  x: 866, // 身体中心（缩放基准 x）
  feetY: 246, // 脚底（缩放基准 y）
  scale: 1.1,
  head: { x: 855, y: 157, r: 8.2 },
  grip: { x: 832, y: 203 }, // 握竿点（旋转支点，落在竿身上）
  rodTip: { x: 575, y: 128 }, // 待机竿梢（约画面 58% 宽，浮漂在其正下方）
  bubble: { left: 64, right: 2.5, tailLeft: 62, bottom: 77, maxHeight: 20 },
};

// 浮漂：漂在水面，只画水面以上部分（水下被 clip 裁掉）
export const BOBBER = {
  x: 528, // 基本位于竿梢正下方
  surfaceY: 338, // 水线
  height: 38, // 水面以上高度（含天线顶珠）
  sink: 17, // 咬钩下沉距离（保留一小截红色漂尾可见）
};

// 鱼竿 / 人物咬钩姿态角度
export const ROD_BITE_DEG = -8.5; // 绕握竿点：负角 = 竿梢下压
export const PERSON_BITE_DEG = -2.4; // 绕脚底：负角 = 前倾

export const rotatePoint = (pt, center, deg) => {
  const a = (deg * Math.PI) / 180;
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
};

// 竿梢实际落点（竿绕握竿点旋转 → 人物绕脚底前倾 → 整体放大）
export const fisherTipAt = (pose) => {
  const center = { x: FISHER.x, y: FISHER.feetY };
  const p = rotatePoint(
    rotatePoint(FISHER.rodTip, FISHER.grip, ROD_BITE_DEG * pose),
    center,
    PERSON_BITE_DEG * pose
  );
  return {
    x: FISHER.x + (p.x - FISHER.x) * FISHER.scale,
    y: FISHER.feetY + (p.y - FISHER.feetY) * FISHER.scale,
  };
};

// 浮漂顶端（钓线系点）随下沉移动
export const bobberTopAt = (sinkT) => ({
  x: BOBBER.x,
  y: BOBBER.surfaceY - BOBBER.height + BOBBER.sink * sinkT,
});

// —— 确定性伪随机（避免每次渲染跳变，截图稳定）——
const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export const STARS = (() => {
  const r = rng(20240517);
  return Array.from({ length: 58 }, () => ({
    x: 12 + r() * 976,
    y: 6 + r() * 118,
    s: 0.5 + r() * 1.35,
    o: 0.25 + r() * 0.75,
    d: r() * 6,
  }));
})();

export const CLOUDS = (() => {
  const r = rng(77123);
  return Array.from({ length: 6 }, (_, i) => ({
    x: -40 + i * 175 + r() * 90,
    y: 34 + r() * 78,
    w: 130 + r() * 150,
    h: 14 + r() * 16,
    o: 0.5 + r() * 0.5,
  }));
})();

// 水面细波纹：越靠近画面底部越宽、越疏（透视）
export const RIPPLES = (() => {
  const r = rng(99117);
  return Array.from({ length: 17 }, (_, i) => {
    const k = i / 16;
    const y = 182 + k * 232 + r() * 8;
    return {
      y,
      x: -40 + r() * 480,
      w: 90 + r() * 240,
      o: 0.035 + r() * 0.075,
      bend: (r() - 0.5) * 3,
    };
  });
})();

// 月光/日光的碎片化碎光点：只落在倒影柱附近，越近越散
export const GLINTS = (() => {
  const r = rng(55331);
  return Array.from({ length: 44 }, () => {
    const dy = 3 + Math.pow(r(), 0.82) * 178;
    return {
      dy,
      off: r() * 2 - 1,
      w: 4 + r() * 20,
      h: 0.65 + r() * 0.7,
      o: 0.05 + r() * 0.24,
      d: r() * 4,
    };
  });
})();

// 两组细波纹椭圆（让水面有局部扰动，而不是纯横线）
export const RIPPLE_SETS = [
  { x: 372, y: 296, rings: [[26, 3.4], [42, 5.2], [60, 7.2]] },
  { x: 690, y: 402, rings: [[32, 4.2], [50, 6.4]] },
];

// 浅滩卵石（只出现在浅水带，用于体现"看得见沙石湖床"）
export const PEBBLES = (() => {
  const r = rng(31007);
  return Array.from({ length: 44 }, () => {
    const y = 356 + r() * 74;
    const x = -10 + r() * 790;
    return {
      x,
      y,
      rx: 1 + r() * 2.8,
      ry: 0.5 + r() * 1.3,
      o: 0.12 + r() * 0.24,
      light: r() > 0.45,
    };
  });
})();

// 岸上草丛（沿真实岸线手摆，避免越界到水里）
export const BANK_GRASS = [
  [998, 197, 11],
  [978, 202, 8],
  [952, 205, 13],
  [934, 211, 9],
  [910, 217, 12],
  [892, 221, 8],
  [870, 227, 10],
  [852, 232, 14],
  [836, 238, 9],
  [820, 244, 12],
  [806, 249, 8],
  [792, 258, 13],
  [780, 268, 9],
  [770, 278, 12],
  [760, 292, 8],
  [754, 306, 11],
  [752, 322, 9],
  [748, 338, 13],
  [744, 354, 9],
  [738, 372, 12],
  [730, 392, 9],
  [722, 410, 12],
  [712, 428, 10],
];

// 远岸芦苇
export const FAR_REEDS = [
  [26, 172, 13], [52, 172, 18], [74, 171, 9], [96, 172, 14],
  [318, 172, 11], [336, 171, 17], [352, 172, 9], [372, 172, 13],
  [612, 172, 10], [630, 171, 16], [648, 172, 8], [700, 172, 12],
  [916, 172, 14], [936, 171, 9], [958, 172, 17], [982, 172, 11],
];
