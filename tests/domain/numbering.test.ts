// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '@/config/app.config';
import {
  formatDocumentNumber,
  formattedSequenceSql,
  isDocumentNumber,
  parseDocumentNumber,
  SEQUENCE_SQL,
  sequenceKey,
  SHIFT_SEQUENCE_DIGITS,
} from '@/domain/numbering';

// Local-time dates (the shop's clock), independent of the runtime time zone.
const SEP_10_AFTERNOON = new Date(2026, 8, 10, 15, 30);

describe('document numbers', () => {
  it('formats PREFIX-YYYYMMDD-#### with the configured digits', () => {
    expect(APP_CONFIG.numbering.sequenceDigits).toBe(4);
    expect(formatDocumentNumber('INV', SEP_10_AFTERNOON, 1)).toBe('INV-20260910-0001');
    expect(formatDocumentNumber('RET', SEP_10_AFTERNOON, 42)).toBe('RET-20260910-0042');
    expect(formatDocumentNumber('INV', SEP_10_AFTERNOON, 12_345)).toBe('INV-20260910-12345');
  });

  it('uses two digits for shift numbers', () => {
    expect(SHIFT_SEQUENCE_DIGITS).toBe(2);
    expect(formatDocumentNumber('SH', SEP_10_AFTERNOON, 3, SHIFT_SEQUENCE_DIGITS)).toBe('SH-20260910-03');
  });

  it('builds per-day sequence keys from the LOCAL date', () => {
    expect(sequenceKey('INV', SEP_10_AFTERNOON)).toBe('INV-20260910');
    expect(sequenceKey('INV', new Date(2026, 8, 10, 23, 59, 59, 999))).toBe('INV-20260910');
    expect(sequenceKey('INV', new Date(2026, 8, 11, 0, 0, 0, 0))).toBe('INV-20260911');
    expect(sequenceKey('GRN', new Date(2026, 0, 5))).toBe('GRN-20260105');
  });

  it('parses and recognises document numbers', () => {
    expect(parseDocumentNumber('INV-20260910-0042')).toEqual({ prefix: 'INV', date: '20260910', sequence: 42 });
    expect(parseDocumentNumber(' inv-20260910-0042 ')).toEqual({ prefix: 'INV', date: '20260910', sequence: 42 });
    expect(parseDocumentNumber('SH-20260910-03')).toBeNull(); // shift numbers have 2 digits
    expect(parseDocumentNumber('INV-2026091-0001')).toBeNull();
    expect(parseDocumentNumber('INV20260910-0001')).toBeNull();
    expect(parseDocumentNumber('')).toBeNull();
    expect(isDocumentNumber('GRN-20260910-0007')).toBe(true);
    expect(isDocumentNumber('hello')).toBe(false);
  });

  it('round-trips format → parse', () => {
    for (const sequence of [1, 9, 10, 999, 1_000, 9_999, 10_000]) {
      const value = formatDocumentNumber('PO', SEP_10_AFTERNOON, sequence);
      expect(parseDocumentNumber(value)).toEqual({ prefix: 'PO', date: '20260910', sequence });
    }
  });
});

describe('sequence SQL', () => {
  function sequenceDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE sequences (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
    return db;
  }

  it('increments per key and formats the running number inside SQLite', () => {
    const db = sequenceDb();
    const key = sequenceKey('INV', SEP_10_AFTERNOON);
    const increment = db.prepare(SEQUENCE_SQL.increment);
    const formatted = db.prepare(`SELECT ${SEQUENCE_SQL.formatted} AS value`);
    increment.run(key);
    expect(formatted.get(key, key)).toEqual({ value: 'INV-20260910-0001' });
    increment.run(key);
    increment.run(key);
    expect(formatted.get(key, key)).toEqual({ value: 'INV-20260910-0003' });

    const otherDay = sequenceKey('INV', new Date(2026, 8, 11, 9));
    increment.run(otherDay);
    expect(formatted.get(otherDay, otherDay)).toEqual({ value: 'INV-20260911-0001' });
    expect(formatted.get(key, key)).toEqual({ value: 'INV-20260910-0003' });
  });

  it('matches formatDocumentNumber for any digit count', () => {
    const db = sequenceDb();
    const key = sequenceKey('SH', SEP_10_AFTERNOON);
    db.prepare(SEQUENCE_SQL.increment).run(key);
    db.prepare(SEQUENCE_SQL.increment).run(key);
    const row = db.prepare(`SELECT ${formattedSequenceSql(SHIFT_SEQUENCE_DIGITS)} AS value`).get(key, key) as { value: string };
    expect(row.value).toBe(formatDocumentNumber('SH', SEP_10_AFTERNOON, 2, SHIFT_SEQUENCE_DIGITS));
  });
});
