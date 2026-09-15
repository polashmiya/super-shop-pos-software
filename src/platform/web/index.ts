import { APP_CONFIG } from '@/config/app.config';
import type { AppInfo } from '@/types/print';
import type { ElectronAPI } from '../../../electron/types/electron';
import { createWebDatabaseClient, type WebDatabaseClient } from './db/client';
import type { DbOpenResult } from './db/protocol';
import { createWebData } from './data';
import { createWebPrinter } from './printing';
import { createWebDeviceStore } from './store';

/* ==========================================================================
   The browser build of the platform bridge.

   It implements exactly the interface the Electron preload script exposes,
   so every service, store and screen above it is unchanged: the repositories
   cannot tell whether a query crossed an IPC channel to node:sqlite or a
   postMessage to SQLite compiled to WebAssembly.
   ========================================================================== */

export interface WebPlatform {
  api: ElectronAPI;
  /** Opens (and on first visit seeds) the database. */
  start(): Promise<DbOpenResult>;
  /** False when this browser cannot store data — the UI warns the cashier. */
  isPersistent(): boolean;
}

function webAppInfo(): AppInfo {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const chrome = /Chrome\/([\d.]+)/.exec(agent)?.[1] ?? '';
  return {
    name: APP_CONFIG.name,
    version: APP_CONFIG.version,
    electron: '',
    chrome,
    node: '',
    platform: 'web',
    arch: '',
    userDataPath: 'browser storage',
    isPackaged: true,
  };
}

export function createWebPlatform(): WebPlatform {
  const db: WebDatabaseClient = createWebDatabaseClient();
  const store = createWebDeviceStore();
  let persistent = true;

  const markBackupDone = () => {
    void store.get('session').then((session) => store.set('session', { ...session, lastBackupAt: new Date().toISOString() } as never));
  };

  const api: ElectronAPI = {
    store,
    database: {
      query: (sql, params) => db.query(sql, params),
      get: (sql, params) => db.get(sql, params),
      run: (sql, params) => db.run(sql, params),
      transaction: (statements) => db.transaction(statements),
      info: () => db.info(),
    },
    printer: createWebPrinter(),
    data: createWebData(db, markBackupDone),
    app: {
      getVersion: () => Promise.resolve(APP_CONFIG.version),
      getInfo: () => Promise.resolve(webAppInfo()),
      // The browser follows the OS theme on its own; the app's own theme
      // tokens already applied by the time this is called.
      setNativeTheme: () => Promise.resolve(),
      toggleFullscreen: async () => {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          return false;
        }
        await document.documentElement.requestFullscreen();
        return true;
      },
      // No data folder to reveal and no process to restart or quit: the
      // browser owns the window. Reloading is the closest equivalent.
      openDataFolder: () => Promise.resolve(),
      relaunch: () => {
        globalThis.location.reload();
        return Promise.resolve();
      },
      quit: () => Promise.resolve(),
    },
  };

  return {
    api,
    async start() {
      const result = await db.open();
      persistent = result.persistent;
      return result;
    },
    isPersistent: () => persistent,
  };
}
