import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import { extendDemoData, seedDatabase, type SeedSummary } from '@/data/seed';
import type { DatabaseInfo } from '@/types/print';
import { logger } from '../main/logger';
import { FIXED_NOW } from '../main/paths';
import { SqlBridge } from './bridge';
import { createSyncExecutor } from './executor';
import { configureConnection, DATA_TABLES, getSchemaVersion, migrate } from './migrations';

/* ==========================================================================
   The application's SQLite database (<userData>/data/supershop.db).
   Opened once in the main process; the renderer reaches it only through the
   validated SQL bridge.
   ========================================================================== */

interface DatabaseHandle {
  db: DatabaseSync;
  bridge: SqlBridge;
  filePath: string;
}

let handle: DatabaseHandle | null = null;

export function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`, 'utf-8').digest('hex');
}

export function clock(): Date {
  if (FIXED_NOW) {
    const fixed = new Date(FIXED_NOW);
    if (!Number.isNaN(fixed.getTime())) return fixed;
  }
  return new Date();
}

export function databaseFilePath(): string {
  return path.join(app.getPath('userData'), 'data', APP_CONFIG.database.fileName);
}

function isEmpty(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count === 0;
}

function open(filePath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true });
  configureConnection(db);
  migrate(db);
  return db;
}

/** Opens (and on first launch seeds) the database. */
export function openDatabase(): DatabaseHandle {
  if (handle) return handle;
  const filePath = databaseFilePath();
  const db = open(filePath);
  if (isEmpty(db)) {
    const started = Date.now();
    const summary = seedDatabase(createSyncExecutor(db), { mode: 'demo', hashPin, now: clock() });
    logger.info(`Demo data created in ${Date.now() - started} ms: ${JSON.stringify(summary)}`);
  }
  handle = { db, bridge: new SqlBridge(db, undefined, APP_CONFIG.database.statementCacheSize), filePath };
  return handle;
}

export function getDatabase(): DatabaseHandle {
  return handle ?? openDatabase();
}

export function closeDatabase(): void {
  if (!handle) return;
  try {
    handle.bridge.clearCache();
    handle.db.close();
  } catch (error) {
    logger.warn('Closing the database failed', error);
  }
  handle = null;
}

function removeDatabaseFiles(filePath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${filePath}${suffix}`, { force: true });
  }
}

/** Deletes the database and recreates it with demo data or base data only. */
export function recreateDatabase(mode: 'demo' | 'empty'): SeedSummary {
  const filePath = databaseFilePath();
  closeDatabase();
  // Keep one safety copy of the previous database.
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, `${filePath}.before-reset`);
    } catch (error) {
      logger.warn('Could not keep a copy of the previous database', error);
    }
  }
  removeDatabaseFiles(filePath);
  const db = open(filePath);
  const summary = seedDatabase(createSyncExecutor(db), { mode, hashPin, now: clock() });
  handle = { db, bridge: new SqlBridge(db, undefined, APP_CONFIG.database.statementCacheSize), filePath };
  logger.info(`Database recreated (${mode}): ${JSON.stringify(summary)}`);
  return summary;
}

export function generateMoreDemoData(): { sales: number; customers: number } {
  const { db } = getDatabase();
  const summary = extendDemoData(createSyncExecutor(db), clock());
  getDatabase().bridge.clearCache();
  logger.info(`Demo data extended: ${JSON.stringify(summary)}`);
  return summary;
}

export function getDatabaseInfo(): DatabaseInfo {
  const { db, filePath } = getDatabase();
  const counts: Record<string, number> = {};
  for (const table of ['products', 'customers', 'sales', 'sale_items', 'stock_movements', 'purchases', 'suppliers', 'cash_sessions', 'expenses', 'audit_logs']) {
    counts[table] = (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  }
  let sizeBytes = 0;
  for (const suffix of ['', '-wal']) {
    try {
      sizeBytes += fs.statSync(`${filePath}${suffix}`).size;
    } catch {
      // Missing WAL file is fine.
    }
  }
  const version = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
  return { path: filePath, sizeBytes, schemaVersion: getSchemaVersion(db), counts, sqliteVersion: version };
}

/** Reads every business table (backup export). */
export function readAllTables(): Record<string, unknown[]> {
  const { db } = getDatabase();
  const tables: Record<string, unknown[]> = {};
  for (const table of DATA_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
  }
  return tables;
}

/**
 * Replaces all business data with the given tables in one transaction
 * (backup import). Columns are taken from the live schema; unknown columns
 * are ignored, so older backups import cleanly.
 */
export function replaceAllTables(tables: Record<string, unknown[]>): void {
  const { db, bridge } = getDatabase();
  const executor = createSyncExecutor(db);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of [...DATA_TABLES].reverse()) db.exec(`DELETE FROM ${table}`);
    for (const table of DATA_TABLES) {
      const rows = tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        executor.run(
          sql,
          columns.map((column) => {
            const value = record[column];
            if (value === undefined || value === null) return null;
            if (typeof value === 'number' || typeof value === 'string') return value;
            if (typeof value === 'boolean') return value ? 1 : 0;
            return JSON.stringify(value);
          }),
        );
      }
    }
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) throw new Error(`Backup has ${violations.length} broken references`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    bridge.clearCache();
  }
}
