import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { REGIONS } from "../src/lib/gameConfig.js";
import {
  SCENE_GEOMETRIES, BOBBER, FISHER, ROD_BITE_DEG, PERSON_BITE_DEG,
  geometryForRegion, isWaterPoint, rotatePoint, fisherTipAt, bobberTopAt,
  fisherBodyPointAt, actorPlacementFor, VIEW,
} from "../src/components/pond/scene.js";
import { createPrecipitation, precipitationFrame, PRECIPITATION_BUDGET } from "../src/components/pond/precipitation.js";
const require = createRequire(import.meta.url);
const { auditArt } = require("../scripts/audit-ink-art.cjs");

test("all 12 shipped scenes have their own geometry, valid float water, and excluded banks", () => {
  assert.deepEqual(Object.keys(SCENE_GEOMETRIES).sort(), REGIONS.map((region) => region.id).sort());
  for (const [id, geometry] of Object.entries(SCENE_GEOMETRIES)) {
    assert.equal(geometryForRegion(id), geometry);
    assert.ok(isWaterPoint(geometry, BOBBER.x, BOBBER.surfaceY), id + ": float must be in water");
    for (const [x, y] of [[500, 0], [980, 420], [-10, 338], [1100, 338]]) {
      assert.equal(isWaterPoint(geometry, x, y), false, id + ": nonwater must be excluded");
    }
    assert.ok(geometry.waterPath.startsWith("M "));
    assert.ok(geometry.waterPath.endsWith(" Z"));
    assert.equal(geometry.asset, "art/inkwash/" + id + "-v" + geometry.assetRevision + ".jpg");
  }
});

test("painted foreground stones and Tarim poplar peninsula reject water contact", () => {
  for (const [regionId, x, y] of [
    ["dongbei", 750, 420], ["xibei", 850, 300], ["qingzang", 600, 435],
    ["changjiang", 700, 435], ["yungui", 720, 435], ["huaihe", 900, 390],
  ]) assert.equal(isWaterPoint(geometryForRegion(regionId), x, y), false, regionId);
});

test("rain/snow are bounded and every deterministic contact belongs to the authored water polygon", () => {
  for (const geometry of Object.values(SCENE_GEOMETRIES)) {
    for (const kind of ["rain", "snow"]) {
      for (const intensity of ["light", "moderate", "heavy", "unknown"]) {
        const particles = createPrecipitation(geometry, kind, intensity);
        assert.equal(particles.length, PRECIPITATION_BUDGET[kind][intensity] || PRECIPITATION_BUDGET[kind].light);
        assert.ok(particles.length <= (kind === "rain" ? 64 : 48));
        assert.equal(new Set(particles.map((p) => p.id)).size, particles.length);
        for (const particle of particles) assert.ok(isWaterPoint(geometry, particle.x, particle.y), particle.id);
        assert.deepEqual(particles, createPrecipitation(geometry, kind, intensity), "stable visual seed");
      }
    }
  }
  for (const kind of ["none", "mixed", "unknown"]) {
    assert.deepEqual(createPrecipitation(geometryForRegion("jiangnan"), kind), []);
  }
});

test("a particle reaches its own exact water point before the response; skipped frames never create another location", () => {
  for (const geometry of Object.values(SCENE_GEOMETRIES)) {
    for (const kind of ["rain", "snow"]) {
      for (const particle of createPrecipitation(geometry, kind, "heavy")) {
        const hit = 2 * particle.cycleMs - particle.offsetMs + particle.fallMs;
        const before = precipitationFrame(particle, hit - .001);
        const contact = precipitationFrame(particle, hit + .001);
        assert.equal(before.stage, "fall");
        assert.equal(contact.stage, "contact");
        assert.ok(Math.abs(before.x - particle.x) < .001);
        assert.ok(Math.abs(before.y - particle.y) < .001);
        assert.equal(contact.x, particle.x);
        assert.equal(contact.y, particle.y);
        assert.equal(contact.cycle, 2);
        assert.ok(Math.abs(contact.hitTimeMs - hit) < .001);
        const skipped = precipitationFrame(particle, hit + particle.responseMs / 2);
        assert.equal(skipped.stage, "contact");
        assert.equal(skipped.hitTimeMs, contact.hitTimeMs);
        assert.equal(skipped.contactX, particle.x);
        assert.equal(skipped.contactY, particle.y);
        const gone = precipitationFrame(particle, hit + particle.responseMs + .001);
        assert.equal(gone.stage, "rest");
        assert.equal(precipitationFrame(particle, hit + particle.cycleMs + 1).cycle, 3);
      }
    }
  }
});

