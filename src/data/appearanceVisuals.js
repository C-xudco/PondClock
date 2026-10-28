// Presentation palettes only. Ownership, prices and equipment validation live in domain/config.
export const CHARACTER_VISUALS = Object.freeze({
  minimal: { coat: '#273742', lining: '#819395', hat: '#293d42', sash: '#a9a084', trim: '#c1cecb' },
  cloudwalker: { coat: '#b9cec9', lining: '#6b8e90', hat: '#a5bdb8', sash: '#687c83', trim: '#e5ebe0' },
  ember: { coat: '#9a5549', lining: '#5f4346', hat: '#5b4244', sash: '#d0a776', trim: '#dfb397' },
  whitecape: { coat: '#dce5e8', lining: '#859fa6', hat: '#cddce2', sash: '#a36e5b', trim: '#f5f6ed' },
});
export const ROD_VISUALS = Object.freeze({
  minimal: { body: '#34463f', highlight: '#8f9e8e', wrap: '#465650' },
  inkwash: { body: '#283b33', highlight: '#859484', wrap: '#172e29' },
  jade: { body: '#356e68', highlight: '#9bc9b3', wrap: '#d0c397' },
  dawn: { body: '#9b7166', highlight: '#dfb998', wrap: '#6b596a' },
});
export function resolveAppearanceVisuals(appearance) {
  const selected = appearance?.equipped || {};
  return {
    scene: selected.scene === 'inkwash' ? 'inkwash' : 'minimal',
    character: selected.character === 'inkwash' || Object.hasOwn(CHARACTER_VISUALS, selected.character)
      ? selected.character : 'minimal',
    rod: Object.hasOwn(ROD_VISUALS, selected.rod) ? selected.rod : 'minimal',
  };
}
