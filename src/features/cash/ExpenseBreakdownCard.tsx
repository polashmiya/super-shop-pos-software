import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { ExpenseSummary } from '@/repositories/types';
import { BarList, ChartCard, MiniTable } from '@/components/charts/Charts';
import { Skeleton } from '@/components/ui/States';

interface ExpenseBreakdownCardProps {
  summary: ExpenseSummary | undefined;
  loading: boolean;
}

/** Spending by category for the filtered period, with the drawer / office split. */
export function ExpenseBreakdownCard({ summary, loading }: ExpenseBreakdownCardProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const rows = summary?.byCategory ?? [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <ChartCard
      title={t('cash.expenses.breakdownTitle')}
      subtitle={summary ? t('cash.expenses.breakdownSubtitle', { amount: format.money(summary.total) }) : undefined}
      loading={loading && Boolean(summary)}
      chartLabel={t('dashboard.chartLabel')}
      tableLabel={t('dashboard.tableLabel')}
      className="self-start"
      table={
        rows.length > 0 ? (
          <MiniTable
            headers={[t('common.labels.category'), t('cash.common.count'), t('common.labels.amount')]}
            rows={rows.map((row) => [localize(row.name), format.integer(row.count), format.money(row.amount)])}
          />
        ) : undefined
      }
    >
      {!summary ? (
        <div className="flex flex-col gap-3" aria-hidden>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <BarList
            emptyText={t('cash.expenses.breakdownEmpty')}
            items={rows.map((row) => ({
              key: row.categoryId,
              label: localize(row.name),
              value: row.amount,
              valueLabel: format.money(row.amount),
              secondary: format.percentValue(total > 0 ? (row.amount / total) * 100 : 0, 0),
            }))}
          />
          {rows.length > 0 && (
            <p className="type-caption border-t border-border pt-3 text-fg-muted">
              {t('cash.expenses.sourceSplit', { drawer: format.money(summary.drawerTotal), office: format.money(summary.officeTotal) })}
            </p>
          )}
        </div>
      )}
    </ChartCard>
  );
}
