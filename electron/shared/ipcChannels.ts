/** The only IPC channel names the application uses (main ⇄ preload). */
export const IPC_CHANNELS = {
  store: {
    get: 'store:get',
    set: 'store:set',
    delete: 'store:delete',
  },
  database: {
    query: 'db:query',
    get: 'db:get',
    run: 'db:run',
    transaction: 'db:transaction',
    info: 'db:info',
  },
  printer: {
    printReceipt: 'print:receipt',
    printReport: 'print:report',
    printKOT: 'print:kot',
    savePdf: 'print:save-pdf',
    getPrinters: 'print:get-printers',
  },
  data: {
    exportBackup: 'data:export-backup',
    pickImport: 'data:pick-import',
    applyImport: 'data:apply-import',
    saveFile: 'data:save-file',
    resetDemo: 'data:reset-demo',
    generateMore: 'data:generate-more',
    clearLocal: 'data:clear-local',
  },
  app: {
    getVersion: 'app:get-version',
    getInfo: 'app:get-info',
    setNativeTheme: 'app:set-native-theme',
    toggleFullscreen: 'app:toggle-fullscreen',
    openDataFolder: 'app:open-data-folder',
    relaunch: 'app:relaunch',
    quit: 'app:quit',
  },
} as const;

/** electron-store keys the renderer may read/write. */
export const DEVICE_STORE_KEYS = ['device', 'session', 'posDraft'] as const;
export type DeviceStoreKey = (typeof DEVICE_STORE_KEYS)[number];
