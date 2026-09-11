import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarRange, Download, History, X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { AuditLogEntry, AuditQuery } from '@/repositories/types';
import { auditService } from '@/services/auditService';
import type { AuditAction } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Controls';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, StatusBadge } from '@/components/ui/Display';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import { EmptyState, LoadingBar } from '@/components/ui/States';
import { AuditDetailDrawer } from '@/features/audit/AuditDetailDrawer';
import { AUDIT_ACTIONS, actionLook, actionText, detailSummary, entityLink, entityText } from '@/features/audit/auditMeta';
import { exportAuditCsv } from '@/features/audit/auditExport';
import { periodPatch, readChoice, readPaging, readPeriod, useListParams } from '@/features/sales/listParams';
import { SALES_PERIODS } from '@/features/sales/saleMeta';
import { useSearchText } from '@/features/sales/useSearchText';

/* ==========================================================================
   Activity log: who did what and when. Period, user, action, record type
   and text search are kept in the URL; the table is server-paginated and a
   row opens the full entry. Entries can never be edited or deleted.
   ========================================================================== */

export default function AuditPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const [params, update] = useListParams();
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const { period, range } = readPeriod(params, SALES_PERIODS, 'this_week');
  const userId = params.get('user') || 'all';
  const action = readChoice<AuditAction | 'all'>(params, 'action', ['all', ...AUDIT_ACTIONS], 'all');
  const entity = params.get('entity') || 'all';
  const search = params.get('q') ?? '';
  const { page, pageSize } = readPaging(params);
  const [searchText, setSearchText, resetSearch] = useSearchText(search, (value) => update({ q: value, page: null }));

  const filter: AuditQuery = { from: range.from, to: range.to, userId, action, entity, search: search || undefined };
  const list = useAsync(() => auditService.list(filter, { page, pageSize }), [range.from, range.to, userId, action, entity, search, page, pageSize]);
  const users = useAsync(() => auditService.users(), []);
  const entities = useAsync(() => auditService.entityTypes(), []);

  // The log stores the English name at the time; show the current name in the current language.
  const usersById = useMemo(() => new Map((users.data ?? []).map((user) => [user.id, user])), [users.data]);
  const userName = (entry: AuditLogEntry): string => {
    const user = entry.userId ? usersById.get(entry.userId) : undefined;
    return user ? localize(user.name) : (entry.userName ?? t('settings.audit.system'));
  };

  const hasFilters = Boolean(search || userId !== 'all' || action !== 'all' || entity !== 'all');
  const clearFilters = () => {
    resetSearch('');
    update({ q: null, user: null, action: null, entity: null, page: null });
  };

  const exportCsv = async () => {
    setExporting(true);
    await exportAuditCsv(filter, format);
    setExporting(false);
  };

  const columns: Array<Column<AuditLogEntry>> = [
    {
      key: 'when',
      header: t('common.labels.dateTime'),
      cell: (entry) => (
        <div className="leading-tight whitespace-nowrap">
          <p className="tnum text-fg">{format.date(entry.createdAt)}</p>
          <p className="type-caption text-fg-subtle tnum">{format.time(entry.createdAt, true)}</p>
        </div>
      ),
    },
    { key: 'user', header: t('common.labels.user'), cell: (entry) => <span className="block max-w-40 truncate">{userName(entry)}</span> },
    {
      key: 'action',
      header: t('settings.audit.action'),
      cell: (entry) => {
        const look = actionLook(entry.action);
        return <StatusBadge size="sm" tone={look.tone} icon={look.icon} label={actionText(entry.action, t)} />;
      },
    },
    {
      key: 'record',
      header: t('settings.audit.record'),
      cell: (entry) => {
        const link = entityLink(entry.entity, entry.entityId);
        return (
          <div className="min-w-0 max-w-52 leading-tight">
            <p className="type-caption text-fg-subtle">{entityText(entry.entity, t)}</p>
            {link ? (
              <Link to={link} onClick={(event) => event.stopPropagation()} className="block truncate font-mono text-[0.84rem] text-primary hover:underline">
                {entry.reference ?? t('settings.audit.openRecord')}
              </Link>
            ) : (
              <p className="truncate font-mono text-[0.84rem] text-fg-muted">{entry.reference ?? '—'}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'details',
      header: t('settings.audit.recorded'),
      hideable: true,
      cell: (entry) => <span className="line-clamp-2 max-w-md type-body-sm text-fg-muted">{detailSummary(entry.entity, entry.details, t, format, entry.reference) || '—'}</span>,
    },
  ];

  const userOptions = [{ value: 'all', label: t('settings.audit.allUsers') }, ...(users.data ?? []).map((user) => ({ value: user.id, label: localize(user.name) }))];
  const actionOptions = [{ value: 'all' as const, label: t('settings.audit.allActions') }, ...AUDIT_ACTIONS.map((value) => ({ value, label: actionText(value, t) }))];
  const entityOptions = [{ value: 'all', label: t('settings.audit.allRecords') }, ...(entities.data ?? []).map((value) => ({ value, label: entityText(value, t) }))];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={History}
        title={t('settings.audit.title')}
        description={t('settings.audit.subtitle')}
        actions={
          <Button icon={Download} loading={exporting} onClick={() => void exportCsv()} disabled={!list.data || list.data.total === 0}>
            {t('common.actions.exportCsv')}
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t('settings.audit.filtersLabel')}>
          <PeriodPicker period={period} range={range} periods={SALES_PERIODS} onChange={(next, custom) => update(periodPatch(next, custom))} />
          <div className="min-w-[15rem] flex-1">
            <SearchInput value={searchText} onChange={setSearchText} clearLabel={t('common.actions.clear')} placeholder={t('settings.audit.searchPlaceholder')} aria-label={t('settings.audit.searchLabel')} />
          </div>
          <div className="w-44">
            <Select aria-label={t('common.labels.user')} value={userId} options={userOptions} onChange={(value) => update({ user: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-52">
            <Select aria-label={t('settings.audit.action')} value={action} options={actionOptions} onChange={(value) => update({ action: value === 'all' ? null : value, page: null })} />
          </div>
          <div className="w-44">
            <Select aria-label={t('settings.audit.entity')} value={entity} options={entityOptions} onChange={(value) => update({ entity: value === 'all' ? null : value, page: null })} />
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
            ariaLabel={t('settings.audit.title')}
            className="min-h-0 flex-1"
            columns={columns}
            columnsKey="audit-log"
            rows={list.data?.rows ?? []}
            rowKey={(entry) => entry.id}
            loading={!list.data && !list.error}
            onRowClick={setSelected}
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
                  title={t('settings.audit.empty')}
                  description={hasFilters ? t('settings.audit.emptyFiltered') : t('settings.audit.emptyPeriod')}
                  action={
                    hasFilters ? (
                      <Button icon={X} onClick={clearFilters}>
                        {t('common.actions.clearFilters')}
                      </Button>
                    ) : period !== 'this_month' ? (
                      <Button icon={CalendarRange} onClick={() => update(periodPatch('this_month'))}>
                        {t('settings.audit.showMonth')}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        </div>
      </div>

      <AuditDetailDrawer entry={selected} userName={selected ? userName(selected) : ''} onClose={() => setSelected(null)} />
    </div>
  );
}
