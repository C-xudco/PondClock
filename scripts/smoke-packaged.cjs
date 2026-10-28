// Exercise the actual distributed EXE. Never substitute developer Electron or disable its sandbox.
// Usage: node scripts/smoke-packaged.cjs "X:\\path\\PondClock.exe"
// Alternative: POND_PACKAGED_EXE supplies the executable path.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { setTimeout: delay } = require('node:timers/promises');
const { _electron: electron } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const resultsRoot = path.join(root, 'test-results');
const executableInput = process.argv[2] || process.env.POND_PACKAGED_EXE;
const report = {
  scope: 'Real packaged EXE under Playwright; normal sandbox, isolated profile and blocked HTTP. This does not validate installer or shortcuts.',
  startedAt: new Date().toISOString(),
  host: { platform: process.platform, architecture: process.arch, release: os.release() },
  passed: false, hostSandboxEnabled: true, checks: [], launches: [], consoleErrors: [], cleanupErrors: [], fatalEvents: [],
  limitations: ['Ordinary waiting uses Playwright wall-clock advancement; short active/focus intervals use its monotonic clock. This is not a real-time waiting or sleep test.',
    'Near-complete focus and sufficient purchase coins are explicitly synthetic, schema-validated fixtures in a separate test profile; they are not earned through this smoke run.',
    'Same Windows host with development tools installed; child PATH omits developer tools, not a second clean computer.',
    'Playwright adds debugging transport; ordinary double-click and shortcut launches require separate checks.'],
};
if (process.env.POND_PACKAGED_HARNESS_SELF_TEST === '1') {
  report.scope = 'Harness failure-path self-test with injected Playwright failure; no actual EXE, GUI or installation was exercised.';
  report.harnessSelfTest = true;
}
let runDirectory;
let userData;
let executable;
let application;
let currentProcess;
let currentLaunch;
let finalization;
let overallWatchdog;

const normalize = (filename) => path.resolve(filename).replaceAll('/', '\\').toLowerCase();
const checked = (id, description) => report.checks.push({ id, description, passed: true });
const errorText = (error) => String(error?.stack || error).slice(-30000);

// An early Chromium failure can reject an internal Playwright waitForLine promise
// outside electron.launch()'s returned promise. Node 24 otherwise exits before our
// ordinary catch/finally can preserve the failure. Treat it as fatal, never a pass.
function fatalFailure(kind, error) {
  report.passed = false;
  report.fatalEvents.push({ kind, at: new Date().toISOString(), error: errorText(error) });
  report.error ||= errorText(error);
  if (currentLaunch && !currentLaunch.runtime) currentLaunch.failure = { kind, error: errorText(error) };
  process.exitCode = 1;
  // Preserve the failure immediately even if the library's cleanup later hangs.
  writeReport();
  void finalize().then(() => process.exit(1), (finalError) => {
    report.cleanupErrors.push(`Fatal report finalization: ${errorText(finalError)}`);
    writeReport();
    process.exit(1);
  });
}

process.on('unhandledRejection', (error) => fatalFailure('UNHANDLED_REJECTION', error));
process.on('uncaughtException', (error) => fatalFailure('UNCAUGHT_EXCEPTION', error));

