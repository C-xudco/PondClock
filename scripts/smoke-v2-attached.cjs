// Attach to the final EXE already started through its normal Windows desktop entry.
// This script never launches a browser/EXE, changes permissions, or disables sandboxing.
// Usage: node scripts/smoke-v2-attached.cjs [expected-PondClock.exe]
// Leader supplies an isolated validated fixture and writes its absolute directory to
// test-results/v2-attached-profile.txt before starting the EXE with --remote-debugging-port=9322.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright-core');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const expectedExe = process.argv[2] || 'X:/game/PondClock-2.0.0/PondClock.exe';
const report = { startedAt: new Date().toISOString(), passed: false, checks: [], screenshots: [], layouts: [], decodedImages: [], copies: [], pageErrors: [],
  scope: 'Real final EXE started separately through Windows Explorer/shortcut, then inspected over CDP. This script does not start the EXE. Debugging attachment and accelerated clocks distinguish this from an ordinary no-debug launch acceptance.',
  limitations: ['The starting coins, appearance rights and near-complete fourth focus plan are explicit Leader-prepared fixtures in an isolated profile.',
    'Virtual wall/monotonic clocks accelerate trips, active casts and the final focus seconds; this does not verify full real-time sessions or sleep.',
    'No live IP/weather, installer, clean second computer or subjective artwork acceptance is certified.',
    'noSandboxSwitch is observed through the real bridge; native webPreferences are separately covered by main-process tests.'],
  connection: 'http://127.0.0.1:9322', launchesPerformedByThisScript: 0 };
