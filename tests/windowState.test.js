import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { normalizeWindowState, resolveWindowPlacement, createWindowStateRepository } = require('../desktop/windowState.cjs');
const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const state = (extra = {}) => ({ version: 1, sizePreset: 'compact', x: 100, y: 150, ...extra });

test('widget defaults to a compact preset at the work-area lower right', () => {
  assert.deepEqual(resolveWindowPlacement(null, [primary]), {
    sizePreset: 'compact', bounds: { x: 1476, y: 666, width: 420, height: 350 },
  });
  assert.deepEqual(resolveWindowPlacement(state(), [primary], { sizePreset: 'comfortable' }), {
    sizePreset: 'comfortable', bounds: { x: 100, y: 150, width: 640, height: 490 },
  });
});

test('restored position stays on a secondary display, including negative coordinates', () => {
  const left = { x: -1280, y: -100, width: 1280, height: 924 };
  assert.deepEqual(resolveWindowPlacement(state({ x: -1000, y: 20 }), [primary, left]).bounds,
    { x: -1000, y: 20, width: 420, height: 350 });
});

test('removed displays and resolution changes clamp the whole widget into a remaining work area', () => {
  assert.deepEqual(resolveWindowPlacement(state({ x: -1000, y: 20 }), [primary]).bounds,
    { x: 0, y: 20, width: 420, height: 350 });
  const reduced = { x: 0, y: 0, width: 800, height: 560 };
  assert.deepEqual(resolveWindowPlacement(state({ sizePreset: 'comfortable', x: 1500, y: 900 }), [reduced]).bounds,
    { x: 160, y: 70, width: 640, height: 490 });
  const tiny = { x: -10, y: 30, width: 300, height: 240 };
  assert.deepEqual(resolveWindowPlacement(state({ sizePreset: 'comfortable' }), [tiny]), {
    sizePreset: 'comfortable', bounds: { x: -10, y: 30, width: 300, height: 240 },
  });
});

test('reset returns to the primary lower right and keeps the selected size', () => {
  assert.deepEqual(resolveWindowPlacement(state({ sizePreset: 'comfortable', x: -800 }), [primary], { resetPosition: true }), {
    sizePreset: 'comfortable', bounds: { x: 1256, y: 526, width: 640, height: 490 },
  });
});

test('window state strips game fields and rejects corrupt coordinates and arbitrary dimensions', () => {
  assert.deepEqual(normalizeWindowState(state({ coins: 9999, bucket: ['fish'], width: 9000 })), state());
  for (const bad of [null, {}, state({ version: 2 }), state({ sizePreset: 'huge' }),
    state({ x: NaN }), state({ x: '1' }), state({ y: Infinity }), state({ x: 1000001 })]) {
    assert.equal(normalizeWindowState(bad), null);
    assert.equal(resolveWindowPlacement(bad, [primary]).sizePreset, 'compact');
  }
});

