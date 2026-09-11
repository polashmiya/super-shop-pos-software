import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Ban, Download, EllipsisVertical, Eye, PackageCheck, Pencil, Plus, Send, ShoppingCart, Truck, X } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { useCan } from '@/stores/authStore';
import { toast } from '@/stores/uiStore';
import type { Purchase, PurchaseFilter, PurchaseStatus } from '@/types';
import { csvMoney } from '@/utils/csv';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { saveCsvExport } from '@/features/inventory/exportHelpers';
import { PeriodFilter } from '@/features/inventory/PeriodFilter';
import { periodBounds, periodState, type PeriodState } from '@/features/inventory/periods';
import { useResettingPage } from '@/features/inventory/useClientTable';
import { DueAmount, PurchaseStatusBadge } from '@/features/purchases/PurchaseBits';
import {
  PURCHASE_STATUSES,
  canCancelPurchase,
  canEditPurchase,
  canMarkOrdered,
  canReceivePurchase,
  cancelPurchaseWithConfirm,
  localDate,
  markPurchaseOrdered,
  parsePurchaseStatus,
  purchaseDue,
  purchaseStatusBadge,
} from '@/features/purchases/purchaseHelpers';

/* ==========================================================================
   Purchases — purchase orders by status, supplier and period with the
   amounts still owed. ?status=ordered presets the filter (notifications).
   ========================================================================== */

