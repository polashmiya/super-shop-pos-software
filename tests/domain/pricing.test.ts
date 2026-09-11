// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/domain/ids';
import { sumMoney } from '@/domain/money';
import {
  calculateCartTotals,
  calculateChange,
  calculateDiscountAmount,
  calculateItemDiscount,
  calculateOrderDiscount,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  effectiveRate,
  validateDiscount,
  type PricingLine,
  type PricingOptions,
} from '@/domain/pricing';
import type { Discount } from '@/types';

const EXCLUSIVE: PricingOptions = { taxEnabled: true, taxMode: 'exclusive', rounding: 'none' };
const INCLUSIVE: PricingOptions = { taxEnabled: true, taxMode: 'inclusive', rounding: 'none' };

let lineCounter = 0;
function line(overrides: Partial<PricingLine> = {}): PricingLine {
  lineCounter += 1;
  return { lineId: `L${lineCounter}`, quantity: 1, unitPrice: 10_000, taxRate: 0, discount: null, mrp: null, ...overrides };
}

describe('line arithmetic', () => {
  it('multiplies unit price and quantity (weighted items too)', () => {
    expect(calculateSubtotal(12_050, 3)).toBe(36_150);
    expect(calculateSubtotal(48_000, 0.75)).toBe(36_000);
    expect(calculateSubtotal(9_900, 1.255)).toBe(12_425); // 12424.5 → 12425
  });

  it('calculates percent and fixed item discounts', () => {
    expect(calculateDiscountAmount(10_000, { type: 'percent', value: 1_000 })).toBe(1_000);
    expect(calculateDiscountAmount(3_333, { type: 'percent', value: 1_000 })).toBe(333);
    expect(calculateDiscountAmount(10_000, { type: 'fixed', value: 2_500 })).toBe(2_500);
    expect(calculateItemDiscount(line({ unitPrice: 5_000, quantity: 2, discount: { type: 'percent', value: 500 } }))).toBe(500);
  });

  it('never returns a negative discount or more than the base', () => {
    expect(calculateDiscountAmount(3_000, { type: 'fixed', value: 5_000 })).toBe(3_000);
    expect(calculateDiscountAmount(3_000, { type: 'percent', value: 15_000 })).toBe(3_000);
    expect(calculateDiscountAmount(3_000, { type: 'fixed', value: -500 })).toBe(0);
    expect(calculateDiscountAmount(3_000, { type: 'percent', value: -500 })).toBe(0);
    expect(calculateDiscountAmount(0, { type: 'fixed', value: 500 })).toBe(0);
    expect(calculateDiscountAmount(-100, { type: 'fixed', value: 500 })).toBe(0);
    expect(calculateDiscountAmount(3_000, null)).toBe(0);
    expect(calculateDiscountAmount(3_000, undefined)).toBe(0);
    expect(calculateOrderDiscount(0, { type: 'percent', value: 1_000 })).toBe(0);
  });
});

describe('VAT', () => {
  it('adds exclusive VAT on top of the taxable amount', () => {
    expect(calculateTax(10_000, 500, 'exclusive')).toBe(500);
    expect(calculateTax(10_000, 1_500, 'exclusive')).toBe(1_500);
    expect(calculateTax(333, 750, 'exclusive')).toBe(25); // 24.975 → 25
    expect(calculateTotal(10_000, 500, 'exclusive')).toBe(10_500);
  });

  it('extracts inclusive VAT from the taxable amount', () => {
    expect(calculateTax(10_500, 500, 'inclusive')).toBe(500);
    expect(calculateTax(11_500, 1_500, 'inclusive')).toBe(1_500);
    expect(calculateTax(999, 750, 'inclusive')).toBe(70); // net = round(929.30) = 929
    expect(calculateTotal(10_500, 500, 'inclusive')).toBe(10_500);
  });

  it('guards zero and negative inputs', () => {
    expect(calculateTax(0, 500, 'exclusive')).toBe(0);
    expect(calculateTax(-100, 500, 'exclusive')).toBe(0);
    expect(calculateTax(10_000, 0, 'exclusive')).toBe(0);
    expect(calculateTax(10_000, -500, 'inclusive')).toBe(0);
  });
});

describe('calculateChange', () => {
  it('returns change only when overpaid', () => {
    expect(calculateChange(10_000, 15_000)).toBe(5_000);
    expect(calculateChange(10_000, 10_000)).toBe(0);
    expect(calculateChange(10_000, 5_000)).toBe(0);
  });
});

