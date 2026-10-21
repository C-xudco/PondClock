// Diagnostic only: use the real desktop main and production UI build, never a UI mirror.
// POND_SMOKE_NO_SANDBOX=1 node scripts/smoke-widget.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const report = { startedAt: new Date().toISOString(), passed: false, diagnostic: true, hostSandboxEnabled: false,
  scope: 'Developer Electron loads real desktop/main.cjs and build-desktop UI. Explicit global --no-sandbox; all IP responses are simulated and real HTTP is blocked.',
  checks: [], launches: [], screenshots: [], consoleErrors: [], fatalEvents: [], cleanupErrors: [], layouts: [],
  pending: ['Normal sandbox launch of final distributed EXE', 'Windows native title-bar dragging with mouse',
    'Windows transparent compositor appearance and taskbar restoration by user', 'Actual network/VPN change and real IP service responsiveness'] };
let directory;
let userData;
let application;
let child;
let currentPage;
let finalization;
let watchdog;
const errorText = (error) => String(error?.stack || error).slice(-20000);
const check = (id, description) => report.checks.push({ id, description, passed: true });

function writeReport() {
  report.finishedAt = new Date().toISOString();
  if (report.error || report.fatalEvents.length || report.cleanupErrors.length) report.passed = false;
  const filename = path.join(directory || resultsRoot, 'widget-smoke.json');
  report.reportPath = filename;
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(resultsRoot, 'widget-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, diagnostic: true, hostSandboxEnabled: false, checks: report.checks.length, report: filename, error: report.error }));
}
async function within(operation, ms, name) {
  let timer;
  try { return await Promise.race([operation, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${name} exceeded ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function finalize() {
  if (finalization) return finalization;
  finalization = (async () => {
    clearTimeout(watchdog);
    const deadline = setTimeout(() => { report.cleanupErrors.push('Finalization exceeded 15 seconds'); writeReport(); process.exit(1); }, 15000);
    try {
      if (application) {
        try { await within(application.close(), 10000, 'Cleanup of this diagnostic app'); }
        catch (error) { report.cleanupErrors.push(errorText(error)); }
        if (child && child.exitCode === null) {
          report.cleanupErrors.push(`Forced cleanup of own diagnostic PID ${child.pid}; not a successful normal exit`);
          try { child.kill(); } catch (error) { report.cleanupErrors.push(errorText(error)); }
        }
      }
      writeReport();
    } finally { clearTimeout(deadline); }
  })();
  return finalization;
}
function fatal(kind, error) {
  report.error ||= errorText(error);
  report.passed = false;
  report.fatalEvents.push({ kind, error: errorText(error) });
  writeReport();
  void finalize().then(() => process.exit(1), () => { writeReport(); process.exit(1); });
}
process.on('unhandledRejection', (error) => fatal('UNHANDLED_REJECTION', error));
process.on('uncaughtException', (error) => fatal('UNCAUGHT_EXCEPTION', error));

async function launch() {
  const args = ['--no-sandbox', path.join(root, 'desktop', 'main.cjs'), `--user-data-dir=${userData}`,
    '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'];
  const entry = { args, executable: require('electron'), diagnostic: true, hostSandboxEnabled: false };
  report.launches.push(entry);
  const launchEnvironment = { ...process.env, POND_DEV_SERVER_URL: '' };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath: require('electron'), args, chromiumSandbox: false,
    cwd: root, timeout: 30000, env: launchEnvironment });
  child = application.process();
  entry.pid = child.pid;
  entry.runtime = await application.evaluate(({ app, session, net }) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, done) => done({ cancel: true }));
    globalThis.__widgetFixture = { province: '广东省', city: '广州', regionCode: 'GD', latitude: 23.13, longitude: 113.26 };
    globalThis.__widgetGeoCalls = [];
    net.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname !== 'ipapi.co') throw new Error('Widget diagnostic blocks real weather and all other HTTP');
      const fixture = globalThis.__widgetFixture;
      globalThis.__widgetGeoCalls.push({ province: fixture.province });
      return new Response(JSON.stringify({ country_code: 'CN', country_name: 'China', region: fixture.province,
        city: fixture.city, region_code: fixture.regionCode, latitude: fixture.latitude, longitude: fixture.longitude }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    return { isPackaged: app.isPackaged, userData: app.getPath('userData'), version: app.getVersion(),
      noSandbox: app.commandLine.hasSwitch('no-sandbox') };
  });
  assert.equal(entry.runtime.userData.toLowerCase(), userData.toLowerCase());
  assert.equal(entry.runtime.noSandbox, true);
  const page = await application.firstWindow({ timeout: 10000 });
  currentPage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => report.consoleErrors.push(error.message));
  await page.waitForFunction(() => typeof window.pondDesktop?.loadSave === 'function');
  await page.reload(); // Ensure all environment requests use the in-process fixture installed above.
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(async () => Boolean((await window.pondDesktop.loadSave()).snapshot));
  entry.earlyRuntime = entry.runtime;
  entry.runtime = await application.evaluate(({ app, BrowserWindow, Menu }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const prefs = window.webContents.getLastWebPreferences();
    return { isPackaged: app.isPackaged, userData: app.getPath('userData'), version: app.getVersion(),
      noSandbox: app.commandLine.hasSwitch('no-sandbox'), bounds: window.getBounds(), contentBounds: window.getContentBounds(),
      backgroundColor: window.getBackgroundColor(), menuIsNull: Menu.getApplicationMenu() === null, resizable: window.isResizable(),
      preferences: { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration } };
  });
  assert.equal(entry.runtime.menuIsNull, true);
  assert.equal(entry.runtime.resizable, false);
  assert.deepEqual(entry.runtime.preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  await within((async () => {
    while (!await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())) await delay(50);
  })(), 10000, 'Production ready-to-show makes window visible');
  return page;
}
const snapshot = (page) => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function nativeInfo() {
  return application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const bounds = window.getBounds();
    return { bounds, contentBounds: window.getContentBounds(), scaleFactor: screen.getDisplayMatching(bounds).scaleFactor,
      top: window.isAlwaysOnTop(), minimized: window.isMinimized() };
  });
}
async function screenshot(page, name) {
  const filename = path.join(directory, name);
  await page.screenshot({ path: filename, fullPage: false, omitBackground: true });
  report.screenshots.push(filename);
}
async function layout(page, name, width, height) {
  report.lastExpectedLayout = { name, width, height };
  report.lastActualViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  const measured = await page.evaluate(() => {
    const rect = (element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom }; };
    return { viewport: { width: innerWidth, height: innerHeight }, backgrounds: ['html', 'body', '#root'].map((selector) => ({ selector,
      color: getComputedStyle(document.querySelector(selector)).backgroundColor })),
      dragRegion: getComputedStyle(document.querySelector('.widget-toolbar')).getPropertyValue('-webkit-app-region'),
      buttons: [...document.querySelectorAll('[aria-label="窗口操作"] button, [aria-label="功能面板"] button')].map((button) => ({
        label: button.getAttribute('aria-label'), appRegion: getComputedStyle(button).getPropertyValue('-webkit-app-region'), ...rect(button) })),
      panel: document.querySelector('#fishing-panel') ? rect(document.querySelector('#fishing-panel')) : null,
      panelClose: document.querySelector('[aria-label="收起面板"]') ? rect(document.querySelector('[aria-label="收起面板"]')) : null,
      overflow: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
  });
  report.layouts.push({ name, ...measured });
  for (const element of measured.backgrounds) assert.ok(/rgba\(0, 0, 0, 0\)|transparent/.test(element.color), `${name}: ${element.selector} background ${element.color}`);
  assert.equal(measured.dragRegion, 'drag');
  assert.equal(measured.buttons.length, 9);
  for (const button of measured.buttons.filter((button) => /挂件|置顶|最小化|退出/.test(button.label))) assert.equal(button.appRegion, 'no-drag', button.label);
  for (const box of [...measured.buttons, measured.panel, measured.panelClose].filter(Boolean)) {
    assert.ok(box.width > 0 && box.height > 0 && box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1,
      `${name}: outside viewport ${JSON.stringify(box)}`);
  }
  assert.ok(measured.overflow.width <= width && measured.overflow.height <= height, `${name}: document overflow`);
  const actual = await nativeInfo();
  // Layout has already been checked exactly above. Windows may return an
  // integer outer envelope one DIP larger at fractional display scaling.
  const nativeEnvelopeTolerance = Number.isInteger(actual.scaleFactor) ? 0 : 1;
  report.layouts[report.layouts.length - 1].native = { ...actual, nativeEnvelopeTolerance };
  assert.ok(Math.abs(actual.bounds.width - width) <= nativeEnvelopeTolerance, `${name}: native outer width`);
  assert.ok(Math.abs(actual.bounds.height - height) <= nativeEnvelopeTolerance, `${name}: native outer height`);
}
async function panels(page, width, height) {
  for (const [button, title] of [['鱼篓', '鱼篓'], ['图鉴', '图鉴'], ['渔具店', '渔具店'], ['漫游', '漫游'], ['设置', '设置与存档']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('region', { name: title, exact: true }).waitFor();
    await page.getByRole('region', { name: title, exact: true }).evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))));
    await layout(page, `${width}x${height}:${title}`, width, height);
    if (button === '设置') await screenshot(page, `settings-${width}.png`);
    await page.getByRole('button', { name: '收起面板', exact: true }).click();
  }
}
function unchangedAssets(before, after) {
  for (const key of ['coins', 'homeRegion', 'currentRegion', 'bucket', 'codex', 'travel', 'rodLevel', 'baitCount', 'baitLeft', 'pityCounter']) assert.deepEqual(after[key], before[key], `IP changed ${key}`);
  for (const region of before.unlockedRegions) assert.ok(after.unlockedRegions.includes(region), `IP removed prior unlock ${region}`);
}
async function fixture(province) {
  await application.evaluate((_electron, value) => { globalThis.__widgetFixture = value; }, province === '北京' ?
    { province: '北京市', city: '北京', regionCode: 'BJ', latitude: 39.90, longitude: 116.40 } :
    { province: '广东省', city: '广州', regionCode: 'GD', latitude: 23.13, longitude: 113.26 });
}
async function waitRegion(page, region) {
  await page.waitForFunction(async (value) => { const saved = (await window.pondDesktop.loadSave()).snapshot; return saved.realRegion === value && saved.unlockedRegions.includes(value); }, region);
}
async function clickExit(page) {
  const app = application;
  const process = child;
  const pids = await app.evaluate(({ app }) => app.getAppMetrics().map(({ pid }) => pid));
  const exit = new Promise((resolve) => { if (process.exitCode !== null) resolve(process.exitCode); else process.once('exit', resolve); });
  await page.getByRole('button', { name: '退出水塘时钟', exact: true }).click().catch((error) => { if (!/closed/i.test(error.message)) throw error; });
  assert.equal(await within(exit, 10000, 'X button normal quit'), 0);
  const deadline = Date.now() + 5000;
  let remaining;
  do {
    remaining = pids.filter((pid) => { try { global.process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } });
    if (!remaining.length) break;
    await delay(100);
  } while (Date.now() < deadline);
  assert.deepEqual(remaining, []);
  application = null;
  child = null;
  await within(app.close(), 5000, 'Playwright transport close');
}

