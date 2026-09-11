import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { BarList, ChartCard, ColumnChart, DonutChart, LineChart, MiniTable, type LineSeries } from '@/components/charts/Charts';
import { cn } from '@/components/ui/cn';
import { formatValue, resolveLabel, resolveText, type LabelContext } from './labels';
import type { BarChartSpec, ChartSpec, ColumnChartSpec, DonutChartSpec, LineChartSpec, ValueKind } from './types';

/* ==========================================================================
   Renders a report's chart specs with the shared chart components: one
   axis, fixed categorical colours, hover tooltips and a table view.
   ========================================================================== */

interface ChartProps<T extends ChartSpec> {
  chart: T;
  ctx: LabelContext;
}

/** Axis ticks: compact money (৳12k, ১২ হাজার), whole numbers, whole percentages. */
function tickFormatter(kind: ValueKind, ctx: LabelContext): (value: number) => string {
  if (kind === 'money') return (value) => ctx.format.compactMoney(value);
  if (kind === 'percent') return (value) => ctx.format.percentValue(value * 100, 0);
  return (value) => ctx.format.number(value, 1);
}

const every = (count: number, target: number) => Math.max(1, Math.ceil(count / target));

function LineReportChart({ chart, ctx, previous }: ChartProps<LineChartSpec> & { previous?: number[] }) {
  const t = useT();
  const labels = chart.points.map((point) => resolveLabel(point, ctx, 'short'));
  const comparing = Boolean(chart.compare && previous);
  const series: LineSeries[] = chart.series.map((entry) => ({ key: entry.key, label: comparing ? t('reports.view.current') : t(entry.labelKey), values: entry.values }));
  if (comparing && previous) series.push({ key: 'previous', label: t('reports.view.previous'), values: labels.map((_, index) => previous[index] ?? 0), muted: true });
  const format = (value: number) => formatValue(value, chart.valueKind, ctx);
  return (
    <ChartCard
      title={t(chart.titleKey)}
      subtitle={chart.subtitle ? resolveText(chart.subtitle, ctx) : undefined}
      tableLabel={t('reports.view.table')}
      chartLabel={t('reports.view.chart')}
      table={
        <MiniTable
          headers={[t(chart.categoryKey), ...series.map((entry) => entry.label)]}
          rows={chart.points.map((point, index) => [resolveLabel(point, ctx), ...series.map((entry) => format(entry.values[index] ?? 0))])}
        />
      }
    >
      <LineChart labels={labels} series={series} formatValue={format} formatTick={tickFormatter(chart.valueKind, ctx)} labelEvery={every(labels.length, 10)} ariaLabel={t(chart.titleKey)} />
    </ChartCard>
  );
}

function ColumnReportChart({ chart, ctx }: ChartProps<ColumnChartSpec>) {
  const t = useT();
  const format = (value: number) => formatValue(value, chart.valueKind, ctx);
  return (
    <ChartCard
      title={t(chart.titleKey)}
      subtitle={chart.subtitle ? resolveText(chart.subtitle, ctx) : undefined}
      tableLabel={t('reports.view.table')}
      chartLabel={t('reports.view.chart')}
      table={<MiniTable headers={[t(chart.categoryKey), t(chart.valueKey)]} rows={chart.data.map((datum) => [resolveLabel(datum.label, ctx), format(datum.value)])} />}
    >
      <ColumnChart
        data={chart.data.map((datum) => ({ key: datum.key, label: resolveLabel(datum.label, ctx, 'short'), value: datum.value }))}
        seriesLabel={t(chart.valueKey)}
        formatValue={format}
        formatTick={tickFormatter(chart.valueKind, ctx)}
        labelEvery={every(chart.data.length, 12)}
        highlightKey={chart.highlightKey}
        ariaLabel={t(chart.titleKey)}
      />
    </ChartCard>
  );
}

function BarReportChart({ chart, ctx }: ChartProps<BarChartSpec>) {
  const t = useT();
  const format = (value: number) => formatValue(value, chart.valueKind, ctx);
  return (
    <ChartCard
      title={t(chart.titleKey)}
      subtitle={chart.subtitle ? resolveText(chart.subtitle, ctx) : undefined}
      tableLabel={t('reports.view.table')}
      chartLabel={t('reports.view.chart')}
      table={<MiniTable headers={[t(chart.categoryKey), t(chart.valueKey)]} rows={chart.items.map((item) => [resolveLabel(item.label, ctx), format(item.value)])} />}
    >
      <BarList
        emptyText={t('common.states.noResults')}
        items={chart.items.map((item) => ({
          key: item.key,
          label: resolveLabel(item.label, ctx),
          value: item.value,
          valueLabel: format(item.value),
          secondary: item.secondary ? resolveText(item.secondary, ctx) : undefined,
        }))}
      />
    </ChartCard>
  );
}

function DonutReportChart({ chart, ctx }: ChartProps<DonutChartSpec>) {
  const t = useT();
  const format = useFormat();
  const total = chart.items.reduce((sum, item) => sum + item.value, 0);
  const valueText = (value: number) => formatValue(value, chart.valueKind, ctx);
  const shareText = (share: number) => format.percentValue(share * 100);
  const items = chart.items.map((item) => ({ key: item.key, label: resolveLabel(item.label, ctx), value: item.value, valueLabel: valueText(item.value), share: total > 0 ? item.value / total : 0 }));
  return (
    <ChartCard
      title={t(chart.titleKey)}
      subtitle={chart.subtitle ? resolveText(chart.subtitle, ctx) : undefined}
      tableLabel={t('reports.view.table')}
      chartLabel={t('reports.view.chart')}
      table={<MiniTable headers={[t(chart.categoryKey), t(chart.valueKey), t('reports.col.share')]} rows={items.map((item) => [item.label, item.valueLabel, shareText(item.share)])} />}
    >
      {items.length === 0 ? (
        <p className="type-body-sm py-6 text-center text-fg-muted">{t('common.states.noResults')}</p>
      ) : (
        <DonutChart
          items={items}
          centerLabel={t(chart.centerKey)}
          centerValue={chart.valueKind === 'money' ? format.compactMoney(total) : valueText(total)}
          ariaLabel={t(chart.titleKey)}
          formatShare={shareText}
        />
      )}
    </ChartCard>
  );
}

/** One chart spec; `previous` is the same chart of the comparison period (line charts). */
export function ReportChart({ chart, ctx, previous, className }: { chart: ChartSpec; ctx: LabelContext; previous?: ChartSpec; className?: string }) {
  const body = (() => {
    switch (chart.kind) {
      case 'line':
        return <LineReportChart chart={chart} ctx={ctx} previous={previous?.kind === 'line' ? previous.series[0]?.values : undefined} />;
      case 'column':
        return <ColumnReportChart chart={chart} ctx={ctx} />;
      case 'bar':
        return <BarReportChart chart={chart} ctx={ctx} />;
      default:
        return <DonutReportChart chart={chart} ctx={ctx} />;
    }
  })();
  return <div className={cn('min-w-0 [&>section]:h-full', chart.span === 'full' && 'xl:col-span-2', className)}>{body}</div>;
}
