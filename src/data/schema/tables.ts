import type { SeedExecutor } from '@/data/seed/executor';
import type { SqlValue } from '@/types/database';
import { DATA_TABLES } from './migrations';

/* ==========================================================================
   Whole-database read and replace for backup / restore, shared by both
   runtimes (node:sqlite in the desktop app, sqlite-wasm in the browser).
   Because both sides run this same code, a backup taken in one runtime
   restores cleanly into the other.
   ========================================================================== */

/** Reads every business table (backup export). */
export function readAllTables(db: SeedExecutor): Record<string, unknown[]> {
  const tables: Record<string, unknown[]> = {};
  for (const table of DATA_TABLES) {
    tables[table] = db.all<Record<string, unknown>>(`SELECT * FROM ${table}`).map((row) => ({ ...row }));
  }
  return tables;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}

/**
 * Replaces all business data with the given tables in one transaction
 * (backup import). Columns are taken from the live schema; unknown columns
 * are ignored, so older backups import cleanly.
 */
export function replaceAllTables(db: SeedExecutor, tables: Record<string, unknown[]>): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of [...DATA_TABLES].reverse()) db.exec(`DELETE FROM ${table}`);
    for (const table of DATA_TABLES) {
      const rows = tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((column) => column.name);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        db.run(sql, columns.map((column) => toSqlValue(record[column])));
      }
    }
    const violations = db.all('PRAGMA foreign_key_check');
    if (violations.length > 0) throw new Error(`Backup has ${violations.length} broken references`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** Tables whose row counts are shown in Settings → Data. */
export const INFO_TABLES = [
  'products',
  'customers',
  'sales',
  'sale_items',
  'stock_movements',
  'purchases',
  'suppliers',
  'cash_sessions',
  'expenses',
  'audit_logs',
] as const;

export function countRows(db: SeedExecutor): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of INFO_TABLES) {
    counts[table] = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;
  }
  return counts;
}
