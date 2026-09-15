// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { classifySqlError, SQL_ERROR_PREFIX, SqlBridge, toBridgeError } from '../../electron/database/bridge';
import { configureConnection, migrate } from '@/data/schema/migrations';
import { SqlRejectedError } from '@/data/schema/sqlGuard';
import { parseBridgeError, SqlError } from '@/repositories/local/sql';
import { createTestDatabase } from '../helpers/db';

function migratedBridge(cacheSize?: number): { db: DatabaseSync; bridge: SqlBridge } {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  configureConnection(db, { wal: false });
  migrate(db);
  return { db, bridge: cacheSize === undefined ? new SqlBridge(db) : new SqlBridge(db, undefined, cacheSize) };
}

function caught(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

describe('classifySqlError / toBridgeError', () => {
  it('maps SQLite messages to stable codes', () => {
    expect(classifySqlError(new Error('UNIQUE constraint failed: sequences.key'))).toEqual({ code: 'constraint_unique', detail: 'sequences.key' });
    expect(classifySqlError(new Error('UNIQUE constraint failed: sale_items.sale_id, sale_items.line_no'))).toEqual({ code: 'constraint_unique', detail: 'sale_items.sale_id, sale_items.line_no' });
    expect(classifySqlError(new Error('FOREIGN KEY constraint failed'))).toEqual({ code: 'constraint_foreign_key', detail: '' });
    expect(classifySqlError(new Error('CHECK constraint failed: amount > 0'))).toEqual({ code: 'constraint_check', detail: 'amount > 0' });
    expect(classifySqlError(new Error('database is locked'))).toEqual({ code: 'busy', detail: '' });
    expect(classifySqlError(new SqlRejectedError('comments are not allowed'))).toEqual({ code: 'rejected', detail: 'SQL rejected: comments are not allowed' });
    expect(classifySqlError(new Error('no such table: secrets'))).toEqual({ code: 'failed', detail: '' });
    expect(classifySqlError('plain string')).toEqual({ code: 'failed', detail: '' });
  });

  it('never leaks raw SQLite text for unknown failures', () => {
    const error = toBridgeError(new Error('no such column: pin_hash_secret in SELECT …'));
    expect(error.message).toBe(`${SQL_ERROR_PREFIX}|failed|`);
  });

  it('produces messages the renderer parses back', () => {
    const parsed = parseBridgeError(toBridgeError(new Error('UNIQUE constraint failed: customers.phone')));
    expect(parsed).toBeInstanceOf(SqlError);
    expect(parsed.code).toBe('constraint_unique');
    expect(parsed.detail).toBe('customers.phone');
    // IPC wraps messages ("Error invoking remote method …: Error: SQL_ERROR|…").
    const wrapped = parseBridgeError(new Error("Error invoking remote method 'db:run': Error: SQL_ERROR|busy|"));
    expect(wrapped.code).toBe('busy');
    expect(parseBridgeError(new Error('something else')).code).toBe('failed');
  });
});

describe('SqlBridge against the real schema', () => {
  it('runs, reads and reports changes', () => {
    const { bridge } = migratedBridge();
    expect(bridge.run('INSERT INTO sequences (key, value) VALUES (?, ?)', ['INV-20260910', 7])).toMatchObject({ changes: 1 });
    expect(bridge.get('SELECT value FROM sequences WHERE key = ?', ['INV-20260910'])).toEqual({ value: 7 });
    expect(bridge.get('SELECT value FROM sequences WHERE key = ?', ['missing'])).toBeNull();
    expect(bridge.all('SELECT key FROM sequences')).toEqual([{ key: 'INV-20260910' }]);
    expect(bridge.run('UPDATE sequences SET value = value + 1 WHERE key LIKE ?', ['INV-%']).changes).toBe(1);
  });

  it('rejects unsafe SQL before it reaches SQLite', () => {
    const { bridge } = migratedBridge();
    expect(caught(() => bridge.all('PRAGMA table_info(users)'))).toBeInstanceOf(SqlRejectedError);
    expect(caught(() => bridge.run('DROP TABLE sales'))).toBeInstanceOf(SqlRejectedError);
    expect(caught(() => bridge.get('SELECT 1; SELECT 2'))).toBeInstanceOf(SqlRejectedError);
    expect(caught(() => bridge.run('SELECT ?', [true]))).toBeInstanceOf(SqlRejectedError);
    expect(toBridgeError(caught(() => bridge.all('PRAGMA table_info(users)'))).message).toMatch(/^SQL_ERROR\|rejected\|SQL rejected/);
  });

  it('maps a unique violation to SQL_ERROR|constraint_unique|…', () => {
    const { bridge } = migratedBridge();
    bridge.run('INSERT INTO sequences (key, value) VALUES (?, 1)', ['K']);
    const error = caught(() => bridge.run('INSERT INTO sequences (key, value) VALUES (?, 1)', ['K']));
    expect(toBridgeError(error).message).toBe('SQL_ERROR|constraint_unique|sequences.key');
  });

  it('maps foreign key and CHECK violations', () => {
    const { bridge } = migratedBridge();
    const foreign = caught(() => bridge.run("INSERT INTO product_barcodes (id, product_id, barcode, is_primary, created_at) VALUES ('b1', 'no-such-product', '123', 1, '2026-09-10')"));
    expect(toBridgeError(foreign).message).toBe('SQL_ERROR|constraint_foreign_key|');
    bridge.run("INSERT INTO expense_categories (id, code, name_bn, name_en) VALUES ('c1', 'misc', 'বিবিধ', 'Misc')");
    const insertExpense = "INSERT INTO expenses (id, expense_no, category_id, amount, expense_date, created_at, updated_at) VALUES (?, ?, 'c1', ?, '2026-09-10', 'now', 'now')";
    expect(bridge.run(insertExpense, ['e1', 'EXP-1', 500]).changes).toBe(1);
    const check = caught(() => bridge.run(insertExpense, ['e2', 'EXP-2', 0]));
    expect(toBridgeError(check).message).toMatch(/^SQL_ERROR\|constraint_check\|.*amount > 0/);
  });

  it('executes transactions atomically with per-statement modes', () => {
    const { bridge } = migratedBridge();
    const results = bridge.transaction([
      { sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['A'] },
      { sql: 'UPDATE sequences SET value = value + 1 WHERE key = ?', params: ['A'] },
      { sql: 'SELECT value FROM sequences WHERE key = ?', params: ['A'], mode: 'get' },
      { sql: 'SELECT key FROM sequences ORDER BY key', mode: 'all' },
      { sql: 'SELECT value FROM sequences WHERE key = ?', params: ['none'], mode: 'get' },
    ]);
    expect(results[0]).toMatchObject({ changes: 1 });
    expect(results[1]).toMatchObject({ changes: 1 });
    expect(results[2]).toEqual({ value: 2 });
    expect(results[3]).toEqual([{ key: 'A' }]);
    expect(results[4]).toBeNull();
  });

  it('rolls back everything when one statement fails', () => {
    const { bridge } = migratedBridge();
    bridge.run('INSERT INTO sequences (key, value) VALUES (?, 1)', ['EXISTING']);
    const error = caught(() =>
      bridge.transaction([
        { sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['NEW'] },
        { sql: 'UPDATE sequences SET value = 99 WHERE key = ?', params: ['EXISTING'] },
        { sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['EXISTING'] },
      ]),
    );
    expect(toBridgeError(error).message).toBe('SQL_ERROR|constraint_unique|sequences.key');
    expect(bridge.all('SELECT key, value FROM sequences ORDER BY key')).toEqual([{ key: 'EXISTING', value: 1 }]);
    // The connection is usable again after the rollback.
    expect(bridge.transaction([{ sql: 'INSERT INTO sequences (key, value) VALUES (?, 5)', params: ['AFTER'] }])).toHaveLength(1);
  });

  it('rejects an unsafe transaction without executing any statement', () => {
    const { bridge } = migratedBridge();
    expect(caught(() => bridge.transaction([{ sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['X'] }, { sql: 'DROP TABLE sequences' }]))).toBeInstanceOf(SqlRejectedError);
    expect(bridge.all('SELECT * FROM sequences')).toEqual([]);
  });

  it('keeps working when the statement cache evicts entries', () => {
    const { bridge } = migratedBridge(2);
    for (let round = 0; round < 3; round += 1) {
      for (const key of ['a', 'b', 'c', 'd']) {
        bridge.run(`INSERT INTO sequences (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`, [key]);
        expect(bridge.get(`SELECT value FROM sequences WHERE key = '${key}'`)).toEqual({ value: round + 1 });
      }
    }
    bridge.clearCache();
    expect(bridge.all('SELECT COUNT(*) AS count FROM sequences')).toEqual([{ count: 4 }]);
  });
});

describe('test SqlClient (same mapping as the IPC client)', () => {
  it('turns bridge failures into SqlError objects', async () => {
    const database = createTestDatabase({ seed: 'none' });
    await database.sql.run('INSERT INTO sequences (key, value) VALUES (?, 1)', ['K']);
    await expect(database.sql.run('INSERT INTO sequences (key, value) VALUES (?, 1)', ['K'])).rejects.toMatchObject({ name: 'SqlError', code: 'constraint_unique', detail: 'sequences.key' });
    await expect(database.sql.all('PRAGMA user_version')).rejects.toMatchObject({ code: 'rejected' });
    await expect(database.sql.transaction([{ sql: 'INSERT INTO sequences (key, value) VALUES (?, 1)', params: ['K'] }])).rejects.toBeInstanceOf(SqlError);
    expect(await database.sql.get('SELECT value FROM sequences WHERE key = ?', ['nope'])).toBeUndefined();
  });
});
