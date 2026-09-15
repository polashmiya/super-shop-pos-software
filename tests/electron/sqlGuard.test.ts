// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertSafeParams, assertSafeSql, assertSafeStatements, DEFAULT_GUARD_LIMITS, SqlRejectedError, type SqlGuardLimits } from '@/data/schema/sqlGuard';

function rejection(work: () => void): string {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(SqlRejectedError);
    return (error as Error).message;
  }
  throw new Error('expected the statement to be rejected');
}

describe('assertSafeSql', () => {
  it('allows single data statements', () => {
    for (const sql of [
      'SELECT 1',
      'select * from products where id = ?',
      '  SELECT created_at, updated_at, deleted_at FROM sales',
      "INSERT INTO sequences (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1",
      'UPDATE products SET status = ? WHERE id = ?',
      'DELETE FROM held_sales WHERE id = ?',
      'WITH recent AS (SELECT * FROM sales) SELECT COUNT(*) FROM recent',
      'REPLACE INTO settings (key, value) VALUES (?, ?)',
      'SELECT 1;',
      'SELECT 1 ;  ',
    ]) {
      expect(() => assertSafeSql(sql)).not.toThrow();
    }
  });

  it('ignores forbidden words, comments and semicolons inside literals and quoted identifiers', () => {
    for (const sql of [
      "SELECT 'DROP TABLE products' AS text",
      "SELECT '-- not a comment', '/* nor this */'",
      "SELECT 'a;b' AS value",
      "SELECT 'it''s fine; PRAGMA x' AS value",
      'SELECT "create" FROM t',
      "SELECT * FROM products WHERE name_en LIKE ? ESCAPE '\\'",
    ]) {
      expect(() => assertSafeSql(sql)).not.toThrow();
    }
  });

  it('rejects other statement types', () => {
    for (const sql of ['PRAGMA foreign_keys = OFF', 'CREATE TABLE x (id)', 'DROP TABLE sales', 'ALTER TABLE sales ADD COLUMN x', 'ATTACH DATABASE ? AS evil', 'DETACH evil', 'VACUUM', 'BEGIN', 'COMMIT', 'EXPLAIN SELECT 1', 'REINDEX']) {
      expect(rejection(() => assertSafeSql(sql))).toMatch(/SQL rejected/);
    }
  });

  it('rejects schema and dangerous keywords inside allowed statements', () => {
    expect(rejection(() => assertSafeSql('SELECT * FROM sqlite_master'))).toMatch(/forbidden keyword/);
    expect(rejection(() => assertSafeSql('SELECT * FROM SQLITE_SCHEMA'))).toMatch(/forbidden keyword/);
    expect(rejection(() => assertSafeSql("SELECT load_extension('evil')"))).toMatch(/forbidden keyword/);
    expect(rejection(() => assertSafeSql('SELECT * FROM schema_migrations'))).toMatch(/forbidden keyword/);
    expect(rejection(() => assertSafeSql('WITH x AS (SELECT 1) SELECT * FROM x WHERE 1 = 1 AND ATTACH'))).toMatch(/forbidden keyword/);
    expect(rejection(() => assertSafeSql("SELECT writefile('x', 'y')"))).toMatch(/forbidden keyword/);
  });

  it('rejects comments', () => {
    expect(rejection(() => assertSafeSql('SELECT 1 -- trailing'))).toMatch(/comments/);
    expect(rejection(() => assertSafeSql('SELECT /* hidden */ 1'))).toMatch(/comments/);
    expect(rejection(() => assertSafeSql('DELETE FROM sales WHERE id = ? --'))).toMatch(/comments/);
  });

  it('rejects multiple statements', () => {
    expect(rejection(() => assertSafeSql('SELECT 1; SELECT 2'))).toMatch(/multiple statements/);
    expect(rejection(() => assertSafeSql("SELECT 1; DROP TABLE sales"))).toMatch(/SQL rejected/);
    expect(rejection(() => assertSafeSql("UPDATE users SET pin_hash = 'x'; DELETE FROM users"))).toMatch(/multiple statements/);
  });

  it('rejects empty, non-string and oversized input', () => {
    expect(rejection(() => assertSafeSql(''))).toMatch(/empty/);
    expect(rejection(() => assertSafeSql('   '))).toMatch(/empty/);
    expect(rejection(() => assertSafeSql(undefined))).toMatch(/empty/);
    expect(rejection(() => assertSafeSql(42))).toMatch(/empty/);
    expect(rejection(() => assertSafeSql(null))).toMatch(/empty/);
    const limits: SqlGuardLimits = { ...DEFAULT_GUARD_LIMITS, maxSqlLength: 20 };
    expect(rejection(() => assertSafeSql('SELECT * FROM products', limits))).toMatch(/too long/);
  });

  it('rejects unterminated literals', () => {
    expect(rejection(() => assertSafeSql("SELECT 'abc"))).toMatch(/unterminated literal/);
    expect(rejection(() => assertSafeSql('SELECT "abc'))).toMatch(/unterminated literal/);
  });
});

