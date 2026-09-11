import type { Money } from '@/types/common';
import type { PaymentBreakdown, PaymentEntry, PaymentErrorCode, PaymentMethod } from '@/types/sales';
import { isValidMoney, sumMoney } from './money';

/* ==========================================================================
   Payment rules.

   - Every entry must be a positive amount.
   - Card, mobile and points together may never exceed the amount due
     (overpayment is only possible in cash, and it becomes change).
   - The sale can complete only when the tendered total covers the due.
   ========================================================================== */

export interface PaymentRules {
  requireCardReference: boolean;
  requireMobileReference: boolean;
  /** Customer's available points (method 'points'). */
  pointsBalance: number;
  /** Money value of one point. */
  pointValue: Money;
  /** Largest amount payable with points for this sale. */
  maxPointsAmount: Money;
}

export const DEFAULT_PAYMENT_RULES: PaymentRules = {
  requireCardReference: false,
  requireMobileReference: false,
  pointsBalance: 0,
  pointValue: 100,
  maxPointsAmount: 0,
};

export function isNonCash(method: PaymentMethod): boolean {
  return method !== 'cash';
}

export function summarizePayments(due: Money, entries: readonly PaymentEntry[], rules: PaymentRules = DEFAULT_PAYMENT_RULES): PaymentBreakdown {
  const errors = new Set<PaymentErrorCode>();

  for (const entry of entries) {
    if (!isValidMoney(entry.amount) || entry.amount <= 0) errors.add('invalidAmount');
    if (entry.method === 'card' && rules.requireCardReference && !entry.reference.trim()) errors.add('missingReference');
    if (entry.method === 'mobile' && rules.requireMobileReference && !entry.reference.trim()) errors.add('missingReference');
  }

  const valid = entries.filter((entry) => isValidMoney(entry.amount) && entry.amount > 0);
  const cashTendered = sumMoney(valid.filter((entry) => entry.method === 'cash').map((entry) => entry.amount));
  const nonCashTendered = sumMoney(valid.filter((entry) => isNonCash(entry.method)).map((entry) => entry.amount));
  const tendered = cashTendered + nonCashTendered;

  if (nonCashTendered > due) errors.add('nonCashExceedsDue');

  const pointsEntries = valid.filter((entry) => entry.method === 'points');
  if (pointsEntries.length > 0) {
    const points = pointsEntries.reduce((total, entry) => total + (entry.points ?? 0), 0);
    const pointsAmount = sumMoney(pointsEntries.map((entry) => entry.amount));
    if (points > rules.pointsBalance) errors.add('pointsExceedBalance');
    if (pointsAmount > rules.maxPointsAmount) errors.add('pointsExceedLimit');
  }

  if (due > 0 && valid.length === 0) errors.add('noPayment');

  const remaining = Math.max(0, due - tendered);
  if (remaining > 0 && valid.length > 0) errors.add('insufficient');

  const change = tendered > due ? tendered - due : 0;

  return {
    due,
    tendered,
    cashTendered,
    nonCashTendered,
    change,
    remaining,
    isSufficient: remaining === 0 && !errors.has('nonCashExceedsDue'),
    errors: [...errors],
  };
}

export interface AppliedPayment {
  method: PaymentMethod;
  provider: string | null;
  /** Amount applied to the sale. */
  amount: Money;
  tendered: Money;
  change: Money;
  reference: string;
  points: number;
}

/**
 * Converts tendered entries into the payment rows stored with the sale:
 * change is taken from the cash entries, so Σ applied amounts = due.
 */
export function applyPayments(due: Money, entries: readonly PaymentEntry[]): AppliedPayment[] {
  const breakdown = summarizePayments(due, entries, {
    ...DEFAULT_PAYMENT_RULES,
    pointsBalance: Number.MAX_SAFE_INTEGER,
    maxPointsAmount: Number.MAX_SAFE_INTEGER,
  });
  let changeLeft = breakdown.change;

  const applied = entries
    .filter((entry) => entry.amount > 0)
    .map((entry): AppliedPayment => ({
      method: entry.method,
      provider: entry.provider,
      amount: entry.amount,
      tendered: entry.amount,
      change: 0,
      reference: entry.reference.trim(),
      points: entry.points ?? 0,
    }));

  // Give change from the last cash entry backwards.
  for (let index = applied.length - 1; index >= 0 && changeLeft > 0; index -= 1) {
    const payment = applied[index];
    if (payment.method !== 'cash') continue;
    const fromThis = Math.min(changeLeft, payment.tendered);
    payment.change = fromThis;
    payment.amount = payment.tendered - fromThis;
    changeLeft -= fromThis;
  }

  return applied;
}

/** Suggested quick-cash notes for an amount due (next round notes above it). */
export function suggestCashAmounts(due: Money, notes: readonly Money[]): Money[] {
  const suggestions = new Set<Money>();
  for (const note of [...notes].sort((a, b) => a - b)) {
    if (note >= due) suggestions.add(note);
  }
  // Round up to the next 100 and 500 taka as well.
  const nextHundred = Math.ceil(due / 10_000) * 10_000;
  const nextFiveHundred = Math.ceil(due / 50_000) * 50_000;
  if (nextHundred > due) suggestions.add(nextHundred);
  if (nextFiveHundred > due) suggestions.add(nextFiveHundred);
  return [...suggestions].sort((a, b) => a - b).slice(0, 6);
}
