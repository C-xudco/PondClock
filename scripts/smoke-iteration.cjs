// Independent 1.2.0 production UI acceptance. No DEV query or actual HTTP.
// POND_SMOKE_NO_SANDBOX=1 node scripts/smoke-iteration.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright-core');
const { createNewGame } = require('../src/domain/gameState.js');
const { validateSave } = require('../src/domain/saveSchema.js');
const { quoteBucketSale, quoteSaleFish } = require('../src/domain/market.js');
const { catchOutcome, watchRepairOutcome } = require('../src/domain/loot.js');
const { REGIONS } = require('../src/lib/gameConfig.js');
const { SCENE_SITES } = require('../src/data/sceneSites.js');
const { geometryForRegion, isWaterPoint } = require('../src/components/pond/scene.js');
const { createSaveRepository } = require('../desktop/saveRepository.cjs');
const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const report = { startedAt: new Date().toISOString(), passed: false, version: '1.2.0',
  mode: 'Production bundle + real desktop/main.cjs in developer Electron, explicit --no-sandbox diagnostic only. All HTTP is blocked/mocked. Audio constructor is a silent event spy, not a listening test.',
  checks: [], launches: [], screenshots: [], frames: [], layouts: [], pageErrors: [], resourceFailures: [],
  pending: ['Ordinary final EXE with normal sandbox', 'Actual network/VPN and real weather', 'Human listening and visual quality judgment', 'Native dragging and taskbar restore', 'DPR 1/2 and long-duration performance'] };
let directory, application, child, page, watchdog, finalizing;
const check = (id, description) => { report.checks.push({ id, description, passed: true }); console.log(id); };
const errorText = (e) => String(e?.stack || e).slice(-16000);

