import type { Database as WasmDatabase, PreparedStatement, Sqlite3Static, SqlValue as WasmValue } from '@sqlite.org/sqlite-wasm';
import { APP_CONFIG } from '@/config/app.config';
import { configureConnection, getSchemaVersion, migrate, type SchemaDb } from '@/data/schema/migrations';
import { DEFAULT_GUARD_LIMITS, assertSafeParams, assertSafeSql, assertSafeStatements, type SqlGuardLimits } from '@/data/schema/sqlGuard';
import { countRows, readAllTables, replaceAllTables } from '@/data/schema/tables';
import { extendDemoData, seedDatabase, type ExtendSummary, type SeedSummary } from '@/data/seed';
import type { SeedExecutor } from '@/data/seed/executor';
import type { SqlRow, SqlRunResult, SqlStatement, SqlTransactionResult, SqlValue } from '@/types/database';
import type { DatabaseInfo } from '@/types/print';
import { hashPin } from './sha256';

/* ==========================================================================
   The browser's SQLite engine: sqlite-wasm behind exactly the same guard and
   statement semantics the Electron main process applies (see
   electron/database/bridge.ts). It runs inside the database worker, so the
   UI thread never blocks on a query or on demo-data generation.

   No worker or OPFS plumbing lives here, so the whole engine — schema, seed,
   queries, backup — is exercised in Node by tests/platform/webEngine.test.ts.
   ========================================================================== */

/**
 * sqlite-wasm's statement API is not shaped like node:sqlite's, so the shared
 * migrations get a small adapter rather than a cast. Migrations run once at
 * start-up, so finalising each statement immediately costs nothing.
 */
function schemaAdapter(db: WasmDatabase): SchemaDb {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const consume = (params: SqlValue[], wantRow: boolean): unknown => {
        const statement = db.prepare(sql);
        try {
          if (params.length > 0) statement.bind(params as WasmValue[]);
          if (wantRow) return statement.step() ? statement.get({}) : undefined;
          while (statement.step()) {
            // Drain any rows the statement produces.
          }
          return undefined;
        } finally {
          statement.finalize();
        }
      };
      return {
        get: (...params: SqlValue[]) => consume(params, true),
        run: (...params: SqlValue[]) => consume(params, false),
      };
    },
  };
}

export interface WebEngine {
  all(sql: unknown, params?: unknown): SqlRow[];
  get(sql: unknown, params?: unknown): SqlRow | null;
  run(sql: unknown, params?: unknown): SqlRunResult;
  transaction(statements: unknown): SqlTransactionResult[];
  info(sizeBytes: number, filePath: string): DatabaseInfo;
  readTables(): Record<string, unknown[]>;
  replaceTables(tables: Record<string, unknown[]>): void;
  /** Wipes every table, re-runs the migrations and seeds demo or base data. */
  reseed(mode: 'demo' | 'empty', now: Date): SeedSummary;
  extend(now: Date): ExtendSummary;
  isEmpty(): boolean;
  close(): void;
}

/** Applies the pragmas and migrations a freshly opened browser database needs. */
export function prepareDatabase(db: WasmDatabase, { wal }: { wal: boolean }): void {
  const schema = schemaAdapter(db);
  configureConnection(schema, { wal });
  migrate(schema);
}

