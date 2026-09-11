import type { Money } from '@/types/common';
import type { ShiftTotals } from '@/types/operations';

/* ==========================================================================
   Shift / cash drawer arithmetic.
   ========================================================================== */

export interface ShiftTotalsInput {
  openingCash: Money;
  cashSales: Money;
  cardSales: Money;
  mobileSales: Money;
  pointsRedeemed: Money;
  salesCount: number;
  returnsTotal: Money;
  cashRefunds: Money;
  /** Expenses paid from this drawer. */
  cashExpenses: Money;
  /** All expenses recorded during the shift (for display). */
  expensesTotal: Money;
  cashIn: Money;
  cashOut: Money;
  discountTotal: Money;
  taxTotal: Money;
}

export function calculateExpectedCash(input: Pick<ShiftTotalsInput, 'openingCash' | 'cashSales' | 'cashRefunds' | 'cashExpenses' | 'cashIn' | 'cashOut'>): Money {
  return input.openingCash + input.cashSales - input.cashRefunds - input.cashExpenses + input.cashIn - input.cashOut;
}

export function calculateShiftTotals(input: ShiftTotalsInput): ShiftTotals {
  return {
    openingCash: input.openingCash,
    cashSales: input.cashSales,
    cardSales: input.cardSales,
    mobileSales: input.mobileSales,
    pointsRedeemed: input.pointsRedeemed,
    grossSales: input.cashSales + input.cardSales + input.mobileSales + input.pointsRedeemed,
    salesCount: input.salesCount,
    returnsTotal: input.returnsTotal,
    cashRefunds: input.cashRefunds,
    expensesTotal: input.expensesTotal,
    cashIn: input.cashIn,
    cashOut: input.cashOut,
    discountTotal: input.discountTotal,
    taxTotal: input.taxTotal,
    expectedCash: calculateExpectedCash(input),
  };
}

/** Actual − expected: negative = cash short, positive = cash over. */
export function calculateCashDifference(expected: Money, actual: Money): Money {
  return actual - expected;
}

/** Bangladeshi note denominations (taka) for the cash count helper. */
export const CASH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export function sumDenominations(counts: Partial<Record<number, number>>): Money {
  let total = 0;
  for (const note of CASH_DENOMINATIONS) {
    const count = counts[note] ?? 0;
    if (Number.isFinite(count) && count > 0) total += Math.trunc(count) * note * 100;
  }
  return total;
}
