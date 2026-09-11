import { BadgePercent, Calculator, Landmark, ShoppingBag, TrendingUp, Undo2, Users, Wallet } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { DashboardView } from '@/services/reportService';
import { StatCard } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { change } from './dashboardData';

/** Headline numbers with a change against the comparison window. */
export function DashboardKpis({ view, showProfit }: { view: DashboardView | null; showProfit: boolean }) {
  const t = useT();
  const format = useFormat();
  const count = showProfit ? 8 : 7;

  if (!view) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className="h-[7rem] rounded-xl" />
        ))}
      </div>
    );
  }

  const { kpis, previous, customers } = view;
  const vs = t(`dashboard.vs.${view.period}`);
  const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${format.percentValue(value * 100, Math.abs(value) < 0.1 ? 1 : 0)}`;
  const delta = (current: number, before: number) => ({ delta: change(current, before), deltaLabel: previous.orders > 0 || before > 0 ? vs : t('dashboard.noComparison'), formatDelta });
  const profit = kpis.grossProfit;
  const margin = kpis.netSales > 0 ? (profit / (kpis.grossSales - kpis.taxTotal || 1)) * 100 : 0;

  return (
    <section aria-label={t('dashboard.kpi.netSales')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label={t('dashboard.kpi.netSales')} value={format.money(kpis.netSales)} icon={TrendingUp} tone="primary" {...delta(kpis.netSales, previous.netSales)} />
      <StatCard label={t('dashboard.kpi.orders')} value={format.integer(kpis.orders)} icon={ShoppingBag} tone="info" {...delta(kpis.orders, previous.orders)} />
      <StatCard label={t('dashboard.kpi.averageBasket')} value={format.money(kpis.averageOrder)} icon={Calculator} tone="neutral" {...delta(kpis.averageOrder, previous.averageOrder)} />
      {showProfit && (
        <StatCard
          label={t('dashboard.kpi.grossProfit')}
          value={format.money(profit)}
          icon={Wallet}
          tone="success"
          {...delta(profit, previous.grossProfit)}
          deltaLabel={t('dashboard.kpi.margin', { rate: format.percentValue(margin) })}
        />
      )}
      <StatCard
        label={t('dashboard.kpi.discounts')}
        value={format.money(kpis.discountTotal)}
        icon={BadgePercent}
        tone="warning"
        hint={kpis.grossSales > 0 ? t('dashboard.kpi.ofSales', { rate: format.percentValue((kpis.discountTotal / kpis.grossSales) * 100) }) : undefined}
      />
      <StatCard label={t('dashboard.kpi.vat')} value={format.money(kpis.taxTotal)} icon={Landmark} tone="info" {...delta(kpis.taxTotal, previous.taxTotal)} />
      <StatCard
        label={t('dashboard.kpi.returns')}
        value={format.money(kpis.returnsTotal)}
        icon={Undo2}
        tone="danger"
        invertDelta
        delta={change(kpis.returnsTotal, previous.returnsTotal)}
        formatDelta={formatDelta}
        deltaLabel={t('dashboard.kpi.returnsCount', { count: kpis.returnsCount })}
      />
      <StatCard
        label={t('dashboard.kpi.customers')}
        value={format.integer(customers.served)}
        icon={Users}
        tone="primary"
        delta={change(customers.served, customers.previousServed)}
        formatDelta={formatDelta}
        deltaLabel={t('dashboard.kpi.members', { count: customers.members })}
      />
    </section>
  );
}
