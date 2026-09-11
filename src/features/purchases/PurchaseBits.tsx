import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { PurchaseStatus } from '@/types';
import { cn } from '@/components/ui/cn';
import { StatusBadge } from '@/components/ui/Display';
import { purchaseStatusBadge } from './purchaseHelpers';

/** Purchase status: colour + icon + text. */
export function PurchaseStatusBadge({ status, size = 'sm' }: { status: PurchaseStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const badge = purchaseStatusBadge(status);
  return <StatusBadge tone={badge.tone} icon={badge.icon} size={size} label={t(`enums.purchaseStatus.${status}`)} />;
}

/** Amount still owed: red when something is due, muted dash when settled. */
export function DueAmount({ amount, className }: { amount: number; className?: string }) {
  const format = useFormat();
  if (amount <= 0) return <span className={cn('text-fg-subtle', className)}>—</span>;
  return <span className={cn('font-semibold text-danger-text tnum', className)}>{format.money(amount)}</span>;
}

/** One line of a totals block (label left, amount right). */
export function TotalLine({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'danger' | 'success' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', strong ? 'border-t border-border pt-2 text-lg font-bold text-fg' : 'type-body text-fg-muted')}>
      <span>{label}</span>
      <span className={cn('tnum', tone === 'danger' ? 'font-semibold text-danger-text' : tone === 'success' ? 'font-semibold text-success-text' : strong ? '' : 'text-fg')}>{value}</span>
    </div>
  );
}
