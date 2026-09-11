import { Link } from 'react-router';
import { Coins, SquarePen } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { LoyaltyTransaction } from '@/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { LoyaltyTypeBadge } from './CustomerBadges';

interface CustomerLoyaltyTabProps {
  entries: LoyaltyTransaction[] | null;
  loading: boolean;
  error: boolean;
  balance: number;
  worth: number;
  onRetry: () => void;
  /** Missing when the user may not adjust points. */
  onAdjust?: () => void;
}

/** Loyalty ledger: every earn / redeem / adjustment with the running balance. */
export function CustomerLoyaltyTab({ entries, loading, error, balance, worth, onRetry, onAdjust }: CustomerLoyaltyTabProps) {
  const t = useT();
  const format = useFormat();

  const columns: Array<Column<LoyaltyTransaction>> = [
    { key: 'date', header: t('common.labels.dateTime'), cell: (entry) => <span className="whitespace-nowrap tnum">{format.dateTime(entry.createdAt)}</span> },
    { key: 'type', header: t('common.labels.type'), cell: (entry) => <LoyaltyTypeBadge size="sm" type={entry.type} /> },
    {
      key: 'points',
      header: t('customers.loyalty.columns.points'),
      align: 'end',
      cell: (entry) => <span className={cn('font-semibold tnum', entry.points >= 0 ? 'text-success-text' : 'text-danger-text')}>{`${entry.points >= 0 ? '+' : '−'}${format.integer(Math.abs(entry.points))}`}</span>,
    },
    { key: 'balance', header: t('customers.loyalty.columns.balance'), align: 'end', cell: (entry) => format.integer(entry.balanceAfter) },
    {
      key: 'invoice',
      header: t('common.labels.invoice'),
      cell: (entry) =>
        entry.saleId && entry.invoiceNo ? (
          <Link to={`/sales/${entry.saleId}`} className="font-mono text-[0.86rem] text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
            {entry.invoiceNo}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: 'note', header: t('common.labels.note'), cell: (entry) => <span className="block max-w-72 truncate text-fg-muted">{entry.note || '—'}</span> },
    { key: 'user', header: t('common.labels.user'), hideable: true, cell: (entry) => <span className="text-fg-muted">{entry.userName ?? '—'}</span> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-soft text-warning-text" aria-hidden>
            <Coins size={20} />
          </span>
          <div>
            <p className="type-caption text-fg-subtle">{t('customers.loyalty.balance')}</p>
            <p className="text-lg font-bold text-fg tnum">
              {t('common.units.points', { count: balance })} <span className="text-sm font-medium text-fg-muted">· {t('customers.loyalty.worth', { amount: format.money(worth) })}</span>
            </p>
          </div>
        </div>
        {onAdjust && (
          <Button icon={SquarePen} onClick={onAdjust}>
            {t('customers.loyalty.adjust.title')}
          </Button>
        )}
      </div>
      <DataTable
        ariaLabel={t('customers.tabs.loyalty')}
        columns={columns}
        rows={entries ?? []}
        rowKey={(entry) => entry.id}
        loading={loading && !entries}
        empty={
          error ? (
            <EmptyState compact icon={Coins} title={t('errors.loadFailed')} action={<Button onClick={onRetry}>{t('common.actions.retry')}</Button>} />
          ) : (
            <EmptyState compact icon={Coins} title={t('customers.loyalty.empty')} description={t('customers.loyalty.emptyHint')} />
          )
        }
      />
    </div>
  );
}