describe('assertSafeParams', () => {
  it('accepts primitives and a missing parameter list', () => {
    expect(() => assertSafeParams(undefined)).not.toThrow();
    expect(() => assertSafeParams([])).not.toThrow();
    expect(() => assertSafeParams([1, 2.5, -3, 'text', '', null])).not.toThrow();
  });

  it('rejects anything else', () => {
    expect(rejection(() => assertSafeParams('1'))).toMatch(/must be an array/);
    expect(rejection(() => assertSafeParams({ 0: 1 }))).toMatch(/must be an array/);
    expect(rejection(() => assertSafeParams([Number.NaN]))).toMatch(/non-finite/);
    expect(rejection(() => assertSafeParams([Number.POSITIVE_INFINITY]))).toMatch(/non-finite/);
    expect(rejection(() => assertSafeParams([true]))).toMatch(/unsupported parameter type boolean/);
    expect(rejection(() => assertSafeParams([{}]))).toMatch(/unsupported parameter type object/);
    expect(rejection(() => assertSafeParams([10n]))).toMatch(/unsupported parameter type bigint/);
    expect(rejection(() => assertSafeParams([undefined]))).toMatch(/unsupported parameter type undefined/);
  });

  it('enforces parameter count and string size limits', () => {
    expect(rejection(() => assertSafeParams(Array.from({ length: DEFAULT_GUARD_LIMITS.maxParams + 1 }, () => 1)))).toMatch(/too many parameters/);
    const limits: SqlGuardLimits = { ...DEFAULT_GUARD_LIMITS, maxStringBytes: 10 };
    expect(() => assertSafeParams(['0123456789'], limits)).not.toThrow();
    expect(rejection(() => assertSafeParams(['01234567890'], limits))).toMatch(/too large/);
    // Multi-byte text is measured in UTF-8 bytes: 4 Bangla letters = 12 bytes.
    expect(rejection(() => assertSafeParams(['চালচাল'.slice(0, 4)], limits))).toMatch(/too large/);
  });
});

describe('assertSafeStatements', () => {
  it('validates every statement of a transaction', () => {
    expect(() =>
      assertSafeStatements([
        { sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['INV-20260910'] },
        { sql: 'SELECT value FROM sequences WHERE key = ?', params: ['INV-20260910'], mode: 'get' },
        { sql: 'SELECT * FROM sequences', mode: 'all' },
      ]),
    ).not.toThrow();
  });

  it('rejects malformed transactions', () => {
    expect(rejection(() => assertSafeStatements('SELECT 1'))).toMatch(/must be an array/);
    expect(rejection(() => assertSafeStatements([]))).toMatch(/empty transaction/);
    expect(rejection(() => assertSafeStatements([null]))).toMatch(/invalid statement/);
    expect(rejection(() => assertSafeStatements([{ sql: 'SELECT 1', mode: 'exec' }]))).toMatch(/invalid mode/);
    expect(rejection(() => assertSafeStatements([{ sql: 'SELECT 1' }, { sql: 'PRAGMA x' }]))).toMatch(/statement type/);
    expect(rejection(() => assertSafeStatements([{ sql: 'SELECT ?', params: [true] }]))).toMatch(/unsupported parameter/);
    const limits: SqlGuardLimits = { ...DEFAULT_GUARD_LIMITS, maxStatements: 2 };
    expect(rejection(() => assertSafeStatements([{ sql: 'SELECT 1' }, { sql: 'SELECT 2' }, { sql: 'SELECT 3' }], limits))).toMatch(/too many statements/);
  });
});
