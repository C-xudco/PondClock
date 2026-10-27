// Default free character art only. These source-pixel anchors were inspected on
// the selected PNGs; they never affect ownership, fishing stats or save data.
const TARGET_SUPPORT = Object.freeze({ x: 940, y: 329 });
const TARGET_GRIP_Y = 244;

function variant(asset, anchorsPx, snowPaths) {
  const source = Object.freeze({ width: 1254, height: 1254 });
  const scale = (TARGET_SUPPORT.y - TARGET_GRIP_Y) / (anchorsPx.support.y - anchorsPx.grip.y);
  const x = TARGET_SUPPORT.x - anchorsPx.support.x * scale;
  const y = TARGET_SUPPORT.y - anchorsPx.support.y * scale;
  return Object.freeze({
    asset, source,
    anchorsPx: Object.freeze({ grip: Object.freeze(anchorsPx.grip), support: Object.freeze(anchorsPx.support) }),
    render: Object.freeze({ x, y, width: source.width * scale, height: source.height * scale, scale }),
    grip: Object.freeze({ x: x + anchorsPx.grip.x * scale, y: TARGET_GRIP_Y }),
    support: TARGET_SUPPORT,
    snowPaths: Object.freeze(snowPaths),
  });
}

const clear = variant('art/characters/default-clear-v1.png', {
  grip: { x: 426, y: 568 }, support: { x: 818, y: 1190 },
}, [
  'M592 159Q632 121 681 111Q738 79 781 85Q844 86 894 120L874 122Q826 103 779 104Q737 103 691 127Q636 137 599 173Z',
  'M807 384Q851 394 887 425L910 459L892 454Q856 416 822 409L801 402Z',
  'M530 537L638 478Q655 470 668 472L663 484L540 550Z',
]);

// This edit preserves hand and boot alignment, while the added hat/cape has its
// own snow shelves for a mixed-weather transition and subsequent melt.
const rain = variant('art/characters/default-rain-v1.png', {
  grip: { x: 426, y: 568 }, support: { x: 818, y: 1190 },
}, [
  'M565 154L803 60Q819 53 833 60L844 75L831 72Q819 68 807 76L589 166Z',
  'M762 345Q839 322 911 345L945 368L926 368Q853 343 788 367L767 366Z',
  'M530 537L638 478Q655 470 668 472L663 484L540 550Z',
]);

export const DEFAULT_CHARACTER = Object.freeze({ revision: 1, variants: Object.freeze({ clear, rain }) });
export const defaultCharacterVariant = (rainGear = false) => DEFAULT_CHARACTER.variants[rainGear ? 'rain' : 'clear'];
export const defaultCharacterPoint = (entry, point) => ({
  x: entry.render.x + point.x * entry.render.scale,
  y: entry.render.y + point.y * entry.render.scale,
});
