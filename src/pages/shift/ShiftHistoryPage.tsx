import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarRange, CircleMinus, CirclePlus, Download, History, Layers, TrendingUp, Wallet, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useNow } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import type { ShiftListRow, ShiftSearchFilter } from '@/repositories/types';
import { searchShifts, summarizeShifts } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import type { ShiftStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { EmptyState, LoadingBar, Skeleton } from '@/components/ui/States';
import { DifferenceBadge, ShiftStatusBadge } from '@/features/cash/CashBadges';
import { exportShiftHistory } from '@/features/cash/cashExports';
import { CASH_PERIODS, formatDuration } from '@/features/cash/cashMeta';
import { periodPatch, readChoice, readPaging, readPeriod, useListParams } from '@/features/sales/listParams';
import { directoryName, loadStaffDirectory } from '@/features/sales/saleData';

/* ==========================================================================
   Shift history (/shift/history): period, counter, cashier and status
   filters (kept in the URL), a KPI strip (sales, cash short / over) and a
   server-paginated table. A row opens the shift's reconciliation.
   ========================================================================== */

const STATUSES: readonly ShiftStatus[] = ['open', 'closed'];

export default function ShiftHistoryPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const canViewAll = useCan('shift.viewAll');
  const [params, update] = useListParams();
  const [exporting, setExporting] = useState(false);

  const { period, range } = readPeriod(params, CASH_PERIODS, 'this_week');
  const counterId = params.get('counter') || 'all';
  const cashierId = canViewAll ? params.get('cashier') || 'all' : 'all';
  const status = readChoice<ShiftStatus | 'all'>(params, 'status', ['all', ...STATUSES], 'all');
  const differenceOnly = params.get('diff') === '1';
  const { page, pageSize } = readPaging(params);
  const filter: ShiftSearchFilter = { from: range.from, to: range.to, counterId, userId: cashierId, status, differenceOnly };
  const deps = [range.from, range.to, counterId, cashierId, status, differenceOnly];

  const directory = useAsync(() => loadStaffDirectory(), []);
  const list = useAsync(() => searchShifts(filter, { page, pageSize }), [...deps, page, pageSize]);
  const summary = useAsync(() => summarizeShifts(filter), deps);

  const users = directory.data?.users;
  const counters = directory.data?.counters;
  const counterLabel = (row: ShiftListRow) => directoryName(counters, row.counterId, language, row.counterName);
  const cashierLabel = (row: ShiftListRow) => directoryName(users, row.openedBy, language, row.openedByName);
  const hasFilters = counterId !== 'all' || cashierId !== 'all' || status !== 'all' || differenceOnly;
  const clearFilters = () => update({ counter: null, cashier: null, status: null, diff: null, page: null });

  const exportCsv = async () => {
    setExporting(true);
    await exportShiftHistory(filter, { counter: counterLabel, cashier: cashierLabel });
    setExporting(false);
  };

  const columns: Array<Column<ShiftListRow>> = [
    {
      key: 'shift',
      header: t('cash.history.columns.shift'),
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{row.shiftNo}</span>
          <ShiftStatusBadge status={row.status} size="sm" />
        </div>
      ),
    },
    { key: 'counter', header: t('common.labels.counter'), hideable: true, cell: (row) => <span className="block max-w-36 truncate">{counterLabel(row)}</span> },
    { key: 'cashier', header: t('common.labels.cashier'), hideable: true, cell: (row) => <span className="block max-w-40 truncate">{cashierLabel(row)}</span> },
    {
      key: 'opened',
      header: t('cash.history.columns.opened'),
      cell: (row) => (
        <div className="leading-tight whitespace-nowrap tnum">
          <p>{format.date(row.openedAt)}</p>
          <p className="type-caption text-fg-subtle">{format.time(row.openedAt)}</p>
        </div>
      ),
    },
    {
      key: 'closed',
      header: t('cash.history.columns.closed'),
      cell: (row) => (row.closedAt ? <span className="whitespace-nowrap tnum">{format.time(row.closedAt)}</span> : <span className="text-fg-subtle">{t('cash.common.stillOpen')}</span>),
    },
    {
      key: 'duration',
      header: t('cash.history.columns.duration'),
      hideable: true,
      cell: (row) => <span className="whitespace-nowrap text-fg-muted tnum">{formatDuration(t, row.openedAt, row.closedAt ? new Date(row.closedAt) : now)}</span>,
    },
    { key: 'opening', header: t('cash.history.columns.opening'), align: 'end', hideable: true, defaultHidden: true, cell: (row) => format.money(row.openingCash) },
    {
      key: 'sales',
      header: t('cash.history.columns.sales'),
      align: 'end',
      cell: (row) => (
        <div className="flex flex-col items-end leading-tight">
          <span className="font-semibold">{format.money(row.salesTotal)}</span>
          <span className="type-caption text-fg-subtle">{t('cash.common.salesCount', { count: row.salesCount })}</span>
        </div>
      ),
    },
    { key: 'expected', header: t('cash.history.columns.expected'), align: 'end', cell: (row) => format.money(row.closingTotals?.expectedCash ?? row.drawerCash) },
    { key: 'counted', header: t('cash.history.columns.counted'), align: 'end', cell: (row) => (row.actualCash !== null ? format.money(row.actualCash) : <span className="text-fg-subtle">—</span>) },
    {
      key: 'difference',
      header: t('cash.history.columns.difference'),
      cell: (row) => (row.status === 'closed' && row.difference !== null ? <DifferenceBadge difference={row.difference} size="sm" /> : <span className="text-fg-subtle">—</span>),
    },
  ];

  const counterOptions = [{ value: 'all', label: t('cash.history.allCounters') }, ...(counters ?? []).map((entry) => ({ value: entry.id, label: `${entry.code} · ${language === 'bn' ? entry.name.bn || entry.name.en : entry.name.en || entry.name.bn}` }))];
  const cashierOptions = [{ value: 'all', label: t('cash.history.allCashiers') }, ...(users ?? []).map((entry) => ({ value: entry.id, label: language === 'bn' ? entry.name.bn || entry.name.en : entry.name.en || entry.name.bn }))];
  const statusOptions = [{ value: 'all' as const, label: t('cash.history.allStatuses') }, ...STATUSES.map((value) => ({ value, label: t(`enums.shiftStatus.${value}`) }))];
  const kpis = summary.data;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={History}
        title={t('cash.history.title')}
        description={t('cash.history.description')}
        breadcrumb={[{ label: t('cash.shift.title'), to: '/shift' }, { label: t('cash.history.title') }]}
        actions={
          <>
            <Button icon={Download} loading={exporting} disabled={!list.data || list.data.total === 0} onClick={() => void exportCsv()}>
              {t('common.actions.exportCsv')}
            </Button>
            <Button variant="primary" icon={Wallet} onClick={() => navigate('/shift')}>
              {t('cash.detail.goToCashScreen')}
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('common.actions.filters')}>
          <PeriodPicker period={period} range={range} periods={CASH_PERIODS} onChange={(next, custom) => update(periodPatch(next, custom))} />
          <div className="w-48">
            <Select aria-label={t('common.labels.counter')} value={counterId} options={counterOptions} onChange={(value) => update({ counter: value === 'all' ? null : value, page: null })} />
          </div>
          {canViewAll && (
            <div className="w-48">
              <Select aria-label={t('common.labels.cashier')} value={cashierId} options={cashierOptions} onChange={(value) => update({ cashier: value === 'all' ? null : value, page: null })} />
            </div>
          )}
          <div className="w-40">
            <Select aria-label={t('common.labels.status')} value={status} options={statusOptions} onChange={(value) => update({ status: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="flex min-h-touch items-center rounded-md border border-border bg-surface-2 px-3">
            <Checkbox checked={differenceOnly} onChange={(checked) => update({ diff: checked ? '1' : null, page: null })} label={t('cash.history.differenceOnly')} />
          </div>
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters}>
              {t('common.actions.clearFilters')}
            </Button>
          )}
        </div>

        <section aria-label={t('cash.history.kpiShifts')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {!kpis ? (
            Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[6.4rem] rounded-xl" />)
          ) : (
            <>
              <StatCard label={t('cash.history.kpiShifts')} value={format.integer(kpis.count)} icon={Layers} tone="primary" hint={t('cash.history.kpiOpen', { count: kpis.openCount })} />
              <StatCard label={t('cash.history.kpiSales')} value={format.money(kpis.salesTotal)} icon={TrendingUp} tone="info" hint={t('cash.history.kpiShiftCount', { count: kpis.count })} />
              <StatCard
                label={t('cash.history.kpiShort')}
                value={format.money(kpis.shortTotal)}
                icon={CircleMinus}
                tone={kpis.shortCount > 0 ? 'danger' : 'neutral'}
                hint={t('cash.history.kpiShiftCount', { count: kpis.shortCount })}
                onClick={kpis.shortCount > 0 && !differenceOnly ? () => update({ diff: '1', page: null }) : undefined}
              />
              <StatCard
                label={t('cash.history.kpiOver')}
                value={format.money(kpis.overTotal)}
                icon={CirclePlus}
                tone={kpis.overCount > 0 ? 'warning' : 'neutral'}
                hint={t('cash.history.kpiShiftCount', { count: kpis.overCount })}
                onClick={kpis.overCount > 0 && !differenceOnly ? () => update({ diff: '1', page: null }) : undefined}
              />
            </>
          )}
        </section>

        <div className="relative flex min-h-[26rem] flex-1 flex-col">
          <LoadingBar active={list.loading && Boolean(list.data)} />
          <DataTable
            ariaLabel={t('cash.history.aria')}
            className="min-h-0 flex-1"
            columns={columns}
            columnsKey="shift-history"
            rows={list.data?.rows ?? []}
            rowKey={(row) => row.id}
            loading={!list.data && !list.error}
            onRowClick={(row) => navigate(`/shift/${row.id}`)}
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
                <EmptyState icon={History} title={t('errors.loadFailed')} action={<Button onClick={list.reload}>{t('common.actions.retry')}</Button>} />
              ) : (
                <EmptyState
                  icon={History}
                  title={t('cash.history.empty')}
                  description={t('cash.history.emptyHint')}
                  action={
                    hasFilters ? (
                      <Button icon={X} onClick={clearFilters}>
                        {t('common.actions.clearFilters')}
                      </Button>
                    ) : period !== 'this_month' ? (
                      <Button icon={CalendarRange} onClick={() => update(periodPatch('this_month'))}>
                        {t('common.periods.this_month')}
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
