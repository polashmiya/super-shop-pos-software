import {
  Activity,
  Ban,
  Banknote,
  BadgePercent,
  CircleCheck,
  CornerUpLeft,
  CreditCard,
  Gift,
  Printer,
  ReceiptText,
  Smartphone,
  Split,
  Tag,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/ui/Display';
import type { TranslationKey } from '@/i18n';
import type { AuditAction, CardNetwork, MobileProvider, PaymentMethod, RefundMethod, ReportPeriod, SaleDetail, SaleStatus } from '@/types';

/* ==========================================================================
   Visual meta for sales screens: status = colour + icon + text, payment and
   refund method icons, provider labels and the default refund method.
   ========================================================================== */

export const SALE_STATUSES: readonly SaleStatus[] = ['completed', 'partially_returned', 'returned', 'cancelled'];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card', 'mobile', 'points'];
export const REFUND_METHODS: readonly RefundMethod[] = ['cash', 'card', 'mobile', 'store_credit'];

/** Periods offered on the sales and returns lists. */
export const SALES_PERIODS: ReportPeriod[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'custom'];

export const SALE_STATUS_META: Record<SaleStatus, { tone: Tone; icon: LucideIcon }> = {
  completed: { tone: 'success', icon: CircleCheck },
  partially_returned: { tone: 'warning', icon: CornerUpLeft },
  returned: { tone: 'info', icon: Undo2 },
  cancelled: { tone: 'danger', icon: Ban },
};

export const PAYMENT_ICONS: Record<PaymentMethod | 'split', LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  mobile: Smartphone,
  points: Gift,
  split: Split,
};

export const REFUND_ICONS: Record<RefundMethod, LucideIcon> = {
  cash: Banknote,
  card: CreditCard,
  mobile: Smartphone,
  store_credit: Wallet,
};

export const AUDIT_META: Partial<Record<AuditAction, { tone: Tone; icon: LucideIcon }>> = {
  'sale.completed': { tone: 'success', icon: CircleCheck },
  'sale.cancelled': { tone: 'danger', icon: Ban },
  'sale.returned': { tone: 'warning', icon: Undo2 },
  'sale.reprinted': { tone: 'info', icon: Printer },
  'discount.applied': { tone: 'primary', icon: BadgePercent },
  'price.overridden': { tone: 'warning', icon: Tag },
};

export const DEFAULT_AUDIT_META: { tone: Tone; icon: LucideIcon } = { tone: 'neutral', icon: Activity };

export const SALE_ICON = ReceiptText;

const MOBILE_PROVIDERS: readonly string[] = ['bkash', 'nagad', 'rocket', 'upay', 'other'] satisfies MobileProvider[];
const CARD_NETWORKS: readonly string[] = ['visa', 'mastercard', 'amex', 'unionpay', 'other'] satisfies CardNetwork[];

/** Translation key for a stored payment provider (bKash, Visa…), or null when unknown/empty. */
export function providerLabelKey(method: PaymentMethod, provider: string | null): TranslationKey | null {
  if (!provider) return null;
  if (method === 'mobile' && MOBILE_PROVIDERS.includes(provider)) return `enums.mobileProvider.${provider as MobileProvider}`;
  if (method === 'card' && CARD_NETWORKS.includes(provider)) return `enums.cardNetwork.${provider as CardNetwork}`;
  return null;
}

/** Suggested refund method: how the customer paid (the largest payment when split; points → store credit). */
export function defaultRefundMethod(sale: SaleDetail): RefundMethod {
  const largest = [...sale.payments].sort((a, b) => b.amount - a.amount)[0];
  const method = sale.paymentSummary === 'split' ? largest?.method : sale.paymentSummary;
  if (method === 'cash' || method === 'card' || method === 'mobile') return method;
  return 'store_credit';
}

/** Distinct product ids of a sale (stock refresh after cancel/return). */
export function saleProductIds(sale: SaleDetail): string[] {
  return [...new Set(sale.items.map((item) => item.productId))];
}
