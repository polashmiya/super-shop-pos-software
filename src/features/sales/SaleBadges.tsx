import { Split } from 'lucide-react';
import { useT } from '@/i18n';
import type { PaymentMethod, RefundMethod, SaleStatus } from '@/types';
import { Badge, StatusBadge } from '@/components/ui/Display';
import { PAYMENT_ICONS, REFUND_ICONS, SALE_STATUS_META } from './saleMeta';

/** Sale status: colour + icon + text. */
export function SaleStatusBadge({ status, size }: { status: SaleStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const meta = SALE_STATUS_META[status];
  return <StatusBadge tone={meta.tone} icon={meta.icon} label={t(`enums.saleStatus.${status}`)} size={size} />;
}

/** Payment of a sale; a split payment lists its methods ("Cash + bKash"). */
export function PaymentSummaryBadge({ summary, methods, size }: { summary: PaymentMethod | 'split'; methods?: readonly PaymentMethod[]; size?: 'sm' | 'md' }) {
  const t = useT();
  if (summary === 'split') {
    const label = methods && methods.length > 0 ? methods.map((method) => t(`enums.paymentMethod.${method}`)).join(' + ') : t('enums.paymentMethod.split');
    return (
      <Badge tone="primary" icon={Split} size={size}>
        {label}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" icon={PAYMENT_ICONS[summary]} size={size}>
      {t(`enums.paymentMethod.${summary}`)}
    </Badge>
  );
}

export function RefundMethodBadge({ method, size }: { method: RefundMethod; size?: 'sm' | 'md' }) {
  const t = useT();
  return (
    <Badge tone={method === 'store_credit' ? 'info' : 'neutral'} icon={REFUND_ICONS[method]} size={size}>
      {t(`enums.refundMethod.${method}`)}
    </Badge>
  );
}
