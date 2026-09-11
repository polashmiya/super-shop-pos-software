/**
 * Contract of the SQL bridge between the renderer's local repositories and
 * SQLite in the Electron main process. Only positional `?` parameters with
 * primitive values are allowed; the main process validates every statement.
 */
export type SqlValue = string | number | null;

export type SqlMode = 'run' | 'all' | 'get';

export interface SqlStatement {
  sql: string;
  params?: readonly SqlValue[];
  /** Default 'run'. 'all'/'get' return rows (e.g. to read a generated number). */
  mode?: SqlMode;
}

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number;
}

export type SqlRow = Record<string, SqlValue>;

export type SqlTransactionResult = SqlRunResult | SqlRow[] | SqlRow | null;

export interface SqlClient {
  all<T extends object = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T extends object = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  /** Executes all statements atomically (BEGIN … COMMIT, ROLLBACK on error). */
  transaction(statements: readonly SqlStatement[]): Promise<SqlTransactionResult[]>;
}

/** Error codes the bridge reports to the renderer (never raw SQLite text). */
export type SqlErrorCode = 'constraint_unique' | 'constraint_foreign_key' | 'constraint_check' | 'busy' | 'rejected' | 'failed';
