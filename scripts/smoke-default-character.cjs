// Independent default-character production UI acceptance. No live HTTP/user data.
// POND_SMOKE_NO_SANDBOX=1 node scripts/smoke-default-character.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright-core');
const { createNewGame } = require('../src/domain/gameState.js');
const { validateSave } = require('../src/domain/saveSchema.js');
const { APPEARANCE_PRODUCTS } = require('../src/config/appearance.js');
const { createSaveRepository } = require('../desktop/saveRepository.cjs');
const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const report = { version: require('../package.json').version, startedAt: new Date().toISOString(), passed: false,
  mode: 'Actual production bundle/main.cjs in diagnostic developer Electron with explicit no-sandbox; independent offline profiles and blocked/replaced HTTP. Virtual clock accelerates gameplay timers only.',
  checks: [], screenshots: [], layouts: [], launches: [], images: [], connections: [], pageErrors: [], resourceFailures: [],
  pending: ['Normal final EXE and sandbox', 'Human preference and sound', 'Live IP/VPN/weather', 'Installer upgrade/uninstall', 'Clean second PC and long-duration performance'] };
const NOON = Date.UTC(2026, 9, 25, 4);
let directory, application, child, page, watchdog, finishing;
const checkpoint = (id, description) => { report.checks.push({ id, description, passed: true }); console.log(id); };
const errorText = error => String(error?.stack || error).slice(-16000);
async function within(operation, ms, name) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name}: timeout ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function writeReport() {
  report.finishedAt = new Date().toISOString();
  const target = path.join(directory || resultsRoot, 'default-character-smoke.json');
  mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(report, null, 2));
  writeFileSync(path.join(resultsRoot, 'default-character-smoke-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, error: report.error }));
}
async function closeApp(normal = true) {
  if (!application) return;
  const ownApp = application, ownChild = child;
  try {
    if (normal && page && !page.isClosed()) {
      const exit = new Promise(resolve => ownChild.exitCode !== null ? resolve(ownChild.exitCode) : ownChild.once('exit', resolve));
      await page.getByRole('button', { name: '退出水塘时钟', exact: true }).click().catch(error => { if (!/closed/i.test(error.message)) throw error; });
      assert.equal(await within(exit, 10000, 'Own native X exit'), 0);
    }
    await within(ownApp.close(), 8000, 'Own transport cleanup');
  } finally {
    if (ownChild && ownChild.exitCode === null) { ownChild.kill(); report.forcedCleanup = true; }
    application = null; child = null; page = null;
  }
}
async function finish() {
  if (finishing) return finishing;
  finishing = (async () => {
    clearTimeout(watchdog);
    try { await closeApp(false); } catch (error) { report.cleanupError = errorText(error); report.passed = false; }
    writeReport();
  })();
  return finishing;
}
let fatalStarted = false;
function fatal(error) {
  if (fatalStarted) return;
  fatalStarted = true; report.error ||= errorText(error); report.passed = false;
  void finish().finally(() => process.exit(1));
}
process.on('unhandledRejection', fatal); process.on('uncaughtException', fatal);
async function seedProfile(label, region = 'jiangnan') {
  const profile = path.join(directory, label), state = createNewGame(region, NOON, { randomSeed: 471 });
  const snapshot = validateSave({ ...state, coins: 7391,
    settings: { ...state.settings, onlineEnhancements: false, biteSoundEnabled: false, sceneWeatherMode: 'manual', manualWeather: 'clear' } });
  await createSaveRepository({ directory: path.join(profile, 'saves'), validate: validateSave }).save(snapshot);
  return profile;
}
async function launch(profile) {
  const args = ['--no-sandbox', path.join(root, 'desktop/main.cjs'), `--user-data-dir=${profile}`,
    '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'];
  if (['1', '2'].includes(process.env.POND_ACCEPTANCE_DPR)) args.push(`--force-device-scale-factor=${process.env.POND_ACCEPTANCE_DPR}`);
  const env = { ...process.env, POND_DEV_SERVER_URL: '' }; delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath: require('electron'), args, chromiumSandbox: false, cwd: root, env, timeout: 30000 });
  child = application.process();
  const launched = { profile, pid: child.pid, args }; report.launches.push(launched);
  launched.runtime = await application.evaluate(({ app, BrowserWindow, net, session }) => {
    const block = (_details, done) => done({ cancel: true });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, block);
    const rejected = async () => { throw new Error('Live network is forbidden in default character acceptance'); };
    net.fetch = rejected;
    const geo = session.fromPartition('pondclock-location', { cache: false });
    geo.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, block); geo.fetch = rejected;
    return { userData: app.getPath('userData'), noSandbox: app.commandLine.hasSwitch('no-sandbox'),
      sandboxPreference: BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences().sandbox };
  });
  assert.equal(launched.runtime.userData.toLowerCase(), profile.toLowerCase()); assert.equal(launched.runtime.noSandbox, true);
  page = await application.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('requestfailed', request => { if (request.url().startsWith('file:')) report.resourceFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.waitForLoadState('load', { timeout: 30000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: NOON });
  await page.reload({ timeout: 30000 }); await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
}
const saved = () => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function pollSave(predicate, label) {
  const deadline = Date.now() + 10000;
  let current;
  while (Date.now() < deadline) {
    current = await saved(); if (predicate(current)) return current;
    await delay(50);
  }
  throw new Error(`${label}: durable state not reached: ${JSON.stringify({ revision: current?.revision, appearance: current?.appearance, settings: current?.settings })}`);
}
const waitRevision = before => pollSave(state => state.revision > before.revision, `revision>${before.revision}`);
async function closePanel() { if (await page.getByRole('button', { name: '收起面板', exact: true }).count()) await page.getByRole('button', { name: '收起面板', exact: true }).click(); }
async function openPanel(name) { await closePanel(); await page.getByRole('button', { name, exact: true }).click(); }
async function screenshot(name) {
  if (await page.locator('[data-sonner-toast]').count()) { await page.clock.runFor(5000); report.notificationSettles = (report.notificationSettles || 0) + 1; }
  const target = path.join(directory, name); await page.screenshot({ path: target, omitBackground: true }); report.screenshots.push(target);
}
async function size(large) {
  const button = page.getByRole('button', { name: large ? '展开挂件' : '缩小挂件', exact: true });
  if (await button.count()) await button.click();
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, large ? { width: 640, height: 490 } : { width: 420, height: 350 });
}
async function layout(label) {
  const data = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      background: getComputedStyle(document.body).backgroundColor,
      boxes: [...document.querySelectorAll('.widget-toolbar,.clock-panel,.pond-scene,.action-dock,.widget-footer,[aria-label="点击渔翁"],.mc-bubble')].map(rect) };
  });
  assert.equal(data.scrollWidth, data.width); assert.equal(data.scrollHeight, data.height); assert.equal(data.background, 'rgba(0, 0, 0, 0)');
  for (const box of data.boxes) assert.ok(box.width > 0 && box.height > 0 && box.x >= -.5 && box.y >= -.5 && box.right <= data.width + .5 && box.bottom <= data.height + .5, `${label}: ${JSON.stringify(box)}`);
  report.layouts.push({ label, ...data });
}
async function images(label, expectedVariant) {
  const data = await page.locator('.pond-scene image').evaluateAll(async elements => Promise.all(elements.map(async element => {
    const source = element.getAttribute('href'), image = new Image(); image.src = source; await image.decode();
    return { source, width: image.naturalWidth, height: image.naturalHeight, character: element.closest('[data-character-art]')?.getAttribute('data-character-art') || null,
      variant: element.getAttribute('data-default-character-variant') || element.closest('[data-default-character-variant]')?.getAttribute('data-default-character-variant') || null };
  })));
  for (const image of data) assert.ok(image.width > 100 && image.height > 100);
  if (expectedVariant) {
    const character = data.filter(image => image.character === 'minimal');
    assert.equal(character.length, 1, label + ': exactly one default-character PNG'); assert.equal(character[0].variant, expectedVariant);
  }
  report.images.push({ label, images: data }); return data;
}
async function connection(label) {
  const data = await page.evaluate(() => {
    const line = document.querySelector('[data-fishing-line]'), rod = document.querySelector('[data-rod-art] path');
    const project = (element, point) => new DOMPoint(point.x, point.y).matrixTransform(element.getCTM());
    const a = project(line, line.getPointAtLength(0)), b = project(rod, rod.getPointAtLength(rod.getTotalLength()));
    return { line: { x: a.x, y: a.y }, rod: { x: b.x, y: b.y }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  });
  assert.ok(data.distance < .6, label + ': actual transformed rod tip and line must meet'); report.connections.push({ label, ...data });
}
async function weather(value) {
  await openPanel('设置'); const before = await saved();
  if (before.settings.manualWeather !== value) { await page.getByRole('combobox', { name: '手动场景天气', exact: true }).selectOption(value); await waitRevision(before); }
  assert.equal((await saved()).settings.manualWeather, value); await closePanel();
}
async function equip(slot, style) {
  const label = { scene: '场景插画', character: '人物皮肤', rod: '鱼竿外观' }[slot], before = await saved();
  if (before.appearance.equipped[slot] !== style) { await page.getByRole('combobox', { name: label, exact: true }).selectOption(style); await waitRevision(before); }
  assert.equal((await saved()).appearance.equipped[slot], style);
  await page.waitForFunction(({ slot, style }) => document.querySelector('.pond-scene')?.getAttribute(`data-${slot}-style`) === style, { slot, style });
}
async function run() {
  assert.equal(process.env.POND_SMOKE_NO_SANDBOX, '1', 'Diagnostic opt-in required');
  await fs.mkdir(resultsRoot, { recursive: true }); directory = await fs.mkdtemp(path.join(resultsRoot, 'default-character-smoke-')); report.directory = directory;
  watchdog = setTimeout(() => fatal(new Error('Whole default-character acceptance exceeds8min')), 8 * 60000);
  const html = await fs.readFile(path.join(root, 'build-desktop/index.html'), 'utf8'); report.bundleHashes = {};
  for (const relative of ['build-desktop/index.html', ...[...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map(match => `build-desktop/${match[1]}`)]) report.bundleHashes[relative] = createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');
  const profile = await seedProfile('main'); await launch(profile);
  assert.equal((await saved()).appearance.equipped.character, 'minimal'); assert.deepEqual((await saved()).appearance.ownedProducts, []);
  assert.equal(await page.locator('.pond-scene image[data-scene-art]').count(), 0);
  for (const large of [false, true]) {
    await size(large); await images(`clear-${large ? 640 : 420}`, 'clear'); await connection(`clear-${large ? 640 : 420}`); await layout(`clear-${large ? 640 : 420}`);
    await screenshot(`default-clear-${large ? 640 : 420}.png`);
    for (const [label, color] of [['light', '#f2f3f0'], ['dark', '#122332']]) { await page.evaluate(value => { document.documentElement.style.backgroundColor = value; }, color); await screenshot(`default-clear-${large ? 640 : 420}-${label}.png`); }
    await page.evaluate(() => { document.documentElement.style.backgroundColor = ''; });
  }
  checkpoint('C01', 'Free minimal identity now decodes exactly one local clear-character PNG, original vector background remains; two client sizes and light/dark reference backgrounds fit');
  const beforePoke = await saved(); await page.getByRole('button', { name: '点击渔翁', exact: true }).click();
  await page.locator('.mc-bubble').waitFor(); await layout('character-click-bubble'); await screenshot('character-click-dialogue.png');
  assert.equal((await saved()).coins, beforePoke.coins); assert.equal((await saved()).catchSequence, beforePoke.catchSequence);
  for (let seconds = 0; seconds < 150 && !await page.getByRole('button', { name: '点击收竿', exact: true }).count(); seconds++) await page.clock.runFor(1000);
  await page.getByRole('button', { name: '点击收竿', exact: true }).waitFor(); await connection('bite'); await screenshot('bite-pose.png');
  const beforeCatch = await saved(); await page.getByRole('button', { name: '点击收竿', exact: true }).click();
  const caught = await pollSave(state => state.catchSequence === beforeCatch.catchSequence + 1, 'successful real catch');
  assert.equal(caught.bucket.length + caught.items.length, beforeCatch.bucket.length + beforeCatch.items.length + 1); await connection('after-catch');
  checkpoint('C02', 'Actual character hit target produces bounded dialogue without assets; real bite/catch adds one confirmed outcome and transformed SVG rod/line stay connected');
  const header = await page.locator('.weather-display').innerText();
  for (const [value, variant, precipitation] of [['rain', 'rain', 'rain'], ['snow', 'clear', 'snow'], ['cloudy', 'clear', 'none']]) {
    await weather(value); await page.waitForFunction(kind => document.querySelector('.pond-scene')?.dataset.precipitation === kind, precipitation);
    await images(value, variant); await connection(value); assert.equal(await page.locator('.weather-display').innerText(), header);
    assert.equal(await page.locator('[data-celestial="sun"]').count(), 0);
    if (value === 'snow') { assert.equal(await page.locator('[data-snow-cover]').getAttribute('data-snow-cover'), '1.000'); assert.ok(await page.locator('[data-snow-support="hat-shoulder"]').count()); }
    await screenshot(`default-${value}-640.png`);
  }
  checkpoint('C03', 'Saved manual rain selects rain gear image; snow uses clear image with supported accumulation; cloudy/rain/snow hide sun and never replace real header');
  await weather('clear'); await openPanel('渔具店');
  for (const id of ['inkwash_pack', 'cloudwalker_skin', 'jade_rod']) {
    const product = APPEARANCE_PRODUCTS.find(entry => entry.id === id), before = await saved();
    await page.getByRole('button', { name: `购买${product.name}`, exact: true }).click(); await waitRevision(before);
    assert.equal((await saved()).coins, before.coins - product.price);
  }
  const beforeEquipment = await saved();
  await equip('scene', 'inkwash'); await equip('rod', 'jade'); await closePanel(); await images('ink-scene-default-character', 'clear');
  for (const large of [false, true]) { await size(large); await layout(`ink-default-${large ? 640 : 420}`); await screenshot(`ink-scene-default-character-${large ? 640 : 420}.png`); }
  await openPanel('渔具店'); await equip('character', 'cloudwalker'); await closePanel();
  assert.equal(await page.locator('[data-default-character-variant]').count(), 0); assert.equal(await page.locator('[data-character-art="cloudwalker"]').count(), 1);
  await openPanel('渔具店'); await equip('character', 'inkwash'); await closePanel();
  assert.equal(await page.locator('[data-character-art="inkwash"] image').count(), 1);
  await openPanel('渔具店'); for (const slot of ['scene', 'character', 'rod']) await equip(slot, 'minimal'); await closePanel();
  const afterEquipment = await saved();
  assert.equal(afterEquipment.coins, beforeEquipment.coins); assert.deepEqual(afterEquipment.appearance.ownedProducts, beforeEquipment.appearance.ownedProducts);
  for (const key of ['randomSeed', 'bucket', 'items', 'rodLevel', 'catchSequence', 'travel']) assert.deepEqual(afterEquipment[key], beforeEquipment[key]);
  await images('restored-free-default', 'clear'); checkpoint('C04', 'Actual paid rights remain separate: default figure works on ink background; owned cloudwalker/ink figures and jade rod still switch; free restore preserves economy and outcomes');
  const durable = await saved(); await page.clock.setSystemTime(Date.UTC(2026, 9, 25, 14));
  await page.clock.runFor(1100); await page.waitForFunction(() => document.querySelector('[data-celestial="moon"]'));
  assert.equal(await page.locator('[data-celestial="sun"]').count(), 0); await images('night', 'clear'); await screenshot('default-night-640.png');
  await closeApp(); await launch(profile); const restored = await saved();
  assert.deepEqual(restored.appearance, durable.appearance); assert.equal(restored.coins, durable.coins); assert.equal(restored.settings.manualWeather, durable.settings.manualWeather);
  await images('restart', 'clear'); checkpoint('C05', 'Night clear has moon without sun, normal X and offline restart retain free default ID, purchased rights, equipment and coins');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceFailures, []);
  report.passed = true; await closeApp(); await finish();
}
run().catch(fatal);
