// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/domain/ids';
import { roundQuantity } from '@/domain/money';
import { calculateRefund, remainingReturnable, type RefundableLine } from '@/domain/refund';

function soldLine(quantity: number, lineTotal: number, taxAmount: number): RefundableLine {
  return { quantity, lineTotal, taxAmount, returnedQuantity: 0, refundedAmount: 0, refundedTax: 0 };
}

/** Applies a refund result to a line, like the database does after a return. */
function afterReturn(line: RefundableLine, result: ReturnType<typeof calculateRefund>): RefundableLine {
  return {
    ...line,
    returnedQuantity: roundQuantity(line.returnedQuantity + result.quantity),
    refundedAmount: line.refundedAmount + result.refund,
    refundedTax: line.refundedTax + result.tax,
  };
}

describe('remainingReturnable', () => {
  it('is the sold quantity minus what was returned, never negative', () => {
    expect(remainingReturnable({ quantity: 3, returnedQuantity: 1 })).toBe(2);
    expect(remainingReturnable({ quantity: 1.25, returnedQuantity: 0.5 })).toBe(0.75);
    expect(remainingReturnable({ quantity: 2, returnedQuantity: 2 })).toBe(0);
    expect(remainingReturnable({ quantity: 2, returnedQuantity: 3 })).toBe(0);
  });
});

describe('calculateRefund', () => {
  it('refunds a partial return proportionally (discounts and VAT included)', () => {
    const line = soldLine(3, 1_000, 48);
    expect(calculateRefund(line, 1)).toEqual({ quantity: 1, refund: 333, tax: 16 });
    expect(calculateRefund(line, 2)).toEqual({ quantity: 2, refund: 667, tax: 32 });
  });

  it('lets the final return take exactly what is left', () => {
    let line = soldLine(3, 1_000, 48);
    const first = calculateRefund(line, 1);
    line = afterReturn(line, first);
    const second = calculateRefund(line, 1);
    line = afterReturn(line, second);
    const last = calculateRefund(line, 1);
    expect([first.refund, second.refund, last.refund]).toEqual([333, 333, 334]);
    expect(first.refund + second.refund + last.refund).toBe(1_000);
    expect(first.tax + second.tax + last.tax).toBe(48);
  });

  it('returning the rest in one go refunds the remainder', () => {
    let line = soldLine(3, 1_000, 48);
    line = afterReturn(line, calculateRefund(line, 1));
    expect(calculateRefund(line, 2)).toEqual({ quantity: 2, refund: 667, tax: 32 });
  });

  it('never returns more than was sold', () => {
    const line = soldLine(2, 5_000, 238);
    expect(calculateRefund(line, 5)).toEqual({ quantity: 2, refund: 5_000, tax: 238 });
    const done = afterReturn(line, calculateRefund(line, 2));
    expect(calculateRefund(done, 1)).toEqual({ quantity: 0, refund: 0, tax: 0 });
  });

  it('caps partial refunds whose rounding would exceed what was paid', () => {
    // 9 units for 15 poisha: each unit is 1.67 → rounds to 2, so 8 single
    // returns would otherwise refund 16 > 15 before the final one.
    let line = soldLine(9, 15, 9);
    const refunds: number[] = [];
    for (let unit = 0; unit < 9; unit += 1) {
      const result = calculateRefund(line, 1);
      refunds.push(result.refund);
      line = afterReturn(line, result);
      expect(line.refundedAmount).toBeLessThanOrEqual(15);
      expect(line.refundedTax).toBeLessThanOrEqual(9);
    }
    expect(refunds.reduce((sum, value) => sum + value, 0)).toBe(15);
    expect(line.refundedTax).toBe(9);
    expect(remainingReturnable(line)).toBe(0);
  });

  it('ignores zero and negative quantities', () => {
    const line = soldLine(2, 5_000, 0);
    expect(calculateRefund(line, 0)).toEqual({ quantity: 0, refund: 0, tax: 0 });
    expect(calculateRefund(line, -1)).toEqual({ quantity: 0, refund: 0, tax: 0 });
  });

  it('supports weighted quantities', () => {
    let line = soldLine(1.25, 12_500, 595);
    const part = calculateRefund(line, 0.5);
    expect(part).toEqual({ quantity: 0.5, refund: 5_000, tax: 238 });
    line = afterReturn(line, part);
    expect(calculateRefund(line, 0.75)).toEqual({ quantity: 0.75, refund: 7_500, tax: 357 });
  });

  it('never refunds more than was paid over any return sequence (seeded fuzz)', () => {
    const random = createRandom(7);
    for (let run = 0; run < 300; run += 1) {
      const weighted = random() < 0.3;
      const quantity = weighted ? Math.round((0.1 + random() * 5) * 1_000) / 1_000 : 1 + Math.floor(random() * 9);
      const lineTotal = Math.floor(random() * 300_000);
      const taxAmount = Math.floor(lineTotal * random() * 0.15);
      let line = soldLine(quantity, lineTotal, taxAmount);
      let guard = 0;
      while (remainingReturnable(line) > 0 && guard < 50) {
        guard += 1;
        const remaining = remainingReturnable(line);
        const step = weighted ? Math.max(0.001, roundQuantity(remaining * random())) : Math.max(1, Math.floor(remaining * random()));
        const result = calculateRefund(line, step);
        expect(result.quantity).toBeGreaterThan(0);
        expect(result.refund).toBeGreaterThanOrEqual(0);
        line = afterReturn(line, result);
        expect(line.refundedAmount).toBeLessThanOrEqual(lineTotal);
        expect(line.refundedTax).toBeLessThanOrEqual(taxAmount);
      }
      expect(remainingReturnable(line)).toBe(0);
      expect(line.refundedAmount).toBe(lineTotal);
      expect(line.refundedTax).toBe(taxAmount);
    }
  });
});
