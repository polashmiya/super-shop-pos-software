import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SqlBridge, toBridgeError } from '../../electron/database/bridge';
import { createSyncExecutor } from '../../electron/database/executor';
import { configureConnection, migrate } from '../../electron/database/migrations';
import { extendDemoData, seedDatabase, type SeedSummary } from '@/data/seed';
import { parseBridgeError } from '@/repositories/local/sql';
import type { SqlClient, SqlRow, SqlStatement, SqlValue } from '@/types/database';

/* ==========================================================================
   Test database: in-memory SQLite with the real migrations and the same SQL
   bridge (validation + error mapping) the Electron main process uses.
   ========================================================================== */

export function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`, 'utf-8').digest('hex');
}

export interface TestDatabase {
  db: DatabaseSync;
  bridge: SqlBridge;
  sql: SqlClient;
  summary: SeedSummary | null;
  query<T = SqlRow>(sql: string, params?: SqlValue[]): T[];
  one<T = SqlRow>(sql: string, params?: SqlValue[]): T;
}

function wrap<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(parseBridgeError(toBridgeError(error)));
  }
}

export function createTestDatabase(options: { seed?: 'demo' | 'empty' | 'none'; now?: Date } = {}): TestDatabase {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  configureConnection(db, { inMemory: true });
  migrate(db);
  let summary: SeedSummary | null = null;
  if (options.seed && options.seed !== 'none') {
    summary = seedDatabase(createSyncExecutor(db), { mode: options.seed, hashPin, now: options.now ?? new Date() });
  }
  const bridge = new SqlBridge(db);
  const sql: SqlClient = {
    all: <T extends object = SqlRow>(text: string, params: readonly SqlValue[] = []) => wrap(() => bridge.all(text, params) as unknown as T[]),
    get: <T extends object = SqlRow>(text: string, params: readonly SqlValue[] = []) => wrap(() => (bridge.get(text, params) ?? undefined) as T | undefined),
    run: (text, params = []) => wrap(() => bridge.run(text, params)),
    transaction: (statements: readonly SqlStatement[]) => wrap(() => bridge.transaction(statements)),
  };
  return {
    db,
    bridge,
    sql,
    summary,
    query: <T = SqlRow>(text: string, params: SqlValue[] = []) => db.prepare(text).all(...params) as T[],
    one: <T = SqlRow>(text: string, params: SqlValue[] = []) => db.prepare(text).get(...params) as T,
  };
}

export function extendTestData(database: TestDatabase, now: Date) {
  return extendDemoData(createSyncExecutor(database.db), now);
}
