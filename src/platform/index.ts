import { AppError } from '@/domain/errors';
import type { ElectronAPI } from '../../electron/types/electron';

/* ==========================================================================
   The platform bridge.

   The app ships in two runtimes: the Electron desktop app, where the bridge
   is the sandboxed preload script on window.electronAPI, and the browser,
   where it is the web implementation in ./web (SQLite compiled to WASM in a
   worker, localStorage, the browser's print dialog and file downloads).

   Both expose the same interface, so nothing above this module — no service,
   store, repository or screen — knows which one it is talking to. Use
   isDesktop() only for things a browser genuinely cannot do: naming a
   printer, revealing the data folder, quitting the process.
   ========================================================================== */

export type { ElectronAPI, DeviceStoreSchema, SeedResult } from '../../electron/types/electron';

export type PlatformKind = 'desktop' | 'web';

let api: ElectronAPI | null = null;
let kind: PlatformKind = 'web';
let storagePersistent = true;

export function installPlatform(implementation: ElectronAPI, platform: PlatformKind): void {
  api = implementation;
  kind = platform;
}

export function hasPlatform(): boolean {
  return api !== null;
}

/** The desktop app's preload bridge, if this is running inside Electron. */
export function detectDesktopAPI(): ElectronAPI | undefined {
  return typeof window === 'undefined' ? undefined : window.electronAPI;
}

export function isDesktop(): boolean {
  return kind === 'desktop';
}

export function platformKind(): PlatformKind {
  return kind;
}

/**
 * False when the browser refused durable storage (a private window, or one
 * without OPFS): the shop lives in memory and is lost when the tab closes.
 * Always true on the desktop, which owns a real file.
 */
export function isStoragePersistent(): boolean {
  return storagePersistent;
}

export function setStoragePersistent(value: boolean): void {
  storagePersistent = value;
}

export function getPlatformAPI(): ElectronAPI {
  if (!api) throw new AppError('desktopOnly');
  return api;
}
