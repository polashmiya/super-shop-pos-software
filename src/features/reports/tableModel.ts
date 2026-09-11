import { matchesTokens, normalizeSearch, tokenize } from '@/domain/text';
import type { Language } from '@/i18n';
import type { ReportColumnDef, ReportRowData, ReportTableData } from './types';

/* ==========================================================================
   Client-side table model shared by the screen, CSV/JSON export and print:
   search → sort → totals (over every matching row, not just one page).
   ========================================================================== */

export interface TableSort {
  key: string;
  direction: 'asc' | 'desc';
}

const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const isBlank = (value: unknown): boolean => value === null || value === undefined || value === '';

export function searchRows(rows: readonly ReportRowData[], keys: readonly string[] | undefined, query: string): ReportRowData[] {
  const tokens = tokenize(query);
  if (tokens.length === 0 || !keys || keys.length === 0) return [...rows];
  return rows.filter((row) => matchesTokens(normalizeSearch(keys.map((key) => row[key] ?? '').join(' ')), tokens));
}

/** Sorts by a column; empty cells always go last. Text sorts by what the user reads. */
export function sortRows(rows: readonly ReportRowData[], column: ReportColumnDef | undefined, direction: 'asc' | 'desc', language: Language): ReportRowData[] {
  if (!column) return [...rows];
  const factor = direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(language === 'bn' ? 'bn' : 'en', { numeric: true, sensitivity: 'base' });
  const valueOf = (row: ReportRowData) => {
    if (column.bnKey && language === 'bn' && typeof row[column.bnKey] === 'string' && row[column.bnKey]) return row[column.bnKey];
    return row[column.key];
  };
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (isBlank(left) || isBlank(right)) return isBlank(left) === isBlank(right) ? 0 : isBlank(left) ? 1 : -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return collator.compare(String(left), String(right)) * factor;
  });
}

/** Rows as listed: matching the search, in the chosen order. */
export function viewRows(table: ReportTableData, query: string, sort: TableSort | null, language: Language): ReportRowData[] {
  const matched = searchRows(table.rows, table.searchKeys, query);
  const active = sort ?? table.defaultSort ?? null;
  return active ? sortRows(matched, table.columns.find((column) => column.key === active.key), active.direction, language) : matched;
}

/** Total of a column over the listed rows (null when the column has no total). */
export function columnTotal(column: ReportColumnDef, rows: readonly ReportRowData[]): number | null {
  const total = column.total ?? 'none';
  if (total === 'none') return null;
  const sum = (key: string) => rows.reduce((result, row) => result + toNumber(row[key]), 0);
  if (total === 'sum') return sum(column.key);
  if ('sumOf' in total) return sum(total.sumOf);
  const denominator = sum(total.ratio[1]);
  if (denominator === 0) return 0;
  const value = sum(total.ratio[0]) / denominator;
  return column.kind === 'money' ? Math.round(value) : value;
}

export function hasTotals(columns: readonly ReportColumnDef[]): boolean {
  return columns.some((column) => column.total !== undefined && column.total !== 'none');
}

/** Columns the user has not hidden (the table remembers its choice per report). */
export function visibleColumns(columnsKey: string, columns: readonly ReportColumnDef[]): ReportColumnDef[] {
  let hidden = new Set(columns.filter((column) => column.hidden).map((column) => column.key));
  try {
    const stored = window.localStorage.getItem(`table-columns:${columnsKey}`);
    if (stored) hidden = new Set(JSON.parse(stored) as string[]);
  } catch {
    // Storage unavailable: fall back to the default column set.
  }
  return columns.filter((column, index) => index === 0 || !hidden.has(column.key));
}