test("scenes have isolated contact identity and long running animation keeps constant bounded state", () => {
  const a = createPrecipitation(geometryForRegion("jiangnan"), "rain", "heavy");
  const b = createPrecipitation(geometryForRegion("dongbei"), "snow", "heavy");
  const firstIds = new Set(a.map((p) => p.id));
  assert.ok(b.every((p) => !firstIds.has(p.id)));
  const original = structuredClone(a);
  for (const timeMs of [0, 41, 2000, 60000, 3600000, 86400000]) {
    assert.equal(a.map((p) => precipitationFrame(p, timeMs)).length, 58);
  }
  assert.deepEqual(a, original, "frames do not append contact pools or mutate particles");
});

test("seated body and rod share the exact transform, while line end follows the real float", () => {
  const restLength = Math.hypot(FISHER.rodTip.x - FISHER.grip.x, FISHER.rodTip.y - FISHER.grip.y);
  assert.deepEqual(fisherTipAt(0), FISHER.rodTip);
  for (let i = 0; i <= 100; i++) {
    const pose = i / 100;
    const tip = fisherTipAt(pose);
    const grip = rotatePoint(FISHER.grip, { x: FISHER.x, y: FISHER.seatY }, PERSON_BITE_DEG * pose);
    assert.ok(Math.abs(Math.hypot(tip.x - grip.x, tip.y - grip.y) - restLength) < 1e-8);
    const end = bobberTopAt(pose);
    assert.equal(end.x, BOBBER.x);
    assert.equal(end.y, BOBBER.surfaceY - BOBBER.height + BOBBER.sink * pose);
  }
  assert.ok(ROD_BITE_DEG < 0);
});

test("all production image headers retain dimensions and both character variants have real decoded alpha", () => {
  const report = auditArt();
  assert.equal(report.assets.length, 14);
  assert.equal(report.passed, true);
  assert.ok(report.runtimeBytes < 10 * 1024 * 1024);
  const characters = report.assets.filter((a) => a.alpha);
  assert.equal(characters.length, 2);
  for (const character of characters) {
    assert.ok(character.alpha.transparentFraction > .2);
    assert.deepEqual(character.alpha.cornerAlphas, [0, 0, 0, 0]);
    assert.ok(character.alpha.nearOpaque / character.alpha.pixels > .1);
  }
});

test("every region grounds the seated figure and moves body, rod, click target and speech together", () => {
  const restLength = Math.hypot(FISHER.rodTip.x - FISHER.grip.x, FISHER.rodTip.y - FISHER.grip.y);
  for (const geometry of Object.values(SCENE_GEOMETRIES)) {
    const placement = actorPlacementFor(geometry);
    assert.equal(geometry.revision, 3);
    assert.equal(placement.image.y - FISHER.image.y, geometry.actorOffsetY);
    assert.equal(placement.image.x, FISHER.image.x);
    assert.ok(placement.image.y >= 0 && placement.image.y + placement.image.height <= VIEW.h);
    assert.ok(Math.abs((FISHER.bubble.bottom - placement.bubble.bottom) / 100 * VIEW.h - geometry.actorOffsetY) < 1e-8);
    assert.equal(placement.transform, `translate(0 ${geometry.actorOffsetY})`);
    let previousTip;
    for (let step = 0; step <= 100; step++) {
      const pose = step / 100;
      const tip = fisherTipAt(pose, geometry);
      const sharedTip = fisherTipAt(pose);
      assert.equal(tip.x, sharedTip.x);
      assert.equal(tip.y, sharedTip.y + geometry.actorOffsetY);
      const grip = fisherBodyPointAt(FISHER.grip, pose, geometry);
      assert.ok(Math.abs(Math.hypot(tip.x - grip.x, tip.y - grip.y) - restLength) < 1e-8);
      if (previousTip) assert.ok(Math.hypot(tip.x - previousTip.x, tip.y - previousTip.y) < 2, geometry.id + ": continuous rod tip");
      previousTip = tip;
      if ([0, 50, 100].includes(step)) {
        const support = fisherBodyPointAt(FISHER.support, pose, geometry);
        assert.ok(support.y >= geometry.actorSupportBand[0] && support.y <= geometry.actorSupportBand[1], geometry.id + ": inside independently annotated painted support band");
        assert.equal(isWaterPoint(geometry, support.x, support.y), false, geometry.id + ": support is not water");
      }
      const end = bobberTopAt(pose);
      assert.equal(end.y, BOBBER.surfaceY - BOBBER.height + BOBBER.sink * pose, "scene placement never moves world float");
    }
  }
});
