// Local, dependency-free audit of delivered art. No image generation or network requests.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const art = path.join(root, "public/art/inkwash");
const documentation = path.join(root, "docs/inkwash/roles/rendering");
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
function pngInfo(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Invalid PNG signature");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24], colorType = buffer[25], interlace = buffer[28];
  return { width, height, bitDepth, colorType, interlace };
}
function jpegInfo(buffer) {
  if (buffer[0] !== 255 || buffer[1] !== 216) throw new Error("Invalid JPEG signature");
  let position = 2;
  while (position < buffer.length) {
    if (buffer[position] !== 255) throw new Error("Invalid JPEG marker");
    const marker = buffer[position + 1];
    const length = buffer.readUInt16BE(position + 2);
    if ([192, 193, 194].includes(marker)) return { height: buffer.readUInt16BE(position + 5), width: buffer.readUInt16BE(position + 7) };
    position += length + 2;
  }
  throw new Error("Missing JPEG dimensions");
}
function paeth(a, b, c) {
  const predictor = a + b - c;
  const pa = Math.abs(predictor - a), pb = Math.abs(predictor - b), pc = Math.abs(predictor - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function alphaAudit(buffer) {
  const info = pngInfo(buffer);
  if (info.bitDepth !== 8 || info.colorType !== 6 || info.interlace !== 0) throw new Error("Sprite must be noninterlaced RGBA8");
  const chunks = [];
  for (let position = 8; position < buffer.length;) {
    const length = buffer.readUInt32BE(position);
    const type = buffer.toString("ascii", position + 4, position + 8);
    if (type === "IDAT") chunks.push(buffer.subarray(position + 8, position + 8 + length));
    position += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = info.width * 4;
  const decoded = Buffer.alloc(stride * info.height);
  let input = 0, transparent = 0, opaque = 0, partial = 0, nearOpaque = 0, alphaTotal = 0, saturatedEdge = 0, saturatedColorMaxAlpha = 0;
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    const filter = raw[input++];
    if (filter > 4) throw new Error("Invalid PNG row filter");
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? decoded[index - 4] : 0;
      const up = y ? decoded[index - stride] : 0;
      const corner = y && x >= 4 ? decoded[index - stride - 4] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, corner) : 0;
      decoded[index] = (raw[input++] + predictor) & 255;
      if (x % 4 === 3) {
        const red = decoded[index - 3], green = decoded[index - 2], blue = decoded[index - 1];
        const saturated = (red > green + 100 && red > blue + 100) || (red > 200 && green > 150 && blue < 65);
        if (saturated) saturatedColorMaxAlpha = Math.max(saturatedColorMaxAlpha, decoded[index]);
        if (decoded[index] > 30 && saturated) saturatedEdge++;
        alphaTotal += decoded[index];
        if (decoded[index] > 30) {
          const pixelX = Math.floor(x / 4);
          minX = Math.min(minX, pixelX); maxX = Math.max(maxX, pixelX);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        if (decoded[index] >= 230) nearOpaque++;
        if (!decoded[index]) transparent++;
        else if (decoded[index] === 255) opaque++;
        else partial++;
      }
    }
  }
  const alphaAt = (x, y) => decoded[y * stride + x * 4 + 3];
  const corners = [alphaAt(0, 0), alphaAt(info.width - 1, 0), alphaAt(0, info.height - 1), alphaAt(info.width - 1, info.height - 1)];
  const pixels = info.width * info.height;
  if (transparent / pixels < .2 || nearOpaque / pixels < .1 || corners.some((n) => n !== 0)) throw new Error("Sprite is not a usable transparent cutout: " + JSON.stringify({ transparent, opaque, partial, nearOpaque, alphaMean: alphaTotal / pixels, pixels, corners }));
  return { pixels, transparent, opaque, partial, nearOpaque, saturatedEdge, saturatedColorMaxAlpha, alphaMean: alphaTotal / pixels, transparentFraction: transparent / pixels, cornerAlphas: corners,
    visibleBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, alphaThreshold: 30 } };
}
function auditArt() {
  const prompts = JSON.parse(fs.readFileSync(path.join(documentation, "generation-prompts.json"), "utf8")).filter((record) => record.active !== false);
  const assets = prompts.map((record) => {
    const character = record.id.startsWith("fisherman");
    const revision = record.assetRevision || 1;
    const runtimeFile = path.join(art, record.id + "-v" + revision + "." + (character ? "png" : "jpg"));
    const sourceFile = character ? runtimeFile : path.join(documentation, "source-art", record.id + "-v" + revision + ".png");
    const runtime = fs.readFileSync(runtimeFile), source = fs.readFileSync(sourceFile);
    const sourceInfo = pngInfo(source);
    const runtimeInfo = character ? pngInfo(runtime) : jpegInfo(runtime);
    if (runtimeInfo.width !== sourceInfo.width || runtimeInfo.height !== sourceInfo.height) throw new Error("Format conversion resized asset");
    if (!character && Math.abs(runtimeInfo.width / runtimeInfo.height - 1000 / 440) > .03) throw new Error("Landscape aspect mismatch");
    return { id: record.id, assetRevision: revision, regionId: character ? null : record.id,
      runtimePath: path.relative(root, runtimeFile).replaceAll("\\", "/"),
      sourcePath: path.relative(root, sourceFile).replaceAll("\\", "/"),
      width: runtimeInfo.width, height: runtimeInfo.height,
      runtimeBytes: runtime.length, sourceBytes: source.length, runtimeSha256: hash(runtime), sourceSha256: hash(source),
      alpha: character ? alphaAudit(runtime) : null,
      generation: { provider: record.provider, generatedOn: record.generatedOn, promptRecord: "generation-prompts.json#" + record.id },
      logicalViewBox: { width: 1000, height: 440 },
      geometryId: character ? "shared-seated-v1" : record.id,
      reviewStatus: "implementation-reviewed; independent product visual acceptance tracked separately",
    };
  });
  // V2 additions are original code-authored SVGs, not raster conversions. Keep
  // their provenance distinct while covering every runtime scene resource.
  for (const id of ['taihu', 'dongting', 'jialing', 'baiyangdian', 'jiaodong']) {
    const runtimeFile = path.join(art, id + '-v1.svg');
    const runtime = fs.readFileSync(runtimeFile), svg = runtime.toString('utf8');
    if (!/<svg\b[^>]*viewBox="0 0 1000 440"/.test(svg) || !svg.trim().endsWith('</svg>')) throw new Error('Invalid authored SVG: ' + id);
    if (/<script\b|<foreignObject\b|\bon\w+=|(?:href|xlink:href)=["']https?:/i.test(svg)) throw new Error('SVG must be self-contained: ' + id);
    if (/data-celestial|id=["'](?:sun|moon)["']/.test(svg)) throw new Error('Weather-independent background must not bake in a sun/moon: ' + id);
    assets.push({ id, assetRevision: 1, regionId: id, runtimePath: path.relative(root, runtimeFile).replaceAll('\\', '/'),
      sourcePath: 'scripts/build-focus-art.mjs', width: 1000, height: 440,
      runtimeBytes: runtime.length, runtimeSha256: hash(runtime), alpha: null,
      logicalViewBox: { width: 1000, height: 440 }, geometryId: id,
      generation: { provider: 'project-authored SVG', generatedOn: '2026-10-27' },
      reviewStatus: 'offline structural audit; product visual acceptance tracked separately' });
  }
  const sprites = assets.filter((a) => a.alpha);
  if (sprites.length !== 2 || sprites[0].width !== sprites[1].width || sprites[0].height !== sprites[1].height) throw new Error("Alternate sprite canvas mismatch");
  return { schemaVersion: 1, checkedAt: new Date().toISOString(), passed: true,
    scope: "Offline format, dimensions, real alpha, packaged asset coverage and SHA256 only; not geographic or visual quality certification.",
    provider: "built-in image_gen (original raster assets) and project-authored SVG (V2 additions)", assets, runtimeBytes: assets.reduce((n, a) => n + a.runtimeBytes, 0),
    pending: ["Independent scene and character visual review", "Production UI motion and performance evidence"] };
}
if (require.main === module) {
  const report = auditArt();
  const outputDirectory = path.join(root, 'docs/v2.0.0/roles/art');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, "art-production-manifest.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, assets: report.assets.length, runtimeBytes: report.runtimeBytes, report: output }));
}
module.exports = { auditArt, alphaAudit, pngInfo };