function writeReport() {
  report.finishedAt = new Date().toISOString();
  if (report.cleanupErrors.length || report.fatalEvents.length || report.error) report.passed = false;
  const reportPath = path.join(runDirectory || resultsRoot, 'packaged-smoke.json');
  report.reportPath = reportPath;
  try {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path.join(resultsRoot, 'packaged-smoke-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, report: reportPath, error: report.error }));
  } catch (error) {
    report.passed = false;
    report.cleanupErrors.push(`Report write failed: ${errorText(error)}`);
    // Keep a fallback even if a disconnected project drive caused startup/report failure.
    report.reportPath = path.join(os.tmpdir(), `PondClock-packaged-smoke-${process.pid}.json`);
    try {
      writeFileSync(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.error(JSON.stringify({ passed: false, fallbackReport: report.reportPath, error: report.error }));
    } catch (fallbackError) { console.error(`Unable to preserve failure report: ${errorText(fallbackError)}`); }
    process.exitCode = 1;
  }
}

function finalize() {
  if (finalization) return finalization;
  finalization = (async () => {
    clearTimeout(overallWatchdog);
    const hardStop = setTimeout(() => {
      report.passed = false;
      report.cleanupErrors.push('Report finalization exceeded 15 seconds; terminating this harness with failure');
      writeReport();
      process.exit(1);
    }, 15000);
    try {
      if (application) {
        try { await within(application.close(), 10000, 'Failure cleanup of this test application'); }
        catch (error) { report.cleanupErrors.push(error.message); }
        if (currentProcess && currentProcess.exitCode === null) {
          // A last resort for only our own child; this can never turn failure into a pass.
          report.cleanupErrors.push(`Force-terminating this test's still-running main PID ${currentProcess.pid}`);
          try { currentProcess.kill(); }
          catch (error) { report.cleanupErrors.push(`Test child cleanup failed: ${error.message}`); }
        }
      } else if (currentLaunch && !currentLaunch.mainPid) {
        report.cleanupLimitations = ['Launch failed before Playwright returned an application or PID; no unrelated processes were terminated.'];
      }
      writeReport();
    } finally { clearTimeout(hardStop); }
  })();
  return finalization;
}

async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function within(promise, timeoutMs, description) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${description} timed out after ${timeoutMs}ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function waitForProcessesToExit(pids) {
  const deadline = Date.now() + 10000;
  let remaining;
  do {
    remaining = [...new Set(pids)].filter(processExists);
    if (!remaining.length) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`This test's packaged process IDs remain after close: ${remaining.join(', ')}`);
}

async function loadDiskSnapshot() {
  const candidates = [];
  for (const name of ['save-a.json', 'save-b.json']) {
    let text;
    try { text = await fs.readFile(path.join(userData, 'saves', name), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const envelope = JSON.parse(text);
    assert.equal(envelope.format, 'pondclock.save');
    assert.equal(envelope.envelopeVersion, 1);
    assert.equal(envelope.revision, envelope.snapshot.revision);
    assert.equal(envelope.checksum, createHash('sha256').update(JSON.stringify(envelope.snapshot)).digest('hex'));
    candidates.push(envelope.snapshot);
  }
  candidates.sort((a, b) => b.revision - a.revision);
  assert.ok(candidates.length, 'The packaged EXE did not create a valid disk save');
  if (candidates.length > 1 && candidates[0].revision === candidates[1].revision) {
    assert.deepEqual(candidates[0], candidates[1]);
  }
  return candidates[0];
}

async function snapshot(page) {
  return (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
}

async function waitForSnapshot(page, predicate, argument) {
  const deadline = Date.now() + 15000;
  let state;
  while (Date.now() < deadline) {
    state = await snapshot(page);
    if (predicate(state, argument)) return state;
    await delay(40);
  }
  throw new Error('Expected saved state not reached: ' + JSON.stringify({ revision: state?.revision, fishing: state?.fishing, focus: state?.focus }));
}

async function writeFixtureProfile(fixture) {
  assert.equal(application, null, 'Fixture writes require the test EXE to be closed');
  const { validateSave } = await import(pathToFileURL(path.join(root, 'src/domain/saveSchema.js')));
  const validated = validateSave(fixture);
  assert.deepEqual(validated, fixture, 'Fixtures must already satisfy the current complete save schema');
  const directory = path.join(userData, 'saves');
  await fs.mkdir(directory, { recursive: true });
  const envelope = { format: 'pondclock.save', envelopeVersion: 1, revision: fixture.revision,
    snapshot: fixture, checksum: createHash('sha256').update(JSON.stringify(fixture)).digest('hex') };
  await fs.writeFile(path.join(directory, 'save-a.json'), JSON.stringify(envelope));
  report.fixtures ||= [];
  report.fixtures.push({ profile: userData, purpose: 'V2 near-complete fourth focus plan, 5000 coins, Taihu ink scene',
    schemaVersion: fixture.schemaVersion, editionId: fixture.editionId, sha256: envelope.checksum });
}

function childEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (['path', 'node_options', 'node_path', 'electron_run_as_node', 'pond_dev_server_url'].includes(key.toLowerCase())) delete environment[key];
  }
  const windowsDirectory = process.env.SystemRoot || 'C:\\Windows';
  environment.Path = `${path.join(windowsDirectory, 'System32')};${windowsDirectory}`;
  return environment;
}

async function launch() {
  currentLaunch = { executable, args: [`--user-data-dir=${userData}`, '--proxy-server=http://127.0.0.1:1', '--proxy-bypass-list=<-loopback>'],
    sandbox: 'enabled', developerToolsRemovedFromChildPath: true, startedAt: new Date().toISOString(), stderr: '' };
  report.launches.push(currentLaunch);
  application = await electron.launch({ executablePath: executable, args: currentLaunch.args,
    cwd: path.dirname(executable), chromiumSandbox: true, env: childEnvironment(), timeout: 30000 });
  if (report.fatalEvents.length) throw new Error('The harness already received a fatal launch error');
  currentProcess = application.process();
  currentLaunch.mainPid = currentProcess.pid;
  currentProcess.stderr?.on('data', (chunk) => {
    currentLaunch.stderr = (currentLaunch.stderr + String(chunk)).slice(-20000);
  });

  currentLaunch.runtime = await application.evaluate(({ app, BrowserWindow }) => ({
    isPackaged: app.isPackaged, execPath: process.execPath, appPath: app.getAppPath(), userData: app.getPath('userData'),
    version: app.getVersion(), versions: process.versions, argv: process.argv,
    noSandbox: app.commandLine.hasSwitch('no-sandbox'), disableGpuSandbox: app.commandLine.hasSwitch('disable-gpu-sandbox'),
    preferences: BrowserWindow.getAllWindows().map((window) => {
      const prefs = window.webContents.getLastWebPreferences();
      return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
    }),
  }));
  const runtime = currentLaunch.runtime;
  assert.equal(runtime.isPackaged, true, 'This is not a packaged application');
  assert.equal(normalize(await fs.realpath(runtime.execPath)), normalize(executable));
  assert.equal(normalize(runtime.appPath), normalize(path.join(path.dirname(executable), 'resources', 'app.asar')));
  assert.equal(normalize(runtime.userData), normalize(userData), 'Refusing to test against the real player profile');
  assert.equal(runtime.noSandbox, false);
  assert.equal(runtime.disableGpuSandbox, false);
  assert.equal(runtime.preferences.length, 1);
  assert.deepEqual(runtime.preferences[0], { sandbox: true, contextIsolation: true, nodeIntegration: false });

  await application.evaluate(({ session }) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }));
  });
  const page = await application.firstWindow({ timeout: 15000 });
  page.on('pageerror', (error) => report.consoleErrors.push(error.message));
  await page.waitForFunction(() => typeof window.pondDesktop?.loadSave === 'function');
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('本地进度已保存', { exact: true }).waitFor();
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  const isolated = await page.evaluate(() => ({ require: typeof require, process: typeof process }));
  assert.deepEqual(isolated, { require: 'undefined', process: 'undefined' });
  assert.equal(await page.evaluate(async () => {
    try { await window.pondDesktop.requestEnvironment('https://ipapi.co/json/'); return false; }
    catch { return true; }
  }), true, 'External HTTPS was not blocked');
  currentLaunch.visibleWindowVerified = true;
  return page;
}

