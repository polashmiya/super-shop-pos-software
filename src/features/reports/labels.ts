import { parseLocalDate } from '@/domain/dates';
import { hasTranslation, type Language, type Translate, type TranslationKey, type TranslationParams } from '@/i18n';
import type { Formatters } from '@/utils/format';
import type { ColumnDisplay, EnumGroup, Label, ReportColumnDef, ReportParam, ReportRowData, ReportText, StatementLine, ValueKind } from './types';

/* ==========================================================================
   Turns the label specs produced by report loaders into text in the current
   language and numeral system (screen, print and CSV use the same rules).
   ========================================================================== */

export interface LabelContext {
  t: Translate;
  format: Formatters;
  language: Language;
}

const ENUM_PATHS: Record<EnumGroup, readonly string[]> = {
  paymentMethod: ['enums.paymentMethod'],
  mobileProvider: ['enums.mobileProvider'],
  cardNetwork: ['enums.cardNetwork'],
  customerType: ['enums.customerType'],
  movementType: ['enums.movementType'],
  purchaseStatus: ['enums.purchaseStatus'],
  shiftStatus: ['enums.shiftStatus'],
  expenseStatus: ['enums.expenseStatus'],
  paidFrom: ['enums.paidFrom'],
  refundMethod: ['enums.refundMethod'],
  role: ['enums.role'],
  cashMovement: ['enums.cashMovement'],
  drawer: ['reports.enums.drawer'],
  stockHealth: ['reports.enums.stockHealth'],
  customerSegment: ['reports.enums.customerSegment', 'enums.customerType'],
  provider: ['enums.mobileProvider', 'enums.cardNetwork'],
  adjustmentReason: ['enums.adjustmentReason'],
};

/** Translated label of a stored code; unknown codes are shown as stored. */
export function enumText(group: EnumGroup, value: string, t: Translate): string {
  if (!value) return '—';
  for (const path of ENUM_PATHS[group]) {
    const key = `${path}.${value}`;
    if (hasTranslation(key)) return t(key as TranslationKey);
  }
  return value;
}

/** "yyyy-mm-dd" is a local calendar date; anything else an ISO timestamp. */
export function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalDate(value) : new Date(value);
}

const dayMonthFormats = new Map<Language, Intl.DateTimeFormat>();

/** Compact axis label, e.g. "11 Sep" (digits follow the numeral setting). */
function shortDate(value: string, ctx: LabelContext): string {
  let formatter = dayMonthFormats.get(ctx.language);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(ctx.language === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' });
    dayMonthFormats.set(ctx.language, formatter);
  }
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '—' : ctx.format.digits(formatter.format(date));
}

function hourText(value: string, ctx: LabelContext): string {
  const hour = Number(value);
  return Number.isFinite(hour) ? ctx.format.time(new Date(2000, 0, 1, hour, 0)) : value;
}

/** 0 = Sunday … 6 = Saturday (4 Jan 2026 was a Sunday). */
function weekdayText(day: number, ctx: LabelContext): string {
  return ctx.format.weekday(new Date(2026, 0, 4 + (((day % 7) + 7) % 7)));
}

export function resolveLabel(label: Label, ctx: LabelContext, style: 'full' | 'short' = 'full'): string {
  switch (label.kind) {
    case 'text':
      return label.text || '—';
    case 'i18n':
      return ctx.t(label.key);
    case 'bilingual':
      return (ctx.language === 'bn' ? label.text.bn || label.text.en : label.text.en || label.text.bn) || '—';
    case 'enum':
      return enumText(label.group, label.value, ctx.t);
    case 'date':
      return style === 'short' ? shortDate(label.value, ctx) : ctx.format.date(toDate(label.value));
    case 'month':
      return ctx.format.monthYear(parseLocalDate(`${label.value}-01`));
    case 'hour':
      return hourText(label.value, ctx);
    case 'rate':
      return ctx.format.percent(label.value);
    case 'datetime':
      return ctx.format.dateTime(label.value);
    case 'weekday':
      return weekdayText(label.value, ctx);
    case 'number':
      return ctx.format.integer(label.value);
    default:
      return '';
  }
}

export function formatValue(value: number, kind: ValueKind, ctx: LabelContext, options: { signed?: boolean; compact?: boolean } = {}): string {
  const sign = options.signed && value > 0 ? '+' : '';
  switch (kind) {
    case 'money':
      return options.compact ? ctx.format.compactMoney(value) : ctx.format.money(value, { signed: options.signed });
    case 'quantity':
      return sign + ctx.format.quantity(value);
    case 'percent':
      return sign + ctx.format.percentValue(value * 100);
    case 'number':
    default:
      return sign + (Number.isInteger(value) ? ctx.format.integer(value) : ctx.format.number(value));
  }
}

