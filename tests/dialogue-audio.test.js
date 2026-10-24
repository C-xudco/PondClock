import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogueDirector } from '../src/lib/dialogueDirector.js';
import { DIALOGUE_CATALOG, REGION_DIALOGUE } from '../src/data/dialogueCatalog.js';
import { BiteAudio } from '../src/services/biteAudio.js';

test('dialogue pools are complete and avoid immediate repeat without fixed rotation', () => {
  for (const pool of Object.values(DIALOGUE_CATALOG)) assert.ok(pool.length >= 8);
  assert.equal(Object.keys(REGION_DIALOGUE).length, 12);
  for (const pool of Object.values(REGION_DIALOGUE)) assert.ok(pool.length >= 4);
  const d = new DialogueDirector({ random: () => 0.9 });
  const selected = Array.from({ length: 40 }, () => d.choose('idle', DIALOGUE_CATALOG.idle).id);
  for (let i = 1; i < selected.length; i++) assert.notEqual(selected[i], selected[i - 1]);
  assert.equal(new Set(selected.slice(0, 10)).size, 10);
  assert.notEqual(selected[0], 'idle.1');
  const one = [{ id: 'only', text: 'one' }];
  assert.ok(d.choose('singleton', one)); assert.equal(d.choose('singleton', one), null);
});

test('poke stages survive groups, count despite throttling, reset after quiet and respect bubble priority', () => {
  const d = new DialogueDirector({ random: () => 0 });
  for (let group = 0; group < 3; group++) {
    const at = group * 9000;
    for (let i = 0; i < 4; i++) d.poke(at + i * 100);
    assert.match(d.poke(at + 400).lineId, new RegExp(`^poke${group + 1}`));
  }
  d.poke(70000); assert.equal(d.stage, 0);
  d.speak('high', 80000); assert.equal(d.speak('idle', 80001), null);
  assert.equal(d.poke(80002), null);
});

test('arrival only uses supplied current-region fish and independent dialogue RNG', () => {
  const d = new DialogueDirector({ random: () => 0.99 });
  const result = d.arrival('dongbei', 100, ['江鳕']);
  assert.ok(result.text.includes('江鳕')); assert.ok(!result.text.includes('罗非'));
  const many = new DialogueDirector({ random: () => 0.99 });
  assert.ok(many.arrival('changjiang', 100, Array.from({ length: 16 }, (_, i) => `鱼${i}`)).text.includes('鱼15'));
});

test('audio plays once per fresh bite, mute/background policy and no stale replay', async () => {
  let calls = 0, hidden = false, now = 100;
  const audio = { play: async () => { calls++; }, pause() {}, volume: 1, currentTime: 0 };
  const player = new BiteAudio({ createAudio: () => audio, now: () => now, hidden: () => hidden });
  const bite = { id: 'a', expiresAtMs: 200 };
  assert.equal(await player.bite(bite), true); assert.equal(audio.volume, 0.35);
  assert.equal(await player.bite(bite), false); assert.equal(calls, 1);
  assert.equal(await player.bite({ id: 'b', expiresAtMs: 200 }, { biteSoundEnabled: false }), false);
  hidden = true;
  assert.equal(await player.bite({ id: 'c', expiresAtMs: 200 }, { backgroundBiteSound: false }), false);
  hidden = false; assert.equal(await player.bite({ id: 'c', expiresAtMs: 200 }), false);
  now = 300; assert.equal(await player.bite({ id: 'd', expiresAtMs: 200 }), false);
  assert.equal(await player.bite({ id: 'e', expiresAtMs: 400 }, { biteSoundVolume: 0 }), false);
  player.dispose(); assert.equal(await player.bite({ id: 'f', expiresAtMs: 400 }), false);
  assert.equal(calls, 1);
});

test('autoplay failure does not queue a replay, notifies once and can unlock by gesture', async () => {
  let blocked = true, notices = 0, calls = 0;
  const player = new BiteAudio({ createAudio: () => ({ play: async () => { calls++; if (blocked) throw new Error('blocked'); }, pause() {} }),
    now: () => 1, hidden: () => false, onBlocked: () => notices++ });
  await player.bite({ id: '1', expiresAtMs: 100 }); await player.bite({ id: '2', expiresAtMs: 100 });
  assert.equal(notices, 1); blocked = false; assert.equal(await player.unlock(), true);
  assert.equal(await player.bite({ id: '1', expiresAtMs: 100 }), false);
  assert.equal(calls, 3);
});
