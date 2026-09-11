import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3, LayoutDashboard, PackageCheck, PackagePlus, RefreshCw, ScanBarcode, Wallet } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useNow } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import type { DashboardPeriod } from '@/services/reportService';
import { useAuthStore, useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { PageHeader } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { ErrorState, LoadingBar } from '@/components/ui/States';
import { DashboardKpis } from '@/features/dashboard/DashboardKpis';
import { CashiersCard, CategoriesCard, PaymentsCard, TopProductsCard, TrendCard } from '@/features/dashboard/DashboardCharts';
import { CountersCard, ExpiringCard, LowStockCard, QuickActions, RecentSalesCard } from '@/features/dashboard/DashboardPanels';
import { expiringProducts, greetingFor, loadDashboardData } from '@/features/dashboard/dashboardData';

/* ==========================================================================
   Dashboard (spec §45, §96): the day's business at a glance — headline
   numbers with fair comparisons, sales trend, payment mix, best sellers,
   cashiers, stock alerts, open drawers and quick actions.
   ========================================================================== */

const PERIODS: DashboardPeriod[] = ['today', 'yesterday', 'this_week', 'this_month'];

export default function DashboardPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const user = useAuthStore((state) => state.user);
  const store = useSettingsStore((state) => state.business.store);
  const expiryDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const products = useCatalogStore((state) => state.products);
  const canSell = useCan('pos.sell');
  const canProducts = useCan('products.manage');
  const canReceive = useCan('purchases.receive');
  const canReports = useCan('reports.view');
  const canFinancial = useCan('reports.financial');
  const canSales = useCan('sales.view');
  const canShift = useCan('shift.operate');
  const canCounters = useCan('counters.manage');
  const canSeeCounters = useCan('shift.viewAll') || canCounters;
  const [period, setPeriod] = useState<DashboardPeriod>('today');

  const data = useAsync(() => loadDashboardData(period, { canSeeSales: canSales, canSeeCounters }), [period, canSales, canSeeCounters]);
  const view = data.data?.view ?? null;
  const expiring = useMemo(() => expiringProducts(products, expiryDays, now), [products, expiryDays, now]);

  const firstName = user ? (language === 'bn' ? user.name.bn : user.name.en).split(' ')[0] : '';
  const quickActions = [
    canSell && { key: 'sale', icon: ScanBarcode, label: t('dashboard.quick.newSale'), hint: t('dashboard.quick.newSaleHint'), to: '/pos', primary: true },
    canProducts && { key: 'product', icon: PackagePlus, label: t('dashboard.quick.addProduct'), hint: t('dashboard.quick.addProductHint'), to: '/products/new' },
    canReceive && { key: 'receive', icon: PackageCheck, label: t('dashboard.quick.receive'), hint: t('dashboard.quick.receiveHint'), to: '/purchases?status=ordered' },
    canShift && { key: 'shift', icon: Wallet, label: t('dashboard.quick.shift'), hint: t('dashboard.quick.shiftHint'), to: '/shift' },
    canReports && { key: 'reports', icon: BarChart3, label: t('dashboard.quick.reports'), hint: t('dashboard.quick.reportsHint'), to: '/reports' },
  ].filter((action) => action !== false);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={LayoutDashboard}
        title={t(`dashboard.greeting.${greetingFor(now)}`, { name: firstName })}
        description={t('dashboard.subtitle', { store: language === 'bn' ? store.nameBn : store.nameEn, date: format.date(now, 'long') })}
        actions={
          <>
            <SegmentedControl ariaLabel={t('common.labels.period')} value={period} onChange={setPeriod} options={PERIODS.map((value) => ({ value, label: t(`common.periods.${value}`) }))} />
            <IconButton icon={RefreshCw} label={t('common.actions.refresh')} onClick={data.reload} />
            {canSell && (
              <Button variant="primary" icon={ScanBarcode} onClick={() => navigate('/pos')}>
                {t('dashboard.newSale')}
              </Button>
            )}
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-6">
        <LoadingBar active={data.loading && Boolean(data.data)} />
        {data.error && !data.data ? (
          <ErrorState title={t('dashboard.error.title')} description={t('dashboard.error.hint')} action={<Button onClick={data.reload}>{t('common.actions.retry')}</Button>} className="h-full" />
        ) : (
          <div className="flex flex-col gap-5">
            <p className="type-caption -mb-2 text-fg-subtle">{t(`dashboard.comparison.${period}`)}</p>
            <DashboardKpis view={view} showProfit={canFinancial} />
            <QuickActions actions={quickActions} />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <TrendCard view={view} loading={!view} />
              <PaymentsCard view={view} loading={!view} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <TopProductsCard view={view} loading={!view} />
              <CategoriesCard view={view} loading={!view} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <CashiersCard view={view} loading={!view} />
              {canSeeCounters && <CountersCard counters={data.data?.counters ?? []} canManage={canCounters} />}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <LowStockCard rows={view?.lowStock ?? []} count={view?.lowStockCount ?? 0} />
              <ExpiringCard items={expiring} days={expiryDays} />
              {canSales && <RecentSalesCard sales={data.data?.recentSales ?? []} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
