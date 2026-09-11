import { Coins, Crown, Gift, RotateCcw, SquarePen, Store, UserCheck, UserRound, type LucideIcon } from 'lucide-react';
import { AVATAR_COLORS } from '@/config/theme.config';
import type { Tone } from '@/components/ui/Display';
import type { BasisPoints, Customer, CustomerType, DiscountSettings, LoyaltyTransactionType } from '@/types';

/* ==========================================================================
   Visual meta and small rules for the customer screens.
   ========================================================================== */

export const CUSTOMER_TYPES: readonly CustomerType[] = ['regular', 'vip', 'wholesale', 'walk_in'];

export const CUSTOMER_TYPE_META: Record<CustomerType, { tone: Tone; icon: LucideIcon }> = {
  walk_in: { tone: 'neutral', icon: UserRound },
  regular: { tone: 'primary', icon: UserCheck },
  vip: { tone: 'warning', icon: Crown },
  wholesale: { tone: 'info', icon: Store },
};

export const LOYALTY_TYPE_META: Record<LoyaltyTransactionType, { tone: Tone; icon: LucideIcon }> = {
  earn: { tone: 'success', icon: Coins },
  redeem: { tone: 'info', icon: Gift },
  adjust: { tone: 'primary', icon: SquarePen },
  reverse: { tone: 'warning', icon: RotateCcw },
};

export type CustomerSort = 'name' | 'totalSpent' | 'lastPurchase' | 'points';

export const CUSTOMER_SORTS: readonly CustomerSort[] = ['name', 'totalSpent', 'lastPurchase', 'points'];

/** Natural direction of a sort: names A→Z, amounts and dates biggest/newest first. */
export function defaultSortDirection(sort: CustomerSort): 'asc' | 'desc' {
  return sort === 'name' ? 'asc' : 'desc';
}

/** Stable avatar colour for a customer (same person, same colour everywhere). */
export function customerAvatarColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Discount the customer gets at the till: their own rate, else the rate of their type. */
export function memberDiscount(customer: Pick<Customer, 'discountRate' | 'customerType'>, discount: DiscountSettings): { rate: BasisPoints; fromType: boolean } {
  if (customer.discountRate > 0) return { rate: customer.discountRate, fromType: false };
  if (customer.customerType === 'walk_in') return { rate: 0, fromType: true };
  return { rate: discount.customerTypeRates[customer.customerType] ?? 0, fromType: true };
}
