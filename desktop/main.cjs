const { app, BrowserWindow, Menu, ipcMain, dialog, session, net, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSaveRepository, MAX_SAVE_BYTES } = require('./saveRepository.cjs');
const { requestEnvironment } = require('./environment.cjs');
const { createGeoNetworkFetch } = require('./environmentNetwork.cjs');
const { isGeoUrl } = require('../src/config/environmentEndpoints.cjs');
const { resolveUserDataDirectory, createShutdownController, createStartupGuard, startupLogRecord } = require('./lifecycle.cjs');
const { createWindowStateRepository, resolveWindowPlacement } = require('./windowState.cjs');

const APP_ID = 'cn.pondclock.desktop';
app.setName('PondClock');
// Keep this stable across package versions, architecture and install locations.
// An explicit, fully qualified CLI profile also permits isolated verification of
// the real packaged EXE. The renderer has no API to select a filesystem path.
let startupPathError;
let userDataDirectory = path.join(app.getPath('appData'), 'PondClock');
try {
  userDataDirectory = resolveUserDataDirectory(app.commandLine.getSwitchValue('user-data-dir'), userDataDirectory);
} catch (error) { startupPathError = error; }
app.setPath('userData', userDataDirectory);
app.setAppUserModelId(APP_ID);

let window;
let repository;
let validateSave;
let documentUrl;
let startupGuard;
let startupFailurePending = false;
let windowStateRepository;
let sizePreset = 'compact';
let defaultAlwaysOnTop = false;
const startupLogPath = path.join(userDataDirectory, 'logs', 'startup.log');