async function within(operation, ms, name) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name}: timeout ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function writeReport() {
  report.finishedAt = new Date().toISOString();
  const target = path.join(directory || resultsRoot, 'iteration-smoke.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2));
  writeFileSync(path.join(resultsRoot, 'iteration-smoke-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, error: report.error }));
}
async function closeApp(normal = true) {
  if (!application) return;
  const ownApp = application, ownChild = child;
  try {
    if (normal && page && !page.isClosed()) {
      const exit = new Promise((resolve) => ownChild.exitCode !== null ? resolve(ownChild.exitCode) : ownChild.once('exit', resolve));
      await page.getByRole('button', { name: '退出水塘时钟', exact: true }).click().catch((e) => { if (!/closed/i.test(e.message)) throw e; });
      assert.equal(await within(exit, 10000, 'Native X exit'), 0);
    }
    await within(ownApp.close(), 8000, 'App transport cleanup');
  } finally {
    if (ownChild && ownChild.exitCode === null) { ownChild.kill(); report.forcedCleanup = true; }
    application = null; child = null; page = null;
  }
}
async function finish() {
  if (finalizing) return finalizing;
  finalizing = (async () => {
    clearTimeout(watchdog);
    try { await closeApp(false); } catch (e) { report.cleanupError = errorText(e); report.passed = false; }
    writeReport();
  })();
  return finalizing;
}
let fatalStarted = false;
function fatal(error) {
  if (fatalStarted) return;
  fatalStarted = true; report.error ||= errorText(error); report.passed = false;
  void finish().finally(() => process.exit(1));
}
process.on('unhandledRejection', fatal); process.on('uncaughtException', fatal);

async function seedProfile(label, regionId, inventory = false) {
  const profile = path.join(directory, label);
  const now = Date.now(), created = now - 9 * 86400000;
  let state = createNewGame('jiangnan', created, { randomSeed: 12345 });
  state = { ...state, lastEffectiveNowMs: now, currentRegion: regionId, realRegion: 'lingnan',
    unlockedRegions: [...new Set(['jiangnan', 'lingnan', regionId])], coins: 30000 };
  if (inventory) {
    const fish = (sequence, captured) => ({ uid: `fixture-fish-${sequence}`, speciesId: 'baitiao', quality: 'common', name: '白条',
      length: 12, weight: 0.07, caughtAtMs: captured, regionId: 'jiangnan', originRegionId: 'jiangnan', catchSequence: sequence });
    const item = (sequence, type) => ({ uid: `fixture-item-${sequence}`, type, caughtAtMs: now - 1000,
      originRegionId: 'jiangnan', catchSequence: sequence, status: 'found', repairSeed: type === 'waterlogged_watch' ? 12 : null,
      repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null });
    state = { ...state, catchSequence: 6, bucket: [fish(1, now - 3600000), fish(2, now - 8 * 86400000)],
      items: [item(3, 'old_shoe'), item(4, 'waterlogged_watch'), item(5, 'influencer_manual'), item(6, 'influencer_manual')] };
    // Freeze a seed whose next four successful catches are actual fish.
    for (let seed = 1; seed < 1000; seed++) {
      let candidate = { ...state, randomSeed: seed }, allFish = true;
      for (let count = 0; count < 4; count++) {
        if (catchOutcome(candidate).kind !== 'fish') { allFish = false; break; }
        candidate = { ...candidate, catchSequence: candidate.catchSequence + 1 };
      }
      if (allFish) { state.randomSeed = seed; break; }
    }
  }
  state = validateSave(state);
  await createSaveRepository({ directory: path.join(profile, 'saves'), validate: validateSave }).save(state);
  return profile;
}
async function launch(profile, allClear = false, waitOnline = true) {
  const args = ['--no-sandbox', path.join(root, 'desktop/main.cjs'), `--user-data-dir=${profile}`,
    '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'];
  if (['1', '2'].includes(process.env.POND_ACCEPTANCE_DPR)) args.push(`--force-device-scale-factor=${process.env.POND_ACCEPTANCE_DPR}`);
  const env = { ...process.env, POND_DEV_SERVER_URL: '' }; delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath: require('electron'), args, chromiumSandbox: false, cwd: root, env, timeout: 30000 });
  child = application.process();
  const entry = { profile, pid: child.pid, allClear, args }; report.launches.push(entry);
  entry.runtime = await application.evaluate(({ app, BrowserWindow, net, session }, fixture) => {
    const block = (_details, done) => done({ cancel: true });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, block);
    globalThis.__iterationRequests = [];
    const fetchFixture = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.open-meteo.com') {
        const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
        const site = fixture.sites.find((value) => Math.abs(value.latitude - latitude) < 0.000001 && Math.abs(value.longitude - longitude) < 0.000001);
        const region = site?.regionId || 'header';
        const code = fixture.allClear ? 0 : region === 'dongbei' ? 71 : region === 'jiangnan' ? 61 : 0;
        globalThis.__iterationRequests.push({ kind: 'weather', region, at: Date.now() });
        return Response.json({ latitude, longitude,
          current_units: { temperature_2m: '°C', cloud_cover: '%', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm' },
          current: { time: Math.floor(Date.now() / 1000), interval: 900, temperature_2m: code === 71 ? -7 : code === 61 ? 19 : 20,
            weather_code: code, is_day: 1, cloud_cover: code ? 100 : 0, precipitation: code ? 0.1 : 0,
            rain: code === 61 ? 0.1 : 0, showers: 0, snowfall: code === 71 ? 0.025 : 0 } });
      }
      if (!['ipapi.co', 'ipwho.is'].includes(url.hostname)) throw new Error('Every unmocked endpoint is blocked');
      globalThis.__iterationRequests.push({ kind: 'geo', provider: url.hostname, at: Date.now() });
      return Response.json({ success: true, country_code: 'CN', country_name: 'China', region: '广东省', city: '广州',
        region_code: 'GD', latitude: 23.13, longitude: 113.26 });
    };
    net.fetch = fetchFixture;
    const locationSession = session.fromPartition('pondclock-location', { cache: false });
    locationSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, block);
    locationSession.fetch = fetchFixture;
    const window = BrowserWindow.getAllWindows()[0];
    return { version: app.getVersion(), userData: app.getPath('userData'), noSandbox: app.commandLine.hasSwitch('no-sandbox'),
      isPackaged: app.isPackaged, sandboxPreference: window?.webContents.getLastWebPreferences().sandbox };
  }, { allClear, sites: Object.values(SCENE_SITES).map((site) => ({ regionId: site.regionId, ...site.weatherLocation })) });
  // app.getVersion() is the developer Electron host version when launching a
  // main.cjs path; the rendered settings/package version is checked separately.
  assert.equal(require('../package.json').version, '1.2.0'); assert.equal(entry.runtime.noSandbox, true);
  assert.equal(entry.runtime.userData.toLowerCase(), profile.toLowerCase());
  page = await application.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('requestfailed', (request) => { if (request.url().startsWith('file:')) report.resourceFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.addInitScript(() => {
    globalThis.__audioEvents = [];
    globalThis.Audio = class {
      constructor(url) { this.src = url; this.volume = 1; this.currentTime = 0; }
      async play() { globalThis.__audioEvents.push({ volume: this.volume, at: Date.now(), src: this.src }); }
      pause() {}
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // firstWindow precedes loadFile's completion. Reloading during that initial
  // navigation aborts the startup promise (ERR_ABORTED), which is a harness
  // race rather than a renderer failure. Wait for the actual initial load.
  await page.waitForLoadState('load', { timeout: 30000 });
  await page.reload({ timeout: 30000 });
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  if (waitOnline) {
    await page.waitForFunction(() => document.querySelector('.ink-pond')?.dataset.weatherSource === 'online');
    await page.waitForFunction(() => document.querySelector('.weather-detail')?.textContent.includes('实况'));
  }
  return page;
}
const saved = () => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function screenshot(name) {
  const target = path.join(directory, name); await page.screenshot({ path: target, omitBackground: true }); report.screenshots.push(target);
}
async function referenceBackdrops(name) {
  if (process.env.POND_ACCEPTANCE_BACKDROPS !== '1') return;
  for (const [label, color] of [['light', '#f5f5f0'], ['dark', '#182320']]) {
    await page.evaluate((value) => { document.documentElement.style.backgroundColor = value; }, color);
    await screenshot(`${name}-${label}.png`);
  }
  await page.evaluate(() => { document.documentElement.style.backgroundColor = ''; });
}
async function verifyLocalMedia() {
  const filename = (await fs.readdir(path.join(root, 'build-desktop/assets'))).find((name) => /^bite-plop-.*\.wav$/.test(name));
  assert.ok(filename, 'Packaged bite sound missing');
  await openPanel('鱼篓'); await closePanel();
  // Use an actual HTMLMediaElement, bypassing the silent Audio event spy.
  // Muted playback verifies decoding and completion without claiming listening.
  report.realMedia = await page.evaluate((name) => new Promise((resolve, reject) => {
    const audio = document.createElement('audio'); audio.volume = 0;
    audio.src = new URL(`./assets/${name}`, location.href).href;
    let timer;
    const finish = (error) => {
      clearTimeout(timer); audio.onended = null; audio.onerror = null;
      const result = { duration: audio.duration, source: audio.currentSrc, ended: audio.ended, mutedByVolume: audio.volume === 0 };
      audio.pause(); if (error) reject(error); else resolve(result);
    };
    audio.onended = () => finish(); audio.onerror = () => finish(new Error('Native media decoding failed'));
    timer = setTimeout(() => finish(new Error('Native media playback timed out')), 5000);
    audio.play().catch(finish);
  }), filename);
  assert.ok(Math.abs(report.realMedia.duration - 0.32) < 0.01);
  assert.equal(report.realMedia.ended, true);
}
async function layout(name, width, height) {
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  const value = await page.evaluate(() => {
    const rect = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      boxes: [...document.querySelectorAll('.widget-toolbar, .clock-panel, .ink-pond, .action-dock, .widget-footer, #fishing-panel, [aria-label="收起面板"]')].map(rect),
      paper: getComputedStyle(document.querySelector('.clock-panel')).backgroundColor,
      background: getComputedStyle(document.body).backgroundColor };
  });
  assert.equal(value.scrollWidth, width); assert.equal(value.scrollHeight, height);
  for (const box of value.boxes) assert.ok(box.width > 0 && box.height > 0 && box.x >= -0.5 && box.y >= -0.5 && box.right <= width + 0.5 && box.bottom <= height + 0.5, `${name} ${JSON.stringify(box)}`);
  assert.equal(value.background, 'rgba(0, 0, 0, 0)');
  report.layouts.push({ name, ...value });
}
async function size(comfortable) {
  const name = comfortable ? '展开挂件' : '缩小挂件';
  const button = page.getByRole('button', { name, exact: true });
  if (await button.count()) await button.click();
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height,
    comfortable ? { width: 640, height: 490 } : { width: 420, height: 350 });
}
async function openPanel(label) { await page.getByRole('button', { name: label, exact: true }).click(); }
async function closePanel() { if (await page.getByRole('button', { name: '收起面板', exact: true }).count()) await page.getByRole('button', { name: '收起面板', exact: true }).click(); }
async function stableAssets() {
  const s = await saved();
  return Object.fromEntries(['coins', 'bucket', 'items', 'codex', 'homeRegion', 'currentRegion', 'unlockedRegions', 'travel', 'catchSequence', 'saleBuff'].map((key) => [key, s[key]]));
}
async function contacts(kind) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const frames = [];
  for (let index = 0; index < 8; index++) {
    await delay(200);
    const frame = await page.locator('[data-contact-kind]').evaluateAll((elements) => elements.map((e) => ({
      id: e.dataset.contactId, kind: e.dataset.contactKind, x: Number(e.dataset.contactX), y: Number(e.dataset.contactY),
      ageMs: Number(e.dataset.contactAge), hitTimeMs: Number(e.dataset.hitTime) })));
    for (const point of frame) { assert.equal(point.kind, kind); assert.ok(isWaterPoint(geometryForRegion(kind === 'snow-dissolve' ? 'dongbei' : 'jiangnan'), point.x, point.y)); }
    frames.push(frame); await screenshot(`${kind}-frame-${index}.png`);
  }
  assert.ok(frames.some((frame) => frame.length));
  const first = frames.flat().find((point) => frames.flat().some((other) => other.id === point.id && other.ageMs > point.ageMs));
  assert.ok(first, `${kind}: same particle contact advances in consecutive actual frames`);
  report.frames.push({ kind, frames });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
async function waitRevision(previous) { await page.waitForFunction(async (revision) => (await window.pondDesktop.loadSave()).snapshot.revision > revision, previous); }
async function advance(ms) { await page.clock.runFor(ms); await delay(30); }
async function catchNext() {
  const before = await saved();
  for (let seconds = 0; seconds < 150 && !await page.getByRole('button', { name: '点击收竿', exact: true }).count(); seconds++) await advance(1000);
  await page.getByRole('button', { name: '点击收竿', exact: true }).waitFor();
  const soundCount = await page.evaluate(() => globalThis.__audioEvents.filter((event) => event.volume > 0).length);
  await advance(1000);
  assert.equal(await page.evaluate(() => globalThis.__audioEvents.filter((event) => event.volume > 0).length), soundCount);
  await page.getByRole('button', { name: '点击收竿', exact: true }).click(); await waitRevision(before.revision);
  const after = await saved(); assert.equal(after.catchSequence, before.catchSequence + 1);
  assert.ok(after.bucket.some((fish) => fish.catchSequence === after.catchSequence));
  return soundCount;
}

async function run() {
  assert.equal(process.env.POND_SMOKE_NO_SANDBOX, '1');
  await fs.mkdir(resultsRoot, { recursive: true }); directory = await fs.mkdtemp(path.join(resultsRoot, 'iteration-smoke-'));
  report.directory = directory;
  report.bundleHashes = {};
  const html = await fs.readFile(path.join(root, 'build-desktop/index.html'), 'utf8');
  for (const relative of ['build-desktop/index.html', ...[...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => `build-desktop/${m[1]}`)]) report.bundleHashes[relative] = createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');
  if (process.env.POND_ACCEPTANCE_ART_ONLY !== '1') {
  const gameplayProfile = await seedProfile('gameplay-profile', 'dongbei', true);
  await launch(gameplayProfile);
  assert.equal(await page.locator('.ink-pond').getAttribute('data-scene-region'), 'dongbei');
  assert.equal(await page.locator('.ink-pond').getAttribute('data-precipitation'), 'snow');
  assert.equal(await page.locator('.ink-pond').getAttribute('data-sky'), 'overcast');
  assert.equal(await page.locator('[data-celestial="sun"], [data-celestial="reflection"]').count(), 0);
  assert.match(await page.locator('.weather-display').innerText(), /20°.*晴/s);
  assert.match(await page.locator('.pond-label').first().innerText(), /小雪.*-7°/s);
  await screenshot('dual-weather-snow.png'); await contacts('snow-dissolve');
  assert.ok(Number(await page.locator('[data-snow-cover]').getAttribute('data-snow-cover')) > 0);
  check('I01', 'Production header Guangzhou sunny20 and game Heilongjiang overcast snow-7 are separate; no sun/reflection and supported character snow appears');

  const beforeViewer = await stableAssets();
  await openPanel('设置');
  for (const region of REGIONS) {
    await page.getByRole('combobox', { name: '选择查看水域' }).selectOption(region.id);
    assert.deepEqual(await stableAssets(), beforeViewer);
    assert.equal(await page.locator('.ink-pond').getAttribute('data-scene-region'), 'dongbei');
    assert.match(await page.locator('.weather-display').innerText(), /20°.*晴/s);
    await page.getByRole('region', { name: '各水域天气查看', exact: true }).getByText(SCENE_SITES[region.id].address, { exact: true }).waitFor();
  }
  await screenshot('viewer-locked-region.png'); await closePanel();
  check('I02', 'Selecting all12 weather viewer regions, including locked ones, displays the correct address without spending, unlocking, moving or changing header/scene');

  for (const comfortable of [false, true]) {
    await size(comfortable); const width = comfortable ? 640 : 420, height = comfortable ? 490 : 350;
    await layout(`main-${width}`, width, height);
    for (const label of ['鱼篓', '图鉴', '渔具店', '漫游', '设置']) {
      await openPanel(label); await layout(`${label}-${width}`, width, height);
      await screenshot(`panel-${label}-${width}.png`); await closePanel();
    }
  }
  check('I03', 'Both exact client sizes, all five real panels, internal scrolling and window/footer bounds fit with transparent document');

  await page.clock.install({ time: Date.now() }); await page.reload(); await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  await openPanel('鱼篓');
  let before = await saved(); const expectedRepair = watchRepairOutcome(before.items.find((item) => item.type === 'waterlogged_watch'));
  await page.getByRole('button', { name: '试修一次 · ¥500', exact: true }).click(); await waitRevision(before.revision);
  let current = await saved(); assert.equal(current.coins, before.coins - 500);
  const repaired = current.items.find((item) => item.type === 'waterlogged_watch');
  assert.equal(repaired.salePrice, expectedRepair.salePrice); assert.equal(repaired.repairOutcome, expectedRepair.kind);
  assert.equal(await page.getByRole('button', { name: '试修一次 · ¥500', exact: true }).count(), 0);
  await page.getByRole('button', { name: '使用秘籍 · 前3条 +50%', exact: true }).first().click(); await waitRevision(current.revision);
  current = await saved(); assert.equal(current.saleBuff.remaining, 3); assert.equal(current.saleBuff.activationCatchSequence, 6);
  assert.equal(current.items.filter((item) => item.type === 'influencer_manual').length, 1);
  assert.equal(await page.getByRole('button', { name: '当前状态用尽后可使用', exact: true }).isDisabled(), true);
  for (let index = 0; index < 2; index++) {
    before = await saved(); const quote = quoteSaleFish(before.bucket[0], before, before.lastEffectiveNowMs);
    if (index === 1) assert.equal(quote.price, 1);
    await page.locator('.ink-list-row').first().getByRole('button').click(); await waitRevision(before.revision);
    current = await saved(); assert.equal(current.coins, before.coins + quote.price); assert.equal(current.saleBuff.remaining, 3);
  }
  await screenshot('inventory-repair-manual.png'); await closePanel();
  check('I04', 'Real inventory repair deducts500 once, durable result matches seeded identity; manual consumes once, preserves spare; old/expired fish do not consume charges');

  const soundBefore = await page.evaluate(() => globalThis.__audioEvents.filter((event) => event.volume > 0).length);
  assert.equal(await catchNext(), soundBefore + 1);
  await openPanel('设置'); before = await saved();
  await page.getByRole('checkbox', { name: '咬钩提示音', exact: true }).click(); await waitRevision(before.revision); await closePanel();
  const mutedCount = await page.evaluate(() => globalThis.__audioEvents.filter((event) => event.volume > 0).length);
  assert.equal(await catchNext(), mutedCount);
  await openPanel('设置'); before = await saved();
  await page.getByRole('checkbox', { name: '咬钩提示音', exact: true }).click(); await waitRevision(before.revision); await closePanel();
  await catchNext(); await catchNext();
  await openPanel('鱼篓'); before = await saved();
  const bulkQuote = quoteBucketSale(before, await page.evaluate(() => Date.now()));
  assert.equal(bulkQuote.buffUsed, 3); assert.equal(bulkQuote.quotes.filter((quote) => quote.buffApplied).length, 3);
  assert.equal(await page.getByRole('button', { name: `全部卖出 · ¥${bulkQuote.price}`, exact: true }).count(), 1);
  await page.getByRole('button', { name: `全部卖出 · ¥${bulkQuote.price}`, exact: true }).click(); await waitRevision(before.revision);
  current = await saved(); assert.equal(current.coins, before.coins + bulkQuote.price); assert.equal(current.saleBuff.remaining, 0); assert.equal(current.bucket.length, 0);
  await closePanel();
  check('I05', 'Production fishing handles four actual catches, one sound per bite and mute persistence; batch quote and saved three-charge bonus agree, fourth gets no bonus');

  await openPanel('漫游'); before = await saved();
  const targetName = REGIONS.find((region) => region.id === 'jiangnan').name;
  await page.getByText(targetName, { exact: true }).locator('xpath=../../..').getByRole('button', { name: /机票/ }).click();
  await waitRevision(before.revision); current = await saved(); assert.ok(current.travel);
  assert.equal(await page.locator('.ink-pond').getAttribute('data-scene-region'), 'dongbei');
  await closePanel(); await advance(Math.max(0, current.travel.arriveAtMs - await page.evaluate(() => Date.now())) + 1001);
  await page.waitForFunction(async () => { const s = (await window.pondDesktop.loadSave()).snapshot; return s.currentRegion === 'jiangnan' && s.arrivalConsumedSequence === 1; });
  await page.waitForFunction(() => document.querySelector('.mc-bubble'));
  assert.equal(await page.locator('.mc-bubble').count(), 1); report.arrivalText = await page.locator('.mc-bubble').innerText();
  assert.match(await page.locator('.weather-display').innerText(), /20°.*晴/s);
  await screenshot('arrival-qinhuai.png');
  await page.reload(); await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  assert.equal(await page.locator('.mc-bubble').count(), 0);
  assert.equal(await page.locator('.ink-pond').getAttribute('data-precipitation'), 'rain');
  assert.equal(await page.locator('[data-rain-gear]').getAttribute('data-rain-gear'), 'true');
  check('I06', 'Paid travel preserves origin while flying, commits actual destination and one arrival bubble, header stays real location, reload does not replay');

  // Real animation frames use real browser clock after a reload into a fresh page.
  await page.clock.resume(); await contacts('rain-impact');
  check('I07', 'Rain and snow have separate same-particle contact timelines in real production SVG frames, all sampled contacts inside their shared water geometry');

  await openPanel('设置'); before = await saved();
  await page.getByRole('checkbox', { name: '后台鱼讯声音', exact: true }).click(); await waitRevision(before.revision);
  before = await saved();
  await page.locator('label').filter({ hasText: '联网识别所在地与天气' }).locator('input').click(); await waitRevision(before.revision);
  const final = await saved(); report.gameplayFinal = { coins: final.coins, catchSequence: final.catchSequence, settings: final.settings, arrivalConsumedSequence: final.arrivalConsumedSequence, repair: final.items.find((item) => item.type === 'waterlogged_watch') };
  await closeApp(); await launch(gameplayProfile, false, false);
  assert.deepEqual(await saved(), final);
  assert.equal(await page.locator('.mc-bubble').count(), 0);
  await screenshot('offline-restart.png'); await closeApp();
  check('I08', 'Normal X exit and offline restart preserve complete state including fixed repair, unused manual, consumed buff, arrival watermark and audio switches');

  if (process.env.POND_ACCEPTANCE_FUNCTIONAL_ONLY === '1') {
    report.artStatus = 'Not run in this functional-only pass; renderer is revising final artwork.';
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceFailures, []);
    report.passed = true; return;
  }
  }
  const requestedRegions = process.env.POND_ACCEPTANCE_REGION_IDS?.split(',');
  const artRegions = requestedRegions ? REGIONS.filter((region) => requestedRegions.includes(region.id)) : REGIONS;
  assert.ok(artRegions.length > 0, 'No valid scene selected');
  for (const region of artRegions) {
    const profile = await seedProfile(`art-${region.id}`, region.id);
    await launch(profile, true);
    if (!report.realMedia) await verifyLocalMedia();
    assert.equal(await page.locator('.ink-pond').getAttribute('data-scene-region'), region.id);
    await page.locator('svg image').evaluateAll((elements) => Promise.all(elements.map((element) => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => image.naturalWidth ? resolve(true) : reject(new Error('Empty image'));
      image.onerror = () => reject(new Error(`Missing ${element.getAttribute('href')}`)); image.src = element.getAttribute('href');
    }))));
    await size(false); await layout(`${region.id}-420`, 420, 350); await screenshot(`${region.id}-420.png`); await referenceBackdrops(`${region.id}-420`);
    await size(true); await layout(`${region.id}-640`, 640, 490); await screenshot(`${region.id}-640.png`); await referenceBackdrops(`${region.id}-640`);
    await closeApp();
  }
  check('I09', `${artRegions.length} production scene IDs have their own loaded local art;${artRegions.length * 2} actual screenshots and exact client layouts at420x350/640x490 under common clear-weather fixture`);
  check('I10', 'Actual native HTMLMediaElement decodes and completes the local320ms WAV at volume0; no listening or speaker-output claim');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceFailures, []);
  report.passed = true;
}
watchdog = setTimeout(() => fatal(new Error('Independent iteration acceptance exceeded12 minutes')), 12 * 60 * 1000);
run().catch(async (error) => {
  report.error = errorText(error); report.passed = false;
  if (page && !page.isClosed()) {
    try { await screenshot('failure.png'); report.failureText = await page.locator('body').innerText(); } catch { /* Preserve the primary failure. */ }
  }
}).then(() => finish()).then(() => process.exit(report.passed ? 0 : 1));