describe('calculateCartTotals', () => {
  it('prices a simple exclusive-VAT cart', () => {
    const totals = calculateCartTotals([line({ unitPrice: 12_000, quantity: 2, taxRate: 500 })], null, EXCLUSIVE);
    expect(totals.subtotal).toBe(24_000);
    expect(totals.taxableTotal).toBe(24_000);
    expect(totals.taxTotal).toBe(1_200);
    expect(totals.grandTotal).toBe(25_200);
    expect(totals.roundingAdjustment).toBe(0);
    expect(totals.itemCount).toBe(1);
    expect(totals.totalQuantity).toBe(2);
    expect(totals.taxMode).toBe('exclusive');
  });

  it('keeps inclusive-VAT prices unchanged and extracts the VAT', () => {
    const totals = calculateCartTotals([line({ unitPrice: 10_500, quantity: 2, taxRate: 500 })], null, INCLUSIVE);
    expect(totals.grandTotal).toBe(21_000);
    expect(totals.taxTotal).toBe(1_000);
    expect(totals.lines[0].total).toBe(21_000);
  });

  it('applies item discounts before VAT', () => {
    const totals = calculateCartTotals([line({ unitPrice: 10_000, quantity: 1, taxRate: 1_000, discount: { type: 'percent', value: 1_000 } })], null, EXCLUSIVE);
    expect(totals.itemDiscountTotal).toBe(1_000);
    expect(totals.lines[0].taxable).toBe(9_000);
    expect(totals.taxTotal).toBe(900);
    expect(totals.grandTotal).toBe(9_900);
  });

  it('allocates an order discount proportionally to line nets', () => {
    const lines = [line({ unitPrice: 10_000 }), line({ unitPrice: 30_000 })];
    const totals = calculateCartTotals(lines, { type: 'percent', value: 1_000 }, EXCLUSIVE);
    expect(totals.orderDiscountTotal).toBe(4_000);
    expect(totals.lines.map((entry) => entry.orderDiscount)).toEqual([1_000, 3_000]);
    expect(totals.discountTotal).toBe(4_000);
    expect(totals.grandTotal).toBe(36_000);
  });

  it('allocates a fixed order discount without losing a poisha', () => {
    const lines = [line({ unitPrice: 3_333 }), line({ unitPrice: 3_333 }), line({ unitPrice: 3_334 })];
    const totals = calculateCartTotals(lines, { type: 'fixed', value: 1_000 }, EXCLUSIVE);
    expect(sumMoney(totals.lines.map((entry) => entry.orderDiscount))).toBe(1_000);
    expect(totals.grandTotal).toBe(9_000);
  });

  it('computes the order discount on the net after item discounts', () => {
    const lines = [line({ unitPrice: 10_000, discount: { type: 'fixed', value: 2_000 } }), line({ unitPrice: 10_000 })];
    const totals = calculateCartTotals(lines, { type: 'percent', value: 1_000 }, EXCLUSIVE);
    expect(totals.itemDiscountTotal).toBe(2_000);
    expect(totals.orderDiscountTotal).toBe(1_800); // 10% of 18,000
    expect(totals.lines.map((entry) => entry.orderDiscount)).toEqual([800, 1_000]);
    expect(totals.grandTotal).toBe(16_200);
  });

  it('caps an order discount at the cart value', () => {
    const totals = calculateCartTotals([line({ unitPrice: 5_000, taxRate: 500 })], { type: 'fixed', value: 999_999 }, EXCLUSIVE);
    expect(totals.orderDiscountTotal).toBe(5_000);
    expect(totals.taxTotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
  });

  it('handles mixed VAT rates line by line', () => {
    const lines = [
      line({ unitPrice: 10_000, taxRate: 0 }),
      line({ unitPrice: 10_000, taxRate: 500 }),
      line({ unitPrice: 10_000, taxRate: 750 }),
      line({ unitPrice: 10_000, taxRate: 1_500 }),
    ];
    const totals = calculateCartTotals(lines, null, EXCLUSIVE);
    expect(totals.lines.map((entry) => entry.tax)).toEqual([0, 500, 750, 1_500]);
    expect(totals.taxTotal).toBe(2_750);
    expect(totals.grandTotal).toBe(42_750);

    const inclusive = calculateCartTotals(lines, null, INCLUSIVE);
    expect(inclusive.lines.map((entry) => entry.tax)).toEqual([0, 476, 698, 1_304]);
    expect(inclusive.grandTotal).toBe(40_000);
  });

  it('ignores line VAT rates when VAT is disabled', () => {
    const totals = calculateCartTotals([line({ unitPrice: 10_000, taxRate: 1_500 })], null, { ...EXCLUSIVE, taxEnabled: false });
    expect(totals.taxTotal).toBe(0);
    expect(totals.grandTotal).toBe(10_000);
  });

  it('applies the cash rounding rule to the grand total only', () => {
    const lines = [line({ unitPrice: 12_345 })];
    const nearest = calculateCartTotals(lines, null, { ...EXCLUSIVE, rounding: 'nearest_1' });
    expect(nearest.grandTotal).toBe(12_300);
    expect(nearest.roundingAdjustment).toBe(-45);
    expect(nearest.lines[0].total).toBe(12_345);

    const up = calculateCartTotals([line({ unitPrice: 12_350 })], null, { ...EXCLUSIVE, rounding: 'nearest_1' });
    expect(up.grandTotal).toBe(12_400);
    expect(up.roundingAdjustment).toBe(50);

    const half = calculateCartTotals([line({ unitPrice: 12_330 })], null, { ...EXCLUSIVE, rounding: 'nearest_0_5' });
    expect(half.grandTotal).toBe(12_350);

    const down = calculateCartTotals([line({ unitPrice: 12_399 })], null, { ...EXCLUSIVE, rounding: 'down_1' });
    expect(down.grandTotal).toBe(12_300);
    expect(down.roundingAdjustment).toBe(-99);
  });

  it('reports savings against MRP plus all discounts', () => {
    const lines = [line({ unitPrice: 10_000, quantity: 2, mrp: 12_000 }), line({ unitPrice: 5_000, mrp: 4_000, discount: { type: 'fixed', value: 500 } })];
    const totals = calculateCartTotals(lines, { type: 'fixed', value: 1_000 }, EXCLUSIVE);
    // MRP savings only count when MRP > price: (12,000 − 10,000) × 2 = 4,000
    expect(totals.savings).toBe(4_000 + 500 + 1_000);
  });

  it('returns zeros for an empty cart', () => {
    const totals = calculateCartTotals([], null, EXCLUSIVE);
    expect(totals.grandTotal).toBe(0);
    expect(totals.itemCount).toBe(0);
    expect(totals.lines).toEqual([]);
  });

  it('keeps every invariant for random carts (seeded fuzz)', () => {
    const random = createRandom(20260910);
    const rates = [0, 500, 750, 1_000, 1_500];
    const roundings = ['none', 'nearest_1', 'nearest_0_5', 'down_1'] as const;
    for (let run = 0; run < 300; run += 1) {
      const lines = Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
        const weighted = random() < 0.25;
        const discountRoll = random();
        const discount: Discount | null =
          discountRoll < 0.2 ? { type: 'percent', value: Math.floor(random() * 3_000) } : discountRoll < 0.35 ? { type: 'fixed', value: Math.floor(random() * 5_000) } : null;
        return line({
          unitPrice: 100 + Math.floor(random() * 200_000),
          quantity: weighted ? Math.round(random() * 5_000) / 1_000 + 0.001 : 1 + Math.floor(random() * 5),
          taxRate: rates[Math.floor(random() * rates.length)],
          discount,
        });
      });
      const orderRoll = random();
      const orderDiscount: Discount | null =
        orderRoll < 0.3 ? { type: 'percent', value: Math.floor(random() * 2_000) } : orderRoll < 0.45 ? { type: 'fixed', value: Math.floor(random() * 10_000) } : null;
      const options: PricingOptions = { taxEnabled: random() < 0.85, taxMode: random() < 0.5 ? 'exclusive' : 'inclusive', rounding: roundings[Math.floor(random() * roundings.length)] };
      const totals = calculateCartTotals(lines, orderDiscount, options);

      expect(sumMoney(totals.lines.map((entry) => entry.orderDiscount))).toBe(totals.orderDiscountTotal);
      expect(totals.discountTotal).toBe(totals.itemDiscountTotal + totals.orderDiscountTotal);
      expect(totals.subtotal - totals.discountTotal).toBe(totals.taxableTotal);
      expect(sumMoney(totals.lines.map((entry) => entry.total)) + totals.roundingAdjustment).toBe(totals.grandTotal);
      for (const entry of totals.lines) {
        expect(entry.taxable).toBeGreaterThanOrEqual(0);
        expect(entry.tax).toBeGreaterThanOrEqual(0);
        expect(entry.total).toBe(options.taxMode === 'exclusive' ? entry.taxable + entry.tax : entry.taxable);
        expect(Number.isInteger(entry.total)).toBe(true);
      }
      expect(Math.abs(totals.roundingAdjustment)).toBeLessThan(100);
    }
  });
});

