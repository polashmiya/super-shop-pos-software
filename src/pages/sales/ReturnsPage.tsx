import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarRange, Calculator, Percent, ReceiptText, Undo2, Wallet, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { loadKpis } from '@/services/reportService';
import { listReturns } from '@/services/returnService';
import { useAuthStore, useCan } from '@/stores/authStore';
import type { SaleReturn } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { RefundMethodBadge } from '@/features/sales/SaleBadges';
import { SalesSubNav } from '@/features/sales/SalesSubNav';
import { lastDayOf, periodPatch, readPaging, readPeriod, useListParams } from '@/features/sales/listParams';
import { SALES_PERIODS } from '@/features/sales/saleMeta';
import { useSearchText } from '@/features/sales/useSearchText';

/* ==========================================================================
   Returns register: every (partial) return with its refund, reason and
   approver, for a period. Rows open the original sale.
   ========================================================================== */

export default function ReturnsPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? 'none');
  const canViewAll = useCan('sales.viewAll');
  const [params, update] = useListParams();
  const { period, range } = readPeriod(params, SALES_PERIODS, 'this_month');
  const search = params.get('q') ?? '';
  const { page, pageSize } = readPaging(params);
  const [searchText, setSearchText, resetSearch] = useSearchText(search, (value) => update({ q: value, page: null }));
  const cashierId = canViewAll ? 'all' : userId;

  const list = useAsync(
    () => listReturns({ from: range.from, to: range.to, search: search || undefined, cashierId }, { page, pageSize }),
    [range.from, range.to, search, cashierId, page, pageSize],
  );
  const kpis = useAsync(() => loadKpis(range, { cashierId }), [range.from, range.to, cashierId]);

  const from = `${location.pathname}${location.search}`;
  const openSale = (entry: SaleReturn) => navigate(`/sales/${entry.saleId}`, { state: { from } });
  const clearSearch = () => {
    resetSearch('');
    update({ q: null, page: null });
  };

  const columns: Array<Column<SaleReturn>> = [
    { key: 'no', header: t('sales.returnsPage.columns.returnNo'), cell: (entry) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{entry.returnNo}</span> },
    {
      key: 'date',
      header: t('common.labels.date'),
      cell: (entry) => (
        <div className="leading-tight whitespace-nowrap">
          <p className="tnum">{format.date(entry.createdAt)}</p>
          <p className="type-caption text-fg-subtle tnum">{format.time(entry.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'invoice',
      header: t('sales.columns.invoice'),
      cell: (entry) => (
        <Link
          to={`/sales/${entry.saleId}`}
          state={{ from }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="rounded-sm font-mono text-[0.86rem] whitespace-nowrap text-primary underline-offset-2 hover:underline"
        >
          {entry.invoiceNo}
        </Link>
      ),
    },
    { key: 'cashier', header: t('common.labels.cashier'), hideable: true, cell: (entry) => <span className="block max-w-36 truncate">{entry.cashierName}</span> },
    {
      key: 'reason',
      header: t('common.labels.reason'),
      cell: (entry) => (
        <p className="max-w-60 truncate" title={entry.reason}>
          {entry.reason}
        </p>
      ),
    },
    { key: 'method', header: t('sales.returnsPage.columns.refundMethod'), cell: (entry) => <RefundMethodBadge size="sm" method={entry.refundMethod} /> },
    {
      key: 'items',
      header: t('sales.returnsPage.columns.items'),
      align: 'end',
      cell: (entry) => (
        <span className="whitespace-nowrap text-fg-muted">
          {t('sales.returnsPage.itemsQty', { count: entry.items.length, qty: format.quantity(entry.items.reduce((sum, item) => sum + item.quantity, 0)) })}
        </span>
      ),
    },
    { key: 'refund', header: t('sales.returnsPage.columns.refund'), align: 'end', cell: (entry) => <span className="font-semibold whitespace-nowrap text-fg">{format.money(entry.refundTotal)}</span> },
    {
      key: 'approvedBy',
      header: t('sales.returnsPage.columns.approvedBy'),
      hideable: true,
      cell: (entry) => (entry.approvedBy ? <span className="block max-w-36 truncate">{entry.approvedBy}</span> : <span className="text-fg-subtle">—</span>),
    },
  ];

  const data = kpis.data;
  const lastDay = lastDayOf(range);
  const rangeLabel = format.date(range.from) === format.date(lastDay) ? format.date(range.from, 'long') : `${format.date(range.from)} – ${format.date(lastDay)}`;
  const returnRate = data && data.grossSales > 0 ? (data.returnsTotal / data.grossSales) * 100 : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={Undo2} title={t('sales.returnsPage.title')} description={canViewAll ? t('sales.returnsPage.subtitle') : t('sales.returnsPage.ownOnly')}>
        <SalesSubNav active="returns" />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('sales.filters.label')}>
          <PeriodPicker period={period} range={range} periods={SALES_PERIODS} onChange={(next, custom) => update(periodPatch(next, custom))} />
          <div className="min-w-[15rem] max-w-xl flex-1">
            <SearchInput value={searchText} onChange={setSearchText} clearLabel={t('common.actions.clear')} placeholder={t('sales.returnsPage.searchPlaceholder')} aria-label={t('sales.returnsPage.searchPlaceholder')} />
          </div>
        </div>

        <section aria-label={t('sales.kpi.title')} className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 type-caption text-fg-subtle">
            <CalendarRange size={14} aria-hidden />
            {rangeLabel}
          </p>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {!data ? (
              Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
            ) : (
              <>
                <StatCard label={t('sales.returnsPage.kpi.count')} value={format.integer(data.returnsCount)} icon={Undo2} tone="warning" />
                <StatCard label={t('sales.returnsPage.kpi.refunded')} value={format.money(data.returnsTotal)} icon={Wallet} tone="danger" />
                <StatCard label={t('sales.returnsPage.kpi.average')} value={format.money(data.returnsCount > 0 ? Math.round(data.returnsTotal / data.returnsCount) : 0)} icon={Calculator} tone="neutral" />
                <StatCard
                  label={t('sales.returnsPage.kpi.rate')}
                  value={format.percentValue(returnRate)}
                  icon={Percent}
                  tone="info"
                  hint={t('sales.returnsPage.kpi.rateHint', { amount: format.money(data.grossSales) })}
                />
              </>
            )}
          </div>
        </section>

        <div className="relative flex min-h-[26rem] flex-1 flex-col">
          <LoadingBar active={list.loading && Boolean(list.data)} />
          <DataTable
            ariaLabel={t('sales.returnsPage.title')}
            className="min-h-0 flex-1"
            columns={columns}
            columnsKey="returns-list"
            rows={list.data?.rows ?? []}
            rowKey={(entry) => entry.id}
            loading={!list.data && !list.error}
            onRowClick={openSale}
            pagination={
              list.data
                ? {
                    page,
                    pageSize,
                    total: list.data.total,
                    onPageChange: (next) => update({ page: next > 1 ? next : null }),
                    onPageSizeChange: (size) => update({ size, page: null }),
                  }
                : undefined
            }
            empty={
              list.error ? (
                <EmptyState icon={ReceiptText} title={t('errors.loadFailed')} action={<Button onClick={list.reload}>{t('common.actions.retry')}</Button>} />
              ) : (
                <EmptyState
                  icon={Undo2}
                  title={t('sales.returnsPage.empty')}
                  description={search ? t('sales.returnsPage.emptySearch') : t('sales.returnsPage.emptyHint')}
                  action={
                    search ? (
                      <Button icon={X} onClick={clearSearch}>
                        {t('common.actions.clearFilters')}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
