import { useMemo, useState } from 'react';
import { BarChart3, History, Info, SearchX, Star } from 'lucide-react';
import { useT } from '@/i18n';
import { useAuthStore, useCan } from '@/stores/authStore';
import type { ReportId } from '@/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/Controls';
import { PageHeader, SectionHeader } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { getReport, reportsByGroup, visibleReports } from '@/features/reports/definitions';
import { GROUP_ICON } from '@/features/reports/groupMeta';
import { matchReports, readFavourites, readRecent, toggleFavourite } from '@/features/reports/library';
import { ReportCard } from '@/features/reports/ReportCard';
import type { ReportDefinition } from '@/features/reports/types';

/* ==========================================================================
   /reports — the report library: search (Bangla or English), favourites,
   recently viewed and every report grouped by area. Financial reports are
   hidden without the permission.
   ========================================================================== */

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3';

function pick(ids: readonly ReportId[], allowed: readonly ReportDefinition[]): ReportDefinition[] {
  return ids.map((id) => getReport(id)).filter((report): report is ReportDefinition => report !== null && allowed.includes(report));
}

export default function ReportsPage() {
  const t = useT();
  const canFinancial = useCan('reports.financial');
  const userId = useAuthStore((state) => state.user?.id ?? 'none');
  const [query, setQuery] = useState('');
  const [favourites, setFavourites] = useState<ReportId[]>(() => readFavourites(userId));
  const [recent] = useState<ReportId[]>(() => readRecent(userId));

  const allowed = useMemo(() => visibleReports(canFinancial), [canFinancial]);
  const matches = useMemo(() => matchReports(allowed, query), [allowed, query]);
  const groups = useMemo(() => reportsByGroup(matches), [matches]);
  const favouriteReports = useMemo(() => pick(favourites, allowed), [favourites, allowed]);
  const recentReports = useMemo(() => pick(recent, allowed), [recent, allowed]);
  const searching = query.trim().length > 0;

  const renderCard = (report: ReportDefinition) => (
    <ReportCard key={report.id} definition={report} favourite={favourites.includes(report.id)} onToggleFavourite={() => setFavourites(toggleFavourite(userId, report.id))} />
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={BarChart3} title={t('reports.title')} description={t('reports.subtitle')}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-md">
            <SearchInput
              value={query}
              onChange={setQuery}
              clearLabel={t('common.actions.clear')}
              placeholder={t('reports.library.searchPlaceholder')}
              aria-label={t('reports.library.searchLabel')}
              autoFocus
            />
          </div>
          <span className="type-body-sm text-fg-subtle tnum" aria-live="polite">
            {t('reports.library.count', { count: matches.length })}
          </span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-8">
          {!searching && favouriteReports.length > 0 && (
            <section aria-labelledby="reports-favourites" className="flex flex-col gap-3">
              <SectionHeader icon={Star} title={<span id="reports-favourites">{t('reports.library.favourites')}</span>} />
              <div className={GRID}>{favouriteReports.map(renderCard)}</div>
            </section>
          )}

          {!searching && recentReports.length > 0 && (
            <section aria-labelledby="reports-recent" className="flex flex-col gap-3">
              <SectionHeader icon={History} title={<span id="reports-recent">{t('reports.library.recent')}</span>} />
              <div className={GRID}>{recentReports.map(renderCard)}</div>
            </section>
          )}

          {groups.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={t('reports.library.noResults', { query: query.trim() })}
              description={t('reports.library.noResultsHint')}
              action={<Button onClick={() => setQuery('')}>{t('common.actions.clear')}</Button>}
            />
          ) : (
            groups.map(({ group, reports }) => (
              <section key={group} aria-labelledby={`reports-group-${group}`} className="flex flex-col gap-3">
                <SectionHeader
                  icon={GROUP_ICON[group]}
                  title={<span id={`reports-group-${group}`}>{t(`reports.groups.${group}.title`)}</span>}
                  description={t(`reports.groups.${group}.description`)}
                />
                <div className={GRID}>{reports.map(renderCard)}</div>
              </section>
            ))
          )}

          {!canFinancial && (
            <p className="flex items-center gap-2 type-body-sm text-fg-subtle">
              <Info size={16} aria-hidden />
              {t('reports.library.financialHidden')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