export default function PurchasesPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = useCan('purchases.manage');
  const canReceive = useCan('purchases.receive');
  const canViewSuppliers = useCan('suppliers.view');

  const status = parsePurchaseStatus(searchParams.get('status'));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), APP_CONFIG.tables.searchDebounceMs);
  const [supplierId, setSupplierId] = useState('all');
  const [period, setPeriod] = useState<PeriodState>(() => periodState('all'));
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const [exporting, setExporting] = useState(false);

  const bounds = periodBounds(period);
  const filter: PurchaseFilter = { search: debouncedSearch || undefined, status, supplierId, from: bounds.from, to: bounds.to };
  const filterKey = `${JSON.stringify(filter)}|${pageSize}`;
  const [page, setPage] = useResettingPage(filterKey);
  const [version, setVersion] = useState(0);

  const list = useAsync(() => purchaseService.list(filter, { page, pageSize }), [filterKey, page, version]);
  const totals = useAsync(() => purchaseService.totals(filter), [filterKey, version]);
  const counts = useAsync(() => purchaseService.countByStatus(), [version]);
  const suppliers = useAsync(() => supplierService.list(undefined, 'all'), []);
  const refresh = () => setVersion((value) => value + 1);

  const setStatus = useCallback(
    (value: PurchaseStatus | 'all') => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === 'all') next.delete('status');
          else next.set('status', value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const supplierOptions = useMemo(() => [{ value: 'all', label: t('inventory.purchases.allSuppliers') }, ...(suppliers.data ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name }))], [suppliers.data, t]);
  const statusOptions = [{ value: 'all' as const, label: t('inventory.purchases.allStatuses') }, ...PURCHASE_STATUSES.map((value) => ({ value, label: t(`enums.purchaseStatus.${value}`) }))];
  const hasFilters = Boolean(debouncedSearch) || status !== 'all' || supplierId !== 'all' || period.period !== 'all';

  const clearFilters = () => {
    setSearch('');
    setSupplierId('all');
    setPeriod(periodState('all'));
    setStatus('all');
  };

  const runAction = async (action: () => Promise<boolean>) => {
    if (await action()) refresh();
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: Purchase[] = [];
      for (let pageNo = 1; ; pageNo += 1) {
        const result = await purchaseService.list(filter, { page: pageNo, pageSize: 1_000 });
        rows.push(...result.rows);
        if (result.rows.length === 0 || rows.length >= result.total || rows.length >= APP_CONFIG.reports.maxExportRows) break;
      }
      await saveCsvExport(
        t('inventory.purchases.exportName'),
        [
          t('inventory.purchases.columns.poNo'),
          t('inventory.purchases.columns.orderDate'),
          t('common.labels.supplier'),
          t('common.labels.items'),
          t('common.labels.subtotal'),
          t('common.labels.discount'),
          t('common.labels.vat'),
          t('common.labels.total'),
          t('inventory.shared.paid'),
          t('inventory.shared.due'),
          t('common.labels.status'),
          t('inventory.purchases.columns.expectedDate'),
          t('inventory.purchases.columns.receivedAt'),
        ],
        rows.map((purchase) => [
          purchase.poNo,
          purchase.orderDate,
          purchase.supplierName,
          purchase.itemCount,
          csvMoney(purchase.subtotal),
          csvMoney(purchase.discountTotal),
          csvMoney(purchase.taxTotal),
          csvMoney(purchase.grandTotal),
          csvMoney(purchase.paidAmount),
          csvMoney(purchaseDue(purchase)),
          t(`enums.purchaseStatus.${purchase.status}`),
          purchase.expectedDate ?? '',
          purchase.receivedAt ? format.dateTime(purchase.receivedAt) : '',
        ]),
      );
    } catch (error) {
      toast.fromError(error);
    } finally {
      setExporting(false);
    }
  };

  const rowActions = (purchase: Purchase): Array<MenuItem | 'separator'> => {
    const items: Array<MenuItem | 'separator'> = [{ key: 'view', label: t('common.actions.view'), icon: Eye, onSelect: () => navigate(`/purchases/${purchase.id}`) }];
    if (canReceive && canReceivePurchase(purchase)) items.push({ key: 'receive', label: t('inventory.purchases.actions.receive'), icon: PackageCheck, onSelect: () => navigate(`/purchases/${purchase.id}?receive=1`) });
    if (canManage && canMarkOrdered(purchase)) items.push({ key: 'order', label: t('inventory.purchases.actions.markOrdered'), icon: Send, onSelect: () => void runAction(() => markPurchaseOrdered(purchase)) });
    if (canManage && canEditPurchase(purchase)) items.push({ key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: () => navigate(`/purchases/${purchase.id}/edit`) });
    if (canManage && canCancelPurchase(purchase)) {
      items.push('separator');
      items.push({ key: 'cancel', label: t('inventory.purchases.actions.cancel'), icon: Ban, danger: true, onSelect: () => void runAction(() => cancelPurchaseWithConfirm(purchase)) });
    }
    return items;
  };

  const columns: Array<Column<Purchase>> = [
    {
      key: 'poNo',
      header: t('inventory.purchases.columns.poNo'),
      cell: (purchase) => (
        <Link to={`/purchases/${purchase.id}`} onClick={(event) => event.stopPropagation()} className="rounded-sm font-mono text-sm font-semibold text-primary hover:underline">
          {purchase.poNo}
        </Link>
      ),
    },
    { key: 'orderDate', header: t('inventory.purchases.columns.orderDate'), cell: (purchase) => <span className="tnum">{format.date(localDate(purchase.orderDate))}</span> },
    {
      key: 'supplier',
      header: t('common.labels.supplier'),
      width: '22%',
      cell: (purchase) =>
        canViewSuppliers ? (
          <Link to={`/suppliers/${purchase.supplierId}`} onClick={(event) => event.stopPropagation()} className="block truncate rounded-sm text-fg hover:text-primary hover:underline">
            {purchase.supplierName}
          </Link>
        ) : (
          <span className="block truncate">{purchase.supplierName}</span>
        ),
    },
    { key: 'items', header: t('common.labels.items'), align: 'end', hideable: true, cell: (purchase) => format.integer(purchase.itemCount) },
    { key: 'total', header: t('common.labels.total'), align: 'end', cell: (purchase) => <span className="font-semibold">{format.money(purchase.grandTotal)}</span> },
    { key: 'paid', header: t('inventory.shared.paid'), align: 'end', hideable: true, cell: (purchase) => <span className="text-fg-muted">{format.money(purchase.paidAmount)}</span> },
    { key: 'due', header: t('inventory.shared.due'), align: 'end', cell: (purchase) => (purchase.status === 'cancelled' ? <span className="text-fg-subtle">—</span> : <DueAmount amount={purchaseDue(purchase)} />) },
    { key: 'status', header: t('common.labels.status'), cell: (purchase) => <PurchaseStatusBadge status={purchase.status} /> },
    {
      key: 'receivedAt',
      header: t('inventory.purchases.columns.receivedAt'),
      hideable: true,
      cell: (purchase) => <span className="text-fg-muted tnum">{purchase.receivedAt ? format.date(purchase.receivedAt) : '—'}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      align: 'end',
      width: '4.5rem',
      cell: (purchase) => (
        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className="flex justify-end">
          <DropdownMenu width={230} items={rowActions(purchase)} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('inventory.purchases.actionsFor', { poNo: purchase.poNo })} tooltipSide="left" />} />
        </div>
      ),
    },
  ];

  const countData = counts.data;
  const filteredTotals = totals.data;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ShoppingCart}
        title={t('inventory.purchases.title')}
        description={t('inventory.purchases.description')}
        actions={
          <>
            {canViewSuppliers && (
              <Button icon={Truck} onClick={() => navigate('/suppliers')}>
                {t('nav.suppliers')}
              </Button>
            )}
            <Button icon={Download} loading={exporting} onClick={() => void exportCsv()}>
              {t('common.actions.exportCsv')}
            </Button>
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/purchases/new')}>
                {t('inventory.purchases.new')}
              </Button>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <section aria-label={t('inventory.purchases.byStatus')} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {countData
              ? PURCHASE_STATUSES.map((value) => {
                  const badge = purchaseStatusBadge(value);
                  return (
                    <StatCard
                      key={value}
                      label={t(`enums.purchaseStatus.${value}`)}
                      value={format.integer(countData[value])}
                      icon={badge.icon}
                      tone={badge.tone}
                      hint={status === value ? t('inventory.purchases.showing') : t('inventory.purchases.tapToFilter')}
                      className={status === value ? 'border-primary ring-1 ring-primary' : undefined}
                      onClick={() => setStatus(status === value ? 'all' : value)}
                    />
                  );
                })
              : Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-[6.6rem] rounded-xl" />)}
          </section>

          <div className="relative">
            <LoadingBar active={list.loading && Boolean(list.data)} />
            <DataTable
              ariaLabel={t('inventory.purchases.tableLabel')}
              columns={columns}
              rows={list.data?.rows ?? []}
              rowKey={(purchase) => purchase.id}
              loading={list.loading && !list.data}
              onRowClick={(purchase) => navigate(`/purchases/${purchase.id}`)}
              columnsKey="purchases"
              pagination={{ page, pageSize, total: list.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: setPageSize }}
              toolbar={
                <>
                  <div className="w-full max-w-xs min-w-56 flex-1">
                    <SearchInput value={search} onChange={setSearch} placeholder={t('inventory.purchases.search')} aria-label={t('inventory.purchases.search')} clearLabel={t('common.actions.clear')} />
                  </div>
                  <div className="w-44">
                    <Select aria-label={t('common.labels.status')} value={status} options={statusOptions} onChange={setStatus} />
                  </div>
                  <div className="w-48">
                    <Select aria-label={t('common.labels.supplier')} value={supplierId} options={supplierOptions} onChange={setSupplierId} />
                  </div>
                  <PeriodFilter period={period.period} range={period.range} onChange={(value, range) => setPeriod({ period: value, range })} />
                  {hasFilters && (
                    <Button variant="ghost" icon={X} onClick={clearFilters}>
                      {t('common.actions.clearFilters')}
                    </Button>
                  )}
                  {filteredTotals && filteredTotals.count > 0 && (
                    <p className="type-body-sm ms-auto text-fg-muted">
                      {t('inventory.purchases.filteredTotals', {
                        count: format.integer(filteredTotals.count),
                        total: format.money(filteredTotals.grandTotal),
                        due: format.money(Math.max(0, filteredTotals.grandTotal - filteredTotals.paidAmount)),
                      })}
                    </p>
                  )}
                </>
              }
              empty={
                list.error ? (
                  <EmptyState icon={ShoppingCart} title={t('errors.loadFailed')} action={<Button onClick={list.reload}>{t('common.actions.retry')}</Button>} />
                ) : hasFilters ? (
                  <EmptyState icon={ShoppingCart} title={t('inventory.purchases.emptyFiltered')} description={t('common.states.emptyHint')} action={<Button icon={X} onClick={clearFilters}>{t('common.actions.clearFilters')}</Button>} />
                ) : (
                  <EmptyState
                    icon={ShoppingCart}
                    title={t('inventory.purchases.empty')}
                    description={t('inventory.purchases.emptyHint')}
                    action={
                      canManage ? (
                        <Button variant="primary" icon={Plus} onClick={() => navigate('/purchases/new')}>
                          {t('inventory.purchases.new')}
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
    </div>
  );
}
