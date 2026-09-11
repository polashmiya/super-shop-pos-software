import type { SqlValue } from '@/types/database';

/**
 * Synchronous database access used by the seed generator (runs in the main
 * process against node:sqlite, and in tests against an in-memory database).
 */
export interface SeedExecutor {
  run(sql: string, params?: readonly SqlValue[]): void;
  all<T>(sql: string, params?: readonly SqlValue[]): T[];
  get<T>(sql: string, params?: readonly SqlValue[]): T | undefined;
  exec(sql: string): void;
}

export type Row = Record<string, SqlValue | boolean | undefined>;

function normalize(value: SqlValue | boolean | undefined): SqlValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/** Inserts a row object; keys are column names. */
export function insertRow(db: SeedExecutor, table: string, row: Row): void {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  db.run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    columns.map((column) => normalize(row[column])),
  );
}

export function insertRows(db: SeedExecutor, table: string, rows: readonly Row[]): void {
  for (const row of rows) insertRow(db, table, row);
}

/** Standard sync metadata columns for a new entity. */
export function meta(createdAt: string, updatedAt: string = createdAt): Row {
  return { created_at: createdAt, updated_at: updatedAt, version: 1, sync_status: 'local', deleted_at: null };
}
