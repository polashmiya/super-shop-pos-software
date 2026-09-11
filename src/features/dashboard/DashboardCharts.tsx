import { Link } from 'react-router';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { DashboardView } from '@/services/reportService';
import { BarList, ChartCard, ColumnChart, DonutChart, MiniTable } from '@/components/charts/Charts';
import { EmptyState } from '@/components/ui/States';

/* Trend, payment mix, top products, top categories and cashier performance. */

export function TrendCard({ view, loading }: { view: DashboardView | null; loading: boolean }) {
  const t = useT();
  const format = useFormat();
  const hourly = view?.trendKind !== 'day';
  const data = (view?.trend ?? []).map((bucket) => {
    if (hourly) return { key: bucket.key, label: format.digits(`${Number(bucket.key)}:00`), value: bucket.sales };
    const date = new Date(`${bucket.key}T00:00:00`);
    return { key: bucket.key, label: view?.period === 'this_week' ? format.weekday(date) : format.digits(String(date.getDate())), value: bucket.sales };
  });
  const total = view?.trend.reduce((sum, bucket) => sum + bucket.sales, 0) ?? 0;
  const orders = view?.trend.reduce((sum, bucket) => sum + bucket.orders, 0) ?? 0;
  return (
    <ChartCard
      title={hourly ? t('dashboard.trend.hourTitle') : t('dashboard.trend.dayTitle')}
      subtitle={view ? t('dashboard.trend.total', { amount: format.money(total), orders: t('common.units.orders', { count: orders }) }) : undefined}
      loading={loading}
      chartLabel={t('dashboard.chartLabel')}
      tableLabel={t('dashboard.tableLabel')}
      table={<MiniTable headers={[hourly ? t('dashboard.trend.time') : t('dashboard.trend.day'), t('dashboard.trend.series'), t('dashboard.kpi.orders')]} rows={(view?.trend ?? []).map((bucket, index) => [data[index].label, format.money(bucket.sales), format.integer(bucket.orders)])} />}
    >
      <ColumnChart
        data={data}
        height={230}
        seriesLabel={t('dashboard.trend.series')}
        formatValue={(value) => format.money(value)}
        formatTick={(value) => format.compactMoney(value)}
        labelEvery={hourly ? 2 : data.length > 16 ? 3 : 1}
        ariaLabel={t('dashboard.trend.aria')}
      />
    </ChartCard>
  );
}

export function PaymentsCard({ view, loading }: { view: DashboardView | null; loading: boolean }) {
  const t = useT();
  const format = useFormat();
  const grouped = new Map<string, { label: string; value: number }>();
  for (const row of view?.payments ?? []) {
    const key = row.method === 'mobile' && row.provider ? row.provider : row.method;
    const label = row.method === 'mobile' && row.provider ? t(`enums.mobileProvider.${row.provider as 'bkash'}`) : t(`enums.paymentMethod.${row.method}`);
    const entry = grouped.get(key) ?? { label, value: 0 };
    entry.value += row.amount;
    grouped.set(key, entry);
  }
  const sorted = [...grouped.entries()].sort((a, b) => b[1].value - a[1].value);
  const total = sorted.reduce((sum, [, entry]) => sum + entry.value, 0);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((sum, [, entry]) => sum + entry.value, 0);
  const items = [...top.map(([key, entry]) => ({ key, label: entry.label, value: entry.value })), ...(rest > 0 ? [{ key: 'other', label: t('dashboard.payments.other'), value: rest }] : [])].map((item) => ({
    ...item,
    valueLabel: format.money(item.value),
    share: total > 0 ? item.value / total : 0,
  }));
  return (
    <ChartCard
      title={t('dashboard.payments.title')}
      subtitle={t('dashboard.payments.subtitle')}
      loading={loading}
      chartLabel={t('dashboard.chartLabel')}
      tableLabel={t('dashboard.tableLabel')}
      table={<MiniTable headers={[t('dashboard.payments.method'), t('common.labels.amount'), t('dashboard.payments.share')]} rows={items.map((item) => [item.label, item.valueLabel, format.percentValue(item.share * 100)])} />}
    >
      {items.length === 0 ? (
        <EmptyState compact title={t('dashboard.payments.empty')} />
      ) : (
        <DonutChart items={items} centerLabel={t('dashboard.payments.center')} centerValue={format.compactMoney(total)} ariaLabel={t('dashboard.payments.aria')} formatShare={(share) => format.percentValue(share * 100)} />
      )}
    </ChartCard>
  );
}

export function TopProductsCard({ view, loading }: { view: DashboardView | null; loading: boolean }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const rows = view?.topProducts ?? [];
  return (
    <ChartCard
      title={t('dashboard.topProducts.title')}
      subtitle={t('dashboard.topProducts.subtitle')}
      loading={loading}
      chartLabel={t('dashboard.chartLabel')}
      tableLabel={t('dashboard.tableLabel')}
      table={<MiniTable headers={[t('dashboard.topProducts.product'), t('common.labels.qty'), t('common.labels.amount')]} rows={rows.map((row) => [localize(row.name), format.quantity(row.quantity), format.money(row.amount)])} />}
    >
      <BarList
        emptyText={t('dashboard.topProducts.empty')}
        items={rows.map((row) => ({
          key: row.id,
          label: (
            <Link to={`/products/${row.id}`} className="hover:text-primary hover:underline">
              {localize(row.name)}
            </Link>
          ),
          value: row.amount,
          valueLabel: format.money(row.amount),
          secondary: t('dashboard.topProducts.sold', { qty: format.quantity(row.quantity) }),
        }))}
      />
    </ChartCard>
  );
}

export function CategoriesCard({ view, loading }: { view: DashboardView | null; loading: boolean }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const rows = (view?.categories ?? []).slice(0, 8);
  return (
    <ChartCard
      title={t('dashboard.categories.title')}
      subtitle={t('dashboard.categories.subtitle')}
      loading={loading}
      chartLabel={t('dashboard.chartLabel')}
      tableLabel={t('dashboard.tableLabel')}
      table={<MiniTable headers={[t('common.labels.category'), t('common.labels.amount'), t('dashboard.payments.share')]} rows={rows.map((row) => [localize(row.name), format.money(row.amount), format.percentValue(row.share * 100)])} />}
    >
      <BarList
        emptyText={t('dashboard.categories.empty')}
        items={rows.map((row) => ({ key: row.id, label: localize(row.name), value: row.amount, valueLabel: format.money(row.amount), secondary: format.percentValue(row.share * 100) }))}
      />
    </ChartCard>
  );
}

export function CashiersCard({ view, loading }: { view: DashboardView | null; loading: boolean }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const rows = view?.cashiers ?? [];
  return (
    <ChartCard title={t('dashboard.cashiers.title')} subtitle={t('dashboard.cashiers.subtitle')} loading={loading}>
      {rows.length === 0 ? (
        <EmptyState compact title={t('dashboard.cashiers.empty')} />
      ) : (
        <MiniTable
          headers={[t('common.labels.cashier'), t('dashboard.kpi.orders'), t('common.labels.total'), t('dashboard.cashiers.basket'), t('dashboard.cashiers.share')]}
          rows={rows.map((row) => [
            localize(row.name),
            format.integer(row.orders),
            format.money(row.amount),
            format.money(row.orders > 0 ? Math.round(row.amount / row.orders) : 0),
            format.percentValue(row.share * 100),
          ])}
        />
      )}
    </ChartCard>
  );
}
