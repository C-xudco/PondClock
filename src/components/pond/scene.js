// Rendering coordinates only. Geographic sites and route prices live elsewhere.
export const VIEW = Object.freeze({
  w: 1000,
  h: 440
});
export const BOBBER = Object.freeze({
  x: 528,
  surfaceY: 338,
  height: 38,
  sink: 17
});
export const FISHER = Object.freeze({
  x: 925,
  seatY: 310,
  support: { x: 940, y: 329 },
  image: {
    x: 806,
    y: 154,
    width: 177,
    height: 185
  },
  grip: {
    x: 853,
    y: 244
  },
  rodTip: {
    x: 575,
    y: 128
  },
  bubble: {
    left: 47,
    right: 3,
    tailLeft: 75,
    bottom: 72,
    maxHeight: 27
  }
});
export const ROD_BITE_DEG = -8.5;
export const PERSON_BITE_DEG = -2.4;
export const rotatePoint = (pt, center, deg) => {
  const a = deg * Math.PI / 180;
  const dx = pt.x - center.x,
    dy = pt.y - center.y;
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a)
  };
};
export const fisherBodyPointAt = (point, pose, geometry) => {
  const rotated = rotatePoint(point, { x: FISHER.x, y: FISHER.seatY }, PERSON_BITE_DEG * pose);
  return { x: rotated.x, y: rotated.y + (geometry?.actorOffsetY || 0) };
};
export const fisherTipAt = (pose, geometry, grip = FISHER.grip) => fisherBodyPointAt(
  rotatePoint(FISHER.rodTip, grip, ROD_BITE_DEG * pose), pose, geometry,
);
// The image, click target and speech anchor consume the same per-scene placement.
export const actorPlacementFor = (geometry) => {
  const offsetY = geometry?.actorOffsetY || 0;
  return {
    offsetY,
    transform: `translate(0 ${offsetY})`,
    image: { ...FISHER.image, y: FISHER.image.y + offsetY },
    bubble: { ...FISHER.bubble, bottom: FISHER.bubble.bottom - offsetY / VIEW.h * 100, ...geometry?.bubble },
  };
};
export const bobberTopAt = sinkT => ({
  x: BOBBER.x,
  y: BOBBER.surfaceY - BOBBER.height + BOBBER.sink * sinkT
});

// Conservative authored water areas exclude every painted bank, bridge, island and the seat.
// One polygon drives BOTH SVG clipping and contact queries; no separate y>horizon approximation.
const shorelines = {
  jiangnan: [[0, 245], [180, 212], [345, 208], [600, 212], [1000, 211]],
  huaihe: [[0, 214], [200, 208], [500, 206], [1000, 202]],
  huanghe: [[0, 188], [180, 180], [300, 170], [520, 164], [1000, 163]],
  changjiang: [[0, 181], [350, 178], [680, 177], [1000, 183]],
  dongnan: [[0, 180], [140, 180], [230, 184], [600, 184], [1000, 176]],
  lingnan: [[0, 235], [350, 235], [650, 229], [1000, 226]],
  xinan: [[0, 316], [300, 306], [450, 305], [700, 306], [1000, 306]],
  yungui: [[0, 217], [350, 215], [650, 216], [1000, 216]],
  hainan: [[0, 252], [240, 234], [490, 220], [650, 208], [1000, 211]],
  dongbei: [[0, 232], [400, 225], [700, 224], [1000, 223]],
  xibei: [[0, 249], [300, 246], [600, 241], [700, 235]],
  qingzang: [[0, 184], [400, 185], [700, 185], [1000, 186]]
};
const nearBank = {
  default: [[1000, 268], [940, 285], [855, 307], [790, 330], [745, 360], [690, 395], [565, 440]],
  xibei: [[690, 250], [650, 272], [615, 292], [690, 315], [790, 338], [850, 365], [800, 395], [500, 440]],
  qingzang: [[1000, 280], [925, 300], [840, 325], [760, 360], [650, 400], [420, 440]],
  hainan: [[1000, 268], [920, 280], [850, 302], [800, 328], [760, 357], [720, 389], [600, 440]],
  xinan: [[1000, 320], [930, 336], [870, 350], [790, 375], [700, 410], [600, 440]]
};
// Grounding annotations from the 2026-10-25 production 640 scene atlas.
// supportBand is the painted rock/earth range beneath the character contact column (x≈940).
// Keep this independent from the conservative water mask: nonwater alone does not prove support.
const actorGrounding = {
  jiangnan: { offsetY: 0, supportBand: [305, 385] },
  huaihe: { offsetY: 75, supportBand: [380, 435] },
  huanghe: { offsetY: 0, supportBand: [313, 365] },
  changjiang: { offsetY: 50, supportBand: [355, 415] },
  dongnan: { offsetY: 80, supportBand: [385, 435] },
  lingnan: { offsetY: 50, supportBand: [360, 425] },
  xinan: { offsetY: 70, supportBand: [380, 435] },
  yungui: { offsetY: 15, supportBand: [330, 400] },
  hainan: { offsetY: 0, supportBand: [310, 380] },
  dongbei: { offsetY: 0, supportBand: [316, 380] },
  xibei: { offsetY: 0, supportBand: [313, 390] },
  qingzang: { offsetY: 0, supportBand: [316, 400] },
};
const asPath = points => points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ") + " Z";
export const SCENE_GEOMETRIES = Object.freeze(Object.fromEntries(Object.entries(shorelines).map(([id, far]) => {
  const bank = nearBank[id] || nearBank.default;
  const polygon = [...far, ...bank, [0, 440]];
  return [id, Object.freeze({
    id,
    revision: 3,
    assetRevision: id === "dongbei" ? 2 : 1,
    horizonY: Math.max(...far.map(p => p[1])),
    waterPolygon: polygon,
    waterPath: asPath(polygon),
    asset: `art/inkwash/${id}-v${id === "dongbei" ? 2 : 1}.jpg`,
    bobber: BOBBER,
    fisher: FISHER,
    actorOffsetY: actorGrounding[id].offsetY,
    actorSupportBand: Object.freeze(actorGrounding[id].supportBand),
    celestial: {
      x: id === "xinan" ? 455 : 590,
      y: 52
    }
  })];
})));
export const geometryForRegion = id => SCENE_GEOMETRIES[id] || SCENE_GEOMETRIES.jiangnan;

