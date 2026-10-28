import test from 'node:test';
import assert from 'node:assert/strict';
import { coverScene, visibleBubble, visibleCelestial } from '../src/components/pond/sceneViewport.js';
import { VIEW, BOBBER, SCENE_GEOMETRIES, geometryForAppearance, actorPlacementFor } from '../src/components/pond/scene.js';

test('cover fills wide, original and tall scenes without stretching the illustration', () => {
  assert.equal(coverScene(0, 208), null);
  for (const [width, height] of [[612, 208], [406, 100], [626, 224], [1000, 440], [400, 300]]) {
    const frame = coverScene(width, height);
    assert.ok(frame.left <= 0 && frame.top <= 0);
    assert.ok(frame.left + frame.width >= width && frame.top + frame.height >= height);
    assert.ok(Math.abs(frame.width / VIEW.w - frame.height / VIEW.h) < 1e-9);
    assert.ok(Math.abs(frame.left * 2 + frame.width - width) < 1e-9);
    // The float and its HTML hot area share the same scene-to-window transform.
    const surface = frame.top + BOBBER.surfaceY * frame.scale;
    const buttonTop = frame.top + (BOBBER.surfaceY - BOBBER.height - 12) * frame.scale;
    assert.ok(surface >= buttonTop && surface <= buttonTop + frame.height * .17);
  }
});

test('all authored lower banks keep the actor and float above the bottom crop', () => {
  for (const geometry of Object.values(SCENE_GEOMETRIES)) {
    const placement = actorPlacementFor(geometry);
    const bottom = Math.max(BOBBER.surfaceY + 12, placement.image.y + placement.image.height + 12);
    for (const [width, height] of [[612, 208], [406, 138], [626, 224]]) {
      const frame = coverScene(width, height, bottom);
      assert.ok(frame.top + bottom * frame.scale <= height + 1e-9, geometry.id);
      const celestial = visibleCelestial(geometry.celestial, geometry.horizonY, frame);
      const hasRoom = -frame.top / frame.scale + 13 + 6 / frame.scale <= geometry.horizonY - 19;
      if (hasRoom) {
        assert.ok(frame.top + (celestial.y - 13) * frame.scale >= 6 - 1e-9, geometry.id);
        assert.ok(celestial.y + 13 < geometry.horizonY);
      }
    }
  }
});

test('speech remains inside the visible scene after the cover crop', () => {
  for (const style of ['minimal', 'inkwash']) for (const [width, height] of [[612, 208], [406, 100], [626, 224], [1000, 440], [400, 300]]) {
    const placement = actorPlacementFor(geometryForAppearance('lingnan', style));
    const { bubble } = visibleBubble(placement, coverScene(width, height));
    assert.ok(bubble.left >= 0 && bubble.right >= 0 && bubble.left + bubble.right < 100);
    assert.ok(bubble.bottom >= 0 && bubble.bottom + bubble.maxHeight <= 100);
    assert.ok(bubble.tailLeft >= 5 && bubble.tailLeft <= 95);
  }
});
