import type { LucideIcon } from 'lucide-react';
import { addMonths, eachLocalDate, parseLocalDate, startOfMonth, toLocalDate } from '@/domain/dates';
import type { TranslationKey } from '@/i18n';
import type { ReportRow } from '@/repositories/types';
import type { DateRange, ReportCell, ReportFilter } from '@/types';
import type {
  BarChartSpec,
  ColumnChartSpec,
  DonutChartSpec,
  EnumGroup,
  Label,
  LineChartSpec,
  ReportColumnDef,
  ReportKpi,
  ReportParam,
  ReportRowData,
  ReportText,
  ValueKind,
} from './types';

/* ==========================================================================
   Small, pure helpers shared by the report loaders.
   ========================================================================== */

export const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
export const str = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Money columns summed over REAL quantities can carry fractions — keep poisha whole. */
export const whole = (value: unknown): number => Math.round(num(value));
export const ratio = (numerator: number, denominator: number): number => (denominator !== 0 ? numerator / denominator : 0);
export const sumOf = (rows: readonly ReportRow[], key: string): number => rows.reduce((total, row) => total + num(row[key]), 0);

export function rangeOf(filter: ReportFilter): DateRange {
  return { from: filter.from, to: filter.to };
}

/* --------------------------------- labels -------------------------------- */

export const text = (value: string): Label => ({ kind: 'text', text: value });
export const i18n = (key: TranslationKey): Label => ({ kind: 'i18n', key });
export const enumLabel = (group: EnumGroup, value: string): Label => ({ kind: 'enum', group, value });
export const dateLabel = (value: string): Label => ({ kind: 'date', value });
export const monthLabel = (value: string): Label => ({ kind: 'month', value });
export const hourLabel = (value: string): Label => ({ kind: 'hour', value });
export const rateLabel = (basisPoints: number): Label => ({ kind: 'rate', value: basisPoints });
export const numberLabel = (value: number): Label => ({ kind: 'number', value });
/** 0 = Sunday … 6 = Saturday. */
export const weekdayLabel = (day: number): Label => ({ kind: 'weekday', value: day });
/** Bangladesh retail week order: Saturday first. */
export const WEEK_ORDER: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

export function nameLabel(row: ReportRow, enKey = 'name_en', bnKey = 'name_bn'): Label {
  const en = str(row[enKey]) || str(row.name);
  return { kind: 'bilingual', text: { en, bn: str(row[bnKey]) || en } };
}

export const amount = (value: number, kind: ValueKind = 'money'): ReportParam => ({ value, kind });

export function say(key: TranslationKey, params?: Record<string, ReportParam>): ReportText {
  return { key, params };
}

/* --------------------------------- buckets ------------------------------- */

export function byKey(rows: readonly ReportRow[], key = 'key'): Map<string, ReportRow> {
  return new Map(rows.map((row) => [str(row[key]), row]));
}

/** Every local date "yyyy-mm-dd" in the range (charts and registers without gaps). */
export function daysOf(range: DateRange): string[] {
  return eachLocalDate(range);
}

