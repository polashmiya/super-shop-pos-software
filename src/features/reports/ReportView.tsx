import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Download, FileJson, FileSpreadsheet, Printer, RefreshCw, Star, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore, useCan } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/Display';
import { DropdownMenu } from '@/components/ui/Menu';
import { EmptyState, ErrorState, LoadingBar, Skeleton } from '@/components/ui/States';
import { describeFilters, filterValues } from './describe';
import { exportReportCsv, exportReportJson, printReport, type ReportExport } from './exporters';
import { loadFilterDirectory } from './filterOptions';
import type { LabelContext } from './labels';
import { readFavourites, recordRecent, toggleFavourite } from './library';
import { comparisonRange, rangeCaption } from './period';
import { ReportChart } from './ReportCharts';
import { ReportFilters } from './ReportFilters';
import { KpiSkeleton, ReportKpis, ReportStatement } from './ReportSummary';
import { ReportTable } from './ReportTable';
import { viewRows, visibleColumns, type TableSort } from './tableModel';
import type { ReportDefinition } from './types';
import { clearFiltersPatch, periodPatch, useReportState } from './useReportState';

/* ==========================================================================
   One report: header actions (favourite, refresh, export, print), the
   filter row, KPIs with deltas, statement + charts and the detail table.
   Rendered with key={report id}, so switching reports starts fresh.
   ========================================================================== */

