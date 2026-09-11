import type { BasisPoints, Money } from '@/types/common';
import type { RoundingMode } from '@/types/settings';

/* ==========================================================================
   Safe money arithmetic.

   All amounts are integer minor units (poisha). Floats only appear at the
   edges (user input, display) and are converted with toMinor/fromMinor.
   Rounding is always half away from zero ("half-up" for positive amounts).
   ========================================================================== */

export const MINOR_PER_MAJOR = 100;
export const BASIS_POINTS_100 = 10_000;
const QUANTITY_SCALE = 1_000;
const EPSILON = 1e-9;

/** Rounds half away from zero, tolerant to binary float noise (2.675 → 3 when ×100 gives 267.49999…). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) + 0.5 + EPSILON);
}

/** Taka (possibly fractional) → poisha. */
export function toMinor(major: number): Money {
  return roundHalfUp(major * MINOR_PER_MAJOR);
}

/** Poisha → taka (for display and inputs only). */
export function fromMinor(minor: Money): number {
  return minor / MINOR_PER_MAJOR;
}

export function isValidMoney(value: unknown, { allowNegative = false, max = Number.MAX_SAFE_INTEGER } = {}): value is Money {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    (allowNegative || value >= 0) &&
    Math.abs(value) <= max
  );
}

export function sumMoney(values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/** Quantity rounded to 3 decimals (grams / millilitres precision). */
export function roundQuantity(quantity: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return roundHalfUp(quantity * factor) / factor;
}

/** unit price × quantity, with the quantity scaled to an integer first. */
export function multiplyMoney(unitPrice: Money, quantity: number): Money {
  const scaledQuantity = roundHalfUp(quantity * QUANTITY_SCALE);
  return roundHalfUp((unitPrice * scaledQuantity) / QUANTITY_SCALE);
}

/** amount × rate, where rate is in basis points (1% = 100). */
export function percentOf(amount: Money, rate: BasisPoints): Money {
  return roundHalfUp((amount * rate) / BASIS_POINTS_100);
}

/** amount × numerator / denominator with half-up rounding (proportional shares). */
export function proportion(amount: Money, numerator: number, denominator: number): Money {
  if (denominator === 0) return 0;
  const scaledNumerator = roundHalfUp(numerator * QUANTITY_SCALE);
  const scaledDenominator = roundHalfUp(denominator * QUANTITY_SCALE);
  if (scaledDenominator === 0) return 0;
  return roundHalfUp((amount * scaledNumerator) / scaledDenominator);
}

/**
 * Splits `total` across `weights` proportionally so that the parts always add
 * up to exactly `total` (largest remainder method). Used to spread a cart
 * discount over lines.
 */
export function allocateProportionally(total: Money, weights: readonly Money[]): Money[] {
  const weightSum = sumMoney(weights);
  if (total === 0 || weightSum <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * weight) / weightSum);
  const parts = raw.map((value) => Math.floor(value + EPSILON));
  let remainder = total - sumMoney(parts);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value + EPSILON) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    const entry = order[i];
    if (weights[entry.index] > 0) {
      parts[entry.index] += 1;
      remainder -= 1;
    }
  }
  return parts;
}

export function clampMoney(value: Money, min: Money, max: Money): Money {
  return Math.min(Math.max(value, min), max);
}

/** Applies the cash rounding rule to a grand total. Returns the rounded total. */
export function applyRounding(total: Money, mode: RoundingMode): Money {
  switch (mode) {
    case 'nearest_1':
      return roundHalfUp(total / MINOR_PER_MAJOR) * MINOR_PER_MAJOR;
    case 'nearest_0_5':
      return roundHalfUp(total / 50) * 50;
    case 'down_1':
      return Math.floor(total / MINOR_PER_MAJOR) * MINOR_PER_MAJOR;
    case 'none':
    default:
      return total;
  }
}

/** Parses a user-typed amount ("1,250.50", "১২৫০") into minor units, or null. */
export function parseMoneyInput(input: string): Money | null {
  const ascii = input
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/[,\s৳$€£]/g, '')
    .trim();
  if (ascii === '' || !/^-?\d*(\.\d{0,2})?$/.test(ascii) || ascii === '.' || ascii === '-') return null;
  const value = Number(ascii);
  return Number.isFinite(value) ? toMinor(value) : null;
}

/** Parses a user-typed quantity (supports Bangla digits and decimals). */
export function parseQuantityInput(input: string): number | null {
  const ascii = input.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)).replace(/[,\s]/g, '').trim();
  if (ascii === '' || !/^\d*(\.\d{0,3})?$/.test(ascii) || ascii === '.') return null;
  const value = Number(ascii);
  return Number.isFinite(value) ? roundQuantity(value) : null;
}

/** Percentage typed by a user ("7.5") → basis points (750), or null. */
export function parsePercentInput(input: string): BasisPoints | null {
  const ascii = input.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)).replace(/[%\s]/g, '').trim();
  if (ascii === '' || !/^\d*(\.\d{0,2})?$/.test(ascii) || ascii === '.') return null;
  const value = Number(ascii);
  return Number.isFinite(value) ? roundHalfUp(value * 100) : null;
}
