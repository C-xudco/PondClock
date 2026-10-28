// One additional real-EXE active chance for an unobscured preview; attach only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const report = { passed: false, startedAt: new Date().toISOString(), checks: [], copies: [],
  scope: 'Additional13th remaining opportunity preview in the same isolated real EXE, attached over CDP; starting remaining14 decreases to13. No new instance is launched. Prior reports remain unchanged.',
  limitations: ['Explicit fixture coins/rights and accelerated paused test clock; not a fresh user profile or full real-time focus test.'] };
let browser, page, directory, profile;
const normalize = value => path.resolve(value).replaceAll('/', '\\').toLowerCase();
const saved = () => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function waitState(predicate) {
  const until = Date.now() + 12000;
  let state;
  while (Date.now() < until) { state = await saved(); if (predicate(state)) return state; await delay(40); }
  throw Error('Expected persisted state not reached: ' + JSON.stringify(state?.fishing));
}
async function copySlots(label) {
  const slots = [];
  for (const name of ['save-a.json', 'save-b.json']) {
    let bytes;
    try { bytes = await fs.readFile(path.join(profile, 'saves', name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const envelope = JSON.parse(bytes.toString());
    assert.equal(envelope.checksum, createHash('sha256').update(JSON.stringify(envelope.snapshot)).digest('hex'));
    const target = path.join(directory, label + '-' + name); await fs.writeFile(target, bytes);
    slots.push({ target, revision: envelope.revision, sha256: createHash('sha256').update(bytes).digest('hex'), snapshot: envelope.snapshot });
  }
  assert.ok(slots.length);
  slots.sort((a, b) => b.revision - a.revision);
  report.copies.push({ label, slots: slots.map(({ snapshot: _snapshot, ...metadata }) => metadata) });
  return slots[0].snapshot;
}
async function run() {
  directory = await fs.mkdtemp(path.join(results, 'v2-preview-'));
  profile = (await fs.readFile(path.join(results, 'v2-attached-profile.txt'), 'utf8')).trim();
  assert.ok(normalize(profile).startsWith(normalize(results) + '\\'));
  browser = await chromium.connectOverCDP('http://127.0.0.1:9322', { timeout: 15000 });
  page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('file:'));
  assert.ok(page); page.setDefaultTimeout(15000);
  const info = await page.evaluate(() => window.pondDesktop.getAppInfo()); report.appInfo = info;
  assert.equal(info.packaged, true); assert.equal(info.version, '2.0.0'); assert.equal(info.noSandboxSwitch, false);
  assert.equal(normalize(info.userData), normalize(profile));
  assert.equal(normalize(info.execPath), normalize('X:/game/PondClock-2.0.0/PondClock.exe'));
  const before = await saved(); report.before = { activeRemaining: before.activePass.remaining, catchSequence: before.catchSequence,
    baitCount: before.baitCount, baitLeft: before.baitLeft, freeTravelTickets: before.freeTravelTickets, completedPlanIds: before.focus.completedPlanIds };
  assert.equal(before.activePass.remaining, 14); assert.equal(before.fishing.mode, 'stopped');
  await copySlots('before');
  const panel = page.getByRole('button', { name: '收起面板', exact: true }); if (await panel.count()) await panel.click();
  await page.mouse.move(8, 8); await page.clock.runFor(6500);
  assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'Notification timers must dismiss without deleting their DOM');
  await page.getByRole('button', { name: /主动抛竿/ }).click();
  let current = await waitState(state => state.fishing.phase === 'casting'); const id = current.fishing.attempt.id;
  for (let index = 0; index < 3 && current.fishing.phase === 'casting'; index++) {
    assert.equal(current.activePass.remaining, 14); const swings = current.fishing.attempt.completedSwings;
    await page.clock.setSystemTime(current.fishing.attempt.nextSwingAtMs + 1); await page.clock.runFor(275);
    current = await waitState(state => state.fishing.phase === 'gauge' || state.fishing.attempt.completedSwings > swings);
  }
  assert.equal(current.fishing.phase, 'gauge'); assert.equal(current.activePass.remaining, 13);
  await page.clock.runFor(700);
  const gauge = page.getByRole('region', { name: '主动收鱼进度条', exact: true });
  await page.bringToFront(); await gauge.focus(); assert.equal(await page.evaluate(() => document.hasFocus()), true);
  assert.equal(await page.locator('[data-sonner-toast]').count(), 0);
  await gauge.getByRole('img', { name: /当前指针：绿/ }).waitFor();
  const screenshot = path.join(directory, 'active-green-clean.png'); await page.screenshot({ path: screenshot, omitBackground: true }); report.screenshot = screenshot;
  await page.keyboard.press('z');
  const caught = await waitState(state => state.fishing.lastResult?.attemptId === id);
  assert.equal(caught.fishing.lastResult.kind, 'fish'); assert.equal(caught.fishing.lastResult.success, true);
  assert.equal(caught.catchSequence, before.catchSequence + 1); assert.equal(caught.activePass.remaining, 13);
  assert.equal(caught.baitCount, before.baitCount); assert.equal(caught.baitLeft, before.baitLeft); assert.equal(caught.coins, before.coins);
  assert.equal(caught.freeTravelTickets, before.freeTravelTickets); assert.deepEqual(caught.focus.completedPlanIds, before.focus.completedPlanIds);
  await page.getByRole('button', { name: '停止钓鱼', exact: true }).click(); await waitState(state => state.fishing.mode === 'stopped');
  report.checks.push({ id: 'PREVIEW', passed: true, description: 'Unobscured real window green gauge; one additional14-to13 chance resolves one fish and preserves prior focus rewards' });
  const closed = page.waitForEvent('close', { timeout: 15000 });
  await page.evaluate(() => window.pondDesktop.windowAction('close')).catch(error => { if (!/closed|Target|context|browser/i.test(error.message)) throw error; });
  await closed;
  const final = await copySlots('after-normal-close');
  assert.equal(final.fishing.mode, 'stopped'); assert.equal(final.activePass.remaining, 13); assert.equal(final.catchSequence, before.catchSequence + 1);
  assert.equal(final.freeTravelTickets, before.freeTravelTickets); assert.deepEqual(final.focus.completedPlanIds, before.focus.completedPlanIds);
  report.after = { activeRemaining: final.activePass.remaining, catchSequence: final.catchSequence, baitCount: final.baitCount,
    freeTravelTickets: final.freeTravelTickets, completedPlanIds: final.focus.completedPlanIds };
  report.checks.push({ id: 'NORMAL-CLOSE', passed: true, description: 'Own real bridge saves and closes the renderer; latest disk save has no unresolved fishing attempt' });
  report.passed = true;
}
const watchdog = setTimeout(() => { report.error ||= 'Preview acceptance timed out after90seconds'; process.exitCode = 1; void finish(); }, 90000);
async function finish() {
  clearTimeout(watchdog);
  try { if (browser) await browser.close(); } catch { /* target may already have normally exited */ }
  report.finishedAt = new Date().toISOString();
  const target = path.join(directory || results, 'v2-preview.json'); await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, report: target, screenshot: report.screenshot, error: report.error }));
  process.exit(report.passed ? 0 : 1);
}
run().catch(error => { report.error = String(error?.stack || error); report.passed = false; }).finally(finish);
