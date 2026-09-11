// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { REPORTS, getReport } from '@/features/reports/definitions';
import { DEFAULT_EXTRA, type LoadOptions, type ReportDefinition, type ReportResult, type StatementLine } from '@/features/reports/types';
import { translate } from '@/i18n';
import { defaultReportFilter } from '@/services/reportService';
import type { ReportFilter, ReportId } from '@/types';
import { createServiceHarness, errorCode, type ServiceHarness } from '../helpers/services';

/* ==========================================================================
   Every report definition loads against the seeded demo database, and the
   headline numbers reconcile (gross → net, tendered − change, VAT).
   ========================================================================== */

let harness: ServiceHarness;

const options = (overrides: Partial<LoadOptions> = {}): LoadOptions => ({ extra: DEFAULT_EXTRA, canFinancial: true, summaryOnly: false, now: harness.now, ...overrides });
const filterFor = (report: ReportDefinition, period: ReportFilter['period'] = 'last_30_days'): ReportFilter =>
  defaultReportFilter(report.period === 'snapshot' ? 'today' : period);
const report = (id: ReportId): ReportDefinition => {
  const definition = getReport(id);
  if (!definition) throw new Error(`Missing report ${id}`);
  return definition;
};
const kpiValue = (result: ReportResult, id: string): number => {
  const found = result.kpis.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing KPI ${id}`);
  return found.value;
};
const statementValue = (result: ReportResult, key: string): number => {
  const found = result.statement?.lines.find((entry: StatementLine) => entry.key === key);
  if (!found || found.value === undefined) throw new Error(`Missing statement line ${key}`);
  return found.value;
};

beforeAll(async () => {
  harness = await createServiceHarness({ user: 'nusrat' });
}, 120_000);

describe('report definitions', () => {
  it('registers all 25 reports with translated names in both languages', () => {
    expect(REPORTS).toHaveLength(25);
    expect(new Set(REPORTS.map((entry) => entry.id)).size).toBe(25);
    for (const entry of REPORTS) {
      for (const language of ['en', 'bn'] as const) {
        const title = translate(language, 'en', `reports.items.${entry.id}.title`);
        expect(title, `${language} ${entry.id}`).not.toContain('reports.items');
        expect(translate(language, 'en', `reports.items.${entry.id}.description`)).not.toContain('reports.items');
      }
    }
    expect(getReport('nope')).toBeNull();
  });

  it('loads every report with consistent tables, charts and KPIs', async () => {
    for (const entry of REPORTS) {
      const result = await entry.load(filterFor(entry), options());
      const keys = result.table.columns.map((column) => column.key);
      expect(new Set(keys).size, `${entry.id} column keys`).toBe(keys.length);
      const rowKeys = result.table.rows.map((row) => String(row[result.table.rowKey]));
      expect(new Set(rowKeys).size, `${entry.id} row keys`).toBe(rowKeys.length);
      for (const kpi of result.kpis) expect(Number.isFinite(kpi.value), `${entry.id} ${kpi.id}`).toBe(true);
      for (const chart of result.charts) {
        const values =
          chart.kind === 'line' ? chart.series.flatMap((series) => series.values) : chart.kind === 'column' ? chart.data.map((datum) => datum.value) : chart.items.map((item) => item.value);
        expect(values.every(Number.isFinite), `${entry.id} ${chart.id}`).toBe(true);
        if (chart.kind === 'donut') expect(chart.items.length).toBeLessThanOrEqual(6);
        if (chart.kind === 'line') for (const series of chart.series) expect(series.values).toHaveLength(chart.points.length);
      }
      if (entry.id !== 'out-of-stock' && entry.id !== 'low-stock') expect(result.empty, `${entry.id} has data`).toBe(false);
      if (entry.compare) {
        const previous = await entry.load(filterFor(entry), options({ summaryOnly: true }));
        expect(previous.kpis.map((kpi) => kpi.id)).toEqual(result.kpis.map((kpi) => kpi.id));
      }
    }
  });

  it('reconciles the sales summary: net sales = gross − discounts − returns', async () => {
    const result = await report('sales-summary').load(defaultReportFilter('last_30_days'), options());
    const gross = statementValue(result, 'gross');
    const discounts = statementValue(result, 'itemDiscount') + statementValue(result, 'orderDiscount');
    const returns = statementValue(result, 'returns');
    const net = statementValue(result, 'net');
    expect(net).toBe(gross - discounts - returns);
    expect(kpiValue(result, 'net')).toBe(net);
    expect(kpiValue(result, 'discount')).toBe(discounts);
    const takings = statementValue(result, 'takings');
    expect(takings).toBe(net + statementValue(result, 'vatAdded') + statementValue(result, 'rounding'));
    expect(takings).toBe(statementValue(result, 'invoiced') - returns);
    const tableSales = result.table.rows.reduce((sum, row) => sum + Number(row.sales), 0);
    expect(tableSales).toBe(statementValue(result, 'invoiced'));
  });

  it('reconciles payments (tendered − change = received = invoiced) and VAT', async () => {
    const filter = defaultReportFilter('last_30_days');
    const payments = await report('payment-methods').load(filter, options());
    expect(statementValue(payments, 'received')).toBe(statementValue(payments, 'tendered') - statementValue(payments, 'change'));
    expect(statementValue(payments, 'difference')).toBe(0);
    const summary = await report('sales-summary').load(filter, options());
    expect(kpiValue(payments, 'received')).toBe(statementValue(summary, 'invoiced'));
    const vat = await report('vat').load(filter, options());
    expect(kpiValue(vat, 'vat')).toBe(kpiValue(summary, 'vat'));
    expect(statementValue(vat, 'net')).toBe(statementValue(vat, 'sales') - statementValue(vat, 'returns'));
  });

  it('keeps cost and profit behind reports.financial', async () => {
    const products = await report('product-sales').load(defaultReportFilter('last_30_days'), options({ canFinancial: false }));
    expect(products.table.columns.some((column) => column.key === 'profit')).toBe(false);
    expect(products.kpis.some((kpi) => kpi.id === 'profit')).toBe(false);
    harness.withoutPermission('reports.financial');
    try {
      expect(await errorCode(report('profit-estimate').load(defaultReportFilter('last_30_days'), options({ canFinancial: false })))).toBe('permissionDenied');
      expect(await errorCode(report('stock-valuation').load(defaultReportFilter('today'), options({ canFinancial: false })))).toBe('permissionDenied');
    } finally {
      await harness.signIn('nusrat');
    }
  });
});