export function ReportView({ definition }: { definition: ReportDefinition }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const ctx = useMemo<LabelContext>(() => ({ t, format, language }), [t, format, language]);
  const canFinancial = useCan('reports.financial');
  const userId = useAuthStore((state) => state.user?.id ?? 'none');
  const [now, setNow] = useState(() => new Date());
  const [state, update] = useReportState(definition, now);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TableSort | null>(null);
  const [favourite, setFavourite] = useState(() => readFavourites(userId).includes(definition.id));
  const [busy, setBusy] = useState<'print' | 'export' | null>(null);

  useEffect(() => {
    recordRecent(userId, definition.id);
  }, [userId, definition.id]);

  const { filter, extra } = state;
  const comparison = state.compare ? comparisonRange(state.period, state.range, now) : null;
  const directory = useAsync(() => loadFilterDirectory(definition.filters), [definition]);
  const data = useAsync(
    async () => {
      const options = { extra, canFinancial, summaryOnly: false, now };
      const [current, previous] = await Promise.all([
        definition.load(filter, options),
        comparison ? definition.load({ ...filter, from: comparison.from, to: comparison.to }, { ...options, summaryOnly: true }) : Promise.resolve(null),
      ]);
      return { current, previous };
    },
    [definition, filter.from, filter.to, filter.cashierId, filter.counterId, filter.categoryId, filter.brandId, filter.supplierId, filter.paymentMethod, extra.customerType, extra.movementType, extra.cashType, extra.rankBy, comparison?.from, comparison?.to, canFinancial, now],
  );

  const result = data.data?.current;
  const previous = data.data?.previous ?? null;
  const rows = useMemo(() => (result ? viewRows(result.table, search, sort, language) : []), [result, search, sort, language]);
  const title = t(`reports.items.${definition.id}.title`);
  const columnsKey = `report:${definition.id}`;
  const periodText = definition.period === 'snapshot' ? t('reports.view.snapshot', { time: format.dateTime(now) }) : rangeCaption(state.range, format);

  const refresh = () => {
    setNow(new Date());
    directory.reload();
  };

  const onToggleFavourite = () => setFavourite(toggleFavourite(userId, definition.id).includes(definition.id));

  const run = async (kind: 'print' | 'export', action: (input: ReportExport) => Promise<void>) => {
    if (!result) return;
    setBusy(kind);
    try {
      await action({
        definition,
        result,
        rows,
        columns: visibleColumns(columnsKey, result.table.columns),
        ctx,
        title,
        periodText: definition.period === 'snapshot' ? periodText : t('reports.view.period', { range: periodText }),
        filtersText: describeFilters(state, directory.data, ctx),
        range: definition.period === 'range' ? state.range : null,
        filters: filterValues(state),
      });
    } finally {
      setBusy(null);
    }
  };

  const emptyAction = (
    <>
      {state.filtered && (
        <Button icon={X} onClick={() => update(clearFiltersPatch())}>
          {t('reports.filters.clear')}
        </Button>
      )}
      {definition.period === 'range' && state.period !== 'last_30_days' && (definition.periods ?? ['last_30_days']).includes('last_30_days') && (
        <Button icon={CalendarRange} onClick={() => update(periodPatch('last_30_days'))}>
          {t('reports.view.showLonger')}
        </Button>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={definition.icon}
        title={title}
        description={t(`reports.items.${definition.id}.description`)}
        breadcrumb={[{ label: t('reports.title'), to: '/reports' }, { label: title }]}
        actions={
          <>
            <IconButton
              icon={Star}
              label={favourite ? t('reports.view.unfavourite') : t('reports.view.favourite')}
              aria-pressed={favourite}
              onClick={onToggleFavourite}
              className={favourite ? 'text-warning [&>svg]:fill-warning' : undefined}
            />
            <IconButton icon={RefreshCw} label={t('reports.view.refresh')} onClick={refresh} disabled={data.loading} />
            <DropdownMenu
              width={220}
              trigger={(props) => (
                <Button {...props} icon={Download} loading={busy === 'export'} disabled={!result || busy !== null}>
                  {t('reports.view.export')}
                </Button>
              )}
              items={[
                { key: 'csv', label: t('reports.view.exportCsv'), icon: FileSpreadsheet, onSelect: () => void run('export', exportReportCsv) },
                { key: 'json', label: t('reports.view.exportJson'), icon: FileJson, onSelect: () => void run('export', exportReportJson) },
              ]}
            />
            <Button variant="primary" icon={Printer} loading={busy === 'print'} disabled={!result || busy !== null} onClick={() => void run('print', printReport)}>
              {t('reports.view.print')}
            </Button>
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-6">
        <LoadingBar active={data.loading && Boolean(data.data)} />
        <div className="flex flex-col gap-5">
          <ReportFilters definition={definition} state={state} directory={directory.data} snapshotText={periodText} onChange={update} />
          {definition.period === 'range' && (
            <p className="-mt-2 flex flex-wrap items-center gap-1.5 type-caption text-fg-subtle">
              <CalendarRange size={14} aria-hidden />
              <span>{periodText}</span>
              {comparison && <span>· {t('reports.view.comparedWith', { range: rangeCaption(comparison, format) })}</span>}
            </p>
          )}

          {data.error ? (
            <ErrorState
              title={t('reports.view.loadFailed')}
              description={t('reports.view.loadFailedHint')}
              action={
                <Button icon={RefreshCw} onClick={data.reload}>
                  {t('common.actions.retry')}
                </Button>
              }
            />
          ) : !result ? (
            <div className="flex flex-col gap-5" aria-busy>
              <KpiSkeleton />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Skeleton className="h-72 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
              </div>
              <Skeleton className="h-80 rounded-xl" />
            </div>
          ) : result.empty ? (
            <EmptyState icon={definition.icon} title={t(definition.emptyKey)} description={state.filtered ? t('reports.view.emptyFiltered') : t('reports.view.emptyHint')} action={emptyAction} />
          ) : (
            <>
              <ReportKpis kpis={result.kpis} previous={previous?.kpis ?? null} ctx={ctx} />
              {(result.statement || result.charts.length > 0) && (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {result.statement && <ReportStatement statement={result.statement} ctx={ctx} />}
                  {result.charts.map((chart) => (
                    <ReportChart key={chart.id} chart={chart} ctx={ctx} previous={previous?.charts.find((entry) => entry.id === chart.id)} />
                  ))}
                </div>
              )}
              <ReportTable
                table={result.table}
                rows={rows}
                sort={sort}
                onSortChange={setSort}
                search={search}
                onSearchChange={setSearch}
                searchable={definition.filters.includes('search')}
                columnsKey={columnsKey}
                ctx={ctx}
                loading={false}
                title={t('reports.view.tableTitle')}
                empty={
                  search ? (
                    <EmptyState compact title={t('common.states.noResultsFor', { query: search })} description={t('common.states.emptyHint')} />
                  ) : (
                    <EmptyState compact title={t('common.table.noRows')} />
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
