// Uses Electron's own Chromium via Playwright; no separately downloaded browser and no UI test API.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { _electron: electron } = require('playwright-core');
const electronPath = require('electron');
const { createSaveRepository } = require('../desktop/saveRepository.cjs');

const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const hostSandboxEnabled = process.env.POND_SMOKE_NO_SANDBOX !== '1';
const report = { checks: [], consoleErrors: [], passed: false, hostSandboxEnabled };
let application;
let userData;

async function launch() {
  application = await electron.launch({
    executablePath: electronPath,
    args: [...(hostSandboxEnabled ? [] : ['--no-sandbox']), path.join(root, 'desktop', 'main.cjs'), `--user-data-dir=${userData}`, '--proxy-server=http://127.0.0.1:1'],
    cwd: root,
    timeout: 30000,
    chromiumSandbox: hostSandboxEnabled,
    env: { ...process.env, POND_DEV_SERVER_URL: '' },
  });
  await application.evaluate(({ session }) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  const page = await application.firstWindow();
  page.on('pageerror', (error) => report.consoleErrors.push(error.message));
  await page.waitForFunction(() => typeof window.pondDesktop?.loadSave === 'function');
  await page.getByRole('button', { name: /鱼篓/ }).waitFor({ timeout: 15000 });
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const channels = bodyBackground.match(/\d+/g)?.slice(0, 3).map(Number);
  assert.ok(channels?.length === 3 && channels.every((value) => value < 60),
    `Production dark theme is missing: body background ${bodyBackground}`);
  return page;
}

async function close() {
  if (application) {
    await application.close();
    application = null;
  }
}

async function waitForSaved(page) {
  await page.getByText('本地进度已保存', { exact: true }).waitFor();
}

async function coldOfflinePlay({ createNewGame, quoteFish }) {
  userData = await fs.mkdtemp(path.join(resultsRoot, 'electron-cold-'));
  const page = await launch();
  const initial = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.ok(initial);
  assert.equal(initial.coins, createNewGame(initial.currentRegion).coins);
  assert.equal(initial.bucket.length, 0);
  assert.equal(initial.unlockedRegions.length, 1);
  report.checks.push('A completely new profile initializes offline without a server or existing save');

  // Install the public browser clock before reloading, so all production timers use the same clock.
  await page.clock.install({ time: Date.now() });
  await page.reload();
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  await waitForSaved(page);
  const hint = await page.getByText(/静候鱼讯 · 约 \d+ 秒/).innerText();
  const waitingSeconds = Number(hint.match(/约 (\d+) 秒/)[1]);
  assert.ok(waitingSeconds > 0 && waitingSeconds <= 125);
  await page.clock.runFor((waitingSeconds + 1) * 1000);
  const catchButton = page.getByRole('button', { name: '点击收竿', exact: true });
  await catchButton.waitFor();
  await catchButton.click();
  await waitForSaved(page);
  const caught = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(caught.bucket.length, 1);
  assert.equal(caught.codex[caught.bucket[0].speciesId].catchCount, 1);
  const sellPrice = quoteFish(caught.bucket[0], caught.currentRegion, caught.lastEffectiveNowMs).price;
  await page.getByRole('button', { name: '鱼篓', exact: true }).click();
  await page.screenshot({ path: path.join(resultsRoot, 'electron-caught.png'), fullPage: true });
  await page.getByRole('region', { name: '鱼篓', exact: true }).getByRole('button', { name: /^卖 ¥/ }).click();
  await waitForSaved(page);
  const sold = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(sold.bucket.length, 0);
  assert.equal(sold.coins, caught.coins + sellPrice);
  assert.equal(sold.codex[caught.bucket[0].speciesId].catchCount, 1);
  report.checks.push('Production fishing timer reaches a bite; a real click catches and saves one fish; UI sale credits exact coins and retains codex');
  await close();
}

async function run() {
  await fs.access(path.join(root, 'build-desktop', 'index.html'));
  await fs.mkdir(resultsRoot, { recursive: true });
  const { validateSave } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'saveSchema.js')));
  const { createNewGame, applyCommand } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'gameState.js')));
  const { REGIONS, FISH, DEFAULT_REGION } = await import(pathToFileURL(path.join(root, 'src', 'lib', 'gameConfig.js')));
  const { quoteRoute } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'routes.js')));
  const { quoteFish } = await import(pathToFileURL(path.join(root, 'src', 'domain', 'market.js')));
  await coldOfflinePlay({ createNewGame, quoteFish });
  userData = await fs.mkdtemp(path.join(resultsRoot, 'electron-smoke-'));
  const repository = createSaveRepository({ directory: path.join(userData, 'saves'), validate: validateSave });
  const now = Date.now();
  const oldTime = now - 8 * 24 * 60 * 60 * 1000;
  let state = validateSave({ ...createNewGame(DEFAULT_REGION, oldTime), coins: 50000 });
  await repository.save(state);
  const destination = REGIONS.filter((region) => region.id !== DEFAULT_REGION)
    .sort((a, b) => quoteRoute(DEFAULT_REGION, b.id).durationMs - quoteRoute(DEFAULT_REGION, a.id).durationMs)[0];
  const origin = REGIONS.find((region) => region.id === DEFAULT_REGION);
  const speciesId = (origin.fish.find(([id]) => !destination.fish.some(([localId]) => localId === id)) || origin.fish[0])[0];
  const species = FISH.find((fish) => fish.id === speciesId);
  state = applyCommand(state, { id: 'smoke-catch', type: 'CATCH', fish: {
    uid: 'smoke-fish-expired', speciesId, quality: 'legendary', name: species.name,
    length: species.len[0], weight: species.wt[0], regionId: DEFAULT_REGION,
  } }, oldTime);
  await repository.save(state);
  state = applyCommand(state, { id: 'smoke-fresh-catch', type: 'CATCH', fish: {
    uid: 'smoke-fish-fresh', speciesId, quality: 'legendary', name: species.name,
    length: species.len[1], weight: species.wt[1], regionId: DEFAULT_REGION,
  } }, now);
  await repository.save(state);
  state = applyCommand(state, { id: 'smoke-flight', type: 'START_TRAVEL', toId: destination.id }, now);
  await repository.save(state);
  const paidCoins = state.coins;
  const travelId = state.travel.id;

  let page = await launch();
  assert.equal(await page.title(), '水塘时钟 · 桌面挂机钓鱼');
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), userData);
  const isolation = await page.evaluate(() => ({ require: typeof require, process: typeof process, node: typeof window.pondDesktop }));
  assert.deepEqual(isolation, { require: 'undefined', process: 'undefined', node: 'object' });
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const settings = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: settings.sandbox, contextIsolation: settings.contextIsolation, nodeIntegration: settings.nodeIntegration };
  });
  assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  report.checks.push('Local build renders with sandbox preference, context isolation and no renderer Node access');

  const offline = await page.evaluate(async () => {
    try { await window.pondDesktop.requestEnvironment('https://ipapi.co/json/'); return false; }
    catch { return true; }
  });
  assert.equal(offline, true);
  const forbidden = await page.evaluate(async () => {
    try { await window.pondDesktop.requestEnvironment('file:///C:/Windows/win.ini'); return false; }
    catch { return true; }
  });
  assert.equal(forbidden, true);
  report.checks.push('All external HTTP is blocked while the game remains usable; arbitrary bridge URLs rejected');

  const restored = await page.evaluate(() => window.pondDesktop.loadSave());
  assert.equal(restored.snapshot.coins, paidCoins);
  assert.equal(restored.snapshot.travel.id, travelId);
  assert.equal(restored.snapshot.bucket[0].uid, 'smoke-fish-expired');
  state = applyCommand(restored.snapshot, { id: 'smoke-settings', type: 'SETTINGS', patch: { onlineEnhancements: false } }, Date.now());
  const result = await page.evaluate((next) => window.pondDesktop.saveGame(next), state);
  assert.equal(result.status, 'committed');
  const retry = await page.evaluate((next) => window.pondDesktop.saveGame(next), state);
  assert.equal(retry.status, 'already-committed');
  report.checks.push('Renderer save round trip and identical-revision retry preserve one transaction');

  const exportPath = path.join(userData, 'export.json');
  await application.evaluate(({ dialog }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, exportPath);
  assert.equal((await page.evaluate((next) => window.pondDesktop.exportSave(next), state)).canceled, false);
  assert.deepEqual(validateSave(JSON.parse(await fs.readFile(exportPath, 'utf8'))), state);
  const imported = await page.evaluate(() => window.pondDesktop.importSave());
  assert.equal(imported.canceled, false);
  assert.equal(imported.snapshot.revision, state.revision + 1);
  assert.equal(imported.snapshot.travel.id, travelId);
  report.checks.push('Native file-dialog export/import preserve the snapshot and advance local revision');

  await page.reload();
  await page.getByRole('button', { name: /鱼篓/ }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(resultsRoot, 'electron-offline.png'), fullPage: true });
  await close();
  page = await launch();
  const restarted = await page.evaluate(() => window.pondDesktop.loadSave());
  assert.equal(restarted.snapshot.coins, paidCoins);
  assert.equal(restarted.snapshot.travel.id, travelId);
  assert.equal(restarted.snapshot.travel.farePaid, state.travel.farePaid);
  assert.equal(restarted.snapshot.bucket[0].caughtAtMs, state.bucket[0].caughtAtMs);
  report.checks.push('Electron process restart restores in-flight travel, paid fare, fish and timestamps without a second deduction');
  await close();

  // Complete the saved flight through the same domain command, without waiting three real minutes.
  const landing = applyCommand(restarted.snapshot, { id: 'smoke-arrive', type: 'ARRIVE' }, restarted.snapshot.travel.arriveAtMs + 1);
  await repository.save(landing);
  page = await launch();
  assert.equal((await page.evaluate(() => window.pondDesktop.loadSave())).snapshot.travel, null);
  await page.screenshot({ path: path.join(resultsRoot, 'electron-main.png'), fullPage: true });
  await page.getByRole('button', { name: '漫游', exact: true }).click();
  await page.getByRole('img', { name: '从当前水域出发的全国航线示意图' }).waitFor();
  await page.screenshot({ path: path.join(resultsRoot, 'electron-travel.png'), fullPage: true });
  await page.getByRole('button', { name: '鱼篓', exact: true }).click();
  await page.getByText('已过保鲜期 · 固定 ¥1', { exact: false }).waitFor();
  await page.getByText(/当地行情 ×/).waitFor();
  assert.equal(quoteFish(landing.bucket[0], landing.currentRegion, landing.lastEffectiveNowMs).price, 1);
  assert.ok(quoteFish(landing.bucket[1], landing.currentRegion, landing.lastEffectiveNowMs).multiplier > 1);
  await page.screenshot({ path: path.join(resultsRoot, 'electron-bucket.png'), fullPage: true });
  const bucketRegion = page.getByRole('region', { name: '鱼篓', exact: true });
  await bucketRegion.getByRole('button', { name: '卖 ¥1', exact: true }).click();
  await waitForSaved(page);
  const expiredSold = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(expiredSold.coins, paidCoins + 1);
  assert.equal(expiredSold.bucket.length, 1);
  report.checks.push('Grounded UI screenshots cover fishing, route map and market; expired legendary fish sells for exactly one coin');

  await page.clock.install({ time: Math.max(Date.now(), expiredSold.lastEffectiveNowMs) });
  await page.reload();
  await page.getByRole('button', { name: '漫游', exact: true }).click();
  const nextDestination = REGIONS.find((region) => region.id !== expiredSold.currentRegion);
  const uiRoute = quoteRoute(expiredSold.currentRegion, nextDestination.id);
  await page.getByRole('region', { name: '漫游', exact: true }).getByRole('button', { name: /^机票 ¥/ }).first().click();
  await waitForSaved(page);
  const departed = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(departed.travel.toId, nextDestination.id);
  assert.equal(departed.coins, expiredSold.coins - uiRoute.price);
  await page.clock.runFor(uiRoute.durationMs + 2000);
  await page.waitForFunction(async () => !(await window.pondDesktop.loadSave()).snapshot.travel);
  await waitForSaved(page);
  const arrived = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(arrived.currentRegion, nextDestination.id);
  assert.equal(arrived.coins, departed.coins);
  assert.equal(await page.getByText('旅途中暂停垂钓', { exact: true }).count(), 0);
  report.checks.push('A real UI ticket purchase deducts once and the production timer automatically lands after clock advancement');

  // Replace only the test process's net.fetch; this mock never enters product source or build output.
  await application.evaluate(({ net }) => {
    net.fetch = async (input) => {
      if (new URL(String(input)).hostname !== 'ipapi.co') throw new Error('Offline smoke: weather blocked');
      return new Response(JSON.stringify({ country_code: 'CN', region: '广东省', region_code: 'GD', city: '广州',
        latitude: 23.11667, longitude: 113.25, country_name: 'China' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  // This controlled checkbox publishes only after durable save; click, then await the commit.
  await page.getByRole('checkbox').first().click();
  await page.waitForFunction(async () => (await window.pondDesktop.loadSave()).snapshot.settings.onlineEnhancements);
  await page.getByRole('button', { name: '重新识别所在地', exact: true }).click();
  await page.waitForFunction(async () => {
    const saved = (await window.pondDesktop.loadSave()).snapshot;
    return saved.realRegion === 'lingnan' && saved.unlockedRegions.includes('lingnan');
  });
  const located = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(located.coins, arrived.coins);
  const oldImport = validateSave({ ...createNewGame(DEFAULT_REGION, Date.now()), coins: 1234,
    realRegion: 'huanghe', unlockedRegions: [DEFAULT_REGION, 'huanghe'] });
  const oldImportPath = path.join(userData, 'old-region-import.json');
  await fs.writeFile(oldImportPath, JSON.stringify(oldImport));
  await application.evaluate(({ dialog }, filename) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, oldImportPath);
  await page.getByRole('button', { name: '导入存档', exact: true }).click();
  await page.waitForFunction(async () => {
    const saved = (await window.pondDesktop.loadSave()).snapshot;
    return saved.coins === 1234 && saved.realRegion === 'lingnan' && saved.unlockedRegions.includes('lingnan');
  });
  await waitForSaved(page);
  const afterOldImport = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.equal(afterOldImport.currentRegion, DEFAULT_REGION);
  assert.ok(afterOldImport.unlockedRegions.includes('huanghe'));
  report.checks.push('UI IP refresh freely unlocks Guangdong; importing an old other-region save reapplies this launch\'s current IP without charging or moving the player');
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
}

run().catch((error) => {
  report.error = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  await close().catch(() => {});
  await fs.mkdir(resultsRoot, { recursive: true });
  await fs.writeFile(path.join(resultsRoot, 'electron-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  // Keep the isolated user data as reproducible evidence. It never uses the player's save folder.
});
