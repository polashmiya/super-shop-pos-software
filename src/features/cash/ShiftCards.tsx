import type { ReactNode } from 'react';
import { Ban, BadgePercent, Clock, EyeOff, Hash, MonitorSmartphone, Package, ShoppingBag, Timer, TrendingUp, Undo2, UserRound, type LucideIcon } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT, type TranslationKey } from '@/i18n';
import type { ShiftActivity } from '@/repositories/types';
import type { Money, Shift, ShiftTotals } from '@/types';
import { Card, Meter, SectionHeader } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/components/ui/cn';
import { PAYMENT_ICONS, providerLabelKey } from '@/features/sales/saleMeta';
import { ShiftStatusBadge, DifferenceValue } from './CashBadges';
import { formatDuration } from './cashMeta';

/* ==========================================================================
   Building blocks shared by the cash screen and the shift detail page:
   shift facts, cash reconciliation, payments by method and activity.
   ========================================================================== */

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="type-caption text-fg-subtle">{label}</p>
        <div className="truncate font-semibold text-fg">{children}</div>
      </div>
    </div>
  );
}

interface ShiftFactsProps {
  shift: Shift;
  counterLabel: string;
  cashierLabel: string;
  now: Date;
}

/** Shift number, status, cashier, counter, opening time and duration. */
export function ShiftFactsCard({ shift, counterLabel, cashierLabel, now }: ShiftFactsProps) {
  const t = useT();
  const format = useFormat();
  const end = shift.closedAt ? new Date(shift.closedAt) : now;
  return (
    <Card className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Fact icon={Hash} label={t('common.labels.shift')}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{shift.shiftNo}</span>
          <ShiftStatusBadge status={shift.status} size="sm" />
        </span>
      </Fact>
      <Fact icon={UserRound} label={t('cash.common.openedBy')}>
        {cashierLabel}
      </Fact>
      <Fact icon={MonitorSmartphone} label={t('common.labels.counter')}>
        {counterLabel}
      </Fact>
      <Fact icon={Clock} label={t('cash.common.openedAt')}>
        <span className="tnum">{format.dateTime(shift.openedAt)}</span>
      </Fact>
      <Fact icon={Timer} label={shift.closedAt ? t('cash.common.closedAt') : t('cash.common.duration')}>
        <span className="tnum">{shift.closedAt ? format.dateTime(shift.closedAt) : formatDuration(t, shift.openedAt, end)}</span>
      </Fact>
    </Card>
  );
}

interface ReconciliationProps {
  totals: ShiftTotals;
  /** Counted cash of a closed shift. */
  actualCash?: Money | null;
  /** Blind count: the expected cash is not shown to this user. */
  hidden?: boolean;
  /** Live drawer of the open shift (large expected amount). */
  live?: boolean;
  className?: string;
}

/** Opening + cash sales − refunds + cash in − cash out − drawer expenses = expected (± counted). */
export function ReconciliationCard({ totals, actualCash, hidden, live, className }: ReconciliationProps) {
  const t = useT();
  const format = useFormat();
  const lines: Array<{ key: TranslationKey; sign: '+' | '−' | ''; amount: Money }> = [
    { key: 'cash.common.openingCash', sign: '', amount: totals.openingCash },
    { key: 'cash.common.cashSales', sign: '+', amount: totals.cashSales },
    { key: 'cash.common.cashRefunds', sign: '−', amount: totals.cashRefunds },
    { key: 'cash.common.cashIn', sign: '+', amount: totals.cashIn },
    { key: 'cash.common.cashOut', sign: '−', amount: totals.cashOut },
    { key: 'cash.common.drawerExpenses', sign: '−', amount: totals.expensesTotal },
  ];
  const counted = actualCash ?? null;

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <SectionHeader title={live ? t('cash.shift.expectedTitle') : t('cash.breakdown.reconciliationTitle')} description={t('cash.shift.expectedHint')} />
      {hidden ? (
        <div className="flex items-start gap-3 rounded-lg bg-info-soft p-4 text-info-text">
          <EyeOff size={20} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{t('cash.shift.blindTitle')}</p>
            <p className="type-body-sm">{t('cash.shift.blindHint')}</p>
          </div>
        </div>
      ) : (
        <>
          {live && (
            <div className="flex flex-wrap items-end justify-between gap-2 rounded-lg bg-primary-soft px-5 py-4">
              <span className="type-label text-primary-soft-fg">{t('cash.common.expectedCash')}</span>
              <span className="text-4xl leading-none font-extrabold tracking-tight text-fg tnum">{format.money(totals.expectedCash)}</span>
            </div>
          )}
          <dl className="flex flex-col">
            {lines.map((line) => (
              <div key={line.key} className="flex min-h-10 items-center gap-3 border-b border-border last:border-b-0">
                <span className="w-4 text-center font-bold text-fg-subtle" aria-hidden>
                  {line.sign}
                </span>
                <dt className="flex-1 text-fg-muted">{t(line.key)}</dt>
                <dd className="font-semibold text-fg tnum">{format.money(line.amount)}</dd>
              </div>
            ))}
            <div className="mt-1 flex min-h-12 items-center gap-3 border-t-2 border-border-strong">
              <span className="w-4 text-center font-bold text-fg-subtle" aria-hidden>
                =
              </span>
              <dt className="flex-1 font-semibold text-fg">{t('cash.common.expectedCash')}</dt>
              <dd className="text-lg font-bold text-fg tnum">{format.money(totals.expectedCash)}</dd>
            </div>
            {counted !== null && (
              <>
                <div className="flex min-h-10 items-center gap-3 border-t border-border">
                  <span className="w-4" aria-hidden />
                  <dt className="flex-1 text-fg-muted">{t('cash.common.countedCash')}</dt>
                  <dd className="font-semibold text-fg tnum">{format.money(counted)}</dd>
                </div>
                <div className="flex min-h-10 items-center gap-3 border-t border-border">
                  <span className="w-4" aria-hidden />
                  <dt className="flex-1 text-fg-muted">{t('cash.common.difference')}</dt>
                  <dd>
                    <DifferenceValue difference={counted - totals.expectedCash} />
                  </dd>
                </div>
              </>
            )}
          </dl>
        </>
      )}
    </Card>
  );
}

