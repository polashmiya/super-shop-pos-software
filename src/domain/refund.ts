import type { Money } from '@/types/common';
import { proportion, roundQuantity } from './money';

/* ==========================================================================
   Refund calculation for (partial) returns.

   A sale item's line total already includes its share of every discount and
   the VAT, so refunds are proportional to the returned quantity. The final
   return of a line refunds exactly what is left, so rounding never drifts.
   ========================================================================== */

export interface RefundableLine {
  quantity: number;
  lineTotal: Money;
  taxAmount: Money;
  returnedQuantity: number;
  refundedAmount: Money;
  refundedTax: Money;
}

export interface RefundResult {
  quantity: number;
  refund: Money;
  tax: Money;
}

export function remainingReturnable(line: Pick<RefundableLine, 'quantity' | 'returnedQuantity'>): number {
  return Math.max(0, roundQuantity(line.quantity - line.returnedQuantity));
}

export function calculateRefund(line: RefundableLine, returnQuantity: number): RefundResult {
  const remaining = remainingReturnable(line);
  const quantity = Math.min(roundQuantity(returnQuantity), remaining);
  if (quantity <= 0) return { quantity: 0, refund: 0, tax: 0 };

  const refundLeft = Math.max(0, line.lineTotal - line.refundedAmount);
  const taxLeft = Math.max(0, line.taxAmount - line.refundedTax);
  if (quantity === remaining) return { quantity, refund: refundLeft, tax: taxLeft };

  // Each partial share is rounded half-up; cap it so many small returns can
  // never add up to more than was paid for the line.
  return {
    quantity,
    refund: Math.min(proportion(line.lineTotal, quantity, line.quantity), refundLeft),
    tax: Math.min(proportion(line.taxAmount, quantity, line.quantity), taxLeft),
  };
}
