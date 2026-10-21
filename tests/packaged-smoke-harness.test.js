import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = path.join(root, 'tests', '.tmp');

for (const mode of ['unhandled-rejection', 'uncaught-exception', 'rejected-launch']) {
  test(`packaged smoke preserves ${mode} as failure without starting a GUI or hanging`, {
    skip: process.platform !== 'win32', timeout: 12000,
  }, async (t) => {
    await fs.mkdir(temporaryRoot, { recursive: true });
    const directory = await fs.mkdtemp(path.join(temporaryRoot, 'packaged-harness-'));
    t.after(async () => {
      assert.equal(path.dirname(directory), temporaryRoot);
      assert.ok(path.basename(directory).startsWith('packaged-harness-'));
      await fs.rm(directory, { recursive: true, force: true });
    });
    const fakeApp = path.join(directory, 'Fake App');
    await fs.mkdir(path.join(fakeApp, 'resources'), { recursive: true });
    const fakeExecutable = path.join(fakeApp, 'PondClock.exe');
    // These are data files. The injected module below never spawns them.
    await fs.writeFile(fakeExecutable, 'harness fixture, not an executable');
    await fs.writeFile(path.join(fakeApp, 'resources', 'app.asar'), 'harness fixture, not an archive');
    const preload = path.join(directory, 'inject-launch-failure.cjs');
    await fs.writeFile(preload, `const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'playwright-core') return { _electron: { launch() {
    const failure = new Error('Injected Playwright launch failure: ' + process.env.POND_HARNESS_FAILURE_MODE);
    if (process.env.POND_HARNESS_FAILURE_MODE === 'rejected-launch') return Promise.reject(failure);
    if (process.env.POND_HARNESS_FAILURE_MODE === 'uncaught-exception') setTimeout(() => { throw failure; }, 0);
    else queueMicrotask(() => { Promise.reject(failure); });
    return new Promise(() => {});
  } } };
  return originalLoad.call(this, request, parent, isMain);
};\n`);
    const started = Date.now();
    const result = await new Promise((resolve) => {
      execFile(process.execPath, ['--require', preload, path.join(root, 'scripts', 'smoke-packaged.cjs'), fakeExecutable], {
        cwd: root, windowsHide: true, timeout: 8000,
        env: { ...process.env, POND_PACKAGED_HARNESS_SELF_TEST: '1', POND_HARNESS_FAILURE_MODE: mode },
      }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    });
    assert.equal(result.error?.code, 1, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.error?.killed, false, 'The harness must exit itself before the outer test timeout');
    assert.ok(Date.now() - started < 8000);
    const printed = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const reportPath = printed.at(-1).report;
    assert.ok(reportPath);
    assert.equal(path.dirname(path.dirname(reportPath)), path.join(root, 'test-results'));
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.passed, false);
    assert.equal(report.harnessSelfTest, true);
    assert.equal(report.hostSandboxEnabled, true);
    assert.equal(report.checks.length, 0);
    assert.equal(report.launches.length, 1);
    assert.equal(report.launches[0].mainPid, undefined);
    assert.equal(report.launches[0].visibleWindowVerified, undefined);
    assert.match(report.error, new RegExp(`Injected Playwright launch failure: ${mode}`));
    assert.ok(report.finishedAt);
    assert.equal(report.cleanupErrors.length, 0);
    assert.equal(report.fatalEvents.length, mode === 'rejected-launch' ? 0 : 1);
    if (mode !== 'rejected-launch') {
      assert.equal(report.fatalEvents[0].kind, mode === 'unhandled-rejection' ? 'UNHANDLED_REJECTION' : 'UNCAUGHT_EXCEPTION');
    }
  });
}
