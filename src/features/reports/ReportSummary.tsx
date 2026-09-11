import { useT } from '@/i18n';
import { delta } from '@/services/reportService';
import { cn } from '@/components/ui/cn';
import { StatCard } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { formatValue, resolveLabel, resolveText, statementParts, type LabelContext } from './labels';
import type { ReportKpi, ReportStatement as Statement, StatementLine } from './types';

/* ==========================================================================
   KPI strip (with change vs the previous period) and the reconciliation
   statement ("gross − discounts − returns = net").
   ========================================================================== */

function gridFor(count: number): string {
  if (count <= 4) return 'md:grid-cols-4';
  if (count === 5) return 'md:grid-cols-3 xl:grid-cols-5';
  if (count === 6) return 'md:grid-cols-3 2xl:grid-cols-6';
  return 'md:grid-cols-4';
}

export function KpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', gridFor(count))} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-[6.4rem] rounded-xl" />
      ))}
    </div>
  );
}

export function ReportKpis({ kpis, previous, ctx }: { kpis: ReportKpi[]; previous: ReportKpi[] | null; ctx: LabelContext }) {
  const t = useT();
  const signedPercent = (value: number) => `${value > 0 ? '+' : ''}${ctx.format.percentValue(value * 100)}`;
  return (
    <section aria-label={t('reports.view.kpisLabel')} className={cn('grid grid-cols-2 gap-3', gridFor(kpis.length))}>
      {kpis.map((kpi) => {
        const before = kpi.comparable === false ? undefined : previous?.find((entry) => entry.id === kpi.id);
        return (
          <StatCard
            key={kpi.id}
            label={t(kpi.labelKey)}
            value={formatValue(kpi.value, kpi.kind, ctx)}
            icon={kpi.icon}
            tone={kpi.tone}
            delta={before ? delta(kpi.value, before.value) : undefined}
            invertDelta={kpi.invert}
            formatDelta={signedPercent}
            hint={kpi.hint ? resolveText(kpi.hint, ctx) : undefined}
          />
        );
      })}
    </section>
  );
}

function StatementRow({ line, ctx, separated }: { line: StatementLine; ctx: LabelContext; separated: boolean }) {
  const { operator, amount } = statementParts(line, ctx);
  const total = line.role === 'total';
  const info = line.role === 'info';
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 py-1.5',
        total && 'mt-1 border-t border-border-strong pt-2 font-semibold text-fg',
        info && 'text-fg-muted',
        separated && 'mt-2 border-t border-dashed border-border pt-2.5',
      )}
    >
      <dt className={cn('flex min-w-0 flex-1 items-baseline gap-2', info ? 'type-body-sm' : 'type-body')}>
        <span aria-hidden className="w-4 shrink-0 text-center text-fg-subtle tnum">
          {operator}
        </span>
        <span className="min-w-0">{resolveLabel(line.label, ctx)}</span>
      </dt>
      <dd className={cn('shrink-0 text-end tnum', total ? 'text-base' : info ? 'type-body-sm' : 'type-body', line.role === 'subtract' && 'text-fg-muted')}>
        {operator === '−' || operator === '+' ? <span className="sr-only">{operator}</span> : null}
        {amount}
      </dd>
    </div>
  );
}

export function ReportStatement({ statement, ctx }: { statement: Statement; ctx: LabelContext }) {
  const t = useT();
  const firstInfo = statement.lines.findIndex((line) => line.role === 'info');
  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface p-5">
      <header className="mb-3">
        <h3 className="type-h3 text-fg">{t(statement.titleKey)}</h3>
        {statement.subtitle && <p className="type-body-sm text-fg-subtle">{resolveText(statement.subtitle, ctx)}</p>}
      </header>
      <dl className="flex flex-col">
        {statement.lines.map((line, index) => (
          <StatementRow key={line.key} line={line} ctx={ctx} separated={index === firstInfo} />
        ))}
      </dl>
    </section>
  );
}
