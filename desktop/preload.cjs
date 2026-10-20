const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, value) {
  const response = await ipcRenderer.invoke(channel, value);
  if (!response?.ok) {
    const error = new Error(response?.error?.message || '桌面操作未完成。');
    error.code = response?.error?.code || 'DESKTOP_OPERATION_FAILED';
    throw error;
  }
  return response.value;
}

contextBridge.exposeInMainWorld('pondDesktop', Object.freeze({
  loadSave: () => invoke('pond:load-save'),
  saveGame: (snapshot) => invoke('pond:save-game', snapshot),
  exportSave: (snapshot) => invoke('pond:export-save', snapshot),
  importSave: () => invoke('pond:import-save'),
  getAppInfo: () => invoke('pond:app-info'),
  windowAction: (action) => invoke('pond:window-action', action),
  requestEnvironment: (url) => invoke('pond:environment', url),
}));
