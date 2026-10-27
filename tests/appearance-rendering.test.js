import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { REGIONS } from '../src/lib/gameConfig.js';
import { toWeatherVisualState } from '../src/domain/weatherVisualState.js';
import { resolveAppearanceVisuals, CHARACTER_VISUALS, ROD_VISUALS } from '../src/data/appearanceVisuals.js';
import {
  MINIMAL_GEOMETRIES, geometryForAppearance, geometryForRegion, isWaterPoint,
  FISHER, VIEW, BOBBER, fisherBodyPointAt, fisherTipAt, actorPlacementFor,
} from '../src/components/pond/scene.js';
import { createPrecipitation } from '../src/components/pond/precipitation.js';
import { DEFAULT_CHARACTER, defaultCharacterVariant } from '../src/config/defaultCharacter.js';

// Bundle the actual production JSX and render with real React. This checks markup
// and resource selection; effects, timing, on-screen layout remain UI acceptance.
const bundle = buildSync({
  entryPoints: [path.resolve('src/components/pond/Pond.jsx')], bundle: true, write: false,
  format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  alias: { '@': path.resolve('src') }, define: { 'import.meta.env.BASE_URL': '"./"' },
});
const moduleObject = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), moduleObject, moduleObject.exports);
const Pond = moduleObject.exports.default;
const NOW = Date.UTC(2026, 9, 25, 4);
const visual = (weatherCode, isDay = true) => toWeatherVisualState({ weatherCode, isDay, observedAtMs: NOW }, { nowMs: NOW });
const render = (props = {}) => renderToStaticMarkup(React.createElement(Pond, {
  regionId: 'lingnan', status: 'idle', visualState: visual(0), weather: '晴',
  sceneSite: { regionId: 'lingnan', place: '珠江 · 沙面', address: '广东省广州市荔湾区沙面' },
  ...props,
}));

test('appearance defaults preserve the free minimal scene and use the new local character sprite', () => {
  assert.deepEqual(resolveAppearanceVisuals(), { scene: 'minimal', character: 'minimal', rod: 'minimal' });
  assert.deepEqual(resolveAppearanceVisuals({ equipped: { scene: 'bad', character: 'bad', rod: 'bad' } }), resolveAppearanceVisuals());
  const markup = render();
  assert.match(markup, /data-scene-style="minimal"/);
  assert.match(markup, /data-character-art="minimal"/);
  assert.match(markup, /data-rod-art="minimal"/);
  assert.doesNotMatch(markup, /<image[^>]*data-scene-art|art\/inkwash/);
  assert.match(markup, /data-default-character-variant="clear"/);
  assert.match(markup, /art\/characters\/default-clear-v1\.png/);
});

test('all 32 scene/character/rod combinations independently select their local resources', () => {
  for (const scene of ['minimal', 'inkwash']) for (const character of [...Object.keys(CHARACTER_VISUALS), 'inkwash']) for (const rod of Object.keys(ROD_VISUALS)) {
    const markup = render({ appearance: { equipped: { scene, character, rod } } });
    assert.ok(markup.includes(`data-scene-style="${scene}"`));
    assert.ok(markup.includes(`data-character-art="${character}"`));
    assert.ok(markup.includes(`data-rod-art="${rod}"`));
    assert.equal(markup.includes('art/inkwash/lingnan-v1.jpg'), scene === 'inkwash');
    assert.equal(markup.includes('art/inkwash/fisherman-v1.png'), character === 'inkwash');
    assert.equal(markup.includes('art/characters/default-clear-v1.png'), character === 'minimal');
    assert.equal((markup.match(/data-fishing-line="true"/g) || []).length, 1);
  }
});

