const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');
const root = path.resolve(__dirname, '..');
async function run() {
  const archive = path.join(root, 'test-results', 'installed-PondClock', 'resources', 'app.asar');
  await fs.access(archive);
  const profile = await fs.mkdtemp(path.join(root, 'test-results', 'installed-profile-'));
  const report = { passed: false, hostSandboxEnabled: false,
    scope: 'Actual NSIS-installed app.asar under the identical developer Electron runtime; isolated profile, external network blocked. Not a normal sandbox launch of the packaged EXE.' };
  let application;
  try {
    application = await electron.launch({ executablePath: require('electron'),
      args: [archive, `--user-data-dir=${profile}`, '--no-sandbox', '--proxy-server=http://127.0.0.1:1'],
      cwd: root, env: { ...process.env, POND_DEV_SERVER_URL: '' }, timeout: 30000 });
    await application.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_request, callback) => callback({ cancel: true }));
    });
    assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), profile);
    assert.equal(await application.evaluate(({ app }) => app.getAppPath()), archive);
    const page = await application.firstWindow();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.getByRole('button', { name: /鱼篓/ }).waitFor({ timeout: 15000 });
    const saved = await page.evaluate(() => window.pondDesktop.loadSave());
    assert.equal(saved.snapshot.coins, 100);
    assert.equal(saved.snapshot.unlockedRegions.length, 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(root, 'test-results', 'installed-app.png'), fullPage: true });
    report.passed = true;
    report.initialSave = { coins: saved.snapshot.coins, revision: saved.snapshot.revision };
  } catch (error) { report.error = error.stack; process.exitCode = 1; }
  finally {
    if (application) await application.close();
    await fs.writeFile(path.join(root, 'test-results', 'installed-smoke.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
