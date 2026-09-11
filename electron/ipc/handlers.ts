import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import type { PrintJobOptions, SavePdfOptions, SaveFileKind } from '@/types/print';
import type { PaperWidth, ThemeMode } from '@/types/settings';
import { toBridgeError } from '../database/bridge';
import { generateMoreDemoData, getDatabase, getDatabaseInfo, recreateDatabase } from '../database/connection';
import { applyImport, exportBackup, pickImport, saveExportFile, writeAutoBackup } from '../main/dataTransfer';
import { deleteDevice, readDevice, resetDeviceSession, writeDevice } from '../main/deviceStore';
import { logger } from '../main/logger';
import { assertTrustedSender } from '../main/security';
import { applyNativeTheme, toggleFullscreen } from '../main/windowManager';
import { getPrinters, printDocument, savePdf } from '../printing/printManager';
import { DEVICE_STORE_KEYS, IPC_CHANNELS, type DeviceStoreKey } from '../shared/ipcChannels';
import type { SeedResult } from '../types/electron';

/* ==========================================================================
   IPC handlers. Every handler checks the sender and validates every
   argument; the renderer is never trusted blindly.
   ========================================================================== */

type Handler = (...args: unknown[]) => unknown;

function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    assertTrustedSender(event);
    return handler(...args);
  });
}

function requireString(value: unknown, name: string, maxLength = 10_000): string {
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`Invalid ${name}`);
  return value;
}

function requireStoreKey(value: unknown): DeviceStoreKey {
  if (typeof value !== 'string' || !(DEVICE_STORE_KEYS as readonly string[]).includes(value)) throw new Error('Invalid store key');
  return value as DeviceStoreKey;
}

function requireTheme(value: unknown): ThemeMode {
  if (value !== 'dark' && value !== 'light' && value !== 'system') throw new Error('Invalid theme');
  return value;
}

function requirePaperWidth(value: unknown): PaperWidth {
  if (value !== '80mm' && value !== '58mm') throw new Error('Invalid paper width');
  return value;
}

function requirePrintOptions(value: unknown): PrintJobOptions {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid print options');
  const options = value as Record<string, unknown>;
  const page = options.page === 'a4' ? 'a4' : 'receipt';
  return {
    printerName: requireString(options.printerName ?? '', 'printer name', 300),
    copies: Math.min(Math.max(Math.trunc(Number(options.copies) || 1), 1), 5),
    paperWidth: requirePaperWidth(options.paperWidth ?? '80mm'),
    page,
    title: requireString(options.title ?? 'Document', 'title', 200),
    landscape: options.landscape === true,
  };
}

function requirePdfOptions(value: unknown): SavePdfOptions {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid PDF options');
  const options = value as Record<string, unknown>;
  return {
    fileName: requireString(options.fileName ?? 'document.pdf', 'file name', 200),
    paperWidth: requirePaperWidth(options.paperWidth ?? '80mm'),
    page: options.page === 'a4' ? 'a4' : 'receipt',
    landscape: options.landscape === true,
  };
}

/** Runs a database call, converting SQLite errors into safe, parseable errors. */
function withBridge<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    const bridgeError = toBridgeError(error);
    if (!bridgeError.message.includes('|constraint_')) logger.warn('Database call failed', error);
    throw bridgeError;
  }
}

async function seedAction(kind: 'reset' | 'more' | 'clear'): Promise<SeedResult> {
  try {
    if (kind === 'more') {
      const summary = generateMoreDemoData();
      return { ok: true, sales: summary.sales, customers: summary.customers };
    }
    await writeAutoBackup(kind === 'reset' ? 'before-reset' : 'before-clear');
    const summary = recreateDatabase(kind === 'reset' ? 'demo' : 'empty');
    resetDeviceSession();
    return { ok: true, products: summary.products, customers: summary.customers, sales: summary.sales };
  } catch (error) {
    logger.error(`Demo data action "${kind}" failed`, error);
    return { ok: false, reason: 'failed' };
  }
}

export function registerIpcHandlers(): void {
  // Device store (electron-store)
  handle(IPC_CHANNELS.store.get, (key) => readDevice(requireStoreKey(key)));
  handle(IPC_CHANNELS.store.set, (key, value) => {
    const storeKey = requireStoreKey(key);
    writeDevice(storeKey, value);
    if (storeKey === 'device') applyNativeTheme(readDevice('device').appearance.theme);
  });
  handle(IPC_CHANNELS.store.delete, (key) => deleteDevice(requireStoreKey(key)));

  // Database (validated SQL bridge)
  handle(IPC_CHANNELS.database.query, (sql, params) => withBridge(() => getDatabase().bridge.all(sql, params)));
  handle(IPC_CHANNELS.database.get, (sql, params) => withBridge(() => getDatabase().bridge.get(sql, params)));
  handle(IPC_CHANNELS.database.run, (sql, params) => withBridge(() => getDatabase().bridge.run(sql, params)));
  handle(IPC_CHANNELS.database.transaction, (statements) => withBridge(() => getDatabase().bridge.transaction(statements)));
  handle(IPC_CHANNELS.database.info, () => getDatabaseInfo());

  // Printing
  handle(IPC_CHANNELS.printer.printReceipt, (html, options) => printDocument('receipt', requireString(html, 'document', APP_CONFIG.print.maxHtmlBytes), requirePrintOptions(options)));
  handle(IPC_CHANNELS.printer.printReport, (html, options) => printDocument('report', requireString(html, 'document', APP_CONFIG.print.maxHtmlBytes), requirePrintOptions(options)));
  handle(IPC_CHANNELS.printer.printKOT, (html, options) => printDocument('kot', requireString(html, 'document', APP_CONFIG.print.maxHtmlBytes), requirePrintOptions(options)));
  handle(IPC_CHANNELS.printer.savePdf, (html, options) => savePdf(requireString(html, 'document', APP_CONFIG.print.maxHtmlBytes), requirePdfOptions(options)));
  handle(IPC_CHANNELS.printer.getPrinters, () => getPrinters());

  // Data
  handle(IPC_CHANNELS.data.exportBackup, () => exportBackup());
  handle(IPC_CHANNELS.data.pickImport, () => pickImport());
  handle(IPC_CHANNELS.data.applyImport, (token) => applyImport(requireString(token, 'token', 100)));
  handle(IPC_CHANNELS.data.saveFile, (fileName, content, kind) => {
    const fileKind: SaveFileKind = kind === 'json' ? 'json' : 'csv';
    return saveExportFile(requireString(fileName, 'file name', 200), requireString(content, 'content', 100 * 1024 * 1024), fileKind);
  });
  handle(IPC_CHANNELS.data.resetDemo, () => seedAction('reset'));
  handle(IPC_CHANNELS.data.generateMore, () => seedAction('more'));
  handle(IPC_CHANNELS.data.clearLocal, () => seedAction('clear'));

  // Application
  handle(IPC_CHANNELS.app.getVersion, () => app.getVersion());
  handle(IPC_CHANNELS.app.getInfo, () => ({
    name: APP_CONFIG.name,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    isPackaged: app.isPackaged,
  }));
  handle(IPC_CHANNELS.app.setNativeTheme, (theme) => applyNativeTheme(requireTheme(theme)));
  handle(IPC_CHANNELS.app.toggleFullscreen, () => toggleFullscreen());
  handle(IPC_CHANNELS.app.openDataFolder, async () => {
    await shell.openPath(app.getPath('userData'));
  });
  handle(IPC_CHANNELS.app.relaunch, () => {
    app.relaunch();
    app.exit(0);
  });
  handle(IPC_CHANNELS.app.quit, () => app.quit());
}
