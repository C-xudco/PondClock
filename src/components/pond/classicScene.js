import { BOBBER, rotatePoint } from './scene';
export { ROD_BITE_DEG, PERSON_BITE_DEG } from './scene';
export const FISHER = Object.freeze({ x: 866, feetY: 246, scale: 1.1,
  head: { x: 855, y: 157, r: 8.2 }, grip: { x: 832, y: 203 }, rodTip: { x: 575, y: 128 } });
export const fisherTipAt = (pose) => {
  const center = { x: FISHER.x, y: FISHER.feetY };
  const point = rotatePoint(rotatePoint(FISHER.rodTip, FISHER.grip, -8.5 * pose), center, -2.4 * pose);
  return { x: FISHER.x + (point.x - FISHER.x) * FISHER.scale,
    y: FISHER.feetY + (point.y - FISHER.feetY) * FISHER.scale };
};
export const bobberTopAt = (pose) => ({ x: BOBBER.x, y: BOBBER.surfaceY - BOBBER.height + BOBBER.sink * pose });
