// Production renderer diagnosis only. Browser + mocked desktop bridge, never native EXE evidence.
// Runs installed Edge/Chrome with its normal Chromium sandbox; no user profile or live HTTP.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const report = { startedAt: new Date().toISOString(), passed: false,
  scope: 'Production build-desktop rendered in installed Chromium browser with an explicitly mocked in-memory pondDesktop bridge. NOT a native EXE, installer, disk-save, actual desktop integration or live-weather acceptance.',
  sandboxRequested: true, checks: [], screenshots: [], layouts: [], decodedImages: [], pageErrors: [], failedResources: [],
  limitations: ['All currency, ownership, regions and near-complete focus progress are synthetic schema-validated fixtures.',
    'The mock repository persists in this Node process only. No player profile or save file is read or written.',
    'The browser viewport approximates the widget sizes; it does not prove native transparency, pinning, launch or shutdown.',
    'Playwright clock accelerates timers; real elapsed focus, sleep and background behavior are not certified.'] };
const NOW = Date.UTC(2026, 9, 28, 4);
let browser, server, directory, page, state, validateSave, createNewGame, products, regions;
let preset = 'compact';
let closing;
const checked = (id, description) => { report.checks.push({ id, description, passed: true }); console.log(id); };
async function finish() {
  if (closing) return closing;
  closing = (async () => {
    try { if (browser) await browser.close(); } catch (error) { report.cleanupError = String(error); report.passed = false; }
    if (server) await new Promise(resolve => server.httpServer.close(resolve));
    report.finishedAt = new Date().toISOString();
    const target = path.join(directory || results, 'v2-web-smoke.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(report, null, 2));
    await fs.writeFile(path.join(results, 'v2-web-smoke-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, error: report.error }));
  })();
  return closing;
}
const saved = () => page.evaluate(() => window.pondDesktop.loadSave()).then(result => result.snapshot);
async function waitState(predicate, arg) {
  const deadline = Date.now() + 10000;
  let current;
  while (Date.now() < deadline) {
    current = await saved();
    if (predicate(current, arg)) return current;
    await delay(40);
  }
  throw new Error('Expected mock state not reached: ' + JSON.stringify({ revision: current?.revision, fishing: current?.fishing, focus: current?.focus }));
}
function fixture(region = 'jiangnan', extra = {}) {
  const initial = createNewGame(region, NOW, { randomSeed: 471 });
  return validateSave({ ...initial, coins: 5000, unlockedRegions: regions.map(region => region.id),
    appearance: { ownedProducts: products.map(product => product.id), equipped: { scene: 'minimal', character: 'minimal', rod: 'minimal' } },
    settings: { ...initial.settings, onlineEnhancements: false, biteSoundEnabled: false, sceneWeatherMode: 'manual', manualWeather: 'clear' }, ...extra });
}
async function reloadFixture(next) {
  state = validateSave(next);
  await page.reload();
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
}
async function closePanel() {
  const button = page.getByRole('button', { name: '收起面板', exact: true });
  if (await button.count()) await button.click();
}
async function screenshot(name) {
  const target = path.join(directory, name + '.png');
  await page.screenshot({ path: target, omitBackground: true }); report.screenshots.push(target);
}
async function layout(label) {
  const value = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
    boxes: [...document.querySelectorAll('.widget-toolbar,.clock-panel,.pond-scene,.fishing-controls,.action-dock,.widget-footer')].map(element => {
      const box = element.getBoundingClientRect(); return { name: element.className, x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }) }));
  assert.equal(value.scrollWidth, value.width, label + ': horizontal overflow');
  assert.equal(value.scrollHeight, value.height, label + ': vertical overflow');
  for (const box of value.boxes) assert.ok(box.width > 0 && box.height > 0 && box.x >= -.5 && box.y >= -.5 && box.right <= value.width + .5 && box.bottom <= value.height + .5, label + ': ' + JSON.stringify(box));
  report.layouts.push({ label, ...value });
}
async function decodeScene(label) {
  const images = await page.locator('.pond-scene image').evaluateAll(async elements => Promise.all(elements.map(async element => {
    const source = element.getAttribute('href'), image = new Image(); image.src = source; await image.decode();
    return { source, width: image.naturalWidth, height: image.naturalHeight };
  })));
  for (const image of images) assert.ok(image.width > 100 && image.height > 100, label);
  report.decodedImages.push({ label, images });
}
async function run() {
  await fs.mkdir(results, { recursive: true }); directory = await fs.mkdtemp(path.join(results, 'v2 web mock-'));
  const imports = await Promise.all([import(pathToFileURL(path.join(root, 'src/domain/gameState.js'))),
    import(pathToFileURL(path.join(root, 'src/domain/saveSchema.js'))), import(pathToFileURL(path.join(root, 'src/config/appearance.js'))),
    import(pathToFileURL(path.join(root, 'src/lib/gameConfig.js')))]);
  createNewGame = imports[0].createNewGame; validateSave = imports[1].validateSave;
  products = imports[2].APPEARANCE_PRODUCTS; regions = imports[3].REGIONS;
  const candidates = [process.env.POND_WEB_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  for (const candidate of candidates) { try { await fs.access(candidate); report.browserExecutable = candidate; break; } catch { /* inspect next installed browser */ } }
  assert.ok(report.browserExecutable, 'No installed Chromium browser found; no installation or security changes attempted');
  const { preview } = await import('vite');
  server = await preview({ configFile: path.join(root, 'vite.desktop.config.js'), preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  const address = server.httpServer.address(); const origin = `http://127.0.0.1:${address.port}`;
  report.productionDirectory = path.join(root, 'build-desktop');
  report.productionHtmlSha256 = createHash('sha256').update(await fs.readFile(path.join(root, 'build-desktop/index.html'))).digest('hex');
  // Explicit true removes Playwright's default --no-sandbox argument.
  browser = await chromium.launch({ executablePath: report.browserExecutable, headless: true, chromiumSandbox: true, timeout: 20000 });
  report.browserVersion = browser.version();
  const cdp = await browser.newBrowserCDPSession();
  const commandLine = await cdp.send('Browser.getBrowserCommandLine');
  report.browserArgs = commandLine.arguments;
  assert.ok(!commandLine.arguments.some(argument => argument === '--no-sandbox' || argument === '--disable-gpu-sandbox'));
  const context = await browser.newContext({ viewport: { width: 420, height: 350 } });
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort('blockedbyclient'));
  state = fixture();
  await context.exposeBinding('__pondMockLoad', () => ({ snapshot: structuredClone(state), recovery: null }));
  await context.exposeBinding('__pondMockSave', (_source, next) => {
    const validated = validateSave(next);
    assert.equal(next.revision, state.revision + 1, 'Mock save uses real revision progression');
    state = validated; return { status: 'committed', snapshot: structuredClone(state) };
  });
  const info = () => ({ name: 'PondClock browser/mock diagnostic', version: '2.0.0', editionId: 'first-focus',
    platform: 'browser-mock', packaged: false, sizePreset: preset, alwaysOnTop: state.settings.alwaysOnTop });
  await context.exposeBinding('__pondMockInfo', info);
  await context.exposeBinding('__pondMockWindow', async (_source, action) => {
    if (['compact', 'comfortable'].includes(action)) {
      preset = action; await page.setViewportSize(preset === 'compact' ? { width: 420, height: 350 } : { width: 640, height: 490 });
    }
    return info();
  });
  await context.addInitScript(() => {
    window.pondDesktop = Object.freeze({ loadSave: () => window.__pondMockLoad(), saveGame: next => window.__pondMockSave(next),
      getAppInfo: () => window.__pondMockInfo(), windowAction: action => window.__pondMockWindow(action),
      onLifecycle: () => () => {}, ackLifecycle: async () => true,
      requestEnvironment: async () => { throw new Error('Live HTTP disabled in browser/mock diagnosis'); },
      exportSave: async () => ({ canceled: true }), importSave: async () => ({ canceled: true }) });
  });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('requestfailed', request => { if (request.url().startsWith(origin + '/')) report.failedResources.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.clock.install({ time: NOW }); await page.goto(origin);
  await page.getByRole('button', { name: '开始钓鱼', exact: true }).waitFor();
  assert.equal(await page.locator('[data-classic-source="1.1.1"]').count(), 1);
  await layout('classic-compact'); await screenshot('classic-compact');
  await page.getByRole('button', { name: '展开挂件', exact: true }).click();
  await layout('classic-comfortable'); await screenshot('classic-comfortable');
  checked('W01', 'Production renderer shows classic default and both viewport approximations without document overflow');
  for (const region of ['taihu', 'dongting', 'jialing', 'baiyangdian', 'jiaodong']) {
    const next = fixture(region); next.appearance.equipped.scene = 'inkwash';
    await reloadFixture(next); await decodeScene(region); await screenshot('ink-' + region); await layout(region);
    assert.equal(await page.locator('.pond-scene').getAttribute('data-scene-region'), region);
  }
  checked('W02', 'All five new local SVG scenes decode in normal Chromium and retain the classic character');
  for (const weather of ['rain', 'snow']) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('combobox', { name: '手动场景天气', exact: true }).selectOption(weather);
    await waitState((state, weather) => state.settings.manualWeather === weather, weather);
    await closePanel(); await page.clock.runFor(3000);
    assert.equal(await page.locator('.pond-scene').getAttribute('data-precipitation'), weather);
    assert.equal(await page.locator('[data-classic-rain-cape="true"]').count(), weather === 'rain' ? 1 : 0);
    if (weather === 'snow') assert.equal(await page.locator('[data-snow-support="hat-shoulder"]').count(), 1);
    await screenshot('classic-' + weather);
  }
  checked('W03', 'Settings switch rain/snow while retaining the background and applying distinct classic garments/snow support');
  const focusFixture = fixture();
  const day = '2026-10-28';
  focusFixture.focus = { sequence: 4, completedPlanIds: ['mock1', 'mock2', 'mock3'], days: { [day]: { completedCount: 3, ticketGranted: false } },
    breakRemainingMs: 0, plan: { id: 'mock4', title: '浏览器诊断：最后5秒', status: 'paused', elapsedMs: 1495000,
      durationMs: 1500000, dayKey: day, timeZone: 'Asia/Shanghai' } };
  await reloadFixture(focusFixture); await page.getByRole('button', { name: '专注计划', exact: true }).click();
  await page.getByRole('button', { name: '继续专注', exact: true }).click();
  await waitState(state => state.focus.plan?.status === 'running'); await page.clock.runFor(5250);
  const completed = await waitState(state => state.focus.plan === null && state.focus.completedPlanIds.length === 4);
  assert.equal(completed.baitCount, focusFixture.baitCount + 1); assert.equal(completed.freeTravelTickets, 1);
  await screenshot('focus-reward'); await closePanel();
  checked('W04', 'Synthetic fourth-plan fixture receives one bait pack and one ticket through the production UI/session');
  await page.getByRole('button', { name: '渔具店', exact: true }).click();
  await page.getByRole('button', { name: '渔具与鱼饵', exact: true }).click();
  await page.getByRole('button', { name: '购买15次 · ¥450', exact: true }).click();
  const purchased = await waitState(state => state.activePass.remaining === 15); assert.equal(purchased.coins, 4550);
  await closePanel(); await page.getByRole('button', { name: /主动抛竿/ }).click();
  let current = await waitState(state => state.fishing.phase === 'casting');
  const id = current.fishing.attempt.id;
  for (let i = 0; i < 3 && current.fishing.phase === 'casting'; i++) {
    assert.equal(current.activePass.remaining, 15); const swings = current.fishing.attempt.completedSwings;
    await page.clock.setSystemTime(current.fishing.attempt.nextSwingAtMs + 1); await page.clock.runFor(275);
    current = await waitState((state, swings) => state.fishing.phase === 'gauge' || state.fishing.attempt.completedSwings > swings, swings);
  }
  assert.equal(current.fishing.phase, 'gauge'); assert.equal(current.activePass.remaining, 14);
  await page.clock.runFor(700); await screenshot('active-green'); await page.keyboard.press('z');
  const caught = await waitState((state, id) => state.fishing.lastResult?.attemptId === id, id);
  assert.equal(caught.fishing.lastResult.success, true); assert.equal(caught.fishing.lastResult.kind, 'fish');
  assert.equal(caught.activePass.remaining, 14); assert.equal(caught.baitCount, completed.baitCount);
  checked('W05', 'Production UI buys the 15-use rod, preserves empty-cast charges and accepts focused keyboard input in green');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.failedResources, []);
  report.passed = true;
}
const watchdog = setTimeout(() => {
  report.error ||= 'Browser/mock diagnosis exceeded 150 seconds'; report.passed = false;
  void finish().finally(() => process.exit(1));
}, 150000);
run().catch(error => { report.error = String(error?.stack || error).slice(-18000); report.passed = false; })
  .finally(async () => { clearTimeout(watchdog); await finish(); process.exit(report.passed ? 0 : 1); });
