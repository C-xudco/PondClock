// Independent review of the default-character change; no user data or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createNewGame, applyCommand } from '../src/domain/gameState.js';
import { catchOutcome } from '../src/domain/loot.js';
import { APPEARANCE_OPTIONS, APPEARANCE_PRODUCTS, ownsAppearanceStyle } from '../src/config/appearance.js';
import { DEFAULT_CHARACTER, defaultCharacterVariant, defaultCharacterPoint } from '../src/config/defaultCharacter.js';
import { REGIONS } from '../src/lib/gameConfig.js';
import { toWeatherVisualState } from '../src/domain/weatherVisualState.js';
import { geometryForAppearance, fisherTipAt, fisherBodyPointAt, actorPlacementFor, FISHER, ROD_BITE_DEG, VIEW } from '../src/components/pond/scene.js';

const NOON = Date.UTC(2026, 9, 25, 4);
const normalize = source => source.replaceAll('\r\n', '\n');
function decodePng(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, 'RGBA8 sprite required'); assert.equal(bytes[25], 6, 'Real alpha channel required'); assert.equal(bytes[28], 0);
  const chunks = [];
  for (let p = 8; p < bytes.length;) {
    const length = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') chunks.push(bytes.subarray(p + 8, p + 8 + length));
    p += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 4, rgba = Buffer.alloc(stride * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++]; assert.ok(filter >= 0 && filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, left = x >= 4 ? rgba[i - 4] : 0, up = y ? rgba[i - stride] : 0, corner = y && x >= 4 ? rgba[i - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      rgba[i] = (raw[offset++] + predictor) & 255;
    }
  }
  const alphaAt = (x, y) => rgba[(y * width + x) * 4 + 3];
  let transparent = 0, solid = 0, partiallyTransparent = 0;
  const bounds = { left: width, top: height, right: -1, bottom: -1 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = alphaAt(x, y);
    if (alpha === 0) transparent++; else if (alpha < 240) partiallyTransparent++; else solid++;
    if (alpha >= 32) { bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x); bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y); }
  }
  return { width, height, alphaAt, bounds, transparent, solid, partiallyTransparent, pixels: width * height };
}

