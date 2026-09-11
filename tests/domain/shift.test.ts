// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateCashDifference, calculateExpectedCash, calculateShiftTotals, CASH_DENOMINATIONS, sumDenominations, type ShiftTotalsInput } from '@/domain/shift';

const INPUT: ShiftTotalsInput = {
  openingCash: 500_000,
  cashSales: 1_250_000,
  cardSales: 300_000,
  mobileSales: 450_000,
  pointsRedeemed: 12_000,
  salesCount: 42,
  returnsTotal: 25_000,
  cashRefunds: 15_000,
  cashExpenses: 20_000,
  expensesTotal: 35_000,
  cashIn: 100_000,
  cashOut: 50_000,
  discountTotal: 18_000,
  taxTotal: 60_000,
};

describe('shift arithmetic', () => {
  it('computes expected cash from opening, cash sales, refunds, expenses and cash in/out', () => {
    expect(calculateExpectedCash(INPUT)).toBe(500_000 + 1_250_000 - 15_000 - 20_000 + 100_000 - 50_000);
    expect(calculateExpectedCash({ openingCash: 0, cashSales: 0, cashRefunds: 0, cashExpenses: 0, cashIn: 0, cashOut: 0 })).toBe(0);
  });

  it('builds the shift summary', () => {
    const totals = calculateShiftTotals(INPUT);
    expect(totals.grossSales).toBe(1_250_000 + 300_000 + 450_000 + 12_000);
    expect(totals.expectedCash).toBe(calculateExpectedCash(INPUT));
    expect(totals.expensesTotal).toBe(35_000);
    expect(totals).toMatchObject({ openingCash: 500_000, salesCount: 42, returnsTotal: 25_000, cashRefunds: 15_000, cashIn: 100_000, cashOut: 50_000, discountTotal: 18_000, taxTotal: 60_000 });
  });

  it('reports the difference as actual − expected (negative = short)', () => {
    expect(calculateCashDifference(1_765_000, 1_760_000)).toBe(-5_000);
    expect(calculateCashDifference(1_765_000, 1_766_000)).toBe(1_000);
    expect(calculateCashDifference(1_765_000, 1_765_000)).toBe(0);
  });
});

describe('cash count helper', () => {
  it('lists Bangladeshi notes and coins from large to small', () => {
    expect([...CASH_DENOMINATIONS]).toEqual([1000, 500, 200, 100, 50, 20, 10, 5, 2, 1]);
  });

  it('sums note counts in poisha', () => {
    expect(sumDenominations({ 1000: 2, 500: 1, 10: 3, 1: 4 })).toBe((2_000 + 500 + 30 + 4) * 100);
    expect(sumDenominations({})).toBe(0);
  });

  it('ignores negative, non-finite, fractional and unknown counts', () => {
    expect(sumDenominations({ 1000: -1, 500: Number.NaN, 100: Number.POSITIVE_INFINITY })).toBe(0);
    expect(sumDenominations({ 100: 2.7 })).toBe(20_000);
    expect(sumDenominations({ 3: 5, 1000: 1 })).toBe(100_000);
  });
});