const VALUE_KINDS: ReadonlySet<string> = new Set(['money', 'number', 'quantity', 'percent']);

function isValueParam(param: Label | { value: number; kind: ValueKind }): param is { value: number; kind: ValueKind } {
  return VALUE_KINDS.has(param.kind) && 'value' in param && typeof param.value === 'number';
}

function resolveParam(param: ReportParam, ctx: LabelContext): string | number {
  if (typeof param === 'string') return param;
  if (isValueParam(param)) {
    // Plain numbers stay numbers so plural forms ({count}) and digits work in t().
    return param.kind === 'number' ? param.value : formatValue(param.value, param.kind, ctx);
  }
  return resolveLabel(param, ctx);
}

export function resolveText(text: ReportText, ctx: LabelContext): string {
  const params: TranslationParams = {};
  for (const [name, param] of Object.entries(text.params ?? {})) params[name] = resolveParam(param, ctx);
  return ctx.t(text.key, params);
}

/**
 * Operator and amount of a statement line: "+ ৳500", "− ৳200" (the operator
 * carries the sign), "= ৳1,300" for totals, plain signed value otherwise.
 */
export function statementParts(line: StatementLine, ctx: LabelContext): { operator: '' | '+' | '−' | '='; amount: string } {
  if (line.value === undefined) return { operator: '', amount: '' };
  const kind = line.kind ?? 'money';
  if (line.role === 'add' || line.role === 'subtract') {
    const minus = line.role === 'subtract' ? line.value >= 0 : line.value < 0;
    return { operator: minus ? '−' : '+', amount: formatValue(Math.abs(line.value), kind, ctx) };
  }
  return { operator: line.role === 'total' ? '=' : '', amount: formatValue(line.value, kind, ctx) };
}

function displayText(display: ColumnDisplay, raw: string | number, ctx: LabelContext): string {
  switch (display) {
    case 'hour':
      return hourText(String(raw), ctx);
    case 'month':
      return ctx.format.monthYear(parseLocalDate(`${String(raw)}-01`));
    case 'rate':
      return ctx.format.percent(Number(raw));
    case 'weekday':
      return weekdayText(Number(raw), ctx);
    default:
      return String(raw);
  }
}

/** The text of a text column in the current language (Bangla key when there is one). */
function textIn(column: ReportColumnDef, row: ReportRowData, raw: string | number, language: Language): string {
  if (column.bnKey && language === 'bn') {
    const bn = row[column.bnKey];
    if (typeof bn === 'string' && bn) return bn;
  }
  return String(raw);
}

/** Display text of a table cell (screen and print). */
export function cellText(column: ReportColumnDef, row: ReportRowData, ctx: LabelContext): string {
  const raw = row[column.key];
  if (raw === null || raw === undefined || raw === '') return column.fallbackKey ? ctx.t(column.fallbackKey) : '—';
  if (column.enumGroup) return enumText(column.enumGroup, String(raw), ctx.t);
  if (column.display) return displayText(column.display, raw, ctx);
  switch (column.kind) {
    case 'text':
      return textIn(column, row, raw, ctx.language);
    case 'date':
      return ctx.format.date(toDate(String(raw)));
    case 'datetime':
      return ctx.format.dateTime(String(raw));
    default:
      return typeof raw === 'number' ? formatValue(raw, column.kind as ValueKind, ctx, { signed: column.signed }) : String(raw);
  }
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Spreadsheet-friendly cell: plain decimals, ISO-like dates, translated codes. */
export function csvCellValue(column: ReportColumnDef, row: ReportRowData, ctx: LabelContext): string | number {
  const raw = row[column.key];
  if (raw === null || raw === undefined || raw === '') return column.fallbackKey ? ctx.t(column.fallbackKey) : '';
  if (column.enumGroup || column.display === 'weekday') return cellText(column, row, ctx);
  if (column.display === 'hour') return `${String(raw).padStart(2, '0')}:00`;
  if (column.display === 'month') return String(raw);
  if (column.display === 'rate') return (Number(raw) / 100).toFixed(2);
  switch (column.kind) {
    case 'money':
      return (Number(raw) / 100).toFixed(2);
    case 'percent':
      return (Number(raw) * 100).toFixed(2);
    case 'date': {
      const date = toDate(String(raw));
      return Number.isNaN(date.getTime()) ? String(raw) : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    case 'datetime': {
      const date = new Date(String(raw));
      return Number.isNaN(date.getTime()) ? String(raw) : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    case 'text':
      return textIn(column, row, raw, ctx.language);
    default:
      return raw;
  }
}
