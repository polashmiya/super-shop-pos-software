import type { ElectronAPI } from '@/platform';
import type { SqlClient, SqlErrorCode, SqlRow, SqlStatement, SqlValue } from '@/types/database';

/* ==========================================================================
   SQL client for local repositories + small row-mapping helpers.
   ========================================================================== */

export class SqlError extends Error {
  readonly code: SqlErrorCode;
  readonly detail: string;

  constructor(code: SqlErrorCode, detail: string) {
    super(`SQL ${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'SqlError';
    this.code = code;
    this.detail = detail;
  }
}

const BRIDGE_ERROR = /SQL_ERROR\|(\w+)\|(.*)$/;

export function parseBridgeError(error: unknown): SqlError {
  const message = error instanceof Error ? error.message : String(error);
  const match = BRIDGE_ERROR.exec(message);
  if (match) return new SqlError(match[1] as SqlErrorCode, match[2] ?? '');
  return new SqlError('failed', '');
}

async function bridged<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw parseBridgeError(error);
  }
}

/** SqlClient backed by the Electron main process (IPC → node:sqlite). */
export function createIpcSqlClient(database: ElectronAPI['database']): SqlClient {
  return {
    all: <T extends object = SqlRow>(sql: string, params: readonly SqlValue[] = []) => bridged(() => database.query(sql, params) as Promise<T[]>),
    get: <T extends object = SqlRow>(sql: string, params: readonly SqlValue[] = []) =>
      bridged(async () => ((await database.get(sql, params)) ?? undefined) as T | undefined),
    run: (sql, params = []) => bridged(() => database.run(sql, params)),
    transaction: (statements: readonly SqlStatement[]) => bridged(() => database.transaction(statements)),
  };
}

/* ----------------------------- mapping helpers ---------------------------- */

export const toBool = (value: unknown): boolean => value === 1 || value === true || value === '1';

export const toNum = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export const toStr = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export const toNullableStr = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const toNullableNum = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** `?, ?, ?` for an IN (...) clause. */
export const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

export const bool = (value: boolean): number => (value ? 1 : 0);

/** Builds a WHERE clause from optional conditions. */
export class Where {
  private readonly clauses: string[] = [];
  readonly params: SqlValue[] = [];

  add(clause: string, ...params: SqlValue[]): this {
    this.clauses.push(clause);
    this.params.push(...params);
    return this;
  }

  when(condition: unknown, clause: string, ...params: SqlValue[]): this {
    if (condition) this.add(clause, ...params);
    return this;
  }

  toString(): string {
    return this.clauses.length > 0 ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

export function limitOffset(page: number, pageSize: number): { sql: string; params: SqlValue[] } {
  const size = Math.min(Math.max(Math.trunc(pageSize) || 25, 1), 1_000);
  const offset = Math.max(0, Math.trunc(page) - 1) * size;
  return { sql: 'LIMIT ? OFFSET ?', params: [size, offset] };
}