async function closeWindowAndVerifyExit() {
  const closingApplication = application;
  const closingProcess = currentProcess;
  const closingLaunch = currentLaunch;
  const metrics = await application.evaluate(({ app }) => app.getAppMetrics().map(({ pid, type }) => ({ pid, type })));
  closingLaunch.processesBeforeClose = metrics;
  const exited = new Promise((resolve) => {
    if (closingProcess.exitCode !== null) resolve({ code: closingProcess.exitCode, signal: closingProcess.signalCode });
    else closingProcess.once('exit', (code, signal) => resolve({ code, signal }));
  });
  // Trigger the actual window-close handler; application.close()/app.quit() would bypass the reported close bug.
  await application.evaluate(({ BrowserWindow }) => { setImmediate(() => BrowserWindow.getAllWindows()[0].close()); });
  closingLaunch.exit = await within(exited, 15000, 'Normal window close');
  assert.equal(closingLaunch.exit.code, 0);
  await waitForProcessesToExit([closingProcess.pid, ...metrics.map(({ pid }) => pid)]);
  closingLaunch.allObservedProcessesReleased = true;
  application = null;
  currentProcess = null;
  // Dispose Playwright connections after proving the real window-close path terminated the EXE.
  await within(closingApplication.close(), 5000, 'Playwright transport cleanup');
}

