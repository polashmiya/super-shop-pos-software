import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SqlErrorCode, SqlRow, SqlRunResult, SqlStatement, SqlTransactionResult, SqlValue } from '../../src/types/database';
import { DEFAULT_GUARD_LIMITS, SqlRejectedError, assertSafeParams, assertSafeSql, assertSafeStatements, type SqlGuardLimits } from './sqlGuard';

/* ==========================================================================
   SQL bridge: executes validated statements against node:sqlite with a
   prepared-statement cache. Used by the IPC handlers in the main process
   and, in tests, directly (same semantics as production).
   ========================================================================== */

/** Error message prefix understood by the renderer's SQL client. */
export const SQL_ERROR_PREFIX = 'SQL_ERROR';

export function classifySqlError(error: unknown): { code: SqlErrorCode; detail: string } {
  if (error instanceof SqlRejectedError) return { code: 'rejected', detail: error.message };
  const message = error instanceof Error ? error.message : String(error);
  const unique = /UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/i.exec(message);
  if (unique) return { code: 'constraint_unique', detail: unique[1] };
  if (/FOREIGN KEY constraint failed/i.test(message)) return { code: 'constraint_foreign_key', detail: '' };
  const check = /CHECK constraint failed: (.+)$/i.exec(message);
  if (check) return { code: 'constraint_check', detail: check[1] };
  if (/database is locked|SQLITE_BUSY/i.test(message)) return { code: 'busy', detail: '' };
  return { code: 'failed', detail: '' };
}

/** Error with a stable, parseable message: SQL_ERROR|code|detail. */
export function toBridgeError(error: unknown): Error {
  const { code, detail } = classifySqlError(error);
  return new Error(`${SQL_ERROR_PREFIX}|${code}|${detail}`);
}

function toRunResult(result: { changes: number | bigint; lastInsertRowid: number | bigint }): SqlRunResult {
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

export class SqlBridge {
  private readonly cache = new Map<string, StatementSync>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly limits: SqlGuardLimits = DEFAULT_GUARD_LIMITS,
    private readonly cacheSize = 400,
  ) {}

  private statement(sql: string): StatementSync {
    const cached = this.cache.get(sql);
    if (cached) {
      // Refresh LRU position.
      this.cache.delete(sql);
      this.cache.set(sql, cached);
      return cached;
    }
    const prepared = this.db.prepare(sql);
    this.cache.set(sql, prepared);
    if (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return prepared;
  }

  private exec(statement: SqlStatement): SqlTransactionResult {
    const prepared = this.statement(statement.sql);
    const params = (statement.params ?? []) as SqlValue[];
    switch (statement.mode ?? 'run') {
      case 'all':
        return prepared.all(...params) as SqlRow[];
      case 'get':
        return (prepared.get(...params) as SqlRow | undefined) ?? null;
      case 'run':
      default:
        return toRunResult(prepared.run(...params));
    }
  }

  all(sql: unknown, params?: unknown): SqlRow[] {
    assertSafeSql(sql, this.limits);
    assertSafeParams(params, this.limits);
    return this.statement(sql).all(...((params ?? []) as SqlValue[])) as SqlRow[];
  }

  get(sql: unknown, params?: unknown): SqlRow | null {
    assertSafeSql(sql, this.limits);
    assertSafeParams(params, this.limits);
    return (this.statement(sql).get(...((params ?? []) as SqlValue[])) as SqlRow | undefined) ?? null;
  }

  run(sql: unknown, params?: unknown): SqlRunResult {
    assertSafeSql(sql, this.limits);
    assertSafeParams(params, this.limits);
    return toRunResult(this.statement(sql).run(...((params ?? []) as SqlValue[])));
  }

  /** All-or-nothing execution of a batch of statements. */
  transaction(statements: unknown): SqlTransactionResult[] {
    assertSafeStatements(statements, this.limits);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => this.exec(statement));
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The transaction may already be rolled back by SQLite.
      }
      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