let directory, browser, page, finishing, watchdog;
const normalize = value => path.resolve(value).replaceAll('/', '\\').toLowerCase();
const checked = (id, description) => { report.checks.push({ id, description, passed: true }); console.log(id); };
async function finish() {
  if (finishing) return finishing;
  finishing = (async () => {
    clearTimeout(watchdog);
    try { if (browser) await browser.close(); } catch (error) { report.disconnectError = String(error); report.passed = false; }
    report.finishedAt = new Date().toISOString();
    const target = path.join(directory || results, 'v2-attached.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(results, 'v2-attached-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, error: report.error }));
  })();
  return finishing;
}
const saved = () => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function waitState(predicate, arg) {
  // Run test predicates in Node, leaving the production renderer's strict CSP intact.
  const deadline = Date.now() + 15000;
  let latest;
  while (Date.now() < deadline) {
    latest = await saved();
    if (predicate(latest, arg)) return latest;
    await delay(40);
  }
  throw new Error('Expected persisted state not reached: ' + JSON.stringify({ revision: latest?.revision,
    fishing: latest?.fishing, focus: latest?.focus }));
}
async function copySave(label) {
  const snapshot = await saved();
  const filename = path.join(directory, label + '-snapshot.json');
  await fs.writeFile(filename, JSON.stringify(snapshot, null, 2));
  const diskSlots = [];
  for (const name of ['save-a.json', 'save-b.json']) {
    let bytes;
    try { bytes = await fs.readFile(path.join(report.appInfo.userData, 'saves', name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const envelope = JSON.parse(bytes.toString('utf8'));
    assert.equal(envelope.checksum, createHash('sha256').update(JSON.stringify(envelope.snapshot)).digest('hex'));
    const target = path.join(directory, label + '-' + name);
    await fs.writeFile(target, bytes);
    diskSlots.push({ filename: target, revision: envelope.revision, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  assert.ok(diskSlots.length, 'Expected actual isolated disk save slots');
  report.copies.push({ label, filename, revision: snapshot.revision, catchSequence: snapshot.catchSequence, currentRegion: snapshot.currentRegion, diskSlots });
  return snapshot;
}
async function shot(label) {
  const target = path.join(directory, label + '.png');
  await page.screenshot({ path: target, omitBackground: true }); report.screenshots.push(target);
}
async function closePanel() {
  const control = page.getByRole('button', { name: '收起面板', exact: true });
  if (await control.count()) await control.click();
}
async function openPanel(name) { await closePanel(); await page.getByRole('button', { name, exact: true }).click(); }
async function setSize(size) {
  const info = await page.evaluate(() => window.pondDesktop.getAppInfo());
  if (info.sizePreset !== size) await page.getByRole('button', { name: size === 'compact' ? '缩小挂件' : '展开挂件', exact: true }).click();
  const target = size === 'compact' ? { width: 420, height: 350 } : { width: 640, height: 490 };
  await page.waitForFunction(target => innerWidth === target.width && innerHeight === target.height, target);
  const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    boxes: [...document.querySelectorAll('.widget-toolbar,.clock-panel,.pond-scene,.fishing-controls,.action-dock,.widget-footer')].map(element => {
      const box = element.getBoundingClientRect(); return { name: element.className, x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    }) }));
  assert.equal(layout.scrollWidth, layout.width); assert.equal(layout.scrollHeight, layout.height);
  for (const box of layout.boxes) assert.ok(box.width > 0 && box.height > 0 && box.x >= -.5 && box.y >= -.5 && box.right <= layout.width + .5 && box.bottom <= layout.height + .5, JSON.stringify(box));
  report.layouts.push({ size, ...layout }); await shot('window-' + size);
}
async function decodeScene(id) {
  const images = await page.locator('.pond-scene image').evaluateAll(async elements => Promise.all(elements.map(async element => {
    const source = element.getAttribute('href'), image = new Image(); image.src = source; await image.decode();
    return { source, width: image.naturalWidth, height: image.naturalHeight };
  })));
  assert.ok(images.some(image => image.source.endsWith('art/inkwash/' + id + '-v1.svg')), id + ': expected local SVG');
  for (const image of images) assert.ok(image.width > 100 && image.height > 100);
  assert.equal(await page.locator('[data-classic-source="1.1.1"]').count(), 1);
  report.decodedImages.push({ id, images }); await shot('scene-' + id);
}
async function connect() {
  const until = Date.now() + 30000;
  let lastError;
  while (Date.now() < until) {
    try { return await chromium.connectOverCDP(report.connection, { timeout: Math.min(2500, Math.max(100, until - Date.now())) }); }
    catch (error) { lastError = error; await delay(Math.min(500, Math.max(0, until - Date.now()))); }
  }
  throw new Error('The already-running EXE CDP port did not become available within30s: ' + String(lastError));
}
async function run() {
  await fs.mkdir(results, { recursive: true }); directory = await fs.mkdtemp(path.join(results, 'v2-attached-'));
  const expectedProfile = (await fs.readFile(path.join(results, 'v2-attached-profile.txt'), 'utf8')).trim();
  assert.ok(path.isAbsolute(expectedProfile));
  assert.ok(normalize(expectedProfile).startsWith(normalize(results) + '\\'), 'Refusing a profile outside project test-results');
  browser = await connect();
  const pages = browser.contexts().flatMap(context => context.pages());
  page = pages.find(candidate => candidate.url().startsWith('file:'));
  assert.ok(page, 'No final application renderer target found on the attached port');
  page.setDefaultTimeout(15000); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.waitForFunction(() => typeof window.pondDesktop?.getAppInfo === 'function');
  const appInfo = await page.evaluate(() => window.pondDesktop.getAppInfo()); report.appInfo = appInfo;
  assert.equal(appInfo.version, '2.0.0'); assert.equal(appInfo.editionId, 'first-focus');
  assert.equal(appInfo.packaged, true); assert.equal(appInfo.platform, 'win32');
  assert.equal(appInfo.noSandboxSwitch, false);
  assert.equal(normalize(appInfo.execPath), normalize(expectedExe));
  assert.equal(normalize(appInfo.userData), normalize(expectedProfile));
  await page.route('https://**/*', route => route.abort('blockedbyclient'));
  await page.route('http://**/*', route => route.abort('blockedbyclient'));
  const initial = await copySave('before');
  assert.equal(initial.schemaVersion, 4); assert.equal(initial.editionId, 'first-focus');
  assert.equal(initial.settings.onlineEnhancements, false); assert.equal(initial.fishing.mode, 'stopped');
  assert.ok(initial.appearance.ownedProducts.includes('inkwash_pack'));
  assert.equal(initial.appearance.equipped.character, 'minimal'); assert.equal(initial.activePass.remaining, 0);
  assert.ok(initial.coins >= 50000, 'Scene travel fixture needs at least50000 coins');
  assert.equal(initial.focus.plan?.status, 'paused'); assert.equal(initial.focus.completedPlanIds.length, 3);
  assert.ok(initial.focus.plan.durationMs - initial.focus.plan.elapsedMs <= 5000);
  checked('A01', 'Attached real2.0.0 packaged EXE reports expected isolated profile and no no-sandbox switch');
  await closePanel(); await setSize('compact'); await setSize('comfortable');
  checked('A02', 'Both actual window sizes render controls within420x350 and640x490 and produce DOM screenshots');
  // Installing the clock then reloading starts the session under one monotonic origin.
  await page.clock.install({ time: Math.max(Date.now(), initial.lastEffectiveNowMs) });
  await page.reload(); await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  // Keep screenshots and IPC round trips from moving the needle between a
  // deliberate advance and the key press. Only explicit runFor moves this test clock.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 10);
  await openPanel('专注计划'); await page.getByRole('button', { name: '继续专注', exact: true }).click();
  await waitState(state => state.focus.plan?.status === 'running'); await page.clock.runFor(5250);
  const focused = await waitState(state => state.focus.plan === null && state.focus.completedPlanIds.length === 4);
  assert.equal(focused.baitCount, initial.baitCount + 1); assert.equal(focused.freeTravelTickets, initial.freeTravelTickets + 1);
  assert.equal(focused.focus.days[initial.focus.plan.dayKey].ticketGranted, true);
  await shot('focus-fourth-reward'); await copySave('after-focus');
  checked('A03', 'Leader-prepared fourth-plan fixture completes via UI and grants exactly one bait pack and one daily ticket');
  await openPanel('渔具店'); await page.getByRole('button', { name: '渔具与鱼饵', exact: true }).click();
  await page.getByRole('button', { name: '购买15次 · ¥450', exact: true }).click();
  const purchased = await waitState(state => state.activePass.remaining === 15); assert.equal(purchased.coins, focused.coins - 450);
  await closePanel(); await page.getByRole('button', { name: /主动抛竿/ }).click();
  let current = await waitState(state => state.fishing.phase === 'casting'); const activeId = current.fishing.attempt.id;
  for (let index = 0; index < 3 && current.fishing.phase === 'casting'; index++) {
    assert.equal(current.activePass.remaining, 15); const swings = current.fishing.attempt.completedSwings;
    await page.clock.setSystemTime(current.fishing.attempt.nextSwingAtMs + 1); await page.clock.runFor(275);
    current = await waitState((state, swings) => state.fishing.phase === 'gauge' || state.fishing.attempt.completedSwings > swings, swings);
  }
  assert.equal(current.fishing.phase, 'gauge'); assert.equal(current.activePass.remaining, 14);
  await page.clock.runFor(700);
  const gauge = page.getByRole('region', { name: '主动收鱼进度条', exact: true });
  await page.bringToFront(); await gauge.focus();
  assert.equal(await page.evaluate(() => document.hasFocus()), true, 'The real app must own focus for keyboard capture');
  await shot('active-green-before-key'); await page.keyboard.press('z');
  const activeResult = await waitState((state, id) => state.fishing.lastResult?.attemptId === id, activeId);
  assert.equal(activeResult.fishing.lastResult.success, true); assert.equal(activeResult.fishing.lastResult.kind, 'fish');
  assert.equal(activeResult.activePass.remaining, 14); assert.equal(activeResult.bucket.length, initial.bucket.length + 1);
  assert.equal(activeResult.baitCount, focused.baitCount); assert.equal(activeResult.baitLeft, focused.baitLeft);
  await page.getByRole('button', { name: '停止钓鱼', exact: true }).click(); await waitState(state => state.fishing.mode === 'stopped');
  await copySave('after-active');
  checked('A04', 'UI purchases15 chances; empty swings are free, gauge deducts one and focused green keyboard stop catches one fish without bait consumption');
  await openPanel('渔具店'); await page.getByRole('combobox', { name: '场景插画', exact: true }).selectOption('inkwash');
  await waitState(state => state.appearance.equipped.scene === 'inkwash'); await closePanel();
  const { REGIONS } = await import(pathToFileURL(path.join(root, 'src/lib/gameConfig.js')));
  await openPanel('漫游');
  assert.equal(REGIONS.length, 17);
  for (const region of REGIONS) assert.ok(await page.getByRole('region', { name: '漫游', exact: true }).getByText(region.name, { exact: true }).count(), region.id);
  await closePanel();
  for (const id of ['taihu', 'dongting', 'jialing', 'baiyangdian', 'jiaodong']) {
    if ((await saved()).currentRegion !== id) {
      await openPanel('漫游');
      await page.getByRole('combobox', { name: '机票支付方式', exact: true }).selectOption('coins');
      const name = REGIONS.find(region => region.id === id).name;
      const row = page.getByRole('region', { name: '漫游', exact: true }).getByText(name, { exact: true }).locator('..').locator('..').locator('..');
      await row.getByRole('button', { name: /^机票 ¥/ }).click();
      const flying = await waitState(state => state.travel !== null);
      await closePanel(); await page.clock.setSystemTime(flying.travel.arriveAtMs + 1); await page.clock.runFor(500);
      await waitState((state, id) => !state.travel && state.currentRegion === id, id);
      await page.waitForFunction(id => document.querySelector('.pond-scene')?.getAttribute('data-scene-region') === id, id);
    }
    await decodeScene(id);
  }
  await copySave('after-five-scenes'); checked('A05', 'Actual travel UI lists17 regions and pays/arrives through all five added local SVG landscapes');
  assert.deepEqual(report.pageErrors, []); report.passed = true;
}
watchdog = setTimeout(() => { report.error ||= 'Attached acceptance exceeded180seconds'; report.passed = false; void finish().finally(() => process.exit(1)); }, 180000);
run().catch(error => { report.error = String(error?.stack || error).slice(-18000); report.passed = false; })
  .finally(async () => { await finish(); process.exit(report.passed ? 0 : 1); });
