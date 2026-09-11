import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Crown, Store, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService } from '@/services/peopleService';
import { useCan } from '@/stores/authStore';
import type { Customer, CustomerType } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Avatar, PageHeader, StatCard } from '@/components/ui/Display';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { CustomerTypeBadge } from '@/features/customers/CustomerBadges';
import { CustomerRowActions } from '@/features/customers/CustomerRowActions';
import { deleteCustomerWithConfirm, startSaleForCustomer } from '@/features/customers/customerActions';
import { CUSTOMER_SORTS, CUSTOMER_TYPES, customerAvatarColor, defaultSortDirection, type CustomerSort } from '@/features/customers/customerMeta';
import { customerSalesLink } from '@/features/customers/customerLinks';
import { readChoice, readPaging, useListParams } from '@/features/sales/listParams';
import { useSearchText } from '@/features/sales/useSearchText';

/* ==========================================================================
   Customers: type KPIs (click to filter), search by name/phone/code, type
   filter and sort kept in the URL, server-paginated table.
   ========================================================================== */

export default function CustomersPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const canManage = useCan('customers.manage');
  const canDelete = useCan('customers.delete');
  const canSell = useCan('pos.sell');
  const canSeeSales = useCan('sales.view');
  const [params, update] = useListParams();

  const search = params.get('q') ?? '';
  const type = readChoice<CustomerType | 'all'>(params, 'type', ['all', ...CUSTOMER_TYPES], 'all');
  const sort = readChoice<CustomerSort>(params, 'sort', CUSTOMER_SORTS, 'name');
  const direction = readChoice(params, 'dir', ['asc', 'desc'] as const, defaultSortDirection(sort));
  const { page, pageSize } = readPaging(params);
  const [searchText, setSearchText, resetSearch] = useSearchText(search, (value) => update({ q: value, page: null }));
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);

  const list = useAsync(() => customerService.list({ search: search || undefined, type, sort, direction }, { page, pageSize }), [search, type, sort, direction, page, pageSize]);
  const counts = useAsync(() => customerService.countByType(), []);

  const hasFilters = Boolean(search || type !== 'all');
  const clearFilters = () => {
    resetSearch('');
    update({ q: null, type: null, page: null });
  };
  const reloadAll = () => {
    list.reload();
    counts.reload();
  };
  const openCustomer = (customer: Customer) => navigate(`/customers/${customer.id}`);
  const setType = (next: CustomerType | 'all') => update({ type: next === 'all' || next === type ? null : next, page: null });

  const columns: Array<Column<Customer>> = [
    {
      key: 'name',
      header: t('customers.columns.customer'),
      sortKey: 'name',
      cell: (customer) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={customer.name} color={customerAvatarColor(customer.id)} size={34} />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium text-fg">{customer.name}</p>
            <p className="type-caption font-mono text-fg-subtle">{customer.code}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: t('common.labels.phone'), cell: (customer) => <span className="whitespace-nowrap tnum">{customer.phone ? format.digits(customer.phone) : '—'}</span> },
    { key: 'type', header: t('common.labels.type'), cell: (customer) => <CustomerTypeBadge size="sm" type={customer.customerType} /> },
    { key: 'orders', header: t('customers.columns.orders'), align: 'end', hideable: true, cell: (customer) => format.integer(customer.totalOrders) },
    { key: 'spent', header: t('customers.columns.spent'), sortKey: 'totalSpent', align: 'end', cell: (customer) => <span className="font-semibold text-fg">{format.money(customer.totalSpent)}</span> },
    { key: 'points', header: t('customers.columns.points'), sortKey: 'points', align: 'end', hideable: true, cell: (customer) => format.integer(customer.loyaltyPoints) },
    {
      key: 'last',
      header: t('customers.columns.lastPurchase'),
      sortKey: 'lastPurchase',
      hideable: true,
      cell: (customer) =>
        customer.lastPurchaseAt ? (
          <span className="whitespace-nowrap text-fg-muted" title={format.dateTime(customer.lastPurchaseAt)}>
            {format.relative(customer.lastPurchaseAt)}
          </span>
        ) : (
          <span className="text-fg-subtle">{t('customers.never')}</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.labels.actions')}</span>,
      width: '3.5rem',
      cell: (customer) => (
        <CustomerRowActions
          customer={customer}
          onView={openCustomer}
          onEdit={canManage ? setEditing : undefined}
          onNewSale={
            canSell
              ? (row) => {
                  startSaleForCustomer(row);
                  navigate('/pos');
                }
              : undefined
          }
          onSales={canSeeSales ? (row) => navigate(customerSalesLink(row)) : undefined}
          onDelete={canDelete ? (row) => void deleteCustomerWithConfirm(row).then((deleted) => deleted && reloadAll()) : undefined}
        />
      ),
    },
  ];

  const typeOptions = [{ value: 'all' as const, label: t('customers.filters.allTypes') }, ...CUSTOMER_TYPES.map((value) => ({ value, label: t(`enums.customerType.${value}`) }))];
  const sortOptions = CUSTOMER_SORTS.map((value) => ({ value, label: t(`customers.filters.sort.${value}`) }));
  const countData = counts.data;
  const total = countData ? CUSTOMER_TYPES.reduce((sum, key) => sum + countData[key], 0) : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Users}
        title={t('customers.title')}
        description={t('customers.subtitle')}
        actions={
          canManage && (
            <Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>
              {t('customers.add')}
            </Button>
          )
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <section aria-label={t('customers.kpi.title')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {!countData ? (
            Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
          ) : (
            <>
              <StatCard label={t('customers.kpi.total')} value={format.integer(total)} icon={Users} tone="primary" onClick={() => setType('all')} hint={t('customers.kpi.totalHint')} />
              <StatCard label={t('enums.customerType.regular')} value={format.integer(countData.regular)} icon={UserCheck} tone="success" onClick={() => setType('regular')} />
              <StatCard label={t('enums.customerType.vip')} value={format.integer(countData.vip)} icon={Crown} tone="warning" onClick={() => setType('vip')} />
              <StatCard label={t('enums.customerType.wholesale')} value={format.integer(countData.wholesale)} icon={Store} tone="info" onClick={() => setType('wholesale')} />
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('common.actions.filters')}>
          <div className="min-w-[16rem] flex-1">
            <SearchInput value={searchText} onChange={setSearchText} clearLabel={t('common.actions.clear')} placeholder={t('customers.filters.searchPlaceholder')} aria-label={t('customers.filters.searchLabel')} />
          </div>
          <div className="w-48">
            <Select aria-label={t('common.labels.type')} value={type} options={typeOptions} onChange={(value) => update({ type: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-52">
            <Select aria-label={t('common.labels.sortBy')} value={sort} options={sortOptions} onChange={(value) => update({ sort: value === 'name' ? null : value, dir: null, page: null })} />
          </div>
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          )}
        </div>

        <div className="relative flex min-h-[26rem] flex-1 flex-col">
          <LoadingBar active={list.loading && Boolean(list.data)} />
          <DataTable
            ariaLabel={t('customers.title')}
            className="min-h-0 flex-1"
            columns={columns}
            columnsKey="customers-list"
            rows={list.data?.rows ?? []}
            rowKey={(customer) => customer.id}
            loading={!list.data && !list.error}
            onRowClick={openCustomer}
            sort={{ key: sort, direction }}
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
                <EmptyState icon={Users} title={t('errors.loadFailed')} action={<Button onClick={list.reload}>{t('common.actions.retry')}</Button>} />
              ) : (
                <EmptyState
                  icon={Users}
                  title={t('customers.empty.title')}
                  description={hasFilters ? t('customers.empty.filtered') : t('customers.empty.hint')}
                  action={
                    hasFilters ? (
                      <Button icon={X} onClick={clearFilters}>
                        {t('common.actions.clearFilters')}
                      </Button>
                    ) : canManage ? (
                      <Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>
                        {t('customers.add')}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        </div>
      </div>

      {editing && (
        <CustomerFormModal
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const created = editing === 'new';
            setEditing(null);
            if (created) navigate(`/customers/${saved.id}`);
            else reloadAll();
          }}
        />
      )}
    </div>
  );
}
