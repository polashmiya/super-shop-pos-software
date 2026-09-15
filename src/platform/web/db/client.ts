import type { SqlRow, SqlRunResult, SqlStatement, SqlTransactionResult, SqlValue } from '@/types/database';
import type { DatabaseInfo } from '@/types/print';
import type { SeedResult } from '../../../../electron/types/electron';
import type { DbOpenResult, DbRequest, DbResponse } from './protocol';

/* ==========================================================================
   Page-side client for the database worker: one promise per message, the
   same shape the desktop's IPC bridge exposes so the local repositories
   cannot tell the two apart.
   ========================================================================== */

export interface WebDatabaseClient {
  open(): Promise<DbOpenResult>;
  query(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
  get(sql: string, params?: readonly SqlValue[]): Promise<SqlRow | null>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  transaction(statements: readonly SqlStatement[]): Promise<SqlTransactionResult[]>;
  info(): Promise<DatabaseInfo>;
  readTables(): Promise<Record<string, unknown[]>>;
  replaceTables(tables: Record<string, unknown[]>): Promise<void>;
  reseed(mode: 'demo' | 'empty'): Promise<SeedResult>;
  extend(): Promise<SeedResult>;
}

/** Omit over a union keeps each member's own fields (a plain Omit collapses them). */
type RequestBody = DbRequest extends infer T ? (T extends DbRequest ? Omit<T, 'id'> : never) : never;

export function createWebDatabaseClient(): WebDatabaseClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'super-shop-pos-db' });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let nextId = 0;

  worker.addEventListener('message', (event: MessageEvent<DbResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.value);
    else waiting.reject(new Error(response.error));
  });

  worker.addEventListener('error', (event) => {
    const error = new Error(`The database worker failed: ${event.message}`);
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
  });

  function send<T>(request: RequestBody): Promise<T> {
    const id = (nextId += 1);
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ ...request, id } as DbRequest);
    });
  }

  return {
    open: () => send<DbOpenResult>({ kind: 'open' }),
    query: (sql, params = []) => send<SqlRow[]>({ kind: 'all', sql, params }),
    get: (sql, params = []) => send<SqlRow | null>({ kind: 'get', sql, params }),
    run: (sql, params = []) => send<SqlRunResult>({ kind: 'run', sql, params }),
    transaction: (statements) => send<SqlTransactionResult[]>({ kind: 'transaction', statements }),
    info: () => send<DatabaseInfo>({ kind: 'info' }),
    readTables: () => send<Record<string, unknown[]>>({ kind: 'readTables' }),
    replaceTables: (tables) => send<void>({ kind: 'replaceTables', tables }),
    reseed: (mode) => send<SeedResult>({ kind: 'reseed', mode }),
    extend: () => send<SeedResult>({ kind: 'extend' }),
  };
}
