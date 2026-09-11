import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpenText } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import type { CashMovement } from '@/types';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Controls';
import { Card, SectionHeader } from '@/components/ui/Display';
import { EmptyState, SkeletonRows } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { LEDGER_FILTERS, ledgerRows, matchesLedger, MOVEMENT_META, splitExpenseDescription, type LedgerFilter, type LedgerRow } from './cashMeta';

const TONE_TEXT = {
  neutral: 'bg-surface-3 text-fg-muted',
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  info: 'bg-info-soft text-info-text',
} as const;

interface CashLedgerProps {
  movements: CashMovement[] | undefined;
  error?: boolean;
  onRetry?: () => void;
  /** Rows shown before "Show all". */
  limit?: number;
  actions?: ReactNode;
  className?: string;
}

function noteOf(row: LedgerRow): string {
  return row.type === 'expense' ? splitExpenseDescription(row.note).note : row.note;
}

/** Every cash movement of a drawer, newest first, with the running balance. */
export function CashLedger({ movements, error, onRetry, limit = 12, actions, className }: CashLedgerProps) {
  const t = useT();
  const format = useFormat();
  const canSeeSales = useCan('sales.view');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => (movements ? ledgerRows(movements) : []), [movements]);
  const filtered = rows.filter((row) => matchesLedger(row.type, filter));
  const visible = expanded ? filtered : filtered.slice(0, limit);
  const counts = Object.fromEntries(LEDGER_FILTERS.map((key) => [key, rows.filter((row) => matchesLedger(row.type, key)).length])) as Record<LedgerFilter, number>;

  return (
    <Card padded={false} className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex flex-col gap-3 px-5 pt-5">
        <SectionHeader icon={BookOpenText} title={t('cash.ledger.title')} description={t('cash.ledger.subtitle')} action={actions} />
        <Tabs
          ariaLabel={t('cash.ledger.aria')}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setExpanded(false);
          }}
          items={LEDGER_FILTERS.map((key) => ({ value: key, label: t(`cash.ledger.filters.${key}`), count: movements ? counts[key] : undefined }))}
        />
      </div>
      {!movements && !error ? (
        <SkeletonRows rows={5} />
      ) : error && !movements ? (
        <EmptyState compact title={t('errors.loadFailed')} action={onRetry ? <Button onClick={onRetry}>{t('common.actions.retry')}</Button> : undefined} />
      ) : filtered.length === 0 ? (
        <EmptyState compact icon={BookOpenText} title={filter === 'all' ? t('cash.ledger.empty') : t('cash.ledger.emptyFilter')} />
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={t('cash.ledger.aria')} className="w-full min-w-[40rem] text-[0.9rem]">
            <thead>
              <tr className="type-label text-fg-muted">
                <th scope="col" className="h-10 px-5 text-start">{t('common.labels.time')}</th>
                <th scope="col" className="px-3 text-start">{t('common.labels.type')}</th>
                <th scope="col" className="px-3 text-start">{t('common.labels.reference')}</th>
                <th scope="col" className="px-3 text-start">{t('cash.common.by')}</th>
                <th scope="col" className="px-3 text-end">{t('common.labels.amount')}</th>
                <th scope="col" className="px-5 text-end">{t('cash.common.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const meta = MOVEMENT_META[row.type];
                const Icon = meta.icon;
                const note = noteOf(row);
                const linkToSale = canSeeSales && row.referenceType === 'sale' && row.referenceId;
                const closing = row.type === 'closing';
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-5 py-2.5 whitespace-nowrap text-fg-muted tnum">{format.time(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', TONE_TEXT[meta.tone])}>
                        <Icon size={13} aria-hidden />
                        {t(`enums.cashMovement.${row.type}`)}
                      </span>
                    </td>
                    <td className="max-w-72 px-3 py-2">
                      {row.referenceNo &&
                        (linkToSale ? (
                          <Link to={`/sales/${row.referenceId}`} className="font-mono text-[0.84rem] font-semibold text-primary-soft-fg hover:underline">
                            {row.referenceNo}
                          </Link>
                        ) : (
                          <span className="font-mono text-[0.84rem] font-semibold text-fg">{row.referenceNo}</span>
                        ))}
                      {note && <p className="type-caption break-words text-fg-muted">{note}</p>}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-fg-muted">{row.userName ?? '—'}</td>
                    <td className={cn('px-3 py-2.5 text-end font-semibold whitespace-nowrap tnum', closing ? 'text-fg' : row.amount < 0 ? 'text-danger-text' : 'text-success-text')}>
                      {closing ? format.money(Math.abs(row.amount)) : format.money(row.amount, { signed: true })}
                    </td>
                    <td className="px-5 py-2.5 text-end font-semibold whitespace-nowrap text-fg tnum">{format.money(row.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > limit && (
        <div className="border-t border-border px-5 py-2">
          <Button variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('common.actions.showLess') : t('cash.ledger.showAll', { count: filtered.length })}
          </Button>
        </div>
      )}
    </Card>
  );
}
