// @vitest-environment node
import { createHash } from 'node:crypto';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { beforeAll, describe, expect, it } from 'vitest';
import { saltFor } from '@/data/seed/baseData';
import { DEMO_USERS } from '@/data/seed/demoUsers';
import { DATA_TABLES } from '@/data/schema/migrations';
import { createWebEngine, prepareDatabase, type WebEngine } from '@/platform/web/db/engine';
import { createTestDatabase, type TestDatabase } from '../helpers/db';

/* ==========================================================================
   The browser database engine, exercised against the real sqlite-wasm build
   (the Node build loads the same WASM binary the browser does). Covers the
   schema, the demo seeder, the SQL guard, transactions and the backup
   round-trip, and checks the result against node:sqlite seeded identically —
   so the web build is verified without needing a browser.
   ========================================================================== */

let sqlite3: Sqlite3Static;
let engine: WebEngine;
let desktop: TestDatabase;

const NOW = new Date('2026-09-15T12:00:00.000Z');

beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  prepareDatabase(db, { wal: false });
  engine = createWebEngine(sqlite3, db);
  engine.reseed('demo', NOW);
  desktop = createTestDatabase({ seed: 'demo', now: NOW });
}, 180_000);

const count = (sql: string, params: string[] = []): number => Number(engine.get(sql, params)?.count ?? -1);

describe('web engine: schema and seed', () => {
  it('creates the demo shop', () => {
    expect(engine.isEmpty()).toBe(false);
    expect(count('SELECT COUNT(*) AS count FROM products')).toBeGreaterThan(1000);
    expect(count('SELECT COUNT(*) AS count FROM users')).toBe(DEMO_USERS.length);
    expect(count('SELECT COUNT(*) AS count FROM sales')).toBeGreaterThan(0);
    expect(count('SELECT COUNT(*) AS count FROM stock_movements')).toBeGreaterThan(0);
  });

  it('reports the current schema version', () => {
    const info = engine.info(0, '/supershop.db');
    expect(info.schemaVersion).toBeGreaterThan(0);
    expect(info.counts.products).toBeGreaterThan(1000);
    expect(info.sqliteVersion).toMatch(/^3\./);
  });

  it('hashes demo PINs exactly as the desktop seeder does', () => {
    for (const user of DEMO_USERS) {
      const row = engine.get('SELECT pin_hash, pin_salt FROM users WHERE username = ?', [user.username]);
      const expected = createHash('sha256').update(`${saltFor(user.username)}:${user.pin}`, 'utf-8').digest('hex');
      expect(row?.pin_hash, user.username).toBe(expected);
      expect(row?.pin_salt).toBe(saltFor(user.username));
    }
  });

  it('produces the same database as node:sqlite for the same clock', () => {
    for (const table of DATA_TABLES) {
      const web = count(`SELECT COUNT(*) AS count FROM ${table}`);
      const native = desktop.one<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).count;
      expect(web, `${table} row count`).toBe(native);
    }
  });

  it('agrees with node:sqlite on the sales totals', () => {
    const web = engine.get('SELECT COUNT(*) AS n, SUM(grand_total) AS total, SUM(tax_total) AS vat FROM sales');
    const native = desktop.one<{ n: number; total: number; vat: number }>('SELECT COUNT(*) AS n, SUM(grand_total) AS total, SUM(tax_total) AS vat FROM sales');
    expect(Number(web?.total)).toBe(native.total);
    expect(Number(web?.vat)).toBe(native.vat);
  });
});

describe('web engine: SQL guard', () => {
  it('applies the same rules as the desktop bridge', () => {
    expect(() => engine.all('PRAGMA table_info(products)')).toThrow(/rejected/i);
    expect(() => engine.all('DROP TABLE products')).toThrow(/rejected/i);
    expect(() => engine.all('SELECT 1; SELECT 2')).toThrow(/rejected/i);
    expect(() => engine.all('SELECT 1 -- comment')).toThrow(/rejected/i);
    expect(() => engine.all('SELECT * FROM sqlite_master')).toThrow(/rejected/i);
    expect(() => engine.all('ATTACH DATABASE ? AS other', ['x.db'])).toThrow(/rejected/i);
  });

  it('allows ordinary data statements', () => {
    expect(() => engine.all('SELECT id FROM products LIMIT 1')).not.toThrow();
    expect(() => engine.all('WITH x AS (SELECT 1 AS n) SELECT n FROM x')).not.toThrow();
  });
});

const NOTIFICATION_COLUMNS = 'id, type, severity, title_key, message_key, params, entity, entity_id, is_read, dedupe_key, created_at';
const NOTIFICATION_VALUES = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

function notification(id: string, dedupe: string) {
  return [id, 'low_stock', 'info', 'shell.notifications.lowStock', 'shell.notifications.lowStockBody', '{}', 'product', 'p-1', 0, dedupe, NOW.toISOString()];
}

describe('web engine: statements and transactions', () => {
  it('reports changes and the last insert rowid', () => {
    const before = count('SELECT COUNT(*) AS count FROM notifications');
    const result = engine.run(`INSERT INTO notifications (${NOTIFICATION_COLUMNS}) VALUES ${NOTIFICATION_VALUES}`, notification('n-web-1', 'web-test-1'));
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBeGreaterThan(0);
    expect(count('SELECT COUNT(*) AS count FROM notifications')).toBe(before + 1);
  });

  it('commits a batch atomically', () => {
    const results = engine.transaction([
      { sql: 'UPDATE notifications SET is_read = 1 WHERE id = ?', params: ['n-web-1'] },
      { sql: 'SELECT is_read FROM notifications WHERE id = ?', params: ['n-web-1'], mode: 'get' },
    ]);
    expect(results).toHaveLength(2);
    expect((results[1] as { is_read: number }).is_read).toBe(1);
  });

  it('rolls the whole batch back when one statement fails', () => {
    expect(() =>
      engine.transaction([
        { sql: 'UPDATE notifications SET severity = ? WHERE id = ?', params: ['critical', 'n-web-1'] },
        // Duplicate primary key: this must undo the update above.
        { sql: `INSERT INTO notifications (${NOTIFICATION_COLUMNS}) VALUES ${NOTIFICATION_VALUES}`, params: notification('n-web-1', 'web-test-2') },
      ]),
    ).toThrow();
    expect(engine.get('SELECT severity FROM notifications WHERE id = ?', ['n-web-1'])?.severity).toBe('info');
  });

  it('maps constraint failures to the shared error codes', () => {
    expect(() => engine.run(`INSERT INTO notifications (${NOTIFICATION_COLUMNS}) VALUES ${NOTIFICATION_VALUES}`, notification('n-web-2', 'web-test-1'))).toThrow(
      /UNIQUE constraint failed/i,
    );
  });
});

describe('web engine: backup round-trip', () => {
  it('restores every table from a backup', () => {
    const backup = engine.readTables();
    const products = count('SELECT COUNT(*) AS count FROM products');
    const sales = count('SELECT COUNT(*) AS count FROM sales');
    expect(products).toBeGreaterThan(1000);

    engine.reseed('empty', NOW);
    expect(count('SELECT COUNT(*) AS count FROM sales')).toBe(0);

    engine.replaceTables(backup);
    expect(count('SELECT COUNT(*) AS count FROM products')).toBe(products);
    expect(count('SELECT COUNT(*) AS count FROM sales')).toBe(sales);
  }, 180_000);
});