test('independent scope audit: default-character revision changes no economic, catch, market, route or save rule source', () => {
  for (const file of ['src/domain/gameState.js', 'src/domain/loot.js', 'src/domain/market.js', 'src/domain/routes.js', 'src/domain/saveSchema.js', 'src/lib/gameConfig.js']) {
    const before = execFileSync('git', ['show', `96fd232:${file}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(normalize(fs.readFileSync(file, 'utf8')), normalize(before), file);
  }
});

test('independent free-identity audit: minimal remains free and visible, paid ownership still required and appearance cannot reroll outcomes', () => {
  const free = createNewGame('jiangnan', NOON, { randomSeed: 471 });
  assert.equal(free.appearance.equipped.character, 'minimal'); assert.deepEqual(free.appearance.ownedProducts, []);
  assert.ok(APPEARANCE_OPTIONS.character.some(option => option.id === 'minimal'));
  assert.ok(ownsAppearanceStyle(free.appearance, 'character', 'minimal'));
  assert.equal(ownsAppearanceStyle(free.appearance, 'character', 'inkwash'), false);
  const products = APPEARANCE_PRODUCTS.map(product => product.id);
  const paid = { ...free, appearance: { ownedProducts: products, equipped: { scene: 'inkwash', character: 'inkwash', rod: 'jade' } } };
  for (let sequence = 0; sequence < 250; sequence++) {
    assert.deepEqual(catchOutcome({ ...free, catchSequence: sequence }), catchOutcome({ ...paid, catchSequence: sequence }));
  }
  const equipped = applyCommand(free, { id: 'review-free-restore', type: 'EQUIP_APPEARANCE', slot: 'character', styleId: 'minimal' }, NOON);
  assert.equal(equipped, free, 'Already default is a free no-op');
  assert.throws(() => applyCommand(free, { id: 'review-unowned', type: 'EQUIP_APPEARANCE', slot: 'character', styleId: 'cloudwalker' }, NOON), /先拥有/);
});

test('independent PNG audit: both shipped default variants have real alpha, clear borders and substantial visible artwork', () => {
  for (const variant of ['clear', 'rain']) {
    const file = path.resolve(`public/art/characters/default-${variant}-v1.png`), image = decodePng(file);
    assert.ok(image.width >= 256 && image.height >= 256, variant + ': enough source detail');
    for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) assert.equal(image.alphaAt(x, y), 0);
    assert.ok(image.transparent / image.pixels > .2, variant + ': meaningful transparent area');
    assert.ok(image.solid / image.pixels > .02, variant + ': visible, non-ghost artwork');
    assert.ok(image.bounds.left > 0 && image.bounds.top > 0 && image.bounds.right < image.width - 1 && image.bounds.bottom < image.height - 1,
      variant + ': opaque content stays within the source frame');
  }
});

test('independent anchor audit: real sprite pixels map uniformly to hand/support, all24 scene geometries keep visible content, contact and click target on screen', () => {
  for (const [name, art] of Object.entries(DEFAULT_CHARACTER.variants)) {
    const image = decodePng(path.resolve('public', art.asset));
    assert.equal(art.source.width, image.width); assert.equal(art.source.height, image.height);
    assert.ok(Math.abs(art.render.width / image.width - art.render.height / image.height) < 1e-12, 'No stretch');
    assert.deepEqual(defaultCharacterPoint(art, art.anchorsPx.grip), art.grip);
    const support = defaultCharacterPoint(art, art.anchorsPx.support);
    assert.ok(Math.hypot(support.x - FISHER.support.x, support.y - FISHER.support.y) < 1e-9);
    for (const anchor of Object.values(art.anchorsPx)) {
      assert.ok(anchor.x >= 0 && anchor.x < image.width && anchor.y >= 0 && anchor.y < image.height);
      let nearAlpha = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) nearAlpha = Math.max(nearAlpha, image.alphaAt(anchor.x + dx, anchor.y + dy));
      assert.ok(nearAlpha > 128, name + ': anchor must touch actual visible character, not empty canvas');
    }
    const corners = [[image.bounds.left, image.bounds.top], [image.bounds.right, image.bounds.top], [image.bounds.left, image.bounds.bottom], [image.bounds.right, image.bounds.bottom]]
      .map(([x, y]) => defaultCharacterPoint(art, { x, y }));
    for (const style of ['minimal', 'inkwash']) for (const region of REGIONS) {
      const geometry = geometryForAppearance(region.id, style), placement = actorPlacementFor(geometry);
      for (const point of corners) {
        assert.ok(point.x >= placement.image.x - 3 && point.x <= placement.image.x + placement.image.width + 3, `${region.id}/${style}/${name}: click target covers image`);
        assert.ok(point.y + placement.offsetY >= placement.image.y - 3 && point.y + placement.offsetY <= placement.image.y + placement.image.height + 3);
      }
      for (let step = 0; step <= 100; step++) {
        const pose = step / 100, bodySupport = fisherBodyPointAt(support, pose, geometry), tip = fisherTipAt(pose, geometry, art.grip);
        assert.ok(bodySupport.y >= geometry.actorSupportBand[0] && bodySupport.y <= geometry.actorSupportBand[1]);
        const angle = ROD_BITE_DEG * pose * Math.PI / 180, dx = FISHER.rodTip.x - art.grip.x, dy = FISHER.rodTip.y - art.grip.y;
        const rodPoint = { x: art.grip.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: art.grip.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
        const expected = fisherBodyPointAt(rodPoint, pose, geometry);
        assert.ok(Math.hypot(tip.x - expected.x, tip.y - expected.y) < 1e-9);
        for (const corner of corners) {
          const transformed = fisherBodyPointAt(corner, pose, geometry);
          assert.ok(transformed.x >= 0 && transformed.x <= VIEW.w && transformed.y >= 0 && transformed.y <= VIEW.h,
            `${region.id}/${style}/${name}: visible bounds remain on screen across bite`);
        }
      }
    }
  }
  assert.equal(defaultCharacterVariant(false), DEFAULT_CHARACTER.variants.clear); assert.equal(defaultCharacterVariant(true), DEFAULT_CHARACTER.variants.rain);
  assert.notEqual(DEFAULT_CHARACTER.variants.clear.grip.x, FISHER.grip.x, 'New hand is independently anchored, not stretched to old silhouette');
});

test('independent actual JSX audit: one default image, alpha-clipped snow, correct clear/rain resources and stable single rod across every background', () => {
  const bundle = buildSync({ entryPoints: [path.resolve('src/components/pond/Pond.jsx')], bundle: true, write: false,
    format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    alias: { '@': path.resolve('src') }, define: { 'import.meta.env.BASE_URL': '"./"' } });
  const output = { exports: {} };
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), output, output.exports);
  for (const style of ['minimal', 'inkwash']) for (const region of REGIONS) for (const [code, variant] of [[0, 'clear'], [61, 'rain'], [71, 'clear']]) {
    const visualState = toWeatherVisualState({ weatherCode: code, isDay: true, observedAtMs: NOON }, { nowMs: NOON });
    const markup = renderToStaticMarkup(React.createElement(output.exports.default, {
      regionId: region.id, status: 'idle', visualState, appearance: { equipped: { scene: style, character: 'minimal', rod: 'jade' } },
    }));
    assert.equal((markup.match(/data-default-character-sprite="v1"/g) || []).length, 1);
    assert.match(markup, new RegExp(`data-default-character-variant="${variant}"`));
    assert.ok(markup.includes(DEFAULT_CHARACTER.variants[variant].asset));
    assert.equal((markup.match(/data-rod-art="jade"/g) || []).length, 1); assert.equal((markup.match(/data-fishing-line="true"/g) || []).length, 1);
    assert.equal((markup.match(/data-scene-art=/g) || []).length, 1, 'Exactly one independently selected background');
    if (code === 71) { assert.match(markup, /<mask/); assert.match(markup, /<use/); assert.match(markup, /data-snow-support="hat-shoulder"/); }
  }
});
