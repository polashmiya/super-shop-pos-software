import { APP_CONFIG } from '@/config/app.config';
import { toCompactDate } from './dates';

/* ==========================================================================
   Document numbers: PREFIX-YYYYMMDD-#### (e.g. INV-20260910-0001).

   The running number comes from the `sequences` table, incremented inside
   the same database transaction that saves the document, so numbers are
   unique even across restarts and never derived from array lengths.
   ========================================================================== */

export function sequenceKey(prefix: string, date: Date): string {
  return `${prefix}-${toCompactDate(date)}`;
}

export function formatDocumentNumber(prefix: string, date: Date, sequence: number, digits: number = APP_CONFIG.numbering.sequenceDigits): string {
  return `${sequenceKey(prefix, date)}-${String(sequence).padStart(digits, '0')}`;
}

const DOCUMENT_PATTERN = /^([A-Z]{2,6})-(\d{8})-(\d{3,})$/;

export function parseDocumentNumber(value: string): { prefix: string; date: string; sequence: number } | null {
  const match = DOCUMENT_PATTERN.exec(value.trim().toUpperCase());
  if (!match) return null;
  return { prefix: match[1], date: match[2], sequence: Number(match[3]) };
}

export function isDocumentNumber(value: string): boolean {
  return DOCUMENT_PATTERN.test(value.trim().toUpperCase());
}

/**
 * SQL fragments that increment a sequence and read the formatted number in
 * one transaction. Parameters: [key] for the upsert, [key, prefixWithDate]
 * for the select. Kept here so every repository formats numbers the same way.
 */
export const SEQUENCE_SQL = {
  increment: 'INSERT INTO sequences (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1',
  /** Formatted number expression; bind the sequence key twice (prefix text, lookup). */
  formatted: formattedSequenceSql(APP_CONFIG.numbering.sequenceDigits),
} as const;

/** SQL expression producing "<key>-<zero padded value>" for a sequence key (bind key twice). */
export function formattedSequenceSql(digits: number): string {
  return `(SELECT ? || '-' || printf('%0${digits}d', value) FROM sequences WHERE key = ?)`;
}

/** Shift numbers use two digits, e.g. SH-20260910-03. */
export const SHIFT_SEQUENCE_DIGITS = 2;