test('both renderers obey the same day/night, overcast, rain and snow visual contract for every character', () => {
  for (const scene of ['minimal', 'inkwash']) for (const character of [...Object.keys(CHARACTER_VISUALS), 'inkwash']) {
    const appearance = { equipped: { scene, character, rod: 'jade' } };
    for (const [code, kind] of [[3, 'none'], [61, 'rain'], [71, 'snow'], [null, 'unknown']]) {
      const markup = render({ appearance, visualState: visual(code) });
      assert.ok(markup.includes(`data-precipitation="${kind}"`));
      assert.doesNotMatch(markup, /data-celestial="sun"|data-celestial="reflection"/);
      assert.equal(markup.includes('data-rain-gear="true"'), kind === 'rain');
      if (character === 'minimal') {
        assert.equal(markup.includes('art/characters/default-rain-v1.png'), kind === 'rain');
        assert.equal(markup.includes('art/characters/default-clear-v1.png'), kind !== 'rain');
      }
      if (kind === 'snow') {
        assert.match(markup, /data-snow-cover="1.000"/);
        assert.match(markup, /data-snow-support="hat-shoulder"/);
      }
    }
    const moon = render({ appearance, visualState: visual(0, false) });
    assert.match(moon, /data-celestial="moon"/);
    assert.doesNotMatch(moon, /data-celestial="sun"/);
    assert.match(render({ appearance }), /data-celestial="sun"/);
  }
});

test('default character files match the declared source dimensions and use a uniform image scale', () => {
  for (const [name, art] of Object.entries(DEFAULT_CHARACTER.variants)) {
    const png = fs.readFileSync(path.resolve('public', art.asset));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    assert.equal(png.readUInt32BE(16), art.source.width, name);
    assert.equal(png.readUInt32BE(20), art.source.height, name);
    assert.equal(art.render.width / art.source.width, art.render.height / art.source.height, name + ': no width/height distortion');
  }
  assert.equal(defaultCharacterVariant(false), DEFAULT_CHARACTER.variants.clear);
  assert.equal(defaultCharacterVariant(true), DEFAULT_CHARACTER.variants.rain);
});

test('minimal geometry covers all regions, grounds all shared actors and keeps the float/line and contacts in water', () => {
  assert.deepEqual(Object.keys(MINIMAL_GEOMETRIES).sort(), REGIONS.map(region => region.id).sort());
  for (const region of REGIONS) {
    const geometry = geometryForAppearance(region.id);
    assert.equal(geometryForAppearance(region.id, 'inkwash'), geometryForRegion(region.id));
    assert.equal(geometry.asset, null);
    assert.ok(isWaterPoint(geometry, BOBBER.x, BOBBER.surfaceY));
    for (const point of [[940, 249], [900, 300], [50, 420], [980, 430], [500, 50]]) assert.equal(isWaterPoint(geometry, ...point), false);
    const placement = actorPlacementFor(geometry);
    assert.ok(placement.image.y >= 0 && placement.image.y + placement.image.height <= VIEW.h);
    assert.ok(placement.bubble.bottom + placement.bubble.maxHeight <= 100);
    for (let step = 0; step <= 100; step++) {
      const pose = step / 100;
      const support = fisherBodyPointAt(FISHER.support, pose, geometry);
      assert.equal(isWaterPoint(geometry, support.x, support.y), false);
      assert.ok(support.y >= geometry.actorSupportBand[0] && support.y <= geometry.actorSupportBand[1]);
      const tip = fisherTipAt(pose, geometry), reference = fisherTipAt(pose);
      assert.equal(tip.x, reference.x);
      assert.equal(tip.y, reference.y - 80);
    }
    for (const kind of ['rain', 'snow']) for (const particle of createPrecipitation(geometry, kind, 'heavy')) assert.ok(isWaterPoint(geometry, particle.x, particle.y));
  }
});

test('weather overlay labels distinguish a Dongguan source from the Guangzhou landscape and mark manual weather honestly', () => {
  const markup = render({
    weatherEntry: { snapshot: { source: 'online', temperatureC: 21 } },
    weatherPresentation: { originLabel: '现实 · 东莞', sourceLabel: '联网天气', detail: '画面仍在广州，天气来源为现实所在地东莞' },
  });
  assert.match(markup, /珠江 · 沙面/);
  assert.match(markup, /广东省广州市荔湾区沙面/);
  assert.match(markup, /现实 · 东莞/);
  assert.match(markup, /联网天气/);
  const manual = render({ weatherEntry: { snapshot: { source: 'manual', temperatureC: null } }, weatherPresentation: { originLabel: '手动 · 仅画面', sourceLabel: '手动设置' } });
  assert.match(manual, /data-weather-source="manual"/);
  assert.match(manual, /手动设置/);
  assert.doesNotMatch(manual, /实时天气|0°|21°/);
});