interface PaymentsCardProps {
  title: ReactNode;
  hint?: ReactNode;
  payments: ShiftActivity['payments'] | undefined;
  emptyText: ReactNode;
  className?: string;
}

/** Money received by method and provider (bKash, Visa…) with each share. */
export function PaymentsCard({ title, hint, payments, emptyText, className }: PaymentsCardProps) {
  const t = useT();
  const format = useFormat();
  const rows = payments ? [...payments].sort((a, b) => b.amount - a.amount) : undefined;
  const total = rows?.reduce((sum, row) => sum + row.amount, 0) ?? 0;
  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <SectionHeader title={title} description={hint} />
      {!rows ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="type-body-sm py-4 text-center text-fg-muted">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const Icon = PAYMENT_ICONS[row.method];
            const providerKey = providerLabelKey(row.method, row.provider);
            const share = total > 0 ? row.amount / total : 0;
            return (
              <li key={`${row.method}-${row.provider ?? ''}`} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted" aria-hidden>
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium text-fg">
                      {t(`enums.paymentMethod.${row.method}`)}
                      {providerKey && <span className="text-fg-muted"> · {t(providerKey)}</span>}
                    </span>
                    <span className="font-semibold text-fg tnum">{format.money(row.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Meter value={share} className="flex-1" label={format.percentValue(share * 100, 0)} />
                    <span className="type-caption w-24 shrink-0 text-end text-fg-subtle tnum">{t('cash.common.payments', { count: row.count })}</span>
                  </div>
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between border-t border-border pt-3">
            <span className="font-semibold text-fg">{t('common.labels.total')}</span>
            <span className="text-lg font-bold text-fg tnum">{format.money(total)}</span>
          </li>
        </ul>
      )}
    </Card>
  );
}

/** Sales, items, gross, discounts, returns and cancellations of a shift. */
export function ActivityCard({ totals, activity, className }: { totals: ShiftTotals; activity: ShiftActivity | null | undefined; className?: string }) {
  const t = useT();
  const format = useFormat();
  const tiles: Array<{ icon: LucideIcon; label: TranslationKey; value: string; caption?: string }> = [
    { icon: ShoppingBag, label: 'cash.common.sales', value: format.integer(activity?.salesCount ?? totals.salesCount) },
    { icon: Package, label: 'cash.common.itemsSold', value: activity ? format.quantity(activity.itemsSold) : '—' },
    { icon: TrendingUp, label: 'cash.common.grossSales', value: format.money(totals.grossSales) },
    { icon: BadgePercent, label: 'cash.common.discounts', value: format.money(totals.discountTotal) },
    { icon: Undo2, label: 'cash.common.returns', value: activity ? format.integer(activity.returnsCount) : '—', caption: `${t('cash.common.refundsAll')}: ${format.money(totals.returnsTotal)}` },
    { icon: Ban, label: 'cash.common.cancelled', value: activity ? format.integer(activity.cancelledCount) : '—' },
  ];
  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <SectionHeader title={t('cash.shift.activityTitle')} />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value, caption }) => (
          <div key={label} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface-2 p-3">
            <dt className="flex items-center gap-1.5 type-caption text-fg-subtle">
              <Icon size={14} aria-hidden />
              {t(label)}
            </dt>
            <dd className="truncate text-lg font-bold text-fg tnum">{value}</dd>
            {caption && <dd className="type-caption truncate text-fg-muted tnum">{caption}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