async function run() {
  assert.equal(process.env.POND_SMOKE_NO_SANDBOX, '1', 'This host diagnostic requires explicit POND_SMOKE_NO_SANDBOX=1');
  await fs.mkdir(resultsRoot, { recursive: true });
  directory = await fs.mkdtemp(path.join(resultsRoot, 'widget-smoke-'));
  userData = path.join(directory, 'profile');
  report.directory = directory;
  report.profile = userData;
  report.sourceHashes = {};
  const index = await fs.readFile(path.join(root, 'build-desktop/index.html'), 'utf8');
  for (const relative of ['desktop/main.cjs', 'desktop/windowState.cjs', 'src/services/environment.js', 'build-desktop/index.html',
    ...[...index.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((match) => `build-desktop/${match[1]}`)]) {
    report.sourceHashes[relative] = createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');
  }
  let page = await launch();
  await waitRegion(page, 'lingnan');
  const initial = await snapshot(page);
  await layout(page, 'compact-main', 420, 350);
  await screenshot(page, 'compact-main.png');
  check('W01', '420x350 transparent document, draggable toolbar, non-draggable window controls, no document overflow');
  await panels(page, 420, 350);
  check('W02', 'All five compact panels, panel-close controls and window buttons remain inside the viewport');

  await page.getByRole('button', { name: '展开挂件', exact: true }).click();
  await page.getByRole('button', { name: '缩小挂件', exact: true }).waitFor();
  await layout(page, 'comfortable-main', 640, 490);
  await screenshot(page, 'comfortable-main.png');
  await panels(page, 640, 490);
  check('W03', 'Real window expands to 640x490 and all five panels remain contained');
  await page.getByRole('button', { name: '缩小挂件', exact: true }).click();
  await layout(page, 'compact-restored', 420, 350);
  check('W04', 'Toolbar shrinks the real window back to 420x350');

  await page.getByRole('button', { name: '取消窗口置顶', exact: true }).click();
  await page.waitForFunction(async () => !(await window.pondDesktop.loadSave()).snapshot.settings.alwaysOnTop && !(await window.pondDesktop.getAppInfo()).alwaysOnTop);
  assert.equal((await nativeInfo()).top, false);
  await page.getByRole('button', { name: '窗口置顶', exact: true }).click();
  await page.waitForFunction(async () => (await window.pondDesktop.loadSave()).snapshot.settings.alwaysOnTop && (await window.pondDesktop.getAppInfo()).alwaysOnTop);
  assert.equal((await nativeInfo()).top, true);
  check('W05', 'Pin toolbar button durably saves both directions and immediately changes the native always-on-top state');

  await page.getByRole('button', { name: '最小化水塘时钟', exact: true }).click();
  const minimizeDeadline = Date.now() + 3000;
  while (!(await nativeInfo()).minimized && Date.now() < minimizeDeadline) await delay(50);
  assert.equal((await nativeInfo()).minimized, true);
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); window.focus(); });
  assert.equal((await nativeInfo()).minimized, false);
  check('W06', 'Minimize button minimizes the native window, which restores through native APIs (taskbar click not tested)');

  await page.clock.install({ time: Date.now() });
  await page.reload(); // Recreate production intervals under the controlled clock before advancing it.
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  await waitRegion(page, 'lingnan');
  await fixture('北京');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  unchangedAssets(initial, await snapshot(page));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitRegion(page, 'huanghe');
  unchangedAssets(initial, await snapshot(page));
  check('W07', 'Simulated offline/online events automatically replace Guangdong IP with Beijing and freely retain both unlocks without asset/home/game-location changes');
  await fixture('广东');
  await page.clock.runFor(31000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitRegion(page, 'lingnan');
  unchangedAssets(initial, await snapshot(page));
  check('W08', 'Focus after automatic throttle rechecks IP through production event bindings (clock advanced, mocked response)');
  await fixture('北京');
  await page.clock.runFor(120001);
  await waitRegion(page, 'huanghe');
  unchangedAssets(initial, await snapshot(page));
  report.simulatedGeoRequests = await application.evaluate(() => globalThis.__widgetGeoCalls);
  check('W09', 'Production two-minute timer rechecks IP without a button click (clock advanced, mocked response)');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('region', { name: '设置与存档', exact: true });
  await settings.locator('label').filter({ hasText: '保持在其他窗口前面' }).locator('input').click();
  await page.waitForFunction(async () => !(await window.pondDesktop.loadSave()).snapshot.settings.alwaysOnTop && !(await window.pondDesktop.getAppInfo()).alwaysOnTop);
  await settings.locator('label').filter({ hasText: '联网识别所在地与天气' }).locator('input').click();
  await page.waitForFunction(async () => !(await window.pondDesktop.loadSave()).snapshot.settings.onlineEnhancements);
  await screenshot(page, 'settings-saved.png');
  await settings.getByRole('button', { name: '展开显示', exact: true }).click();
  await layout(page, 'comfortable-before-exit', 640, 490);
  const position = await application.evaluate(({ BrowserWindow, screen }) => {
    const work = screen.getPrimaryDisplay().workArea;
    const window = BrowserWindow.getAllWindows()[0];
    const x = work.x + Math.min(40, Math.max(0, work.width - 640));
    const y = work.y + Math.min(60, Math.max(0, work.height - 490));
    window.setPosition(x, y);
    return { x, y };
  });
  const saved = await snapshot(page);
  await clickExit(page);
  const placement = JSON.parse(await fs.readFile(path.join(userData, 'window-state.json'), 'utf8'));
  assert.deepEqual(placement, { version: 1, sizePreset: 'comfortable', ...position });
  check('W10', 'X exits normally and flushes the chosen window preset and programmatically changed position');

  page = await launch();
  await layout(page, 'restarted-comfortable', 640, 490);
  const restored = await nativeInfo();
  assert.equal(restored.bounds.x, position.x);
  assert.equal(restored.bounds.y, position.y);
  assert.equal(restored.top, false);
  assert.deepEqual(await snapshot(page), saved);
  assert.equal((await page.evaluate(() => window.pondDesktop.getAppInfo())).sizePreset, 'comfortable');
  await screenshot(page, 'restarted-comfortable.png');
  await clickExit(page);
  check('W11', 'Restart restores window position/preset and saved pin/offline settings and assets; X exits again');
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
}
watchdog = setTimeout(() => fatal('TEST_TIMEOUT', new Error('Widget diagnostic exceeded 180 seconds')), 180000);
run().catch(async (error) => {
  report.passed = false;
  report.error ||= errorText(error);
  process.exitCode = 1;
  if (application && currentPage && !currentPage.isClosed()) {
    try {
      report.failureWindow = await within(nativeInfo(), 2000, 'Failure native measurement');
      report.failureViewport = await within(currentPage.evaluate(() => ({ width: innerWidth, height: innerHeight,
        documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight })), 2000, 'Failure viewport measurement');
      await within(screenshot(currentPage, 'failure.png'), 3000, 'Failure screenshot');
    } catch (captureError) { report.failureCaptureError = errorText(captureError); }
  }
})
  .then(() => finalize()).then(() => process.exit(report.passed ? 0 : 1)).catch((error) => fatal('FINALIZATION_FAILED', error));
