import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SeedExecutor } from '../../src/data/seed/executor';
import type { SqlValue } from '../../src/types/database';

/** Synchronous executor over node:sqlite with a prepared-statement cache (seed, backup, reset). */
export function createSyncExecutor(db: DatabaseSync): SeedExecutor {
  const cache = new Map<string, StatementSync>();
  const statement = (sql: string): StatementSync => {
    let prepared = cache.get(sql);
    if (!prepared) {
      prepared = db.prepare(sql);
      cache.set(sql, prepared);
    }
    return prepared;
  };
  return {
    run: (sql, params = []) => {
      statement(sql).run(...(params as SqlValue[]));
    },
    all: <T>(sql: string, params: readonly SqlValue[] = []) => statement(sql).all(...(params as SqlValue[])) as T[],
    get: <T>(sql: string, params: readonly SqlValue[] = []) => statement(sql).get(...(params as SqlValue[])) as T | undefined,
    exec: (sql) => db.exec(sql),
  };
}
