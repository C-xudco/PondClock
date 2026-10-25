// Independent 1.3 production UI acceptance; only isolated profiles and fixture HTTP.
// POND_SMOKE_NO_SANDBOX=1 node scripts/smoke-style-packs.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright-core');
const { createNewGame } = require('../src/domain/gameState.js');
const { validateSave } = require('../src/domain/saveSchema.js');
const { APPEARANCE_PRODUCTS, DEFAULT_APPEARANCE } = require('../src/config/appearance.js');
const { REGIONS } = require('../src/lib/gameConfig.js');
const { SCENE_SITES } = require('../src/data/sceneSites.js');
const { createSaveRepository } = require('../desktop/saveRepository.cjs');
const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const report = { version: '1.3.0', startedAt: new Date().toISOString(), passed: false,
  mode: 'Actual production bundle and desktop/main.cjs in developer Electron; explicit no-sandbox diagnostic. HTTP blocked/replaced by fixture. Isolated saves, not user data.',
  checks: [], screenshots: [], layouts: [], launches: [], pageErrors: [], resourceFailures: [],
  pending: ['Normal packaged EXE and sandbox', 'Live IP/VPN/weather', 'Installer upgrade/uninstall', 'Human sound/long-duration performance'] };
let directory, application, child, page, watchdog, finishing, clockInstalled = false;
const checkpoint = (id, description) => { report.checks.push({ id, description, passed: true }); console.log(id); };
const errorText = (e) => String(e?.stack || e).slice(-16000);
async function within(operation, ms, name) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name}: timeout ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
function writeReport() {
  report.finishedAt = new Date().toISOString();
  const target = path.join(directory || resultsRoot, 'style-packs-smoke.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2));
  writeFileSync(path.join(resultsRoot, 'style-packs-smoke-latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: target, error: report.error }));
}
async function closeApp(normal = true) {
  if (!application) return;
  const ownApp = application, ownChild = child;
  try {
    if (normal && page && !page.isClosed()) {
      const exit = new Promise((resolve) => ownChild.exitCode !== null ? resolve(ownChild.exitCode) : ownChild.once('exit', resolve));
      await page.getByRole('button', { name: '退出水塘时钟', exact: true }).click().catch((e) => { if (!/closed/i.test(e.message)) throw e; });
      assert.equal(await within(exit, 10000, 'Own X exit'), 0);
    }
    await within(ownApp.close(), 8000, 'Own app cleanup');
  } finally {
    if (ownChild && ownChild.exitCode === null) { ownChild.kill(); report.forcedCleanup = true; }
    application = null; child = null; page = null;
  }
}
async function finish() {
  if (finishing) return finishing;
  finishing = (async () => {
    clearTimeout(watchdog);
    try { await closeApp(false); } catch (e) { report.cleanupError = errorText(e); report.passed = false; }
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
async function seedProfile(label, coins = 100000) {
  const profile = path.join(directory, label), now = Date.now();
  const state = validateSave({ ...createNewGame('lingnan', now, { randomSeed: 12345 }),
    coins, realRegion: 'lingnan', settings: { ...createNewGame('lingnan', now).settings, biteSoundEnabled: false } });
  await createSaveRepository({ directory: path.join(profile, 'saves'), validate: validateSave }).save(state);
  return profile;
}
async function launch(profile, waitOnline = true) {
  clockInstalled = false;
  const args = ['--no-sandbox', path.join(root, 'desktop/main.cjs'), `--user-data-dir=${profile}`,
    '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'];
  if (['1', '2'].includes(process.env.POND_ACCEPTANCE_DPR)) args.push(`--force-device-scale-factor=${process.env.POND_ACCEPTANCE_DPR}`);
  const env = { ...process.env, POND_DEV_SERVER_URL: '' }; delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({ executablePath: require('electron'), args, chromiumSandbox: false, cwd: root, env, timeout: 30000 });
  child = application.process();
  const launched = { profile, pid: child.pid, args }; report.launches.push(launched);
  launched.runtime = await application.evaluate(({ app, BrowserWindow, net, session }, fixture) => {
    const block = (_details, done) => done({ cancel: true });
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, block);
    globalThis.__styleRequests = [];
    const fetchFixture = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'api.open-meteo.com') {
        const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
        const site = fixture.sites.find((value) => Math.abs(value.latitude - latitude) < 0.000001 && Math.abs(value.longitude - longitude) < 0.000001);
        const region = site?.regionId || 'header';
        const code = region === 'header' || region === 'jiangnan' ? 61 : region === 'dongbei' ? 71 : 0;
        globalThis.__styleRequests.push({ kind: 'weather', region, at: Date.now() });
        return Response.json({ latitude, longitude,
          current_units: { temperature_2m: '°C', cloud_cover: '%', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm' },
          current: { time: Math.floor(Date.now() / 1000), interval: 900, temperature_2m: code === 71 ? -7 : code === 61 ? 22 : 25,
            weather_code: code, is_day: 1, cloud_cover: code ? 100 : 0, precipitation: code ? 0.1 : 0,
            rain: code === 61 ? 0.1 : 0, showers: 0, snowfall: code === 71 ? 0.025 : 0 } });
      }
      if (!['ipapi.co', 'ipwho.is'].includes(url.hostname)) throw new Error('All unmocked endpoints blocked');
      globalThis.__styleRequests.push({ kind: 'geo', provider: url.hostname, at: Date.now() });
      return Response.json({ success: true, country_code: 'CN', country_name: 'China', region: '广东省', city: '东莞',
        region_code: 'GD', latitude: 23.02067, longitude: 113.7518 });
    };
    net.fetch = fetchFixture;
    const locationSession = session.fromPartition('pondclock-location', { cache: false });
    locationSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, block);
    locationSession.fetch = fetchFixture;
    const window = BrowserWindow.getAllWindows()[0];
    return { version: app.getVersion(), userData: app.getPath('userData'), noSandbox: app.commandLine.hasSwitch('no-sandbox'),
      sandboxPreference: window?.webContents.getLastWebPreferences().sandbox };
  }, { sites: Object.values(SCENE_SITES).map((site) => ({ regionId: site.regionId, ...site.weatherLocation })) });
  assert.equal(require('../package.json').version, report.version); assert.equal(launched.runtime.noSandbox, true);
  assert.equal(launched.runtime.userData.toLowerCase(), profile.toLowerCase());
  page = await application.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('requestfailed', (request) => { if (request.url().startsWith('file:')) report.resourceFailures.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForLoadState('load', { timeout: 30000 });
  await page.reload({ timeout: 30000 });
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  if (waitOnline) {
    await page.waitForFunction(() => ['online', 'cached', 'manual'].includes(document.querySelector('.pond-scene')?.dataset.weatherSource));
    await page.waitForFunction(() => {
      const text = document.querySelector('.weather-detail')?.textContent || '';
      return text.includes('东莞') && /实况|缓存/.test(text);
    });
  }
}
const saved = () => page.evaluate(async () => (await window.pondDesktop.loadSave()).snapshot);
async function pollSave(predicate, label, advanceClock = false) {
  const deadline = Date.now() + 10000, samples = [];
  let advances = 0;
  while (Date.now() < deadline) {
    const state = await saved();
    if (predicate(state)) return state;
    samples.push({ revision: state.revision, currentRegion: state.currentRegion, mode: state.settings.sceneWeatherMode,
      travel: state.travel, logicalNowMs: state.lastEffectiveNowMs, rendererNowMs: await page.evaluate(() => Date.now()) });
    if (samples.length > 20) samples.shift();
    if (advanceClock && advances < 10) { await page.clock.runFor(1000); advances++; }
    await delay(50);
  }
  report.savePollingFailure = { label, samples, virtualAdvanceMs: advances * 1000 };
  throw new Error(`${label}: durable state did not reach expected condition within10s: ${JSON.stringify(samples.at(-1))}`);
}
async function waitRevision(before) { return pollSave((state) => state.revision > before.revision, `revision>${before.revision}`); }
async function screenshot(name) {
  // Let acknowledged notifications expire on their normal timer rather than
  // hiding DOM or changing product styles to manufacture a clean screenshot.
  if (await page.locator('[data-sonner-toast]').count()) {
    if (clockInstalled) await page.clock.runFor(5000);
    else await delay(5000);
    report.notificationSettles = (report.notificationSettles || 0) + 1;
  }
  const target = path.join(directory, name); await page.screenshot({ path: target, omitBackground: true }); report.screenshots.push(target);
}
async function closePanel() { if (await page.getByRole('button', { name: '收起面板', exact: true }).count()) await page.getByRole('button', { name: '收起面板', exact: true }).click(); }
async function openPanel(label) { await closePanel(); await page.getByRole('button', { name: label, exact: true }).click(); }
async function equip(slot, style) {
  const label = { scene: '场景插画', character: '人物皮肤', rod: '鱼竿外观' }[slot];
  const before = await saved();
  if (before.appearance.equipped[slot] !== style) {
    await page.getByRole('combobox', { name: label, exact: true }).selectOption(style); await waitRevision(before);
  }
  await page.waitForFunction(({ slot, style }) => document.querySelector('.pond-scene')?.getAttribute(`data-${slot === 'scene' ? 'scene' : slot}-style`) === style, { slot, style });
}
async function mode(name, id) {
  const before = await saved();
  if (before.settings.sceneWeatherMode !== id) {
    // A wrapping label intentionally includes both title and explanatory text.
    // The product is deliberately confirmation-controlled: native checked is
    // published only after disk acknowledgement, later than .check's immediate
    // post-click check. Click once, then verify durable and rendered state.
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click(); await waitRevision(before);
  }
  assert.equal((await saved()).settings.sceneWeatherMode, id);
  await page.waitForFunction((modeId) => [...document.querySelectorAll('input[name="scene-weather-mode"]')].some((input) => input.value === modeId && input.checked), id);
}
async function layout(name, width, height) {
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  const value = await page.evaluate(() => {
    const rect = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      boxes: [...document.querySelectorAll('.widget-toolbar, .clock-panel, .pond-scene, .action-dock, .widget-footer, #fishing-panel, [aria-label="收起面板"]')].map(rect),
      background: getComputedStyle(document.body).backgroundColor };
  });
  assert.equal(value.scrollWidth, width); assert.equal(value.scrollHeight, height);
  for (const box of value.boxes) assert.ok(box.width > 0 && box.height > 0 && box.x >= -.5 && box.y >= -.5 && box.right <= width + .5 && box.bottom <= height + .5, `${name}: ${JSON.stringify(box)}`);
  assert.equal(value.background, 'rgba(0, 0, 0, 0)'); report.layouts.push({ name, ...value });
}
async function size(large) {
  const button = page.getByRole('button', { name: large ? '展开挂件' : '缩小挂件', exact: true });
  if (await button.count()) await button.click();
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, large ? { width: 640, height: 490 } : { width: 420, height: 350 });
}
async function checkImages() {
  const images = await page.locator('.pond-scene image').evaluateAll(async (elements) => Promise.all(elements.map(async (element) => {
    const source = element.getAttribute('href'); const image = new Image(); image.src = source; await image.decode();
    return { source, width: image.naturalWidth, height: image.naturalHeight };
  })));
  for (const image of images) assert.ok(image.width > 100 && image.height > 100);
  return images;
}
async function fly(toId) {
  const before = await saved(); if (before.currentRegion === toId) return;
  await openPanel('漫游');
  const name = REGIONS.find((region) => region.id === toId).name;
  await page.getByText(name, { exact: true }).last().locator('..').locator('..').locator('..').getByRole('button', { name: /机票/ }).click();
  await waitRevision(before); const flying = await saved(); assert.equal(flying.travel.toId, toId);
  assert.equal(flying.currentRegion, before.currentRegion); assert.equal(flying.settings.sceneWeatherMode, before.settings.sceneWeatherMode);
  await closePanel();
  await page.clock.fastForward(Math.max(0, flying.travel.arriveAtMs - flying.lastEffectiveNowMs) + 2000);
  const arrived = await pollSave((state) => !state.travel && state.currentRegion === toId, `arrive:${toId}`, true);
  assert.equal(arrived.currentRegion, toId); assert.equal(arrived.travel, null); assert.equal(arrived.settings.sceneWeatherMode, 'fishing');
  report.arrivals ||= [];
  report.arrivals.push({ fromId: before.currentRegion, toId, revision: arrived.revision, mode: arrived.settings.sceneWeatherMode,
    travel: arrived.travel, rendererNowMs: await page.evaluate(() => Date.now()), logicalNowMs: arrived.lastEffectiveNowMs });
  assert.equal(arrived.coins, before.coins - flying.travel.farePaid);
  await page.waitForFunction((id) => document.querySelector('.pond-scene')?.dataset.sceneRegion === id, toId);
}
async function run() {
  assert.equal(process.env.POND_SMOKE_NO_SANDBOX, '1', 'Diagnostic opt-in required');
  await fs.mkdir(resultsRoot, { recursive: true }); directory = await fs.mkdtemp(path.join(resultsRoot, 'style-packs-smoke-')); report.directory = directory;
  watchdog = setTimeout(() => fatal(new Error('Whole acceptance exceeds 12 minutes')), 12 * 60000);
  const html = await fs.readFile(path.join(root, 'build-desktop/index.html'), 'utf8'); report.bundleHashes = {};
  for (const relative of ['build-desktop/index.html', ...[...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => `build-desktop/${m[1]}`)]) report.bundleHashes[relative] = createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');
  const profile = await seedProfile('gameplay'); await launch(profile);
  assert.deepEqual((await saved()).appearance, DEFAULT_APPEARANCE);
  assert.equal(await page.locator('.minimal-pond').count(), 1); assert.equal(await page.locator('.pond-scene image').count(), 0);
  assert.match(await page.locator('.weather-display').innerText(), /22°.*小雨/s);
  assert.match(await page.locator('.pond-label').first().innerText(), /珠江.*晴.*25°/s);
  await screenshot('default-minimal-guangzhou.png'); checkpoint('S01', 'Default free minimal style uses SVG; real Dongguan rain22 and Guangzhou scene clear25 remain distinct');

  await openPanel('渔具店');
  report.unownedOptions = [];
  for (const label of ['场景插画', '人物皮肤', '鱼竿外观']) {
    const option = page.getByRole('combobox', { name: label, exact: true }).locator('option[value="inkwash"]');
    const diagnostic = await option.evaluate((element) => ({ disabled: element.disabled,
      html: element.outerHTML, selectDisabled: element.parentElement.disabled }));
    diagnostic.playwrightIsDisabled = await option.isDisabled();
    report.unownedOptions.push({ label, ...diagnostic });
    // Native option.disabled is the browser's actual select eligibility. Keep the
    // framework query separately so a host discrepancy remains inspectable.
    assert.equal(diagnostic.disabled, true, JSON.stringify(report.unownedOptions));
  }
  let before = await saved(); const ink = APPEARANCE_PRODUCTS.find((product) => product.id === 'inkwash_pack');
  await page.getByRole('button', { name: `购买${ink.name}`, exact: true }).click(); await waitRevision(before);
  let current = await saved(); assert.equal(current.coins, before.coins - ink.price); assert.deepEqual(current.appearance.equipped, DEFAULT_APPEARANCE.equipped);
  assert.equal(await page.getByRole('button', { name: `已收藏${ink.name}`, exact: true }).isDisabled(), true);
  await equip('scene', 'inkwash'); await equip('character', 'inkwash'); await equip('rod', 'inkwash'); await closePanel();
  assert.equal(await page.locator('.ink-pond').count(), 1); assert.equal((await checkImages()).length, 2);
  await screenshot('purchased-inkwash-guangzhou.png'); checkpoint('S02', 'Unowned options disabled; pack purchase deducts exactly1800 once, no auto-equip; three equipped slots load real local background and figure');

  await openPanel('渔具店');
  for (const product of APPEARANCE_PRODUCTS.filter((entry) => entry.id !== 'inkwash_pack')) {
    before = await saved(); await page.getByRole('button', { name: `购买${product.name}`, exact: true }).click(); await waitRevision(before);
    current = await saved(); assert.equal(current.coins, before.coins - product.price);
    assert.equal(await page.getByRole('button', { name: `已收藏${product.name}`, exact: true }).isDisabled(), true);
  }
  await equip('character', 'cloudwalker'); await equip('rod', 'jade'); await closePanel();
  assert.equal(await page.locator('[data-character-art="cloudwalker"]').count(), 1); assert.equal(await page.locator('[data-rod-art="jade"]').count(), 1);
  await screenshot('mixed-ink-cloudwalker-jade.png');
  await openPanel('渔具店'); await equip('scene', 'minimal'); await equip('character', 'ember'); await equip('rod', 'dawn'); await closePanel();
  assert.equal(await page.locator('.pond-scene image').count(), 0); assert.equal(await page.locator('[data-character-art="ember"]').count(), 1);
  await screenshot('mixed-minimal-ember-dawn.png'); checkpoint('S03', 'All five products persist ownership; original alternate skins and rods render across independent scene/character/rod slots');

  await openPanel('设置'); await mode('现实所在地天气', 'local'); await closePanel();
  await page.waitForFunction(() => document.querySelector('.pond-scene')?.dataset.precipitation === 'rain');
  assert.equal(await page.locator('.pond-scene').getAttribute('data-scene-region'), 'lingnan');
  assert.match(await page.locator('.pond-label').first().innerText(), /珠江.*小雨.*现实.*东莞/s);
  const header = await page.locator('.weather-display').innerText(); await screenshot('guangzhou-background-dongguan-rain.png');
  await openPanel('设置'); await mode('手动天气', 'manual');
  for (const [id, precipitation, sky] of [['clear', 'none', 'clear'], ['cloudy', 'none', 'overcast'], ['rain', 'rain', 'overcast'], ['snow', 'snow', 'overcast']]) {
    before = await saved(); if (before.settings.manualWeather !== id) { await page.getByRole('combobox', { name: '手动场景天气', exact: true }).selectOption(id); await waitRevision(before); }
    await page.waitForFunction((value) => document.querySelector('.pond-scene')?.dataset.precipitation === value.precipitation && document.querySelector('.pond-scene')?.dataset.sky === value.sky, { precipitation, sky });
    assert.equal(await page.locator('.pond-scene').getAttribute('data-weather-source'), 'manual');
    assert.match(await page.locator('.pond-label').first().innerText(), /手动/); assert.equal(await page.locator('.weather-display').innerText(), header);
    await closePanel(); await screenshot(`manual-${id}.png`); await openPanel('设置');
  }
  await closePanel(); checkpoint('S04', 'Guangzhou scene can use Dongguan real weather; four manual presets are explicitly manual and never change real header');

  const durable = await saved(); await closeApp(); await launch(profile);
  current = await saved(); assert.deepEqual(current.appearance, durable.appearance); assert.equal(current.coins, durable.coins);
  assert.equal(current.settings.sceneWeatherMode, 'manual'); assert.equal(current.settings.manualWeather, 'snow');
  assert.equal(await page.locator('.pond-scene').getAttribute('data-precipitation'), 'snow');
  checkpoint('S05', 'Normal X and restart retain earned ownership, mixed equipment, coins and manual snow');

  await page.clock.install({ time: Date.now() }); clockInstalled = true; await fly('dongbei');
  assert.equal((await saved()).settings.sceneWeatherMode, 'fishing');
  await page.waitForFunction(() => document.querySelector('.pond-scene')?.dataset.precipitation === 'snow');
  assert.match(await page.locator('.weather-display').innerText(), /东莞/s);
  await screenshot('arrival-northeast-auto-weather.png'); checkpoint('S06', 'Actual paid flight preserves departure scene/mode until arrival, then atomically selects destination weather while real header remains Dongguan');

  for (const style of ['minimal', 'inkwash']) {
    await openPanel('渔具店'); await equip('scene', style); await closePanel();
    for (const large of [false, true]) {
      await size(large); const width = large ? 640 : 420, height = large ? 490 : 350;
      await layout(`${style}-main-${width}`, width, height);
      for (const name of ['鱼篓', '图鉴', '渔具店', '漫游', '设置']) {
        await openPanel(name); await layout(`${style}-${name}-${width}`, width, height);
        await screenshot(`${style}-panel-${name}-${width}.png`); await closePanel();
      }
    }
  }
  checkpoint('S07', 'Both styles fit exact420x350/640x490 client sizes and all five panels with transparent document and internal scrolling');

  if (process.env.POND_STYLE_QUICK !== '1') {
    report.regionImages = [];
    for (const region of REGIONS) {
      await fly(region.id);
      for (const style of ['minimal', 'inkwash']) {
        await openPanel('渔具店'); await equip('scene', style); await closePanel();
        assert.equal(await page.locator('.pond-scene').getAttribute('data-scene-region'), region.id);
        assert.match(await page.locator('.pond-label').first().innerText(), new RegExp(SCENE_SITES[region.id].place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        const images = await checkImages(); assert.equal(images.length, style === 'inkwash' ? 1 : 0);
        report.regionImages.push({ region: region.id, style, images }); await screenshot(`${region.id}-${style}-640.png`);
      }
    }
    checkpoint('S08', 'All12 real paid travel destinations render both styles; all12 actual ink bitmaps decode locally, minimal uses no bitmap');
  }
  await openPanel('渔具店'); before = await saved();
  for (const slot of ['scene', 'character', 'rod']) await equip(slot, 'minimal');
  assert.equal((await saved()).coins, before.coins); await closePanel();
  assert.deepEqual((await saved()).appearance.equipped, DEFAULT_APPEARANCE.equipped);
  checkpoint('S09', 'All three slots return freely to default without removing ownership or spending');
  const poor = await seedProfile('insufficient-funds', 100); await closeApp(); await launch(poor);
  await openPanel('渔具店');
  for (const product of APPEARANCE_PRODUCTS) assert.equal(await page.getByRole('button', { name: `购买${product.name}`, exact: true }).isDisabled(), true);
  assert.equal((await saved()).coins, 100); assert.deepEqual((await saved()).appearance, DEFAULT_APPEARANCE);
  checkpoint('S10', 'Insufficient-funds profile cannot purchase any paid cosmetic; coins and free ownership remain unchanged');
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.resourceFailures, []);
  report.passed = true; await closeApp(); await finish();
}
run().catch(fatal);