/** Every local month "yyyy-mm" touched by the range. */
export function monthsOf(range: DateRange): string[] {
  const months: string[] = [];
  let cursor = startOfMonth(new Date(range.from));
  const end = new Date(range.to);
  while (cursor < end && months.length < 120) {
    months.push(toLocalDate(cursor).slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** Trading hours 07–22 plus any hour that actually has data. */
export function hoursOf(rows: readonly ReportRow[]): string[] {
  const keys = new Set<string>();
  for (let hour = 7; hour <= 22; hour += 1) keys.add(String(hour).padStart(2, '0'));
  for (const row of rows) if (str(row.key)) keys.add(str(row.key));
  return [...keys].sort();
}

/** Whole days in a range (for per-day averages). */
export function dayCount(range: DateRange): number {
  return Math.max(1, daysOf(range).length);
}

export function isSingleDay(range: DateRange): boolean {
  return daysOf(range).length <= 1;
}

export function localDateOf(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : toLocalDate(new Date(iso));
}

export function monthStart(key: string): Date {
  return parseLocalDate(`${key}-01`);
}

/* ------------------------------ table columns ---------------------------- */

const NUMERIC: ReadonlySet<ValueKind | 'date' | 'datetime' | 'text'> = new Set(['money', 'number', 'quantity', 'percent']);

export function col(key: string, labelKey: TranslationKey, kind: ReportColumnDef['kind'], options: Partial<ReportColumnDef> = {}): ReportColumnDef {
  return { key, labelKey, kind, align: NUMERIC.has(kind as ValueKind) ? 'end' : 'start', ...options };
}

/** Items only included when a condition holds (e.g. financial columns). */
export function when<T>(condition: boolean, ...items: T[]): T[] {
  return condition ? items : [];
}

/** Adds `share` (fraction of the total of `key`) to every row. */
export function withShare(rows: ReportRowData[], key: string, target = 'share'): ReportRowData[] {
  const total = rows.reduce((sum, row) => sum + num(row[key]), 0);
  return rows.map((row) => ({ ...row, [target]: total > 0 ? num(row[key]) / total : 0 }));
}

/** Copies only the listed keys of a query row into a table row. */
export function pickRow(row: ReportRow, keys: readonly string[]): ReportRowData {
  const result: ReportRowData = {};
  for (const key of keys) {
    const value = row[key];
    result[key] = (value ?? null) as ReportCell;
  }
  return result;
}

/* ---------------------------------- KPIs --------------------------------- */

export function kpi(id: string, labelKey: TranslationKey, value: number, kind: ValueKind, icon: LucideIcon, options: Partial<ReportKpi> = {}): ReportKpi {
  return { id, labelKey, value, kind, icon, ...options };
}

/* --------------------------------- charts -------------------------------- */

interface TopBarOptions {
  id: string;
  titleKey: TranslationKey;
  categoryKey: TranslationKey;
  valueKey: TranslationKey;
  valueKind: ValueKind;
  label: (row: ReportRow) => Label;
  value: (row: ReportRow) => number;
  secondary?: (row: ReportRow) => ReportText | undefined;
  limit?: number;
  span?: 'full' | 'half';
  subtitle?: ReportText;
}

/** Ranked bar list of the top N rows by value (descending, zero rows dropped). */
export function topBar(rows: readonly ReportRow[], options: TopBarOptions): BarChartSpec {
  const items = rows
    .map((row, index) => ({ key: str(row.id) || str(row.key) || String(index), label: options.label(row), value: options.value(row), secondary: options.secondary?.(row) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, options.limit ?? 10);
  return {
    kind: 'bar',
    id: options.id,
    titleKey: options.titleKey,
    subtitle: options.subtitle,
    categoryKey: options.categoryKey,
    valueKey: options.valueKey,
    valueKind: options.valueKind,
    span: options.span,
    items,
  };
}

interface ChartMeta {
  id: string;
  titleKey: TranslationKey;
  categoryKey: TranslationKey;
  valueKey: TranslationKey;
  valueKind: ValueKind;
  span?: 'full' | 'half';
  subtitle?: ReportText;
}

export function lineChart(meta: ChartMeta & Pick<LineChartSpec, 'points' | 'series' | 'compare'>): LineChartSpec {
  return { kind: 'line', ...meta };
}

export function columnChart(meta: ChartMeta & Pick<ColumnChartSpec, 'data' | 'highlightKey'>): ColumnChartSpec {
  return { kind: 'column', ...meta };
}

type Slice = DonutChartSpec['items'][number];

/** Part-to-whole: the largest `limit` slices plus one "Other" slice (≤ 6 segments). */
export function donutTop(slices: readonly Slice[], meta: ChartMeta & { centerKey: TranslationKey; limit?: number }): DonutChartSpec {
  const { limit = 5, ...rest } = meta;
  const sorted = slices.filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
  const other = sorted.slice(limit).reduce((total, slice) => total + slice.value, 0);
  const items = other > 0 ? [...sorted.slice(0, limit), { key: '__other', label: i18n('reports.labels.other'), value: other }] : sorted.slice(0, limit);
  return { kind: 'donut', ...rest, items };
}

/** Part-to-whole in a fixed categorical order, so a category keeps its colour everywhere. */
export function donutFixed(order: readonly string[], values: ReadonlyMap<string, number>, label: (key: string) => Label, meta: ChartMeta & { centerKey: TranslationKey }): DonutChartSpec {
  const items = order.map((key) => ({ key, label: label(key), value: values.get(key) ?? 0 })).filter((slice) => slice.value > 0);
  return { kind: 'donut', ...meta, items };
}

/** Σ of `valueKey` per value of `groupKey` (rows already aggregated in SQL, e.g. method + provider). */
export function totalsBy(rows: readonly ReportRow[], groupKey: string, valueKey: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row[groupKey] === null || row[groupKey] === undefined ? '' : String(row[groupKey]);
    totals.set(key, (totals.get(key) ?? 0) + num(row[valueKey]));
  }
  return totals;
}

/** The item with the largest value (first one on ties); undefined for an empty list or all zeros. */
export function bestOf<T>(items: readonly T[], value: (item: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) if (value(item) > 0 && (best === undefined || value(item) > value(best))) best = item;
  return best;
}

/**
 * Groups a small, already-fetched list (≤ a few hundred rows) by `idKey`:
 * row count and the sum of `amountKey`, keeping the English/Bangla names.
 */
export function groupBy(rows: readonly ReportRow[], idKey: string, names: { en?: string; bn?: string } = {}, amountKey?: string): ReportRow[] {
  const groups = new Map<string, { id: string; name_en: string; name_bn: string; count: number; amount: number }>();
  for (const row of rows) {
    const id = str(row[idKey]) || '—';
    const en = names.en ? str(row[names.en]) || id : id;
    const entry = groups.get(id) ?? { id, name_en: en, name_bn: names.bn ? str(row[names.bn]) || en : en, count: 0, amount: 0 };
    entry.count += 1;
    if (amountKey) entry.amount += num(row[amountKey]);
    groups.set(id, entry);
  }
  return [...groups.values()];
}
