import type { SqlStatement, SqlValue } from '../../src/types/database';

/* ==========================================================================
   Validation for SQL arriving from the renderer (defence in depth).

   The renderer's local repositories may only run single data statements
   (SELECT / INSERT / UPDATE / DELETE / WITH / REPLACE) with positional,
   primitive parameters. Schema changes, PRAGMAs, ATTACH, extension loading,
   comments and multiple statements are rejected. Migrations run in the main
   process only.
   ========================================================================== */

export interface SqlGuardLimits {
  maxSqlLength: number;
  maxParams: number;
  maxStringBytes: number;
  maxStatements: number;
}

export const DEFAULT_GUARD_LIMITS: SqlGuardLimits = {
  maxSqlLength: 20_000,
  maxParams: 999,
  maxStringBytes: 2 * 1024 * 1024,
  maxStatements: 50_000,
};

export class SqlRejectedError extends Error {
  constructor(reason: string) {
    super(`SQL rejected: ${reason}`);
    this.name = 'SqlRejectedError';
  }
}

const ALLOWED_START = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|REPLACE)\b/i;
const FORBIDDEN_WORDS =
  /\b(ATTACH|DETACH|PRAGMA|VACUUM|CREATE|DROP|ALTER|REINDEX|ANALYZE|TRIGGER|LOAD_EXTENSION|SQLITE_MASTER|SQLITE_SCHEMA|SQLITE_TEMP_MASTER|SCHEMA_MIGRATIONS|WRITEFILE|READFILE|FTS3_TOKENIZER)\b/i;

/** Removes quoted string literals and quoted identifiers so their contents cannot fool the checks. */
function stripLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
}

export function assertSafeSql(sql: unknown, limits: SqlGuardLimits = DEFAULT_GUARD_LIMITS): asserts sql is string {
  if (typeof sql !== 'string' || sql.trim() === '') throw new SqlRejectedError('empty statement');
  if (sql.length > limits.maxSqlLength) throw new SqlRejectedError('statement too long');
  if (!ALLOWED_START.test(sql)) throw new SqlRejectedError('statement type not allowed');

  const code = stripLiterals(sql);
  if (/'|"/.test(code.replace(/''|""/g, ''))) throw new SqlRejectedError('unterminated literal');
  if (code.includes('--') || code.includes('/*')) throw new SqlRejectedError('comments are not allowed');
  const semicolon = code.indexOf(';');
  if (semicolon !== -1 && code.slice(semicolon + 1).trim() !== '') throw new SqlRejectedError('multiple statements');
  if (FORBIDDEN_WORDS.test(code)) throw new SqlRejectedError('forbidden keyword');
}

export function assertSafeParams(params: unknown, limits: SqlGuardLimits = DEFAULT_GUARD_LIMITS): asserts params is SqlValue[] {
  if (params === undefined) return;
  if (!Array.isArray(params)) throw new SqlRejectedError('parameters must be an array');
  if (params.length > limits.maxParams) throw new SqlRejectedError('too many parameters');
  for (const value of params) {
    if (value === null) continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new SqlRejectedError('non-finite number');
      continue;
    }
    if (typeof value === 'string') {
      if (value.length * 3 > limits.maxStringBytes && Buffer.byteLength(value, 'utf-8') > limits.maxStringBytes) {
        throw new SqlRejectedError('string parameter too large');
      }
      continue;
    }
    throw new SqlRejectedError(`unsupported parameter type ${typeof value}`);
  }
}

export function assertSafeStatements(statements: unknown, limits: SqlGuardLimits = DEFAULT_GUARD_LIMITS): asserts statements is SqlStatement[] {
  if (!Array.isArray(statements)) throw new SqlRejectedError('transaction must be an array');
  if (statements.length === 0) throw new SqlRejectedError('empty transaction');
  if (statements.length > limits.maxStatements) throw new SqlRejectedError('too many statements');
  for (const statement of statements) {
    if (typeof statement !== 'object' || statement === null) throw new SqlRejectedError('invalid statement');
    const { sql, params, mode } = statement as Record<string, unknown>;
    assertSafeSql(sql, limits);
    assertSafeParams(params, limits);
    if (mode !== undefined && mode !== 'run' && mode !== 'all' && mode !== 'get') throw new SqlRejectedError('invalid mode');
  }
}