describe('validateDiscount / effectiveRate', () => {
  it('rejects negative, zero and malformed values', () => {
    expect(validateDiscount({ type: 'fixed', value: -1 }, 10_000)).toBe('negative');
    expect(validateDiscount({ type: 'percent', value: Number.NaN }, 10_000)).toBe('negative');
    expect(validateDiscount({ type: 'fixed', value: 0 }, 10_000)).toBe('zero');
  });

  it('checks percentages against 100% and the user limit', () => {
    expect(validateDiscount({ type: 'percent', value: 10_001 }, 10_000)).toBe('percentTooHigh');
    expect(validateDiscount({ type: 'percent', value: 1_500 }, 10_000, 1_000)).toBe('aboveLimit');
    expect(validateDiscount({ type: 'percent', value: 1_000 }, 10_000, 1_000)).toBeNull();
    expect(validateDiscount({ type: 'percent', value: 10_000 }, 10_000)).toBeNull();
  });

  it('checks fixed amounts against the base and the user limit', () => {
    expect(validateDiscount({ type: 'fixed', value: 10_001 }, 10_000)).toBe('exceedsAmount');
    expect(validateDiscount({ type: 'fixed', value: 1_500 }, 10_000, 1_000)).toBe('aboveLimit');
    expect(validateDiscount({ type: 'fixed', value: 1_000 }, 10_000, 1_000)).toBeNull();
  });

  it('expresses an amount as a rate of a base', () => {
    expect(effectiveRate(1_500, 10_000)).toBe(1_500);
    expect(effectiveRate(1, 3)).toBe(3_333);
    expect(effectiveRate(500, 0)).toBe(0);
  });
});
