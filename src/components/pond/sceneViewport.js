import { VIEW } from './scene.js';

// One uniform transform for the illustration, weather, actors and hit areas.
// Size is the scene's inner box (excluding its border), in CSS pixels.
export function coverScene(width, height, safeBottom = 0) {
  if (!(width > 0 && height > 0)) return null;
  const scale = Math.max(width / VIEW.w, height / VIEW.h);
  const overflowY = height - VIEW.h * scale;
  // Regions with a lower bank keep the actor's feet and float above the crop.
  const top = Math.max(overflowY, Math.min(overflowY / 2, height - safeBottom * scale));
  return { width: VIEW.w * scale, height: VIEW.h * scale,
    left: (width - VIEW.w * scale) / 2, top,
    viewportWidth: width, viewportHeight: height, scale };
}

export function visibleCelestial(point, horizonY, frame, radius = 13) {
  if (!frame) return point;
  const minY = -frame.top / frame.scale + radius + 6 / frame.scale;
  const maxY = horizonY - radius - 6;
  // In an exceptionally shallow scene there may be no visible sky left.
  if (minY > maxY) return point;
  return { ...point, y: Math.max(minY, Math.min(maxY, point.y)) };
}

// Keep text readable in the visible window, while its tail follows the actor.
// Text stays in CSS pixels; it is not stretched along with the illustration.
export function visibleBubble(placement, frame) {
  if (!frame) return placement;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const { width, height, left, top, viewportWidth: vw, viewportHeight: vh } = frame;
  const bubble = placement.bubble;
  const x0 = clamp(left + width * bubble.left / 100, 8, vw - 88);
  const x1 = clamp(left + width * (1 - bubble.right / 100), x0 + 80, vw - 8);
  const anchorY = clamp(top + height * (1 - bubble.bottom / 100), Math.min(60, vh - 8), vh - 8);
  const tailX = left + width * (bubble.left + (100 - bubble.left - bubble.right) * bubble.tailLeft / 100) / 100;
  return { ...placement, bubble: { ...bubble,
    left: x0 / vw * 100, right: (vw - x1) / vw * 100,
    bottom: (vh - anchorY) / vh * 100,
    maxHeight: Math.max(1, anchorY - 6) / vh * 100,
    maxLines: clamp(Math.floor((anchorY - 6 - 14) / (12 * 1.45)), 1, 3),
    tailLeft: clamp((tailX - x0) / (x1 - x0) * 100, 5, 95) } };
}
