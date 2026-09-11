import { useT } from '@/i18n';
import type { CustomerType, LoyaltyTransactionType } from '@/types';
import { StatusBadge } from '@/components/ui/Display';
import { CUSTOMER_TYPE_META, LOYALTY_TYPE_META } from './customerMeta';

/** Customer type: colour + icon + text. */
export function CustomerTypeBadge({ type, size }: { type: CustomerType; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = CUSTOMER_TYPE_META[type];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`enums.customerType.${type}`)} size={size} />;
}

/** Loyalty ledger entry type (earned, redeemed, adjusted, reversed). */
export function LoyaltyTypeBadge({ type, size }: { type: LoyaltyTransactionType; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = LOYALTY_TYPE_META[type];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`customers.loyalty.types.${type}`)} size={size} />;
}
