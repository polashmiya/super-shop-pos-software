import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { BadgePercent, Calculator, CalendarRange, Download, Landmark, ReceiptText, ScanBarcode, ShoppingBag, TrendingUp, Undo2, UserRound, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import type { SaleSort } from '@/repositories/types';
import { customerService } from '@/services/peopleService';
import { loadKpis } from '@/services/reportService';
import { canCancel, getSale, listSales } from '@/services/saleService';
import { useAuthStore, useCan } from '@/stores/authStore';
import { toast } from '@/stores/uiStore';
import type { PaymentMethod, Sale, SaleDetail, SaleFilter, SaleStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { CancelSaleDialog } from '@/features/sales/CancelSaleDialog';
import { ReturnDialog } from '@/features/sales/ReturnDialog';
import { PaymentSummaryBadge, SaleStatusBadge } from '@/features/sales/SaleBadges';
import { SaleRowActions } from '@/features/sales/SaleRowActions';
import { SalesSubNav } from '@/features/sales/SalesSubNav';
import { lastDayOf, periodPatch, readChoice, readPaging, readPeriod, useListParams } from '@/features/sales/listParams';
import { exportSalesCsv, printInvoice, reprintReceipt } from '@/features/sales/saleActions';
import { directoryName, loadStaffDirectory, withSplitMethods } from '@/features/sales/saleData';
import { PAYMENT_METHODS, SALES_PERIODS, SALE_STATUSES } from '@/features/sales/saleMeta';
import { useSearchText } from '@/features/sales/useSearchText';

/* ==========================================================================
   Sales history: period, search and filters (kept in the URL), a KPI strip
   for the filtered range and a server-paginated, server-sorted table.
   Completed sales are read-only — corrections go through Return or Cancel.
   ========================================================================== */

const SORT_FIELDS: readonly SaleSort['field'][] = ['createdAt', 'grandTotal', 'invoiceNo', 'itemCount'];
const RETURNABLE: readonly SaleStatus[] = ['completed', 'partially_returned'];

export default function SalesPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? 'none');
  const canViewAll = useCan('sales.viewAll');
  const canReprint = useCan('sales.reprint');
  const canSell = useCan('pos.sell');
  const [params, update] = useListParams();

  const customerId = params.get('customer') || null;
  const { period, range } = readPeriod(params, SALES_PERIODS, customerId ? 'this_month' : 'today');
  const status = readChoice<SaleStatus | 'all'>(params, 'status', ['all', ...SALE_STATUSES], 'all');
  const method = readChoice<PaymentMethod | 'all'>(params, 'method', ['all', ...PAYMENT_METHODS], 'all');
  const cashierId = canViewAll ? params.get('cashier') || 'all' : 'all';
  const counterId = params.get('counter') || 'all';
  const search = params.get('q') ?? '';
  const { page, pageSize } = readPaging(params);
  const sortField = readChoice(params, 'sort', SORT_FIELDS, 'createdAt');
  const sortDirection = readChoice(params, 'dir', ['asc', 'desc'] as const, 'desc');
  const [searchText, setSearchText, resetSearch] = useSearchText(search, (value) => update({ q: value, page: null }));

  const [returnSale, setReturnSale] = useState<SaleDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaleDetail | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter: SaleFilter = { from: range.from, to: range.to, search: search || undefined, status, paymentMethod: method, cashierId, counterId, customerId };
  const sort: SaleSort = { field: sortField, direction: sortDirection };
  const kpiCashier = canViewAll ? cashierId : userId;

  const directory = useAsync(() => loadStaffDirectory(), []);
  const customer = useAsync(() => (customerId ? customerService.getById(customerId) : Promise.resolve(null)), [customerId]);
  const list = useAsync(
    () => listSales(filter, { page, pageSize }, sort).then(withSplitMethods),
    [range.from, range.to, search, status, method, cashierId, counterId, customerId, page, pageSize, sortField, sortDirection],
  );
  const kpis = useAsync(
    () => loadKpis(range, { cashierId: kpiCashier, counterId, paymentMethod: method, customerId: customerId ?? 'all' }),
    [range.from, range.to, kpiCashier, counterId, method, customerId],
  );

  const users = directory.data?.users;
  const counters = directory.data?.counters;
  const cashierName = (sale: Sale) => directoryName(users, sale.cashierId, language, sale.cashierName);
  const counterName = (sale: Sale) => directoryName(counters, sale.counterId, language, sale.counterName);
  const hasFilters = Boolean(search || status !== 'all' || method !== 'all' || cashierId !== 'all' || counterId !== 'all' || customerId);

  const clearFilters = () => {
    resetSearch('');
    update({ q: null, status: null, method: null, cashier: null, counter: null, customer: null, page: null });
  };

  const openSale = (sale: Sale) => navigate(`/sales/${sale.id}`, { state: { from: `${location.pathname}${location.search}` } });

  const withDetail = async (sale: Sale, run: (detail: SaleDetail) => unknown) => {
    try {
      const detail = await getSale(sale.id);
      if (!detail) {
        toast.error('errors.notFound');
        list.reload();
        return;
      }
      await run(detail);
    } catch (error) {
      toast.fromError(error);
    }
  };

  const afterChange = () => {
    list.reload();
    kpis.reload();
  };

  const exportCsv = async () => {
    setExporting(true);
    await exportSalesCsv(filter, sort, { cashier: cashierName, counter: counterName });
    setExporting(false);
  };

  const columns: Array<Column<Sale>> = [
    {
      key: 'invoice',
      header: t('sales.columns.invoice'),
      sortKey: 'invoiceNo',
      cell: (sale) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{sale.invoiceNo}</span>,
    },
    { key: 'date', header: t('common.labels.date'), sortKey: 'createdAt', cell: (sale) => <span className="whitespace-nowrap tnum">{format.date(sale.createdAt)}</span> },
    { key: 'time', header: t('common.labels.time'), cell: (sale) => <span className="whitespace-nowrap text-fg-muted tnum">{format.time(sale.createdAt)}</span> },
    { key: 'cashier', header: t('common.labels.cashier'), hideable: true, cell: (sale) => <span className="block max-w-40 truncate">{cashierName(sale)}</span> },
    { key: 'counter', header: t('common.labels.counter'), hideable: true, defaultHidden: true, cell: (sale) => <span className="block max-w-32 truncate text-fg-muted">{counterName(sale)}</span> },
    {
      key: 'customer',
      header: t('common.labels.customer'),
      hideable: true,
      cell: (sale) =>
        sale.customerId ? (
          <div className="min-w-0 max-w-48 leading-tight">
            <p className="truncate">{sale.customerName}</p>
            {sale.customerPhone && <p className="type-caption truncate text-fg-subtle tnum">{format.digits(sale.customerPhone)}</p>}
          </div>
        ) : (
          <span className="text-fg-subtle">{t('common.labels.walkIn')}</span>
        ),
    },
    { key: 'items', header: t('sales.columns.items'), sortKey: 'itemCount', align: 'end', cell: (sale) => format.integer(sale.itemCount) },
    { key: 'payment', header: t('sales.columns.payment'), cell: (sale) => <PaymentSummaryBadge size="sm" summary={sale.paymentSummary} methods={list.data?.methods[sale.id]} /> },
    {
      key: 'total',
      header: t('common.labels.total'),
      sortKey: 'grandTotal',
      align: 'end',
      cell: (sale) => (
        <div className="flex flex-col items-end leading-tight">
          <span className={sale.status === 'cancelled' ? 'font-semibold text-fg-subtle line-through' : 'font-semibold text-fg'}>{format.money(sale.grandTotal)}</span>
          {sale.returnedTotal > 0 && <span className="type-caption text-warning-text">−{format.money(sale.returnedTotal)}</span>}
        </div>
      ),
    },
    { key: 'status', header: t('common.labels.status'), cell: (sale) => <SaleStatusBadge size="sm" status={sale.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      width: '3.5rem',
      cell: (sale) => (
        <SaleRowActions
          sale={sale}
          onView={openSale}
          onReprint={canReprint ? (row) => void withDetail(row, reprintReceipt) : undefined}
          onInvoice={canReprint ? (row) => void withDetail(row, printInvoice) : undefined}
          onReturn={RETURNABLE.includes(sale.status) ? (row) => void withDetail(row, setReturnSale) : undefined}
          onCancel={canCancel(sale).allowed ? (row) => void withDetail(row, setCancelTarget) : undefined}
        />
      ),
    },
  ];

  const statusOptions = [{ value: 'all' as const, label: t('sales.filters.allStatuses') }, ...SALE_STATUSES.map((value) => ({ value, label: t(`enums.saleStatus.${value}`) }))];
  const methodOptions = [{ value: 'all' as const, label: t('sales.filters.allPayments') }, ...PAYMENT_METHODS.map((value) => ({ value, label: t(`enums.paymentMethod.${value}`) }))];
  const cashierOptions = [
    { value: 'all', label: t('sales.filters.allCashiers') },
    ...(users ?? []).map((entry) => ({ value: entry.id, label: language === 'bn' ? entry.name.bn || entry.name.en : entry.name.en || entry.name.bn })),
  ];
  const counterOptions = [
    { value: 'all', label: t('sales.filters.allCounters') },
    ...(counters ?? []).map((entry) => ({ value: entry.id, label: language === 'bn' ? entry.name.bn || entry.name.en : entry.name.en || entry.name.bn })),
  ];
  const lastDay = lastDayOf(range);
  const sameDay = format.date(range.from) === format.date(lastDay);
  const rangeLabel = sameDay ? format.date(range.from, 'long') : `${format.date(range.from)} – ${format.date(lastDay)}`;
  const data = kpis.data;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ReceiptText}
        title={t('sales.title')}
        description={canViewAll ? t('sales.subtitle') : t('sales.filters.ownSalesOnly')}
        actions={
          <>
            <Button icon={Download} loading={exporting} onClick={() => void exportCsv()} disabled={!list.data || list.data.total === 0}>
              {t('common.actions.exportCsv')}
            </Button>
            {canSell && (
              <Button variant="primary" icon={ScanBarcode} onClick={() => navigate('/pos')}>
                {t('sales.actions.newSale')}
              </Button>
            )}
          </>
        }
      >
        <SalesSubNav active="sales" />
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('sales.filters.label')}>
          <PeriodPicker period={period} range={range} periods={SALES_PERIODS} onChange={(next, custom) => update(periodPatch(next, custom))} />
          <div className="min-w-[15rem] flex-1">
            <SearchInput value={searchText} onChange={setSearchText} clearLabel={t('common.actions.clear')} placeholder={t('sales.filters.searchPlaceholder')} aria-label={t('sales.filters.searchLabel')} />
          </div>
          <div className="w-44">
            <Select aria-label={t('common.labels.status')} value={status} options={statusOptions} onChange={(value) => update({ status: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-44">
            <Select aria-label={t('sales.columns.payment')} value={method} options={methodOptions} onChange={(value) => update({ method: value === 'all' ? null : value, page: null })} />
          </div>
          {canViewAll && (
            <div className="w-44">
              <Select aria-label={t('common.labels.cashier')} value={cashierId} options={cashierOptions} onChange={(value) => update({ cashier: value === 'all' ? null : value, page: null })} />
            </div>
          )}
          <div className="w-40">
            <Select aria-label={t('common.labels.counter')} value={counterId} options={counterOptions} onChange={(value) => update({ counter: value === 'all' ? null : value, page: null })} />
          </div>
          {customerId && (
            <button
              type="button"
              onClick={() => update({ customer: null, page: null })}
              aria-label={t('sales.filters.removeCustomer')}
              className="inline-flex min-h-11 max-w-64 items-center gap-2 rounded-full bg-primary-soft ps-3 pe-2 text-sm font-medium text-primary-soft-fg transition-base hover:brightness-110"
            >
              <UserRound size={16} aria-hidden />
              <span className="truncate">{t('sales.filters.customer', { name: customer.data?.name ?? '…' })}</span>
              <X size={16} aria-hidden />
            </button>
          )}
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          )}
        </div>

        <section aria-label={t('sales.kpi.title')} className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 type-caption text-fg-subtle">
            <CalendarRange size={14} aria-hidden />
            {t('sales.kpi.caption', { range: rangeLabel })}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {!data ? (
              Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
            ) : (
              <>
                <StatCard label={t('sales.kpi.sales')} value={format.money(data.grossSales)} icon={TrendingUp} tone="primary" hint={t('sales.kpi.net', { amount: format.money(data.netSales) })} />
                <StatCard label={t('sales.kpi.orders')} value={format.integer(data.orders)} icon={ShoppingBag} tone="info" hint={t('sales.kpi.itemsSold', { qty: format.quantity(data.itemsSold) })} />
                <StatCard label={t('sales.kpi.average')} value={format.money(data.averageOrder)} icon={Calculator} tone="neutral" />
                <StatCard label={t('sales.kpi.discount')} value={format.money(data.discountTotal)} icon={BadgePercent} tone="success" />
                <StatCard label={t('sales.kpi.vat')} value={format.money(data.taxTotal)} icon={Landmark} tone="info" />
                <StatCard label={t('sales.kpi.returns')} value={format.money(data.returnsTotal)} icon={Undo2} tone="warning" hint={t('sales.kpi.returnsCount', { count: data.returnsCount })} />
              </>
            )}
          </div>
        </section>

        <div className="relative flex min-h-[26rem] flex-1 flex-col">
          <LoadingBar active={list.loading && Boolean(list.data)} />
          <DataTable
            ariaLabel={t('sales.title')}
            className="min-h-0 flex-1"
            columns={columns}
            columnsKey="sales-list"
            rows={list.data?.rows ?? []}
            rowKey={(sale) => sale.id}
            loading={!list.data && !list.error}
            onRowClick={openSale}
            sort={{ key: sortField, direction: sortDirection }}
            onSortChange={(next) => update({ sort: next.key, dir: next.direction, page: null })}
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
                  icon={ReceiptText}
                  title={t('sales.empty.title')}
                  description={hasFilters ? t('sales.empty.filtered') : t('sales.empty.period')}
                  action={
                    hasFilters ? (
                      <Button icon={X} onClick={clearFilters}>
                        {t('common.actions.clearFilters')}
                      </Button>
                    ) : period === 'today' || period === 'yesterday' ? (
                      <Button icon={CalendarRange} onClick={() => update(periodPatch('this_week'))}>
                        {t('sales.empty.showWeek')}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        </div>
      </div>

      {returnSale && (
        <ReturnDialog
          sale={returnSale}
          onClose={() => setReturnSale(null)}
          onCompleted={() => {
            setReturnSale(null);
            afterChange();
          }}
        />
      )}
      {cancelTarget && (
        <CancelSaleDialog
          sale={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCompleted={() => {
            setCancelTarget(null);
            afterChange();
          }}
        />
      )}
    </div>
  );
}
