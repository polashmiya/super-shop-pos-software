import { toLocalDate } from '@/domain/dates';
import type { ReportDocumentProps } from '@/features/printing/A4Documents';
import { buildReportDocument, openPrintPreview } from '@/features/printing/printService';
import { dataService } from '@/services/dataService';
import { toast } from '@/stores/uiStore';
import type { DateRange } from '@/types';
import { exportFileName, toCsv, type CsvCell } from '@/utils/csv';
import { cellText, csvCellValue, formatValue, resolveLabel, statementParts, type LabelContext } from './labels';
import { columnTotal, hasTotals } from './tableModel';
import type { ChartSpec, ReportColumnDef, ReportDefinition, ReportResult, ReportRowData, ReportStatement } from './types';

/* ==========================================================================
   Report output: CSV (the table as listed), JSON (everything, raw values,
   money in poisha) and the A4 print-out through the in-app preview.
   ========================================================================== */

export interface ReportExport {
  definition: ReportDefinition;
  result: ReportResult;
  /** Rows as listed on screen (search + sort applied). */
  rows: ReportRowData[];
  /** Columns the user has visible (print); CSV/JSON always carry every column. */
  columns: ReportColumnDef[];
  ctx: LabelContext;
  title: string;
  periodText: string;
  filtersText: string;
  range: DateRange | null;
  /** Filters in effect (raw ids/codes) for the JSON export. */
  filters: Record<string, string>;
}

type Section = ReportDocumentProps['sections'][number];

const PRINT_ROW_LIMIT = 2000;

async function save(fileName: string, content: string, kind: 'csv' | 'json', rows: number): Promise<void> {
  try {
    const saved = await dataService.saveFile(fileName, content, kind);
    if (saved.ok) toast.success('reports.view.exported', { key: 'reports.view.exportedRows', params: { count: rows } });
    else if (saved.reason !== 'cancelled') toast.error('errors.saveFailed');
  } catch (error) {
    toast.fromError(error);
  }
}

const totalCell = (column: ReportColumnDef, rows: readonly ReportRowData[]): ReportRowData => ({ [column.key]: columnTotal(column, rows) });

export async function exportReportCsv(input: ReportExport): Promise<void> {
  const { ctx } = input;
  const columns = input.result.table.columns;
  if (input.rows.length === 0) {
    toast.info('reports.view.nothingToExport');
    return;
  }
  const lines: CsvCell[][] = input.rows.map((row) => columns.map((column) => csvCellValue(column, row, ctx)));
  if (hasTotals(columns)) {
    lines.push(columns.map((column, index) => (columnTotal(column, input.rows) === null ? (index === 0 ? ctx.t('reports.view.total') : '') : csvCellValue(column, totalCell(column, input.rows), ctx))));
  }
  await save(exportFileName(`report-${input.definition.id}`, 'csv'), toCsv(columns.map((column) => ctx.t(column.labelKey)), lines), 'csv', input.rows.length);
}

function chartData(chart: ChartSpec, ctx: LabelContext): Array<Record<string, string | number>> {
  switch (chart.kind) {
    case 'line':
      return chart.points.map((point, index) => ({ label: resolveLabel(point, ctx), ...Object.fromEntries(chart.series.map((series) => [series.key, series.values[index] ?? 0])) }));
    case 'column':
      return chart.data.map((datum) => ({ key: datum.key, label: resolveLabel(datum.label, ctx), value: datum.value }));
    default:
      return chart.items.map((item) => ({ key: item.key, label: resolveLabel(item.label, ctx), value: item.value }));
  }
}

