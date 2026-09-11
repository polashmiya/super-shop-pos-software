import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { CounterStatus, ExpensePaidFrom, ExpenseStatus, Money, ShiftStatus } from '@/types';
import { Badge, StatusBadge } from '@/components/ui/Display';
import { cn } from '@/components/ui/cn';
import { COUNTER_STATUS_META, DIFFERENCE_META, differenceKind, EXPENSE_STATUS_META, PAID_FROM_ICONS, SHIFT_STATUS_META } from './cashMeta';

/* Status badges of the cash screens: colour + icon + text, never colour alone. */

/** Over / short / balanced with the amount ("Short ৳120"). */
export function DifferenceBadge({ difference, size }: { difference: Money; size?: 'sm' | 'md' }) {
  const t = useT();
  const format = useFormat();
  const kind = differenceKind(difference);
  const meta = DIFFERENCE_META[kind];
  const amount = format.money(Math.abs(difference));
  const label = kind === 'balanced' ? t('cash.common.balanced') : t(kind === 'over' ? 'cash.common.over' : 'cash.common.short', { amount });
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={label} size={size} />;
}

/** Large difference read-out for reconciliation panels. */
export function DifferenceValue({ difference, className }: { difference: Money; className?: string }) {
  const t = useT();
  const format = useFormat();
  const kind = differenceKind(difference);
  const meta = DIFFERENCE_META[kind];
  const Icon = meta.icon;
  const tone = kind === 'balanced' ? 'text-success-text' : kind === 'over' ? 'text-warning-text' : 'text-danger-text';
  const amount = format.money(Math.abs(difference));
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-bold tnum', tone, className)}>
      <Icon size={18} aria-hidden />
      {kind === 'balanced' ? t('cash.common.balanced') : t(kind === 'over' ? 'cash.common.over' : 'cash.common.short', { amount })}
    </span>
  );
}

export function ShiftStatusBadge({ status, size }: { status: ShiftStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = SHIFT_STATUS_META[status];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`enums.shiftStatus.${status}`)} size={size} />;
}

export function CounterStatusBadge({ status, size }: { status: CounterStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = COUNTER_STATUS_META[status];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`enums.counterStatus.${status}`)} size={size} />;
}

export function ExpenseStatusBadge({ status, size }: { status: ExpenseStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = EXPENSE_STATUS_META[status];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`enums.expenseStatus.${status}`)} size={size} />;
}

export function PaidFromBadge({ paidFrom, size }: { paidFrom: ExpensePaidFrom; size?: 'sm' | 'md' }) {
  const t = useT();
  return (
    <Badge tone={paidFrom === 'cash_drawer' ? 'primary' : 'neutral'} icon={PAID_FROM_ICONS[paidFrom]} size={size}>
      {t(`enums.paidFrom.${paidFrom}`)}
    </Badge>
  );
}
