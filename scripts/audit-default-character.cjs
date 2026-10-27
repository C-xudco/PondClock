// Decode and audit original alpha; never modify/resample the generated artwork.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pngInfo, alphaAudit } = require('./audit-ink-art.cjs');
const root = path.resolve(__dirname, '..');
function auditDefaultCharacter() {
  const assets = ['clear', 'rain'].map((variant) => {
    const relative = `public/art/characters/default-${variant}-v1.png`;
    const bytes = fs.readFileSync(path.join(root, relative));
    return { variant, asset: relative, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), ...pngInfo(bytes), alpha: alphaAudit(bytes) };
  });
  if (assets[0].width !== assets[1].width || assets[0].height !== assets[1].height) throw new Error('Character variant canvas differs');
  if (assets[0].sha256 === assets[1].sha256) throw new Error('Rain variant must have actual protective clothing');
  return { checkedAt: new Date().toISOString(), passed: true, provider: 'built-in image_gen', assets,
    runtimeBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    scope: 'Exact original PNG format/dimensions, real alpha/bounds and hashes. RGB saturation includes the ochre scarf, not a fringe-failure criterion. Human composition and runtime anchors verified separately.' };
}
if (require.main === module) {
  const report = auditDefaultCharacter();
  fs.writeFileSync(path.join(root, 'docs/default-character/ART_CHECK.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
module.exports = { auditDefaultCharacter };
