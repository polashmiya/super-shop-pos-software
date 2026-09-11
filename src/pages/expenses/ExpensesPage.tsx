import { useState } from 'react';
import { CalendarDays, CalendarRange, Download, Hourglass, Plus, ReceiptText, Tags, X } from 'lucide-react';
import { parseLocalDate } from '@/domain/dates';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { ExpenseSearchFilter } from '@/repositories/types';
import { defaultReportFilter } from '@/services/reportService';
import { expenseService, searchExpenses, summarizeExpenses } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import type { Expense, ExpensePaidFrom, ExpenseStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { ExpenseStatusBadge, PaidFromBadge } from '@/features/cash/CashBadges';
import { ExpenseBreakdownCard } from '@/features/cash/ExpenseBreakdownCard';
import { ExpenseFormModal } from '@/features/cash/ExpenseFormModal';
import { ExpenseRowActions } from '@/features/cash/ExpenseRowActions';
import { exportExpenses } from '@/features/cash/cashExports';
import { CASH_PERIODS, EXPENSE_STATUSES, PAID_FROM_OPTIONS, splitExpenseDescription } from '@/features/cash/cashMeta';
import { periodPatch, readChoice, readPaging, readPeriod, useListParams } from '@/features/sales/listParams';
import { useSearchText } from '@/features/sales/useSearchText';

/* ==========================================================================
   Expenses (/expenses): KPIs (this month, today, top category, pending),
   filters kept in the URL, a server-paginated list with approve / void /
   delete, the category breakdown of the filtered period and CSV export.
   ========================================================================== */

export default function ExpensesPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const canCreate = useCan('expenses.create');
  const canApprove = useCan('expenses.approve');
  const [params, update] = useListParams();
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [version, setVersion] = useState(0);

  const { period, range } = readPeriod(params, CASH_PERIODS, 'this_month');
  const categoryId = params.get('category') || 'all';
  const status = readChoice<ExpenseStatus | 'all'>(params, 'status', ['all', ...EXPENSE_STATUSES], 'all');
  const paidFrom = readChoice<ExpensePaidFrom | 'all'>(params, 'paid', ['all', ...PAID_FROM_OPTIONS], 'all');
  const search = params.get('q') ?? '';
  const { page, pageSize } = readPaging(params);
  const [searchText, setSearchText, resetSearch] = useSearchText(search, (value) => update({ q: value, page: null }));
  const filter: ExpenseSearchFilter = { from: range.from, to: range.to, categoryId, status, paidFrom, search: search || undefined };
  const deps = [range.from, range.to, categoryId, status, paidFrom, search, version];

  const categories = useAsync(() => expenseService.categories(), []);
  const list = useAsync(() => searchExpenses(filter, { page, pageSize }), [...deps, page, pageSize]);
  const breakdown = useAsync(() => summarizeExpenses(filter), deps);
  const kpis = useAsync(() => {
    const month = defaultReportFilter('this_month');
    const today = defaultReportFilter('today');
    return Promise.all([summarizeExpenses({ from: month.from, to: month.to }), summarizeExpenses({ from: today.from, to: today.to }), summarizeExpenses({ status: 'pending' })]);
  }, [version]);

  const reloadAll = () => setVersion((value) => value + 1);
  const hasFilters = Boolean(search || categoryId !== 'all' || status !== 'all' || paidFrom !== 'all');
  const clearFilters = () => {
    resetSearch('');
    update({ q: null, category: null, status: null, paid: null, page: null });
  };

  const exportCsv = async () => {
    setExporting(true);
    await exportExpenses(filter, localize);
    setExporting(false);
  };

  const columns: Array<Column<Expense>> = [
    { key: 'number', header: t('cash.expenses.columns.number'), cell: (row) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{row.expenseNo}</span> },
    { key: 'date', header: t('common.labels.date'), cell: (row) => <span className="whitespace-nowrap tnum">{format.date(parseLocalDate(row.expenseDate))}</span> },
    { key: 'category', header: t('common.labels.category'), cell: (row) => <span className="block max-w-40 truncate">{localize(row.categoryName)}</span> },
    {
      key: 'description',
      header: t('common.labels.description'),
      cell: (row) => {
        const { note, reference } = splitExpenseDescription(row.description);
        return (
          <div className="max-w-72 min-w-0 leading-tight">
            <p className="truncate">{note}</p>
            {reference && <p className="type-caption truncate text-fg-subtle">{t('cash.expenses.reference', { reference })}</p>}
          </div>
        );
      },
    },
    { key: 'paidFrom', header: t('cash.expenses.columns.paidFrom'), hideable: true, cell: (row) => <PaidFromBadge paidFrom={row.paidFrom} size="sm" /> },
    { key: 'paidBy', header: t('cash.expenses.columns.paidBy'), hideable: true, cell: (row) => <span className="block max-w-36 truncate text-fg-muted">{row.userName ?? '—'}</span> },
    { key: 'status', header: t('common.labels.status'), cell: (row) => <ExpenseStatusBadge status={row.status} size="sm" /> },
    {
      key: 'amount',
      header: t('common.labels.amount'),
      align: 'end',
      cell: (row) => <span className={row.status === 'rejected' ? 'font-semibold text-fg-subtle line-through' : 'font-semibold text-fg'}>{format.money(row.amount)}</span>,
    },
    ...(canApprove
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">{t('common.labels.actions')}</span>,
            width: '3.5rem',
            cell: (row: Expense) => <ExpenseRowActions expense={row} onEdit={setEditing} onChanged={reloadAll} />,
          },
        ]
      : []),
  ];

  const categoryOptions = [{ value: 'all', label: t('cash.expenses.allCategories') }, ...(categories.data ?? []).map((category) => ({ value: category.id, label: localize(category.name) }))];
  const statusOptions = [{ value: 'all' as const, label: t('cash.expenses.allStatuses') }, ...EXPENSE_STATUSES.map((value) => ({ value, label: t(`enums.expenseStatus.${value}`) }))];
  const paidOptions = [{ value: 'all' as const, label: t('cash.expenses.allSources') }, ...PAID_FROM_OPTIONS.map((value) => ({ value, label: t(`enums.paidFrom.${value}`) }))];
  const [month, today, pending] = kpis.data ?? [];
  const top = month?.byCategory[0];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ReceiptText}
        title={t('cash.expenses.title')}
        description={t('cash.expenses.description')}
        actions={
          <>
            <Button icon={Download} loading={exporting} disabled={!list.data || list.data.total === 0} onClick={() => void exportCsv()}>
              {t('common.actions.exportCsv')}
            </Button>
            {canCreate && (
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} disabled={!categories.data}>
                {t('cash.expenses.add')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <section aria-label={t('cash.expenses.title')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {!month || !today || !pending ? (
            Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
          ) : (
            <>
              <StatCard label={t('cash.expenses.kpiMonth')} value={format.money(month.total)} icon={CalendarRange} tone="primary" hint={t('cash.expenses.kpiMonthHint', { count: month.count })} />
              <StatCard label={t('cash.expenses.kpiToday')} value={format.money(today.total)} icon={CalendarDays} tone="info" hint={t('cash.expenses.kpiMonthHint', { count: today.count })} />
              <StatCard label={t('cash.expenses.kpiTopCategory')} value={top ? localize(top.name) : t('cash.expenses.kpiNone')} icon={Tags} tone="neutral" hint={top ? format.money(top.amount) : undefined} />
              <StatCard
                label={t('cash.expenses.kpiPending')}
                value={format.money(pending.pendingTotal)}
                icon={Hourglass}
                tone={pending.pendingCount > 0 ? 'warning' : 'neutral'}
                hint={t('cash.expenses.kpiMonthHint', { count: pending.pendingCount })}
                onClick={pending.pendingCount > 0 && status !== 'pending' ? () => update({ status: 'pending', period: 'last_30_days', from: null, to: null, page: null }) : undefined}
              />
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('common.actions.filters')}>
          <PeriodPicker period={period} range={range} periods={CASH_PERIODS} onChange={(next, custom) => update(periodPatch(next, custom))} />
          <div className="min-w-[14rem] flex-1">
            <SearchInput value={searchText} onChange={setSearchText} clearLabel={t('common.actions.clear')} placeholder={t('cash.expenses.searchPlaceholder')} aria-label={t('common.actions.search')} />
          </div>
          <div className="w-44">
            <Select aria-label={t('common.labels.category')} value={categoryId} options={categoryOptions} onChange={(value) => update({ category: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-40">
            <Select aria-label={t('common.labels.status')} value={status} options={statusOptions} onChange={(value) => update({ status: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-48">
            <Select aria-label={t('cash.expenses.columns.paidFrom')} value={paidFrom} options={paidOptions} onChange={(value) => update({ paid: value === 'all' ? null : value, page: null })} />
          </div>
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          )}
        </div>

        <div className="grid min-h-[26rem] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="relative flex min-h-[26rem] min-w-0 flex-col">
            <LoadingBar active={list.loading && Boolean(list.data)} />
            <DataTable
              ariaLabel={t('cash.expenses.aria')}
              className="min-h-0 flex-1"
              columns={columns}
              columnsKey="expenses-list"
              rows={list.data?.rows ?? []}
              rowKey={(row) => row.id}
              loading={!list.data && !list.error}
              onRowClick={canApprove ? (row) => setEditing(row) : undefined}
              pagination={
                list.data
                  ? { page, pageSize, total: list.data.total, onPageChange: (next) => update({ page: next > 1 ? next : null }), onPageSizeChange: (size) => update({ size, page: null }) }
                  : undefined
              }
              empty={
                list.error ? (
                  <EmptyState icon={ReceiptText} title={t('errors.loadFailed')} action={<Button onClick={list.reload}>{t('common.actions.retry')}</Button>} />
                ) : (
                  <EmptyState
                    icon={ReceiptText}
                    title={t('cash.expenses.empty')}
                    description={hasFilters ? t('common.states.emptyHint') : t('cash.expenses.emptyHint')}
                    action={
                      hasFilters ? (
                        <Button icon={X} onClick={clearFilters}>
                          {t('common.actions.clearFilters')}
                        </Button>
                      ) : canCreate ? (
                        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} disabled={!categories.data}>
                          {t('cash.expenses.add')}
                        </Button>
                      ) : undefined
                    }
                  />
                )
              }
            />
          </div>
          <ExpenseBreakdownCard summary={breakdown.data} loading={breakdown.loading} />
        </div>
      </div>

      {editing && categories.data && (
        <ExpenseFormModal
          expense={editing === 'new' ? null : editing}
          categories={categories.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
}
