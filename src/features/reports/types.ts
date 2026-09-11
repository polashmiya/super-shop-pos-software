import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@/config/permissions';
import type { TranslationKey } from '@/i18n';
import type { Tone } from '@/components/ui/Display';
import type { BilingualText, CashMovementType, CustomerType, DateRange, ReportCell, ReportColumn, ReportFilter, ReportId, ReportPeriod, StockMovementType } from '@/types';

/* ==========================================================================
   Reports module types. Loaders are pure data functions: they return label
   *specs* (not translated strings) so the screen formats every number, date
   and name in the current language/numeral setting — and re-renders on a
   language switch without reloading.
   ========================================================================== */

export type ReportGroup = 'sales' | 'products' | 'people' | 'finance' | 'operations';

export const REPORT_GROUPS: readonly ReportGroup[] = ['sales', 'products', 'people', 'finance', 'operations'];

export type FilterKey =
  | 'cashier'
  | 'counter'
  | 'category'
  | 'brand'
  | 'supplier'
  | 'customerType'
  | 'paymentMethod'
  | 'movementType'
  | 'cashType'
  | 'rankBy'
  | 'search';

export type ValueKind = 'money' | 'number' | 'quantity' | 'percent';

/** Filters that are not part of ReportFilter (passed to queries as `extra`). */
export interface ReportExtraFilters {
  customerType: CustomerType | 'all';
  movementType: StockMovementType | 'all';
  cashType: CashMovementType | 'all';
  rankBy: 'amount' | 'quantity';
}

export const DEFAULT_EXTRA: ReportExtraFilters = { customerType: 'all', movementType: 'all', cashType: 'all', rankBy: 'amount' };

/** Enum groups translated through `enums.<group>.<value>` or report labels. */
export type EnumGroup =
  | 'paymentMethod'
  | 'mobileProvider'
  | 'cardNetwork'
  | 'customerType'
  | 'movementType'
  | 'purchaseStatus'
  | 'shiftStatus'
  | 'expenseStatus'
  | 'paidFrom'
  | 'refundMethod'
  | 'role'
  | 'cashMovement'
  | 'drawer'
  | 'stockHealth'
  | 'customerSegment'
  /** Mobile-banking provider or card network code (bkash, nagad, visa…). */
  | 'provider'
  | 'adjustmentReason';

/** A label resolved at render time (language, numerals, date style). */
export type Label =
  | { kind: 'text'; text: string }
  | { kind: 'i18n'; key: TranslationKey }
  | { kind: 'bilingual'; text: BilingualText }
  | { kind: 'enum'; group: EnumGroup; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'month'; value: string }
  | { kind: 'hour'; value: string }
  | { kind: 'rate'; value: number }
  | { kind: 'datetime'; value: string }
  /** Day of the week, 0 = Sunday … 6 = Saturday. */
  | { kind: 'weekday'; value: number }
  /** A plain integer (ranks), shown in the current numeral system. */
  | { kind: 'number'; value: number };

export type ReportParam = string | Label | { value: number; kind: ValueKind };

export interface ReportText {
  key: TranslationKey;
  params?: Record<string, ReportParam>;
}

export interface ReportKpi {
  id: string;
  labelKey: TranslationKey;
  value: number;
  kind: ValueKind;
  icon: LucideIcon;
  tone?: Tone;
  /** Lower is better (returns, discounts): inverts the delta colour. */
  invert?: boolean;
  hint?: ReportText;
  /** Include in the previous-period comparison (default true). */
  comparable?: boolean;
}

interface ChartBase {
  id: string;
  titleKey: TranslationKey;
  subtitle?: ReportText;
  valueKind: ValueKind;
  /** Header of the label column in the chart's table view. */
  categoryKey: TranslationKey;
  /** Header of the value column in the chart's table view. */
  valueKey: TranslationKey;
  span?: 'full' | 'half';
}

export interface LineSeriesSpec {
  key: string;
  labelKey: TranslationKey;
  values: number[];
}

export interface LineChartSpec extends ChartBase {
  kind: 'line';
  points: Label[];
  /** One or more series on the same axis (a legend appears for two or more). */
  series: LineSeriesSpec[];
  /** Adds the previous period of the first series as a muted dashed line when comparing. */
  compare?: boolean;
}

