import { maxRedeemableAmount } from '@/domain/loyalty';
import { DEFAULT_PAYMENT_RULES, summarizePayments, type PaymentRules } from '@/domain/payment';
import type { Customer, Money, PaymentBreakdown, PaymentEntry } from '@/types';
import { ctx } from './context';

/** Payment rules for a sale (references, loyalty limits) from the shop settings. */
export function paymentRules(due: Money, customer: Customer | null): PaymentRules {
  const business = ctx().business();
  return {
    ...DEFAULT_PAYMENT_RULES,
    requireCardReference: business.payment.requireCardReference,
    requireMobileReference: business.payment.requireMobileReference,
    pointsBalance: customer?.loyaltyPoints ?? 0,
    pointValue: business.loyalty.pointValue,
    maxPointsAmount: customer ? maxRedeemableAmount(customer.loyaltyPoints, due, business.loyalty) : 0,
  };
}

export function paymentBreakdown(due: Money, entries: readonly PaymentEntry[], customer: Customer | null): PaymentBreakdown {
  return summarizePayments(due, entries, paymentRules(due, customer));
}

export function maxPointsPayable(due: Money, customer: Customer | null): Money {
  if (!customer) return 0;
  return maxRedeemableAmount(customer.loyaltyPoints, due, ctx().business().loyalty);
}
