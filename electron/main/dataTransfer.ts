import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import { toLocalDate } from '@/domain/dates';
import type { ExportResult, ImportPickResult, SaveFileKind } from '@/types/print';
import { getSchemaVersion } from '@/data/schema/migrations';
import { parseBackup, previewCounts, type BackupFile } from '@/data/schema/backupFile';
import { getDatabase, readAllTables, replaceAllTables } from '../database/connection';
import { readDevice, writeDevice } from './deviceStore';
import { safeFileName, writeFileAtomic } from './files';
import { logger } from './logger';
import { PRINT_TO_PDF_DIR } from './paths';
import { getMainWindow } from './windowManager';

/* ==========================================================================
   Local JSON backup / restore and file exports. Nothing is uploaded — files
   are written only where the user chooses, plus a safety copy in
   <userData>/backups before any destructive action.
   ========================================================================== */

const pendingImports = new Map<string, { backup: BackupFile; expiresAt: number }>();
const IMPORT_CONFIRM_TTL_MS = 10 * 60_000;
const MAX_AUTO_BACKUPS = 10;
/** Byte-order mark so Excel opens UTF-8 CSV (Bangla) correctly. */
const UTF8_BOM = String.fromCharCode(0xfeff);

function backupsDirectory(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function createBackup(): BackupFile {
  const { db } = getDatabase();
  return {
    format: APP_CONFIG.backup.format,
    appName: APP_CONFIG.name,
    appVersion: app.getVersion(),
    schemaVersion: getSchemaVersion(db),
    exportedAt: new Date().toISOString(),
    device: readDevice('device'),
    tables: readAllTables(),
  };
}

function pruneAutoBackups(): void {
  const directory = backupsDirectory();
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.startsWith('auto-') && file.endsWith('.json'))
    .sort();
  for (const file of files.slice(0, Math.max(0, files.length - MAX_AUTO_BACKUPS))) {
    fs.rmSync(path.join(directory, file), { force: true });
  }
}

/** Saves a safety copy of all current data before a destructive action. */
export async function writeAutoBackup(reason: 'before-reset' | 'before-import' | 'before-clear'): Promise<string | null> {
  try {
    const directory = backupsDirectory();
    await fs.promises.mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(directory, `auto-${stamp}-${reason}.json`);
    await writeFileAtomic(filePath, JSON.stringify(createBackup()));
    pruneAutoBackups();
    logger.info(`Safety backup written: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.warn('Safety backup failed', error);
    return null;
  }
}

async function chooseSavePath(defaultName: string, extension: string, label: string): Promise<string | null> {
  if (PRINT_TO_PDF_DIR) {
    await fs.promises.mkdir(PRINT_TO_PDF_DIR, { recursive: true });
    return path.join(PRINT_TO_PDF_DIR, defaultName);
  }
  const window = getMainWindow();
  const options = { defaultPath: path.join(app.getPath('documents'), defaultName), filters: [{ name: label, extensions: [extension] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

function markBackupDone(): void {
  const session = readDevice('session');
  writeDevice('session', { ...session, lastBackupAt: new Date().toISOString() });
}

export async function exportBackup(): Promise<ExportResult> {
  const target = await chooseSavePath(`super-shop-backup-${toLocalDate(new Date())}.json`, 'json', 'JSON');
  if (!target) return { ok: false, reason: 'cancelled' };
  try {
    await writeFileAtomic(target, JSON.stringify(createBackup(), null, 1));
    markBackupDone();
    logger.info(`Backup exported: ${target}`);
    return { ok: true, filePath: target };
  } catch (error) {
    logger.error('Backup export failed', error);
    return { ok: false, reason: 'failed' };
  }
}

/** Lets the user pick a backup and validates it WITHOUT applying it yet. */
export async function pickImport(): Promise<ImportPickResult> {
  const window = getMainWindow();
  const options = { properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return { ok: false, reason: 'cancelled' };
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size > APP_CONFIG.backup.maxImportBytes) return { ok: false, reason: 'invalid' };
    let json: unknown;
    try {
      json = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    const parsed = parseBackup(json, getSchemaVersion(getDatabase().db));
    if (!parsed.ok) {
      logger.warn(`Rejected backup ${filePath}: ${parsed.reason}`);
      return { ok: false, reason: parsed.reason };
    }
    const token = randomUUID();
    pendingImports.set(token, { backup: parsed.backup, expiresAt: Date.now() + IMPORT_CONFIRM_TTL_MS });
    const counts = previewCounts(parsed.backup);
    return {
      ok: true,
      preview: {
        token,
        fileName: path.basename(filePath),
        exportedAt: parsed.backup.exportedAt,
        appVersion: parsed.backup.appVersion,
        schemaVersion: parsed.backup.schemaVersion,
        counts,
      },
    };
  } catch (error) {
    logger.error('Backup import could not be read', error);
    return { ok: false, reason: 'failed' };
  }
}

/** Applies a validated backup after the user confirmed the replacement. */
export async function applyImport(token: string): Promise<{ ok: boolean; reason?: string }> {
  const pending = pendingImports.get(token);
  pendingImports.delete(token);
  if (!pending || pending.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  try {
    await writeAutoBackup('before-import');
    replaceAllTables(pending.backup.tables);
    if (pending.backup.device) {
      const current = readDevice('device');
      // Keep this terminal's counter assignment; take appearance/POS options from the backup.
      writeDevice('device', { ...(pending.backup.device as object), terminal: current.terminal });
    }
    logger.info(`Backup from ${pending.backup.exportedAt} imported`);
    return { ok: true };
  } catch (error) {
    logger.error('Backup import failed', error);
    return { ok: false, reason: 'failed' };
  }
}

/** Saves CSV (UTF-8 with BOM so Excel shows Bangla correctly) or JSON exports. */
export async function saveExportFile(fileName: string, content: string, kind: SaveFileKind): Promise<ExportResult> {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf-8') > 100 * 1024 * 1024) return { ok: false, reason: 'invalid' };
  const extension = kind === 'csv' ? 'csv' : 'json';
  const target = await chooseSavePath(safeFileName(fileName, extension, 'report'), extension, extension.toUpperCase());
  if (!target) return { ok: false, reason: 'cancelled' };
  try {
    await writeFileAtomic(target, kind === 'csv' ? `${UTF8_BOM}${content}` : content);
    logger.info(`Export written: ${target}`);
    return { ok: true, filePath: target };
  } catch (error) {
    logger.error('Export failed', error);
    return { ok: false, reason: 'failed' };
  }
}