async function setup(t) {
  const temporaryRoot = path.resolve('tests', '.tmp');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'pondclock-window-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith('pondclock-window-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('debounced placement flush persists only the latest layout, independently of game saves', async (t) => {
  const directory = await setup(t);
  const repository = createWindowStateRepository({ directory, debounceMs: 10000 });
  assert.equal(await repository.load(), null);
  assert.equal(repository.schedule(state({ x: 200, coins: 999 })), true);
  assert.equal(repository.schedule(state({ x: 300, sizePreset: 'comfortable' })), true);
  assert.equal(await repository.flush(), true);
  assert.deepEqual(await createWindowStateRepository({ directory }).load(), state({ x: 300, sizePreset: 'comfortable' }));
  assert.deepEqual(await fs.readdir(directory), ['window-state.json']);
});

test('concurrent flushes are serialized and the most recent position wins', async (t) => {
  const directory = await setup(t);
  const repository = createWindowStateRepository({ directory, debounceMs: 10000 });
  repository.schedule(state({ x: 200 }));
  const first = repository.flush();
  repository.schedule(state({ x: 300 }));
  const second = repository.flush();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal((await repository.load()).x, 300);
});

test('corrupt or excessive layout files reset without affecting the game', async (t) => {
  const directory = await setup(t);
  const repository = createWindowStateRepository({ directory });
  const filename = path.join(directory, 'window-state.json');
  await fs.writeFile(filename, '{broken');
  assert.equal(await repository.load(), null);
  await fs.writeFile(filename, ' '.repeat(4097));
  assert.equal(await repository.load(), null);
});

test('unwritable layout storage never rejects and can recover for later changes', async () => {
  let denied = true;
  let stored;
  const fileSystem = {
    mkdir: async () => { if (denied) throw Object.assign(new Error(), { code: 'EACCES' }); },
    writeFile: async (_filename, content) => { stored = content; },
    rename: async () => {}, unlink: async () => {},
  };
  const repository = createWindowStateRepository({ directory: 'unused', fileSystem, debounceMs: 10000,
    onError: () => { throw new Error('Logging also failed'); } });
  repository.schedule(state());
  assert.equal(await repository.flush(), false);
  denied = false;
  repository.schedule(state({ x: 400 }));
  assert.equal(await repository.flush(), true);
  assert.equal(JSON.parse(stored).x, 400);
});

test('preload preserves validated HTTP backoff metadata and strips malformed numbers', async () => {
  let bridge;
  let response;
  const source = await fs.readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(source, { require: () => ({
    contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
    ipcRenderer: { invoke: async () => response },
  }) });
  response = { ok: false, error: { code: 'ENV_HTTP_ERROR', message: 'limited', status: 429, retryAtMs: 1900000000000 } };
  await assert.rejects(bridge.requestEnvironment('https://example.invalid'), (error) =>
    error.code === 'ENV_HTTP_ERROR' && error.status === 429 && error.retryAtMs === 1900000000000);
  for (const [status, retryAtMs] of [['429', '1900000000000'], [Infinity, NaN], [999, -1], [429.5, Number.MAX_VALUE]]) {
    response = { ok: false, error: { status, retryAtMs } };
    await assert.rejects(bridge.requestEnvironment('https://example.invalid'), (error) =>
      !Object.hasOwn(error, 'status') && !Object.hasOwn(error, 'retryAtMs'));
  }
});

test('main-process widget options and IPC actions preserve the sandbox, saved pin setting and exit drain', async (t) => {
  const directory = await setup(t);
  const filename = fileURLToPath(new URL('../desktop/main.cjs', import.meta.url));
  const mainRequire = createRequire(filename);
  const handlers = new Map();
  let actualWindow;
  let fetchError = Object.assign(new Error('limited'), { code: 'ENV_HTTP_ERROR', status: 429, retryAtMs: 1900000000000 });
  let quitAttempts = 0;
  const app = Object.assign(new EventEmitter(), {
    setName: () => {}, setPath: () => {}, setAppUserModelId: () => {},
    getPath: () => directory, getVersion: () => 'widget-test', isPackaged: false,
    commandLine: { getSwitchValue: () => directory, hasSwitch: () => false },
    requestSingleInstanceLock: () => true, whenReady: async () => {},
    quit: () => { quitAttempts++; app.emit('before-quit', { preventDefault: () => {} }); },
    exit: () => {},
  });
  class FakeWindow extends EventEmitter {
    constructor(options) {
      // Reproduce the observed native constructor style adjustment; main must
      // explicitly calibrate to the configured preset after construction.
      super(); this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width + 4, height: options.height + 4 };
      this.pinned = options.alwaysOnTop;
      this.webContents = Object.assign(new EventEmitter(), { mainFrame: { url: '' }, setWindowOpenHandler: () => {} });
      actualWindow = this;
    }
    setMenu(value) { this.menu = value; }
    getBounds() { return { ...this.bounds }; }
    getNormalBounds() { return { ...this.bounds }; }
    setBounds(bounds) { this.bounds = { ...bounds }; this.emit('move'); }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized || false; }
    isAlwaysOnTop() { return this.pinned; }
    setAlwaysOnTop(value) { this.pinned = value; }
    minimize() { this.minimized = true; }
    restore() { this.minimized = false; }
    show() { this.visible = true; }
    focus() {}
    async loadURL(url) { this.webContents.mainFrame.url = url; this.emit('ready-to-show'); }
  }
  const screen = Object.assign(new EventEmitter(), {
    getPrimaryDisplay: () => ({ id: 1, workArea: primary }),
    getAllDisplays: () => [{ id: 1, workArea: primary }],
  });
  const electron = { app, BrowserWindow: FakeWindow, screen,
    Menu: { setApplicationMenu: (value) => { assert.equal(value, null); } },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: { showErrorBox: (_title, message) => { assert.fail(message); } },
    net: {}, session: { fromPartition: (partition, options) => {
      assert.equal(partition, 'pondclock-location');
      assert.equal(options.cache, false);
      return {};
    }, defaultSession: { setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {},
      webRequest: { onHeadersReceived: () => {} } } },
  };
  const fakeRequire = (id) => {
    if (id === 'electron') return electron;
    if (id === 'node:fs/promises') return { ...fs, access: async () => {} };
    if (id === './saveRepository.cjs') return { MAX_SAVE_BYTES: 16777216, createSaveRepository: () => ({
      load: async () => ({ snapshot: { settings: { alwaysOnTop: false } } }),
    }) };
    if (id === './environment.cjs') return { requestEnvironment: async () => { throw fetchError; } };
    return mainRequire(id);
  };
  vm.runInNewContext(await fs.readFile(filename, 'utf8'), {
    require: fakeRequire, __dirname: path.dirname(filename), URL,
    process: { ...process, env: { ...process.env, POND_DEV_SERVER_URL: undefined } },
  }, { filename, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  for (let attempt = 0; attempt < 100 && !actualWindow?.visible; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(actualWindow?.visible, 'main creates and shows its mocked native window');
  assert.equal(actualWindow.options.frame, false);
  assert.equal(actualWindow.options.thickFrame, false);
  assert.equal(actualWindow.options.hasShadow, false);
  assert.equal(actualWindow.options.transparent, true);
  assert.equal(actualWindow.options.backgroundColor, '#00000000');
  assert.equal(actualWindow.options.resizable, false);
  assert.equal(actualWindow.options.skipTaskbar, false);
  assert.equal(actualWindow.options.webPreferences.sandbox, true);
  assert.equal(actualWindow.options.webPreferences.contextIsolation, true);
  assert.equal(actualWindow.options.webPreferences.nodeIntegration, false);
  assert.equal(actualWindow.bounds.width, 420, 'post-constructor calibration restores the configured width');
  assert.equal(actualWindow.bounds.height, 350, 'post-constructor calibration restores the configured height');
  assert.equal(actualWindow.pinned, false, 'existing game setting has priority over new defaults');
  const event = { sender: actualWindow.webContents, senderFrame: actualWindow.webContents.mainFrame };
  const action = async (value) => (await handlers.get('pond:window-action')(event, value)).value;
  assert.equal((await action('comfortable')).sizePreset, 'comfortable');
  assert.equal(actualWindow.bounds.width, 640);
  assert.equal((await action('compact')).sizePreset, 'compact');
  assert.equal(actualWindow.bounds.width, 420);
  assert.equal((await action('alwaysOnTop:on')).alwaysOnTop, true);
  await action('minimize');
  assert.equal(actualWindow.isMinimized(), true);
  app.emit('second-instance');
  assert.equal(actualWindow.isMinimized(), false, 'task entry can restore a minimized widget');
  const info = (await handlers.get('pond:app-info')(event)).value;
  assert.equal(info.widgetMode, true);
  assert.equal(info.sizePreset, 'compact');
  const failure = await handlers.get('pond:environment')(event, 'unused');
  assert.equal(failure.error.status, 429);
  assert.equal(failure.error.retryAtMs, 1900000000000);
  fetchError = Object.assign(new Error('invalid'), { status: '429', retryAtMs: Infinity });
  const invalid = await handlers.get('pond:environment')(event, 'unused');
  assert.equal(Object.hasOwn(invalid.error, 'status'), false);
  assert.equal(Object.hasOwn(invalid.error, 'retryAtMs'), false);
  actualWindow.bounds = { x: 600, y: 500, width: 420, height: 350 };
  actualWindow.emit('move');
  await action('close');
  for (let attempt = 0; attempt < 100 && quitAttempts < 2; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(quitAttempts, 2, 'close waits for drain and then really quits');
  const saved = JSON.parse(await fs.readFile(path.join(directory, 'window-state.json'), 'utf8'));
  assert.equal(saved.x, 600);
  assert.equal(saved.y, 500);
});
