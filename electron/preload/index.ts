import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import type { ElectronAPI } from '../types/electron';

/* ==========================================================================
   Preload (sandboxed). Exposes a small, typed API on window.electronAPI.
   The renderer never receives ipcRenderer, Node's `process`, `require`, the
   filesystem or any Electron module.
   ========================================================================== */

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api: ElectronAPI = {
  store: {
    get: (key) => invoke(IPC_CHANNELS.store.get, key),
    set: (key, value) => invoke(IPC_CHANNELS.store.set, key, value),
    delete: (key) => invoke(IPC_CHANNELS.store.delete, key),
  },
  database: {
    query: (sql, params) => invoke(IPC_CHANNELS.database.query, sql, params ?? []),
    get: (sql, params) => invoke(IPC_CHANNELS.database.get, sql, params ?? []),
    run: (sql, params) => invoke(IPC_CHANNELS.database.run, sql, params ?? []),
    transaction: (statements) => invoke(IPC_CHANNELS.database.transaction, statements),
    info: () => invoke(IPC_CHANNELS.database.info),
  },
  printer: {
    printReceipt: (html, options) => invoke(IPC_CHANNELS.printer.printReceipt, html, options),
    printReport: (html, options) => invoke(IPC_CHANNELS.printer.printReport, html, options),
    printKOT: (html, options) => invoke(IPC_CHANNELS.printer.printKOT, html, options),
    savePdf: (html, options) => invoke(IPC_CHANNELS.printer.savePdf, html, options),
    getPrinters: () => invoke(IPC_CHANNELS.printer.getPrinters),
  },
  data: {
    exportBackup: () => invoke(IPC_CHANNELS.data.exportBackup),
    pickImport: () => invoke(IPC_CHANNELS.data.pickImport),
    applyImport: (token) => invoke(IPC_CHANNELS.data.applyImport, token),
    saveFile: (fileName, content, kind) => invoke(IPC_CHANNELS.data.saveFile, fileName, content, kind),
    resetDemo: () => invoke(IPC_CHANNELS.data.resetDemo),
    generateMore: () => invoke(IPC_CHANNELS.data.generateMore),
    clearLocal: () => invoke(IPC_CHANNELS.data.clearLocal),
  },
  app: {
    getVersion: () => invoke(IPC_CHANNELS.app.getVersion),
    getInfo: () => invoke(IPC_CHANNELS.app.getInfo),
    setNativeTheme: (theme) => invoke(IPC_CHANNELS.app.setNativeTheme, theme),
    toggleFullscreen: () => invoke(IPC_CHANNELS.app.toggleFullscreen),
    openDataFolder: () => invoke(IPC_CHANNELS.app.openDataFolder),
    relaunch: () => invoke(IPC_CHANNELS.app.relaunch),
    quit: () => invoke(IPC_CHANNELS.app.quit),
  },
};

contextBridge.exposeInMainWorld('electronAPI', Object.freeze(api));
