const { app, BrowserWindow, Menu, ipcMain, dialog, session, net } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSaveRepository, MAX_SAVE_BYTES } = require('./saveRepository.cjs');
const { requestEnvironment } = require('./environment.cjs');

const APP_ID = 'cn.pondclock.desktop';
app.setName('PondClock');
// Keep this stable across package versions, architecture and install locations.
const developmentUserData = !app.isPackaged && app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', developmentUserData
  ? path.resolve(developmentUserData)
  : path.join(app.getPath('appData'), 'PondClock'));
app.setAppUserModelId(APP_ID);

let window;
let quitting = false;
let repository;
let validateSave;
let documentUrl;

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
      return { ok: false, error: { code: error.code || 'DESKTOP_OPERATION_FAILED', message: error.message } };
    }
  });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '最小化', click: () => window?.minimize() },
      { type: 'separator' },
      { label: '退出水塘时钟', accelerator: 'Alt+F4', click: () => app.quit() },
    ] },
    { label: '窗口', submenu: [
      { label: '总在最前', type: 'checkbox', checked: window?.isAlwaysOnTop() ?? false,
        click: (item) => window?.setAlwaysOnTop(item.checked) },
      { role: 'resetZoom', label: '恢复缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
    ] },
  ]));
}

function registerHandlers() {
  handle('pond:load-save', () => repository.load());
  handle('pond:save-game', (snapshot) => repository.save(snapshot));
  handle('pond:export-save', async (input) => {
    const snapshot = validateSave(input);
    const result = await dialog.showSaveDialog(window, {
      title: '导出水塘时钟存档', defaultPath: `PondClock-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: '水塘时钟 JSON 存档', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (Buffer.byteLength(json) > MAX_SAVE_BYTES) throw new Error('导出存档超过大小上限。');
    await fs.writeFile(result.filePath, json, { encoding: 'utf8', mode: 0o600 });
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
    return { canceled: false, ...(await repository.importSnapshot(snapshot)) };
  });
  handle('pond:app-info', () => ({
    name: 'PondClock', displayName: '水塘时钟', version: app.getVersion(),
    platform: process.platform, packaged: app.isPackaged, alwaysOnTop: window.isAlwaysOnTop(),
  }));
  handle('pond:window-action', (action) => {
    if (action === 'minimize' || action === 'close') window.minimize();
    else if (action === 'toggleAlwaysOnTop') { window.setAlwaysOnTop(!window.isAlwaysOnTop()); buildMenu(); }
    else if (action === 'alwaysOnTop:on' || action === 'alwaysOnTop:off') {
      window.setAlwaysOnTop(action === 'alwaysOnTop:on'); buildMenu();
    }
    else if (action === 'quit') app.quit();
    else throw new Error('不支持此窗口操作。');
    return { alwaysOnTop: window?.isAlwaysOnTop() ?? false };
  });
  handle('pond:environment', (url) => requestEnvironment(url, (input, init) => net.fetch(input, init)));
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
  const initialAlwaysOnTop = await repository.load().then((loaded) => loaded.snapshot?.settings?.alwaysOnTop === true).catch(() => false);
  window = new BrowserWindow({
    width: 920, height: 760, minWidth: 700, minHeight: 560,
    title: '水塘时钟', backgroundColor: '#020817', show: false, alwaysOnTop: initialAlwaysOnTop,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== documentUrl) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('close', (event) => { if (!quitting) { event.preventDefault(); window.minimize(); } });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
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
  buildMenu();
  await window.loadURL(documentUrl);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { window.restore(); window.show(); window.focus(); } });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    ({ validateSave } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'domain', 'saveSchema.js')).href));
    repository = createSaveRepository({ directory: path.join(app.getPath('userData'), 'saves'), validate: validateSave });
    registerHandlers();
    await createWindow();
  }).catch((error) => {
    dialog.showErrorBox('水塘时钟启动失败', `${error.message}\n请确认桌面资源完整，或重新安装应用。`);
    app.exit(1);
  });
}