async function writeStartupLog(event, error) {
  try {
    await fs.mkdir(path.dirname(startupLogPath), { recursive: true });
    await fs.appendFile(startupLogPath, `${startupLogRecord(event, error)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch { /* A read-only or unavailable log directory must not leave an invisible app. */ }
}

const shutdown = createShutdownController({
  finish: (code) => { if (code) app.exit(code); else app.quit(); },
  onWriteFailure: (error) => writeStartupLog('SHUTDOWN_SAVE_FAILED', error),
});

function workAreas() {
  const primary = screen.getPrimaryDisplay();
  return [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)]
    .map((display) => display.workArea);
}

function rememberWindowBounds() {
  if (!window || window.isDestroyed() || window.isMinimized() || shutdown.isQuitting()) return;
  const bounds = window.getBounds();
  windowStateRepository?.schedule({ version: 1, sizePreset, x: bounds.x, y: bounds.y });
}

function applyWindowPlacement(options = {}) {
  if (!window || window.isDestroyed() || shutdown.isQuitting()) return;
  const current = window.getNormalBounds();
  const placement = resolveWindowPlacement({ version: 1, sizePreset, x: current.x, y: current.y }, workAreas(), options);
  sizePreset = placement.sizePreset;
  if (Object.keys(placement.bounds).some((key) => placement.bounds[key] !== current[key])) {
    window.setBounds(placement.bounds);
  }
  rememberWindowBounds();
}

function requestApplicationQuit(options) {
  if (!shutdown.isQuitting()) {
    rememberWindowBounds();
    if (windowStateRepository) void shutdown.runWrite(() => windowStateRepository.flush()).catch(() => {});
  }
  return shutdown.requestQuit(options);
}

async function failStartup(reason, error) {
  if (startupFailurePending || shutdown.isQuitting()) return;
  startupFailurePending = true;
  await writeStartupLog(reason, error);
  try {
    dialog.showErrorBox('水塘时钟启动失败',
      `应用窗口未能正常运行，关闭此提示后程序将退出。\n请重新打开或重新安装应用。\n诊断记录：${startupLogPath}`);
  } catch { /* Exit also when the operating system cannot display an error dialog. */
  } finally { await requestApplicationQuit({ code: 1 }); }
}

function trustedFrame(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url.split('#')[0] !== documentUrl) {
    throw new Error('拒绝来自非应用页面的请求。');
  }
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, input) => {
    try {
      trustedFrame(event);
      return { ok: true, value: await action(input) };
    } catch (error) {
      const details = { code: error?.code || 'DESKTOP_OPERATION_FAILED', message: error?.message || '桌面操作未完成。' };
      if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) details.status = error.status;
      if (Number.isSafeInteger(error?.retryAtMs) && error.retryAtMs > 0) details.retryAtMs = error.retryAtMs;
      return { ok: false, error: details };
    }
  });
}

function windowInfo() {
  return { widgetMode: true, sizePreset, alwaysOnTop: window?.isAlwaysOnTop() ?? false };
}

function registerHandlers() {
  const fetchGeoNetwork = createGeoNetworkFetch(session.fromPartition('pondclock-location', { cache: false }));
  handle('pond:load-save', () => repository.load());
  handle('pond:save-game', (snapshot) => shutdown.runWrite(() => repository.save(snapshot)));
  handle('pond:export-save', async (input) => {
    const snapshot = validateSave(input);
    const result = await dialog.showSaveDialog(window, {
      title: '导出水塘时钟存档', defaultPath: `PondClock-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: '水塘时钟 JSON 存档', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('导出存档超过大小上限。');
    await shutdown.runWrite(() => fs.writeFile(result.filePath, json, { encoding: 'utf8', mode: 0o600 }));
    return { canceled: false };
  });
  handle('pond:import-save', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '导入水塘时钟存档', properties: ['openFile'],
      filters: [{ name: '水塘时钟 JSON 存档', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filename = result.filePaths[0];
    const stat = await fs.stat(filename);
    if (stat.size > MAX_SAVE_BYTES) throw new Error('导入存档超过 16 MB 大小上限。');
    const snapshot = validateSave(JSON.parse(await fs.readFile(filename, 'utf8')));
    const confirmation = await dialog.showMessageBox(window, {
      type: 'question', title: '替换当前进度',
      message: '导入此存档并替换当前进度？',
      detail: '当前有效存档会保留在备用槽；损坏存档会先复制备份。',
      buttons: ['取消', '导入'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (confirmation.response !== 1) return { canceled: true };
    return { canceled: false, ...(await shutdown.runWrite(() => repository.importSnapshot(snapshot))) };
  });
  handle('pond:app-info', () => ({
    name: 'PondClock', displayName: '水塘时钟', version: app.getVersion(),
    platform: process.platform, packaged: app.isPackaged, ...windowInfo(),
    execPath: process.execPath, userData: app.getPath('userData'),
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    noSandboxSwitch: app.commandLine.hasSwitch('no-sandbox'),
  }));
  handle('pond:window-action', (action) => {
    if (action === 'minimize') window.minimize();
    else if (action === 'close') app.quit();
    else if (action === 'toggleAlwaysOnTop') window.setAlwaysOnTop(!window.isAlwaysOnTop());
    else if (action === 'alwaysOnTop:on' || action === 'alwaysOnTop:off') {
      window.setAlwaysOnTop(action === 'alwaysOnTop:on');
    }
    else if (action === 'compact' || action === 'comfortable') applyWindowPlacement({ sizePreset: action });
    else if (action === 'resetPosition') applyWindowPlacement({ resetPosition: true });
    else if (action === 'quit') app.quit();
    else throw new Error('不支持此窗口操作。');
    return windowInfo();
  });
  handle('pond:environment', (url) => requestEnvironment(url, (input, init) =>
    isGeoUrl(input) ? fetchGeoNetwork(input, init) : net.fetch(input, init)));
}

async function createWindow() {
  const buildPath = path.join(__dirname, '..', 'build-desktop', 'index.html');
  documentUrl = pathToFileURL(buildPath).href;
  let devUrl;
  if (!app.isPackaged && process.env.POND_DEV_SERVER_URL) {
    devUrl = new URL(process.env.POND_DEV_SERVER_URL);
    if (!['http:', 'https:'].includes(devUrl.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(devUrl.hostname) || devUrl.username || devUrl.password) {
      throw new Error('开发服务器必须是本机回环地址。');
    }
    documentUrl = devUrl.href.split('#')[0];
  } else {
    await fs.access(buildPath);
  }
  const initialAlwaysOnTop = await repository.load().then((loaded) => {
    const stored = loaded.snapshot?.settings?.alwaysOnTop;
    return typeof stored === 'boolean' ? stored : defaultAlwaysOnTop;
  }).catch(() => defaultAlwaysOnTop);
  const placement = resolveWindowPlacement(await windowStateRepository.load(), workAreas());
  sizePreset = placement.sizePreset;
  if (shutdown.isQuitting() || startupFailurePending) return;
  window = new BrowserWindow({
    ...placement.bounds, frame: false, thickFrame: false, hasShadow: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, skipTaskbar: false, autoHideMenuBar: true,
    title: '水塘时钟', show: false, alwaysOnTop: initialAlwaysOnTop,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
      backgroundThrottling: false,
    },
  });
  // Windows can adjust the constructor bounds when applying fixed transparent
  // window styles. Calibrate once after those styles exist, using the preset.
  window.setBounds(placement.bounds);
  Menu.setApplicationMenu(null);
  window.setMenu(null);
  window.on('move', rememberWindowBounds);
  rememberWindowBounds();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== documentUrl) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('close', (event) => {
    if (!shutdown.isReady()) { event.preventDefault(); app.quit(); }
  });
  window.once('ready-to-show', () => startupGuard.ready());
  window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && !shutdown.isQuitting()) {
      startupGuard.fail('DOCUMENT_LOAD_FAILED', Object.assign(new Error(), { code: String(errorCode) }));
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    if (!shutdown.isQuitting()) {
      startupGuard.fail('RENDER_PROCESS_GONE', Object.assign(new Error(), { code: details.reason }));
    }
  });
  window.on('closed', () => { startupGuard.stop(); window = null; });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const connect = devUrl ? `${devUrl.origin} ws://localhost:* ws://127.0.0.1:*` : "'self'";
    callback({ responseHeaders: { ...details.responseHeaders,
      'Content-Security-Policy': [
        `default-src 'self'; script-src 'self'${devUrl ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src ${connect}; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`,
      ],
    } });
  });
  await window.loadURL(documentUrl);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  startupGuard = createStartupGuard({
    onReady: () => { if (!shutdown.isQuitting()) { window.show(); void writeStartupLog('WINDOW_READY'); } },
    onFailure: (reason, error) => { void failStartup(reason, error); },
  });
  app.on('second-instance', () => {
    if (window && !shutdown.isQuitting() && !startupFailurePending) { window.restore(); window.show(); window.focus(); }
  });
  app.on('before-quit', (event) => {
    if (shutdown.isReady()) return;
    event.preventDefault();
    startupGuard.stop();
    void requestApplicationQuit();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    if (startupPathError) throw startupPathError;
    if (shutdown.isQuitting() || startupFailurePending) return;
    await writeStartupLog('STARTUP_BEGIN');
    ({ validateSave } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'domain', 'saveSchema.js')).href));
    const storageConfig = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'config', 'storage.js')).href);
    defaultAlwaysOnTop = storageConfig.DEFAULT_SETTINGS?.alwaysOnTop === true;
    repository = createSaveRepository({ directory: path.join(app.getPath('userData'), 'saves'), validate: validateSave });
    windowStateRepository = createWindowStateRepository({ directory: app.getPath('userData'),
      onError: (error) => writeStartupLog('WINDOW_STATE_SAVE_FAILED', error) });
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(event, () => applyWindowPlacement());
    }
    registerHandlers();
    await createWindow();
  }).catch((error) => startupGuard.fail('STARTUP_FAILED', error));
}