export function createWebEngine(
  sqlite3: Sqlite3Static,
  db: WasmDatabase,
  limits: SqlGuardLimits = DEFAULT_GUARD_LIMITS,
  cacheSize: number = APP_CONFIG.database.statementCacheSize,
): WebEngine {
  const cache = new Map<string, PreparedStatement>();

  /** LRU cache of prepared statements, mirroring the desktop bridge. */
  function statement(sql: string): PreparedStatement {
    const cached = cache.get(sql);
    if (cached) {
      cache.delete(sql);
      cache.set(sql, cached);
      return cached.reset(true);
    }
    const prepared = db.prepare(sql);
    cache.set(sql, prepared);
    if (cache.size > cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.get(oldest)?.finalize();
        cache.delete(oldest);
      }
    }
    return prepared;
  }

  function bound(sql: string, params: readonly SqlValue[]): PreparedStatement {
    const prepared = statement(sql);
    if (params.length > 0) prepared.bind(params as WasmValue[]);
    return prepared;
  }

  /** sqlite-wasm returns bigint for very large integers; the app uses numbers. */
  function normalizeRow(row: Record<string, WasmValue>): SqlRow {
    const result: SqlRow = {};
    for (const [key, value] of Object.entries(row)) {
      result[key] = typeof value === 'bigint' ? Number(value) : (value as SqlValue);
    }
    return result;
  }

  function selectAll(sql: string, params: readonly SqlValue[]): SqlRow[] {
    const prepared = bound(sql, params);
    const rows: SqlRow[] = [];
    try {
      while (prepared.step()) rows.push(normalizeRow(prepared.get({})));
    } finally {
      prepared.reset(true);
    }
    return rows;
  }

  function selectOne(sql: string, params: readonly SqlValue[]): SqlRow | null {
    const prepared = bound(sql, params);
    try {
      return prepared.step() ? normalizeRow(prepared.get({})) : null;
    } finally {
      prepared.reset(true);
    }
  }

  function execute(sql: string, params: readonly SqlValue[]): SqlRunResult {
    const prepared = bound(sql, params);
    try {
      while (prepared.step()) {
        // Drain rows so statements with RETURNING behave like the desktop.
      }
    } finally {
      prepared.reset(true);
    }
    return { changes: Number(db.changes(false, false)), lastInsertRowid: Number(sqlite3.capi.sqlite3_last_insert_rowid(db)) };
  }

  function runStatement(entry: SqlStatement): SqlTransactionResult {
    const params = (entry.params ?? []) as SqlValue[];
    switch (entry.mode ?? 'run') {
      case 'all':
        return selectAll(entry.sql, params);
      case 'get':
        return selectOne(entry.sql, params);
      case 'run':
      default:
        return execute(entry.sql, params);
    }
  }

  function clearCache(): void {
    for (const prepared of cache.values()) prepared.finalize();
    cache.clear();
  }

  /**
   * Unguarded synchronous access for schema, seeding and backup restore —
   * the same privilege the desktop keeps inside its main process. Statements
   * are not cached here because this path issues DDL and PRAGMAs.
   */
  const seedExecutor: SeedExecutor = {
    run: (sql, params = []) => {
      execute(sql, params);
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => selectAll(sql, params) as T[],
    get: <T>(sql: string, params: readonly SqlValue[] = []) => (selectOne(sql, params) ?? undefined) as T | undefined,
    exec: (sql) => {
      // Cached statements hold pointers into the old schema; DDL invalidates them.
      clearCache();
      db.exec(sql);
    },
  };

  /** Drops everything and re-runs the migrations (the desktop deletes the file). */
  function wipe(): void {
    clearCache();
    db.exec('PRAGMA foreign_keys = OFF');
    const tables = db.selectObjects("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    for (const row of tables) db.exec(`DROP TABLE IF EXISTS "${String(row.name)}"`);
    db.exec('PRAGMA foreign_keys = ON');
    migrate(schemaAdapter(db));
  }

  return {
    all(sql, params) {
      assertSafeSql(sql, limits);
      assertSafeParams(params, limits);
      return selectAll(sql, (params ?? []) as SqlValue[]);
    },
    get(sql, params) {
      assertSafeSql(sql, limits);
      assertSafeParams(params, limits);
      return selectOne(sql, (params ?? []) as SqlValue[]);
    },
    run(sql, params) {
      assertSafeSql(sql, limits);
      assertSafeParams(params, limits);
      return execute(sql, (params ?? []) as SqlValue[]);
    },
    transaction(statements) {
      assertSafeStatements(statements, limits);
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(runStatement);
        db.exec('COMMIT');
        return results;
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // SQLite may have rolled the transaction back already.
        }
        throw error;
      }
    },
    info(sizeBytes, filePath) {
      return {
        path: filePath,
        sizeBytes,
        schemaVersion: getSchemaVersion(schemaAdapter(db)),
        counts: countRows(seedExecutor),
        sqliteVersion: sqlite3.capi.sqlite3_libversion(),
      };
    },
    readTables: () => readAllTables(seedExecutor),
    replaceTables(tables) {
      clearCache();
      replaceAllTables(seedExecutor, tables);
      clearCache();
    },
    reseed(mode, now) {
      wipe();
      return seedDatabase(seedExecutor, { mode, hashPin, now });
    },
    extend(now) {
      const summary = extendDemoData(seedExecutor, now);
      clearCache();
      return summary;
    },
    isEmpty: () => Number(selectOne('SELECT COUNT(*) AS count FROM users', [])?.count ?? 0) === 0,
    close() {
      clearCache();
      db.close();
    },
  };
}
