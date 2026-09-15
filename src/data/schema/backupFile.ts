import { APP_CONFIG } from '@/config/app.config';
import { DATA_TABLES } from './migrations';

/* ==========================================================================
   The backup file format and its validation, shared by both runtimes, so a
   backup taken in the desktop app imports into the browser build and the
   other way round — and both reject exactly the same broken files.
   ========================================================================== */

export interface BackupFile {
  format: string;
  appName: string;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  device: unknown;
  tables: Record<string, unknown[]>;
}

export type ParsedBackup = { ok: true; backup: BackupFile } | { ok: false; reason: 'invalid' | 'newer-schema' };

/** Tables whose row counts are shown in the import confirmation. */
export const PREVIEW_TABLES = ['products', 'customers', 'sales', 'suppliers', 'purchases', 'cash_sessions'] as const;

/** Validates the structure of a backup file before anything is replaced. */
export function parseBackup(json: unknown, currentSchema: number): ParsedBackup {
  if (typeof json !== 'object' || json === null) return { ok: false, reason: 'invalid' };
  const candidate = json as Partial<BackupFile>;
  if (candidate.format !== APP_CONFIG.backup.format) return { ok: false, reason: 'invalid' };
  if (typeof candidate.schemaVersion !== 'number' || typeof candidate.exportedAt !== 'string') return { ok: false, reason: 'invalid' };
  if (candidate.schemaVersion > currentSchema) return { ok: false, reason: 'newer-schema' };
  if (typeof candidate.tables !== 'object' || candidate.tables === null) return { ok: false, reason: 'invalid' };
  const tables = candidate.tables as Record<string, unknown>;
  for (const required of ['users', 'roles', 'products', 'categories', 'units', 'settings']) {
    if (!Array.isArray(tables[required])) return { ok: false, reason: 'invalid' };
  }
  for (const [name, rows] of Object.entries(tables)) {
    if (!(DATA_TABLES as readonly string[]).includes(name)) return { ok: false, reason: 'invalid' };
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) return { ok: false, reason: 'invalid' };
  }
  const users = tables.users as Array<Record<string, unknown>>;
  if (users.length === 0 || users.some((user) => typeof user.id !== 'string' || typeof user.pin_hash !== 'string')) return { ok: false, reason: 'invalid' };
  return { ok: true, backup: candidate as BackupFile };
}

export function previewCounts(backup: BackupFile): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of PREVIEW_TABLES) counts[table] = backup.tables[table]?.length ?? 0;
  return counts;
}