export interface ColumnChartSpec extends ChartBase {
  kind: 'column';
  data: Array<{ key: string; label: Label; value: number }>;
  /** Emphasised column (e.g. the best day); the others are slightly muted. */
  highlightKey?: string;
}

export interface BarChartSpec extends ChartBase {
  kind: 'bar';
  items: Array<{ key: string; label: Label; value: number; secondary?: ReportText }>;
}

export interface DonutChartSpec extends ChartBase {
  kind: 'donut';
  items: Array<{ key: string; label: Label; value: number }>;
  centerKey: TranslationKey;
}

export type ChartSpec = LineChartSpec | ColumnChartSpec | BarChartSpec | DonutChartSpec;

/**
 * Totals row: sum of the column, a ratio of two row sums (margins, shares),
 * the sum of another row key (e.g. amounts that exclude rejected rows) or none.
 */
export type ColumnTotal = 'sum' | { ratio: [numerator: string, denominator: string] } | { sumOf: string } | 'none';

/** How a text/number cell is shown (the raw value stays in exports). */
export type ColumnDisplay = 'hour' | 'month' | 'rate' | 'weekday';

export interface ReportColumnDef extends ReportColumn {
  labelKey: TranslationKey;
  /** Cell holds an enum code translated through its group. */
  enumGroup?: EnumGroup;
  /** Row key holding the Bangla text (the cell key holds the English text). */
  bnKey?: string;
  /** Hidden until the user shows it (column visibility). */
  hidden?: boolean;
  /** Prefix positive values with + (differences, stock movements). */
  signed?: boolean;
  /** Colour positive/negative values (success/danger) — the sign stays as the non-colour cue. */
  signTone?: boolean;
  /** Render enum values as a status badge (colour + icon + text). */
  tones?: Record<string, Tone>;
  total?: ColumnTotal;
  /** Keep a column narrow (wraps long text). */
  wrap?: boolean;
  /** Document numbers and SKUs in the monospace face. */
  mono?: boolean;
  display?: ColumnDisplay;
  /** Shown (and exported) when the cell is empty, e.g. "Walk-in" or "Never". */
  fallbackKey?: TranslationKey;
}

export type ReportRowData = Record<string, ReportCell>;

export interface ReportTableData {
  columns: ReportColumnDef[];
  rows: ReportRowData[];
  rowKey: string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  /** Row keys matched by the search box. */
  searchKeys?: string[];
  notice?: ReportText;
}

export type StatementRole = 'base' | 'add' | 'subtract' | 'total' | 'info' | 'heading';

export interface StatementLine {
  key: string;
  label: Label;
  value?: number;
  kind?: ValueKind;
  role: StatementRole;
}

export interface ReportStatement {
  titleKey: TranslationKey;
  subtitle?: ReportText;
  lines: StatementLine[];
}

export interface ReportResult {
  kpis: ReportKpi[];
  charts: ChartSpec[];
  statement?: ReportStatement;
  table: ReportTableData;
  /** True when the period/filters produced no data (empty state). */
  empty: boolean;
}

export interface LoadOptions {
  extra: ReportExtraFilters;
  canFinancial: boolean;
  /** Only KPIs/charts are needed (previous-period comparison). */
  summaryOnly: boolean;
  now: Date;
}

export interface ReportDefinition {
  id: ReportId;
  group: ReportGroup;
  icon: LucideIcon;
  permission: Extract<Permission, 'reports.view' | 'reports.financial'>;
  filters: FilterKey[];
  /** 'snapshot' = current stock (no period); 'range' = a period of time. */
  period: 'range' | 'snapshot';
  defaultPeriod: ReportPeriod;
  /** Range used when `defaultPeriod` is 'custom' (e.g. the last 12 months). */
  defaultRange?: (now: Date) => DateRange;
  /** Period presets offered by the picker (defaults to all). */
  periods?: ReportPeriod[];
  compare: boolean;
  emptyKey: TranslationKey;
  landscape?: boolean;
  load(filter: ReportFilter, options: LoadOptions): Promise<ReportResult>;
}
