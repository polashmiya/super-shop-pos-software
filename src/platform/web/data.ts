import { APP_CONFIG } from '@/config/app.config';
import { parseBackup, previewCounts, type BackupFile } from '@/data/schema/backupFile';
import { toLocalDate } from '@/domain/dates';
import type { ExportResult, ImportPickResult } from '@/types/print';
import type { ElectronAPI, SeedResult } from '../../../electron/types/electron';
import type { WebDatabaseClient } from './db/client';
import { downloadBlob, pickTextFile, saveTextFile } from './files';
import { readStoredDevice } from './store';

/* ==========================================================================
   Backup, restore, demo data and file exports in the browser.

   The backup format and its validation are shared with the desktop app, so
   a shop can back up on one and restore on the other. Import keeps the same
   two steps the desktop uses — validate and preview first, replace only
   after the cashier confirms — because restoring destroys existing data.
   ========================================================================== */

const IMPORT_CONFIRM_TTL_MS = 10 * 60_000;
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

function seedResult(summary: { products?: number; customers?: number; sales?: number } | null): SeedResult {
  return { ok: true, products: summary?.products, customers: summary?.customers, sales: summary?.sales };
}

export function createWebData(db: WebDatabaseClient, markBackupDone: () => void): ElectronAPI['data'] {
  const pendingImports = new Map<string, { backup: BackupFile; expiresAt: number }>();

  async function buildBackup(): Promise<BackupFile> {
    const [tables, info] = await Promise.all([db.readTables(), db.info()]);
    return {
      format: APP_CONFIG.backup.format,
      appName: APP_CONFIG.name,
      appVersion: APP_CONFIG.version,
      schemaVersion: info.schemaVersion,
      exportedAt: new Date().toISOString(),
      device: readStoredDevice(),
      tables,
    };
  }

  return {
    async exportBackup(): Promise<ExportResult> {
      try {
        const backup = await buildBackup();
        const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json;charset=utf-8' });
        const result = downloadBlob(`super-shop-backup-${toLocalDate(new Date())}.json`, blob);
        if (result.ok) markBackupDone();
        return result;
      } catch (error) {
        console.error('Backup export failed', error);
        return { ok: false, reason: 'failed' };
      }
    },

    async pickImport(): Promise<ImportPickResult> {
      const picked = await pickTextFile('application/json,.json', APP_CONFIG.backup.maxImportBytes);
      if (picked === null) return { ok: false, reason: 'cancelled' };
      if (picked === 'too-large') return { ok: false, reason: 'invalid' };
      try {
        let json: unknown;
        try {
          json = JSON.parse(picked.text);
        } catch {
          return { ok: false, reason: 'invalid' };
        }
        const { schemaVersion } = await db.info();
        const parsed = parseBackup(json, schemaVersion);
        if (!parsed.ok) {
          console.warn(`Rejected backup ${picked.name}: ${parsed.reason}`);
          return { ok: false, reason: parsed.reason };
        }
        const token = globalThis.crypto.randomUUID();
        pendingImports.set(token, { backup: parsed.backup, expiresAt: Date.now() + IMPORT_CONFIRM_TTL_MS });
        return {
          ok: true,
          preview: {
            token,
            fileName: picked.name,
            exportedAt: parsed.backup.exportedAt,
            appVersion: parsed.backup.appVersion,
            schemaVersion: parsed.backup.schemaVersion,
            counts: previewCounts(parsed.backup),
          },
        };
      } catch (error) {
        console.error('Backup import could not be read', error);
        return { ok: false, reason: 'failed' };
      }
    },

    async applyImport(token: string): Promise<{ ok: boolean; reason?: string }> {
      const pending = pendingImports.get(token);
      pendingImports.delete(token);
      if (!pending || pending.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
      try {
        // The desktop writes a safety copy to disk first; a web page has
        // nowhere to write one, so the cashier is offered the download.
        await db.replaceTables(pending.backup.tables);
        return { ok: true };
      } catch (error) {
        console.error('Backup import failed', error);
        return { ok: false, reason: 'failed' };
      }
    },

    saveFile(fileName: string, content: string, kind): Promise<ExportResult> {
      if (typeof content !== 'string' || new TextEncoder().encode(content).length > MAX_EXPORT_BYTES) {
        return Promise.resolve({ ok: false, reason: 'invalid' });
      }
      return Promise.resolve(saveTextFile(fileName, content, kind));
    },

    async resetDemo(): Promise<SeedResult> {
      try {
        return seedResult(await db.reseed('demo'));
      } catch (error) {
        console.error('Demo reset failed', error);
        return { ok: false, reason: 'failed' };
      }
    },

    async generateMore(): Promise<SeedResult> {
      try {
        return seedResult(await db.extend());
      } catch (error) {
        console.error('Generating more demo data failed', error);
        return { ok: false, reason: 'failed' };
      }
    },

    async clearLocal(): Promise<SeedResult> {
      try {
        return seedResult(await db.reseed('empty'));
      } catch (error) {
        console.error('Clearing the shop failed', error);
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
