import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, EllipsisVertical, Eye, HandCoins, Pencil, ShoppingCart, Truck, Wallet, X } from 'lucide-react';
import { normalizeSearch } from '@/domain/text';
import { useAsync } from '@/hooks/useAsync';
import { useDebouncedValue } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { defaultReportFilter } from '@/services/reportService';
import { useCan } from '@/stores/authStore';
import type { Supplier, SupplierStatus, SupplierSummary } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { saveCsvExport } from '@/features/inventory/exportHelpers';
import { useClientTable } from '@/features/inventory/useClientTable';
import { DueAmount } from '@/features/purchases/PurchaseBits';
import { SupplierFormModal } from '@/features/suppliers/SupplierFormModal';
import { supplierHaystack, supplierStatusBadge } from '@/features/suppliers/supplierHelpers';

/* ==========================================================================
   Suppliers: KPIs (count, outstanding, this month's purchases), instant
   search and status filter over the (small) supplier list, sortable table
   with totals and dues from the purchase ledger.
   ========================================================================== */

type StatusFilter = SupplierStatus | 'all';

export default function SuppliersPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const canManage = useCan('suppliers.manage');
  const canPurchase = useCan('purchases.manage');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const debouncedQuery = useDebouncedValue(query, 120);

  const suppliers = useAsync(() => supplierService.list(undefined, 'all'), []);
  const summaries = useAsync(() => supplierService.summaries(), []);
  const month = useAsync(() => {
    const range = defaultReportFilter('this_month');
    return purchaseService.list({ from: range.from, to: range.to, status: 'all' }, { page: 1, pageSize: 500 });
  }, []);

  const summaryOf = useCallback((id: string): SupplierSummary | undefined => summaries.data?.get(id), [summaries.data]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(debouncedQuery);
    return (suppliers.data ?? []).filter((supplier) => (status === 'all' || supplier.status === status) && (!needle || supplierHaystack(supplier).includes(needle)));
  }, [suppliers.data, debouncedQuery, status]);

  const sortValue = useCallback(
    (supplier: Supplier, key: string) => {
      const summary = summaryOf(supplier.id);
      if (key === 'purchases') return summary?.totalPurchases ?? 0;
      if (key === 'outstanding') return summary?.outstanding ?? 0;
      if (key === 'last') return summary?.lastPurchaseAt ?? '';
      return supplier.name.toLowerCase();
    },
    [summaryOf],
  );
  const table = useClientTable(filtered, sortValue, { key: 'name', direction: 'asc' }, `${debouncedQuery}|${status}`);

  const all = suppliers.data ?? [];
  const activeCount = all.filter((supplier) => supplier.status === 'active').length;
  const owing = [...(summaries.data?.values() ?? [])].filter((summary) => summary.outstanding > 0);
  const outstandingTotal = owing.reduce((sum, summary) => sum + summary.outstanding, 0);
  const monthRows = (month.data?.rows ?? []).filter((purchase) => purchase.status !== 'cancelled');
  const monthTotal = monthRows.reduce((sum, purchase) => sum + purchase.grandTotal, 0);
  const hasFilters = Boolean(query || status !== 'all');

  const clearFilters = () => {
    setQuery('');
    setStatus('all');
  };

  const reload = () => {
    suppliers.reload();
    summaries.reload();
  };

  const exportCsv = () => {
    void saveCsvExport(
      'suppliers',
      [t('common.labels.code'), t('inventory.supplierForm.name'), t('inventory.supplierForm.company'), t('inventory.supplierForm.contactPerson'), t('common.labels.phone'), t('common.labels.email'), t('inventory.suppliers.columns.purchases'), t('inventory.shared.paid'), t('inventory.suppliers.columns.outstanding'), t('common.labels.status')],
      table.sorted.map((supplier) => {
        const summary = summaryOf(supplier.id);
        return [
          supplier.code,
          supplier.name,
          supplier.company,
          supplier.contactPerson,
          supplier.phone,
          supplier.email,
          (summary?.totalPurchases ?? 0) / 100,
          (summary?.totalPaid ?? 0) / 100,
          (summary?.outstanding ?? 0) / 100,
          t(supplier.status === 'active' ? 'common.labels.active' : 'common.labels.inactive'),
        ];
      }),
    );
  };

  const rowActions = (supplier: Supplier): Array<MenuItem | 'separator'> => {
    const items: Array<MenuItem | 'separator'> = [{ key: 'view', label: t('inventory.suppliers.actions.view'), icon: Eye, onSelect: () => navigate(`/suppliers/${supplier.id}`) }];
    if (canManage) items.push({ key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: () => setEditing(supplier) });
    if (canPurchase && supplier.status === 'active') items.push({ key: 'po', label: t('inventory.suppliers.actions.newPurchase'), icon: ShoppingCart, onSelect: () => navigate(`/purchases/new?supplier=${supplier.id}`) });
    if (canManage) items.push({ key: 'pay', label: t('inventory.suppliers.actions.pay'), icon: HandCoins, onSelect: () => navigate(`/suppliers/${supplier.id}?pay=1`) });
    return items;
  };

  const columns: Array<Column<Supplier>> = [
    {
      key: 'name',
      header: t('inventory.suppliers.columns.supplier'),
      sortKey: 'name',
      cell: (supplier) => (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-medium text-fg">{supplier.name}</p>
          <p className="type-caption truncate text-fg-subtle">
            <span className="font-mono">{supplier.code}</span>
            {supplier.company && supplier.company !== supplier.name ? ` · ${supplier.company}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('inventory.suppliers.columns.contact'),
      hideable: true,
      cell: (supplier) => (
        <div className="min-w-0 leading-tight">
          <p className="truncate">{supplier.contactPerson || '—'}</p>
          {supplier.phone && <p className="type-caption text-fg-subtle tnum">{format.digits(supplier.phone)}</p>}
        </div>
      ),
    },
    {
      key: 'purchases',
      header: t('inventory.suppliers.columns.purchases'),
      sortKey: 'purchases',
      align: 'end',
      cell: (supplier) => {
        const summary = summaryOf(supplier.id);
        return (
          <div className="flex flex-col items-end leading-tight">
            <span className="font-semibold text-fg">{format.money(summary?.totalPurchases ?? 0)}</span>
            <span className="type-caption text-fg-subtle">{t('common.units.orders', { count: summary?.purchaseCount ?? 0 })}</span>
          </div>
        );
      },
    },
    { key: 'outstanding', header: t('inventory.suppliers.columns.outstanding'), sortKey: 'outstanding', align: 'end', cell: (supplier) => <DueAmount amount={summaryOf(supplier.id)?.outstanding ?? 0} /> },
    {
      key: 'last',
      header: t('inventory.suppliers.columns.lastPurchase'),
      sortKey: 'last',
      hideable: true,
      cell: (supplier) => {
        const last = summaryOf(supplier.id)?.lastPurchaseAt;
        return last ? <span className="whitespace-nowrap text-fg-muted">{format.relative(last)}</span> : <span className="text-fg-subtle">{t('inventory.suppliers.noPurchases')}</span>;
      },
    },
    {
      key: 'status',
      header: t('common.labels.status'),
      cell: (supplier) => {
        const badge = supplierStatusBadge(supplier.status);
        return <StatusBadge size="sm" tone={badge.tone} icon={badge.icon} label={t(supplier.status === 'active' ? 'common.labels.active' : 'common.labels.inactive')} />;
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      width: '3.5rem',
      cell: (supplier) => (
        <div className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <DropdownMenu width={240} items={rowActions(supplier)} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('inventory.suppliers.actionsFor', { name: supplier.name })} tooltipSide="left" />} />
        </div>
      ),
    },
  ];

  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: t('inventory.suppliers.allStatuses') },
    { value: 'active', label: t('common.labels.active') },
    { value: 'inactive', label: t('common.labels.inactive') },
  ];
  const kpisReady = Boolean(suppliers.data && summaries.data);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Truck}
        title={t('inventory.suppliers.title')}
        description={t('inventory.suppliers.description')}
        actions={
          <>
            <Button icon={Download} onClick={exportCsv} disabled={table.total === 0}>
              {t('common.actions.exportCsv')}
            </Button>
            {canManage && (
              <Button variant="primary" icon={Truck} onClick={() => setEditing('new')}>
                {t('inventory.suppliers.add')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <section aria-label={t('inventory.suppliers.kpi.title')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {!kpisReady ? (
            Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
          ) : (
            <>
              <StatCard label={t('inventory.suppliers.kpi.suppliers')} value={format.integer(all.length)} icon={Truck} tone="primary" hint={t('inventory.suppliers.kpi.activeHint', { count: format.integer(activeCount) })} />
              <StatCard label={t('inventory.suppliers.kpi.outstanding')} value={format.money(outstandingTotal)} icon={Wallet} tone={outstandingTotal > 0 ? 'danger' : 'success'} hint={outstandingTotal > 0 ? t('inventory.suppliers.kpi.outstandingHint', { count: format.integer(owing.length) }) : undefined} />
              <StatCard label={t('inventory.suppliers.kpi.purchasesMonth')} value={month.data ? format.money(monthTotal) : '…'} icon={ShoppingCart} tone="info" hint={month.data ? t('inventory.suppliers.kpi.purchasesMonthHint', { count: format.integer(monthRows.length) }) : undefined} />
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('common.actions.filters')}>
          <div className="min-w-[16rem] flex-1">
            <SearchInput value={query} onChange={setQuery} clearLabel={t('common.actions.clear')} placeholder={t('inventory.suppliers.searchPlaceholder')} aria-label={t('inventory.suppliers.searchLabel')} />
          </div>
          <div className="w-48">
            <Select aria-label={t('common.labels.status')} value={status} options={statusOptions} onChange={setStatus} />
          </div>
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          )}
        </div>

        <DataTable
          ariaLabel={t('inventory.suppliers.tableLabel')}
          className="min-h-[24rem] flex-1"
          columns={columns}
          columnsKey="suppliers-list"
          rows={table.rows}
          rowKey={(supplier) => supplier.id}
          loading={!suppliers.data && !suppliers.error}
          onRowClick={(supplier) => navigate(`/suppliers/${supplier.id}`)}
          sort={table.sort}
          onSortChange={table.setSort}
          pagination={
            table.total > 0
              ? {
                  page: table.page,
                  pageSize: table.pageSize,
                  total: table.total,
                  onPageChange: table.setPage,
                  onPageSizeChange: table.setPageSize,
                }
              : undefined
          }
          empty={
            suppliers.error ? (
              <EmptyState icon={Truck} title={t('errors.loadFailed')} action={<Button onClick={reload}>{t('common.actions.retry')}</Button>} />
            ) : hasFilters ? (
              <EmptyState
                icon={Truck}
                title={t('inventory.suppliers.emptyFiltered')}
                description={t('common.states.emptyHint')}
                action={
                  <Button icon={X} onClick={clearFilters}>
                    {t('common.actions.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Truck}
                title={t('inventory.suppliers.empty')}
                description={t('inventory.suppliers.emptyHint')}
                action={
                  canManage ? (
                    <Button variant="primary" icon={Truck} onClick={() => setEditing('new')}>
                      {t('inventory.suppliers.add')}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </div>

      <SupplierFormModal
        open={editing !== null}
        supplier={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          const created = editing === 'new';
          setEditing(null);
          if (created) navigate(`/suppliers/${saved.id}`);
          else reload();
        }}
      />
    </div>
  );
}
