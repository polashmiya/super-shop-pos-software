// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/domain/ids';
import {
  allocateProportionally,
  applyRounding,
  clampMoney,
  fromMinor,
  isValidMoney,
  multiplyMoney,
  parseMoneyInput,
  parsePercentInput,
  parseQuantityInput,
  percentOf,
  proportion,
  roundHalfUp,
  roundQuantity,
  sumMoney,
  toMinor,
} from '@/domain/money';

describe('roundHalfUp', () => {
  it('rounds halves away from zero', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.5)).toBe(4);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(-2.4)).toBe(-2);
    expect(roundHalfUp(0)).toBe(0);
  });

  it('is tolerant to binary float noise', () => {
    // 1.005 * 100 = 100.49999999999999 in IEEE-754
    expect(roundHalfUp(1.005 * 100)).toBe(101);
    expect(roundHalfUp(2.675 * 100)).toBe(268);
  });

  it('maps non-finite input to 0', () => {
    expect(roundHalfUp(Number.NaN)).toBe(0);
    expect(roundHalfUp(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundHalfUp(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('toMinor / fromMinor', () => {
  it('converts taka to poisha with half-up rounding', () => {
    expect(toMinor(12.5)).toBe(1250);
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(2.675)).toBe(268);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(-1.005)).toBe(-101);
    expect(toMinor(0.004)).toBe(0);
    expect(toMinor(0.005)).toBe(1);
  });

  it('converts poisha back to taka', () => {
    expect(fromMinor(12345)).toBe(123.45);
    expect(fromMinor(0)).toBe(0);
    expect(fromMinor(-50)).toBe(-0.5);
  });

  it('round-trips every whole poisha amount', () => {
    for (let minor = -2_000; minor <= 2_000; minor += 7) {
      expect(toMinor(fromMinor(minor))).toBe(minor);
    }
  });
});

describe('isValidMoney / sumMoney / clampMoney', () => {
  it('accepts only safe, non-negative integers by default', () => {
    expect(isValidMoney(100)).toBe(true);
    expect(isValidMoney(0)).toBe(true);
    expect(isValidMoney(-1)).toBe(false);
    expect(isValidMoney(-1, { allowNegative: true })).toBe(true);
    expect(isValidMoney(10.5)).toBe(false);
    expect(isValidMoney('100')).toBe(false);
    expect(isValidMoney(Number.NaN)).toBe(false);
    expect(isValidMoney(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isValidMoney(1_001, { max: 1_000 })).toBe(false);
  });

  it('sums and clamps', () => {
    expect(sumMoney([])).toBe(0);
    expect(sumMoney([100, 250, -50])).toBe(300);
    expect(clampMoney(500, 0, 300)).toBe(300);
    expect(clampMoney(-5, 0, 300)).toBe(0);
    expect(clampMoney(120, 0, 300)).toBe(120);
  });
});

describe('quantity and rate arithmetic', () => {
  it('rounds quantities to 3 decimals', () => {
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(2.5, 0)).toBe(3);
  });

  it('multiplies a unit price by a (fractional) quantity', () => {
    expect(multiplyMoney(5_000, 3)).toBe(15_000);
    expect(multiplyMoney(5_000, 1.5)).toBe(7_500);
    expect(multiplyMoney(48_000, 0.75)).toBe(36_000);
    expect(multiplyMoney(12_345, 0.333)).toBe(4_111); // 4110.885 → 4111
    expect(multiplyMoney(9_999, 0)).toBe(0);
  });

  it('takes a percentage in basis points', () => {
    expect(percentOf(10_000, 750)).toBe(750);
    expect(percentOf(333, 500)).toBe(17); // 16.65 → 17
    expect(percentOf(10_000, 0)).toBe(0);
    expect(percentOf(10_000, 10_000)).toBe(10_000);
  });

  it('computes proportional shares', () => {
    expect(proportion(1_000, 1, 3)).toBe(333);
    expect(proportion(1_000, 2, 3)).toBe(667);
    expect(proportion(1_000, 0.5, 1.25)).toBe(400);
    expect(proportion(1_000, 1, 0)).toBe(0);
  });
});

describe('allocateProportionally', () => {
  it('splits exactly when shares are whole', () => {
    expect(allocateProportionally(10, [3, 3, 4])).toEqual([3, 3, 4]);
    expect(allocateProportionally(4_000, [10_000, 30_000])).toEqual([1_000, 3_000]);
  });

  it('gives the remainder to the largest fractions (ties by position)', () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
    // raw shares 0.5, 1, 3.5 → floors 0, 1, 3 and one unit for the first tie
    expect(allocateProportionally(5, [10, 20, 70])).toEqual([1, 1, 3]);
    // raw shares 2.9, 7.1 → the larger fraction wins
    expect(allocateProportionally(10, [29, 71])).toEqual([3, 7]);
  });

  it('never allocates to zero weights and handles empty totals', () => {
    expect(allocateProportionally(10, [0, 5, 5])).toEqual([0, 5, 5]);
    expect(allocateProportionally(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProportionally(10, [0, 0])).toEqual([0, 0]);
    expect(allocateProportionally(10, [])).toEqual([]);
  });

  it('always preserves the total and stays within one unit of the exact share (seeded fuzz)', () => {
    const random = createRandom(42);
    for (let run = 0; run < 400; run += 1) {
      const count = 1 + Math.floor(random() * 8);
      const weights = Array.from({ length: count }, () => (random() < 0.15 ? 0 : Math.floor(random() * 50_000)));
      const weightSum = sumMoney(weights);
      const total = Math.floor(random() * Math.max(1, weightSum));
      const parts = allocateProportionally(total, weights);
      expect(parts).toHaveLength(count);
      if (weightSum === 0 || total === 0) {
        expect(parts.every((part) => part === 0)).toBe(true);
        continue;
      }
      expect(sumMoney(parts)).toBe(total);
      parts.forEach((part, index) => {
        const exact = (total * weights[index]) / weightSum;
        expect(Number.isInteger(part)).toBe(true);
        expect(part).toBeGreaterThanOrEqual(Math.floor(exact));
        expect(part).toBeLessThanOrEqual(Math.ceil(exact));
        if (weights[index] === 0) expect(part).toBe(0);
      });
    }
  });
});

describe('applyRounding', () => {
  it('leaves the total unchanged with "none"', () => {
    expect(applyRounding(12_345, 'none')).toBe(12_345);
  });

  it('rounds to the nearest taka (half up)', () => {
    expect(applyRounding(12_345, 'nearest_1')).toBe(12_300);
    expect(applyRounding(12_350, 'nearest_1')).toBe(12_400);
    expect(applyRounding(12_300, 'nearest_1')).toBe(12_300);
  });

  it('rounds to the nearest 50 poisha', () => {
    expect(applyRounding(12_324, 'nearest_0_5')).toBe(12_300);
    expect(applyRounding(12_325, 'nearest_0_5')).toBe(12_350);
    expect(applyRounding(12_374, 'nearest_0_5')).toBe(12_350);
    expect(applyRounding(12_375, 'nearest_0_5')).toBe(12_400);
  });

  it('rounds down to the taka', () => {
    expect(applyRounding(12_399, 'down_1')).toBe(12_300);
    expect(applyRounding(12_300, 'down_1')).toBe(12_300);
  });
});

describe('parseMoneyInput', () => {
  it('parses plain and grouped amounts', () => {
    expect(parseMoneyInput('100')).toBe(10_000);
    expect(parseMoneyInput('1,250.50')).toBe(125_050);
    expect(parseMoneyInput('1,00,000')).toBe(10_000_000); // Indian/Bangladeshi grouping
    expect(parseMoneyInput(' 42 ')).toBe(4_200);
    expect(parseMoneyInput('12.')).toBe(1_200);
    expect(parseMoneyInput('.5')).toBe(50);
    expect(parseMoneyInput('0.05')).toBe(5);
  });

  it('accepts Bangla digits and currency symbols', () => {
    expect(parseMoneyInput('১২৩.৫০')).toBe(12_350);
    expect(parseMoneyInput('১,২৫০')).toBe(125_000);
    expect(parseMoneyInput('৳ 1,000')).toBe(100_000);
    expect(parseMoneyInput('৳৫০০')).toBe(50_000);
  });

  it('accepts a leading minus', () => {
    expect(parseMoneyInput('-5')).toBe(-500);
  });

  it('rejects invalid input', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('   ')).toBeNull();
    expect(parseMoneyInput('.')).toBeNull();
    expect(parseMoneyInput('-')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('12a')).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull(); // more than 2 decimals
    expect(parseMoneyInput('1.2.3')).toBeNull();
    expect(parseMoneyInput('1e5')).toBeNull();
  });
});

describe('parseQuantityInput / parsePercentInput', () => {
  it('parses quantities with up to 3 decimals', () => {
    expect(parseQuantityInput('2')).toBe(2);
    expect(parseQuantityInput('1.5')).toBe(1.5);
    expect(parseQuantityInput('১.২৫০')).toBe(1.25);
    expect(parseQuantityInput('0.125')).toBe(0.125);
    expect(parseQuantityInput('1.2345')).toBeNull();
    expect(parseQuantityInput('-1')).toBeNull();
    expect(parseQuantityInput('')).toBeNull();
    expect(parseQuantityInput('.')).toBeNull();
  });

  it('parses percentages into basis points', () => {
    expect(parsePercentInput('7.5')).toBe(750);
    expect(parsePercentInput('10%')).toBe(1_000);
    expect(parsePercentInput('১০')).toBe(1_000);
    expect(parsePercentInput('0.25')).toBe(25);
    expect(parsePercentInput('5.555')).toBeNull();
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('-5')).toBeNull();
  });
});