async function run() {
  assert.equal(process.platform, 'win32', 'This smoke test targets the distributed Windows EXE');
  assert.ok(executableInput, 'Usage: node scripts/smoke-packaged.cjs "X:\\path\\PondClock.exe" (or POND_PACKAGED_EXE)');
  executable = await fs.realpath(path.resolve(executableInput));
  assert.equal(path.basename(executable).toLowerCase(), 'pondclock.exe', 'Select the actual game EXE, not an installer or developer Electron');
  const archive = path.join(path.dirname(executable), 'resources', 'app.asar');
  await fs.access(archive);
  await fs.mkdir(resultsRoot, { recursive: true });
  runDirectory = await fs.mkdtemp(path.join(resultsRoot, 'packaged smoke-'));
  userData = path.join(runDirectory, 'profile');
  await fs.mkdir(userData);
  report.directory = runDirectory;
  report.profile = userData;
  report.executable = { path: executable, bytes: (await fs.stat(executable)).size, sha256: await sha256File(executable) };
  report.archive = { path: archive, sha256: await sha256File(archive) };

  let page = await launch();
  const initial = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.ok(initial);
  assert.equal(initial.revision, 0);
  assert.equal(initial.schemaVersion, 4); assert.equal(initial.editionId, 'first-focus');
  assert.equal(initial.fishing.mode, 'stopped');
  assert.equal(initial.bucket.length, 0);
  assert.equal(initial.unlockedRegions.length, 1);
  assert.deepEqual(await loadDiskSnapshot(), initial);
  await page.screenshot({ path: path.join(runDirectory, 'first-launch.png'), fullPage: true });
  checked('P01', 'Actual packaged EXE shows an offline new game with normal sandbox and a valid isolated disk save');

  await page.clock.install({ time: Date.now() });
  await page.reload();
  await page.getByRole('button', { name: '鱼篓', exact: true }).waitFor();
  await page.getByRole('button', { name: '开始钓鱼', exact: true }).click();
  const waiting = await waitForSnapshot(page, state => state.fishing.phase === 'waiting');
  const waitMs = waiting.fishing.attempt.waitUntilMs - waiting.lastEffectiveNowMs;
  assert.ok(waitMs >= 55000 && waitMs <= 125000);
  // Change Date only; a large monotonic jump correctly triggers sleep recovery.
  await page.clock.setSystemTime(waiting.fishing.attempt.waitUntilMs + 1);
  await page.clock.runFor(500);
  await waitForSnapshot(page, state => state.fishing.phase === 'bite');
  await page.getByRole('button', { name: '点击收竿', exact: true }).click();
  await waitForSnapshot(page, state => state.catchSequence === 1);
  await page.getByRole('button', { name: '停止钓鱼', exact: true }).click();
  const caught = await waitForSnapshot(page, state => state.fishing.mode === 'stopped');
  assert.ok(caught.revision > initial.revision);
  assert.equal(caught.coins, initial.coins);
  assert.equal(caught.bucket.length + caught.items.length, 1);
  if (caught.bucket.length) assert.equal(caught.codex[caught.bucket[0].speciesId].catchCount, 1);
  else assert.deepEqual(caught.codex, initial.codex);
  assert.deepEqual(await loadDiskSnapshot(), caught);
  checked('P02', 'UI start, production fish event, manual capture and UI stop persist exactly one fish or item');

  await closeWindowAndVerifyExit();
  assert.deepEqual(await loadDiskSnapshot(), caught);
  checked('P03', 'Window close exits normally and releases every observed app process without force kill');

  page = await launch();
  const restarted = (await page.evaluate(() => window.pondDesktop.loadSave())).snapshot;
  assert.deepEqual(restarted, caught);
  await page.getByRole('button', { name: '鱼篓', exact: true }).click();
  await page.screenshot({ path: path.join(runDirectory, 'restarted-catch.png'), fullPage: true });
  const bucketPanel = page.getByRole('region', { name: '鱼篓', exact: true });
  const manual = restarted.items[0]?.type === 'influencer_manual';
  const actionButton = manual ? bucketPanel.getByRole('button', { name: '使用秘籍 · 前3条 +50%', exact: true })
    : bucketPanel.getByRole('button', { name: restarted.bucket.length ? /^卖 ¥/ : /^直接出售 · ¥/ });
  const price = manual ? 0 : Number((await actionButton.innerText()).match(/¥(\d+)$/)[1]);
  assert.ok(Number.isSafeInteger(price) && (manual ? price === 0 : price > 0));
  await actionButton.click();
  const sold = await waitForSnapshot(page, state => state.bucket.length + state.items.length === 0);
  assert.equal(sold.coins, restarted.coins + price);
  assert.deepEqual(sold.codex, restarted.codex);
  if (manual) assert.equal(sold.saleBuff.remaining, 3);
  assert.ok(sold.revision > restarted.revision);
  assert.deepEqual(await loadDiskSnapshot(), sold);
  checked('P04', manual ? 'The same EXE reopens a captured manual and its UI use preserves exactly three buff charges'
    : 'The same EXE reopens a captured fish/item and its UI sale credits the displayed price exactly once');

  await closeWindowAndVerifyExit();
  page = await launch();
  assert.deepEqual((await page.evaluate(() => window.pondDesktop.loadSave())).snapshot, sold);
  await page.screenshot({ path: path.join(runDirectory, 'restarted-sale.png'), fullPage: true });
  await closeWindowAndVerifyExit();
  checked('P05', 'A second restart preserves sale proceeds and codex, then normal close releases the runtime again');

  // Independent synthetic profile: no edit to the ordinary-capture evidence or a real user's save.
  const { createNewGame } = await import(pathToFileURL(path.join(root, 'src/domain/gameState.js')));
  const { FOCUS_CONFIG } = await import(pathToFileURL(path.join(root, 'src/config/focus.js')));
  const fixtureTime = Date.now();
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(fixtureTime);
  const fixture = { ...createNewGame('taihu', fixtureTime, { randomSeed: 471 }), coins: 5000,
    settings: { ...createNewGame('taihu', fixtureTime, { randomSeed: 471 }).settings, onlineEnhancements: false },
    appearance: { ownedProducts: ['inkwash_pack'], equipped: { scene: 'inkwash', character: 'minimal', rod: 'inkwash' } },
    focus: { sequence: 4, completedPlanIds: ['fixture-focus-1', 'fixture-focus-2', 'fixture-focus-3'],
      days: { [dayKey]: { completedCount: 3, ticketGranted: false } }, breakRemainingMs: 0,
      plan: { id: 'fixture-focus-4', title: '验收：第四轮最后5秒', status: 'paused', elapsedMs: FOCUS_CONFIG.durationMs - 5000,
        durationMs: FOCUS_CONFIG.durationMs, dayKey, timeZone: 'Asia/Shanghai' } } };
  userData = path.join(runDirectory, 'fixture-profile');
  await writeFixtureProfile(fixture);
  page = await launch();
  await page.clock.install({ time: fixtureTime });
  await page.reload();
  await page.getByRole('button', { name: '专注计划', exact: true }).waitFor();
  await page.screenshot({ path: path.join(runDirectory, 'fixture-taihu-classic.png'), fullPage: true });
  const sceneResources = await page.locator('[data-scene-art] image, image[data-scene-art]').evaluateAll(images => images.map(image => image.getAttribute('href')));
  assert.ok(sceneResources.some(resource => resource?.endsWith('art/inkwash/taihu-v1.svg')));
  assert.equal(await page.locator('[data-classic-source="1.1.1"]').count(), 1);
  checked('P06', 'Separate schema-validated fixture renders bundled Taihu SVG with the restored classic character');
  await page.getByRole('button', { name: '专注计划', exact: true }).click();
  await page.getByRole('button', { name: '继续专注', exact: true }).click();
  await waitForSnapshot(page, state => state.focus.plan?.status === 'running');
  await page.clock.runFor(5250);
  const focused = await waitForSnapshot(page, state => state.focus.plan === null && state.focus.completedPlanIds.length === 4);
  assert.equal(focused.baitCount, fixture.baitCount + 1); assert.equal(focused.freeTravelTickets, 1);
  assert.deepEqual(focused.focus.days[dayKey], { completedCount: 4, ticketGranted: true });
  await page.screenshot({ path: path.join(runDirectory, 'fixture-focus-rewards.png'), fullPage: true });
  checked('P07', 'Near-complete fourth-plan fixture resumes through UI and awards one bait pack plus one daily ticket exactly once');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '渔具店', exact: true }).click();
  await page.getByRole('button', { name: '渔具与鱼饵', exact: true }).click();
  await page.getByRole('button', { name: '购买15次 · ¥450', exact: true }).click();
  const purchased = await waitForSnapshot(page, state => state.activePass.remaining === 15);
  assert.equal(purchased.coins, fixture.coins - 450);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /主动抛竿/ }).click();
  let casting = await waitForSnapshot(page, state => state.fishing.phase === 'casting');
  const activeAttemptId = casting.fishing.attempt.id;
  for (let swing = 0; swing < 3 && casting.fishing.phase === 'casting'; swing++) {
    const previous = casting.fishing.attempt.completedSwings;
    assert.equal(casting.activePass.remaining, 15, 'Empty swings must not consume charges');
    await page.clock.setSystemTime(casting.fishing.attempt.nextSwingAtMs + 1);
    await page.clock.runFor(275);
    casting = await waitForSnapshot(page, (state, previous) => state.fishing.phase === 'gauge'
      || state.fishing.attempt.completedSwings > previous, previous);
  }
  assert.equal(casting.fishing.phase, 'gauge'); assert.equal(casting.activePass.remaining, 14);
  await page.clock.runFor(700);
  await page.getByRole('region', { name: '主动收鱼进度条', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.hasFocus()), true, 'Keyboard smoke requires the game to have focus');
  await page.screenshot({ path: path.join(runDirectory, 'fixture-active-green.png'), fullPage: true });
  await page.keyboard.press('z');
  const activeResult = await waitForSnapshot(page, (state, id) => state.fishing.lastResult?.attemptId === id, activeAttemptId);
  assert.equal(activeResult.fishing.lastResult.success, true, 'A green stop must produce a fish');
  assert.equal(activeResult.fishing.lastResult.kind, 'fish'); assert.equal(activeResult.bucket.length, 1);
  assert.equal(activeResult.activePass.remaining, 14);
  assert.equal(activeResult.baitCount, focused.baitCount); assert.equal(activeResult.baitLeft, focused.baitLeft);
  await page.getByRole('button', { name: '停止钓鱼', exact: true }).click();
  await waitForSnapshot(page, state => state.fishing.mode === 'stopped');
  checked('P08', 'UI purchases 15 active chances; empty swings are free, gauge deducts one, a focused keyboard green stop catches a fish without consuming bait');
  await closeWindowAndVerifyExit();
  const completedFixture = await loadDiskSnapshot();
  page = await launch();
  assert.deepEqual(await snapshot(page), completedFixture);
  assert.equal(completedFixture.focus.completedPlanIds.length, 4);
  assert.equal(completedFixture.baitCount, fixture.baitCount + 1); assert.equal(completedFixture.freeTravelTickets, 1);
  await closeWindowAndVerifyExit();
  checked('P09', 'Restart preserves active charges, focus completion and ticket without repeating rewards');
  assert.deepEqual(report.consoleErrors, []);
  report.saved = { firstRevision: initial.revision, caughtRevision: caught.revision, finalRevision: sold.revision, finalCoins: sold.coins };
  report.passed = report.harnessSelfTest !== true;
}

overallWatchdog = setTimeout(() => fatalFailure('TEST_TIMEOUT', new Error('Packaged EXE smoke exceeded its 180-second overall deadline')), 180000);
run().catch((error) => {
  report.passed = false;
  report.error ||= errorText(error);
  if (currentLaunch && !currentLaunch.runtime) currentLaunch.failure = { kind: 'LAUNCH_REJECTED', error: errorText(error) };
  process.exitCode = 1;
}).then(() => finalize()).then(() => {
  // Playwright may retain its transport after an early launch failure. A complete
  // report is on disk, so do not let that orphaned transport hang the test runner.
  process.exit(report.passed ? 0 : 1);
}).catch((error) => fatalFailure('FINALIZATION_FAILED', error));
// Evidence and this test's profile are deliberately preserved. Never touch the real player profile.