// Original SVG shoreline sampled from the same cubic curves painted in MinimalWater.
// This mask is shared by rain/snow landing queries and their SVG clipping.
const minimalShore = (() => {
  const points = [[1000, 176]];
  const curves = [
    [[1000, 176], [940, 198], [890, 210], [856, 231]],
    [[856, 231], [812, 244], [780, 259], [764, 282]],
    [[764, 282], [750, 304], [756, 328], [746, 354]],
    [[746, 354], [734, 384], [712, 414], [698, 452]],
  ];
  for (const curve of curves) for (let i = 1; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    const p = [0, 1].map(axis => u ** 3 * curve[0][axis] + 3 * u ** 2 * t * curve[1][axis] + 3 * u * t ** 2 * curve[2][axis] + t ** 3 * curve[3][axis]);
    if (p[1] > VIEW.h) {
      const previous = points.at(-1), ratio = (VIEW.h - previous[1]) / (p[1] - previous[1]);
      points.push([previous[0] + (p[0] - previous[0]) * ratio, VIEW.h]);
      return points;
    }
    points.push(p);
  }
  return points;
})();
const minimalWater = [[0, 177], ...minimalShore, [120, 440], [108, 432], [83, 428], [60, 412], [25, 398], [0, 398]];
export const MINIMAL_GEOMETRIES = Object.freeze(Object.fromEntries(Object.keys(SCENE_GEOMETRIES).map(regionId => [regionId, Object.freeze({
  id: `minimal-${regionId}`,
  regionId, revision: 1, horizonY: 170, asset: null,
  waterPolygon: minimalWater, waterPath: asPath(minimalWater),
  bobber: BOBBER, fisher: FISHER, actorOffsetY: -80,
  actorSupportBand: [235, 270],
  // Keep a two-line bubble within the shorter sky of the original composition.
  bubble: { bottom: 78, maxHeight: 21 },
  celestial: { x: 590, y: 52 },
})])));
export const geometryForAppearance = (regionId, style = 'minimal') => style === 'inkwash'
  ? geometryForRegion(regionId) : MINIMAL_GEOMETRIES[regionId] || MINIMAL_GEOMETRIES.jiangnan;
export function isWaterPoint(geometry, x, y) {
  const points = geometry.waterPolygon;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const visualRandom = seed => {
  let s = seed >>> 0;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
};
export const STARS = (() => {
  const random = visualRandom(20261025);
  return Array.from({
    length: 24
  }, () => ({
    x: 40 + random() * 880,
    y: 8 + random() * 76,
    r: .55 + random() * 1.15
  }));
})();