export async function exportReportJson(input: ReportExport): Promise<void> {
  const { ctx, result } = input;
  if (result.empty && input.rows.length === 0) {
    toast.info('reports.view.nothingToExport');
    return;
  }
  const columns = result.table.columns;
  const payload = {
    report: input.definition.id,
    title: input.title,
    generatedAt: new Date().toISOString(),
    period: input.range,
    filters: input.filters,
    moneyUnit: 'poisha (1/100 taka)',
    percentUnit: 'fraction (0.12 = 12%)',
    kpis: result.kpis.map((kpi) => ({ id: kpi.id, label: ctx.t(kpi.labelKey), kind: kpi.kind, value: kpi.value })),
    statement: result.statement
      ? { title: ctx.t(result.statement.titleKey), lines: result.statement.lines.map((line) => ({ key: line.key, label: resolveLabel(line.label, ctx), role: line.role, value: line.value ?? null })) }
      : null,
    charts: result.charts.map((chart) => ({ id: chart.id, title: ctx.t(chart.titleKey), kind: chart.kind, valueKind: chart.valueKind, data: chartData(chart, ctx) })),
    table: {
      columns: columns.map((column) => ({ key: column.key, label: ctx.t(column.labelKey), kind: column.kind })),
      rows: input.rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, row[column.key] ?? null]))),
      totals: Object.fromEntries(columns.filter((column) => columnTotal(column, input.rows) !== null).map((column) => [column.key, columnTotal(column, input.rows)])),
    },
  };
  await save(exportFileName(`report-${input.definition.id}`, 'json'), JSON.stringify(payload, null, 2), 'json', input.rows.length);
}

function statementSection(statement: ReportStatement, ctx: LabelContext): Section {
  return {
    title: ctx.t(statement.titleKey),
    headers: [ctx.t('reports.col.label'), ctx.t('reports.col.amount')],
    numeric: [false, true],
    rows: statement.lines.map((line) => {
      const parts = statementParts(line, ctx);
      return [`${parts.operator} ${resolveLabel(line.label, ctx)}`.trim(), parts.amount];
    }),
  };
}

function chartSection(chart: ChartSpec, ctx: LabelContext): Section | null {
  if (chart.kind !== 'bar' && chart.kind !== 'donut') return null;
  if (chart.items.length === 0) return null;
  return {
    title: ctx.t(chart.titleKey),
    headers: [ctx.t(chart.categoryKey), ctx.t(chart.valueKey)],
    numeric: [false, true],
    rows: chart.items.slice(0, 12).map((item) => [resolveLabel(item.label, ctx), formatValue(item.value, chart.valueKind, ctx)]),
  };
}

export async function printReport(input: ReportExport): Promise<void> {
  const { ctx, result } = input;
  try {
    const columns = input.columns;
    const sections: Section[] = [];
    if (result.statement) sections.push(statementSection(result.statement, ctx));
    for (const chart of result.charts) {
      const section = chartSection(chart, ctx);
      if (section) sections.push(section);
    }
    const limited = input.rows.length > PRINT_ROW_LIMIT;
    sections.push({
      title: limited ? `${ctx.t('reports.view.tableTitle')} — ${ctx.t('reports.view.printLimited', { count: PRINT_ROW_LIMIT })}` : ctx.t('reports.view.tableTitle'),
      headers: columns.map((column) => ctx.t(column.labelKey)),
      numeric: columns.map((column) => column.align === 'end'),
      rows: input.rows.slice(0, PRINT_ROW_LIMIT).map((row) => columns.map((column) => cellText(column, row, ctx))),
      totals: hasTotals(columns)
        ? columns.map((column, index) => (columnTotal(column, input.rows) === null ? (index === 0 ? ctx.t('reports.view.total') : '') : cellText(column, totalCell(column, input.rows), ctx)))
        : undefined,
    });
    const request = await buildReportDocument({
      title: input.title,
      subtitle: `${input.periodText} · ${input.filtersText}`,
      kpis: result.kpis.map((kpi) => ({ label: ctx.t(kpi.labelKey), value: formatValue(kpi.value, kpi.kind, ctx) })),
      sections,
      landscape: Boolean(input.definition.landscape) || columns.length > 7,
      fileName: `${input.definition.id}-${toLocalDate(new Date())}.pdf`,
    });
    await openPrintPreview(request);
  } catch (error) {
    toast.fromError(error);
  }
}
