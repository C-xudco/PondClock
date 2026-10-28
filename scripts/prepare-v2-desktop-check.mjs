// Synthetic profile only; never uses the actual player's AppData directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createNewGame } from '../src/domain/gameState.js';
import { validateSave } from '../src/domain/saveSchema.js';
import { FOCUS_CONFIG } from '../src/config/focus.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await fs.mkdtemp(path.join(root, 'test-results/v2-desktop-fixture-'));
const profile = path.join(directory, 'profile');
const now = Date.now(), base = createNewGame('taihu', now, { randomSeed: 471 });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const fixture = validateSave({ ...base, coins: 50000,
  settings: { ...base.settings, onlineEnhancements: false, biteSoundEnabled: false },
  appearance: { ownedProducts: ['inkwash_pack', 'whitecape_character_pack'], equipped: { scene: 'inkwash', character: 'minimal', rod: 'inkwash' } },
  focus: { sequence: 4, completedPlanIds: ['fixture-focus-1', 'fixture-focus-2', 'fixture-focus-3'],
    days: { [dayKey]: { completedCount: 3, ticketGranted: false } }, breakRemainingMs: 0,
    plan: { id: 'fixture-focus-4', title: '验收：第四轮最后5秒', status: 'paused', elapsedMs: FOCUS_CONFIG.durationMs - 5000,
      durationMs: FOCUS_CONFIG.durationMs, dayKey, timeZone: 'Asia/Shanghai' } } });
await fs.mkdir(path.join(profile, 'saves'), { recursive: true });
const checksum = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
await fs.writeFile(path.join(profile, 'saves/save-a.json'), JSON.stringify({ format: 'pondclock.save', envelopeVersion: 1, revision: 0, checksum, snapshot: fixture }));
await fs.writeFile(path.join(directory, 'fixture.json'), JSON.stringify(fixture, null, 2));
await fs.writeFile(path.join(root, 'test-results/v2-attached-profile.txt'), profile);
console.log(JSON.stringify({ directory, profile, checksum }));
