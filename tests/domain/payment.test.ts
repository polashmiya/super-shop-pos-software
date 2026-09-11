// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sumMoney } from '@/domain/money';
import { applyPayments, DEFAULT_PAYMENT_RULES, isNonCash, suggestCashAmounts, summarizePayments, type PaymentRules } from '@/domain/payment';
import type { PaymentEntry } from '@/types';

let entryCounter = 0;
function entry(method: PaymentEntry['method'], amount: number, extra: Partial<PaymentEntry> = {}): PaymentEntry {
  entryCounter += 1;
  return {
    id: `p${entryCounter}`,
    method,
    provider: method === 'mobile' ? 'bkash' : method === 'card' ? 'visa' : null,
    amount,
    reference: '',
    ...extra,
  };
}

const cash = (amount: number) => entry('cash', amount);
const card = (amount: number, reference = '') => entry('card', amount, { reference });
const bkash = (amount: number, reference = '') => entry('mobile', amount, { reference });

describe('isNonCash', () => {
  it('treats everything except cash as non-cash', () => {
    expect(isNonCash('cash')).toBe(false);
    expect(isNonCash('card')).toBe(true);
    expect(isNonCash('mobile')).toBe(true);
    expect(isNonCash('points')).toBe(true);
  });
});

describe('summarizePayments', () => {
  it('accepts exact cash', () => {
    const result = summarizePayments(10_000, [cash(10_000)]);
    expect(result).toMatchObject({ due: 10_000, tendered: 10_000, cashTendered: 10_000, nonCashTendered: 0, change: 0, remaining: 0, isSufficient: true, errors: [] });
  });

  it('gives change for cash over the due', () => {
    const result = summarizePayments(10_000, [cash(15_000)]);
    expect(result.change).toBe(5_000);
    expect(result.remaining).toBe(0);
    expect(result.isSufficient).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('flags insufficient cash', () => {
    const result = summarizePayments(10_000, [cash(4_000)]);
    expect(result.remaining).toBe(6_000);
    expect(result.change).toBe(0);
    expect(result.isSufficient).toBe(false);
    expect(result.errors).toEqual(['insufficient']);
  });

  it('flags a missing payment', () => {
    const result = summarizePayments(10_000, []);
    expect(result.errors).toEqual(['noPayment']);
    expect(result.isSufficient).toBe(false);
    expect(result.remaining).toBe(10_000);
  });

  it('needs nothing for a zero due', () => {
    const result = summarizePayments(0, []);
    expect(result.errors).toEqual([]);
    expect(result.isSufficient).toBe(true);
  });

  it('splits across cash, card and bKash', () => {
    const result = summarizePayments(10_000, [card(4_000), bkash(3_000), cash(5_000)]);
    expect(result.nonCashTendered).toBe(7_000);
    expect(result.cashTendered).toBe(5_000);
    expect(result.tendered).toBe(12_000);
    expect(result.change).toBe(2_000);
    expect(result.isSufficient).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('never lets card / mobile / points exceed the due', () => {
    const overCard = summarizePayments(10_000, [card(12_000)]);
    expect(overCard.errors).toContain('nonCashExceedsDue');
    expect(overCard.isSufficient).toBe(false);

    const overMixed = summarizePayments(10_000, [card(6_000), bkash(5_000)]);
    expect(overMixed.errors).toContain('nonCashExceedsDue');
    expect(overMixed.isSufficient).toBe(false);

    const exactNonCash = summarizePayments(10_000, [card(6_000), bkash(4_000)]);
    expect(exactNonCash.isSufficient).toBe(true);
    expect(exactNonCash.change).toBe(0);
  });

  it('requires references only when configured', () => {
    expect(summarizePayments(10_000, [card(10_000)]).errors).toEqual([]);
    const rules: PaymentRules = { ...DEFAULT_PAYMENT_RULES, requireCardReference: true, requireMobileReference: true };
    expect(summarizePayments(10_000, [card(10_000, '  ')], rules).errors).toEqual(['missingReference']);
    expect(summarizePayments(10_000, [bkash(10_000)], rules).errors).toEqual(['missingReference']);
    expect(summarizePayments(10_000, [card(5_000, '4242'), bkash(5_000, 'TX9A2B')], rules).errors).toEqual([]);
    // Cash never needs a reference.
    expect(summarizePayments(10_000, [cash(10_000)], rules).errors).toEqual([]);
  });

  it('rejects invalid amounts and leaves them out of the tender', () => {
    const negative = summarizePayments(10_000, [cash(-100), cash(10_000)]);
    expect(negative.errors).toContain('invalidAmount');
    expect(negative.tendered).toBe(10_000);

    const fractional = summarizePayments(10_000, [cash(10_000.5)]);
    expect(fractional.errors).toContain('invalidAmount');
    expect(fractional.errors).toContain('noPayment');

    const zero = summarizePayments(10_000, [cash(0), cash(10_000)]);
    expect(zero.errors).toContain('invalidAmount');
  });

  it('checks loyalty points against balance and the per-sale limit', () => {
    const rules: PaymentRules = { ...DEFAULT_PAYMENT_RULES, pointsBalance: 100, pointValue: 100, maxPointsAmount: 5_000 };
    const ok = summarizePayments(10_000, [entry('points', 5_000, { points: 50 }), cash(5_000)], rules);
    expect(ok.errors).toEqual([]);
    expect(ok.isSufficient).toBe(true);

    const overLimit = summarizePayments(10_000, [entry('points', 6_000, { points: 60 }), cash(4_000)], rules);
    expect(overLimit.errors).toContain('pointsExceedLimit');

    const overBalance = summarizePayments(20_000, [entry('points', 5_000, { points: 150 }), cash(15_000)], rules);
    expect(overBalance.errors).toContain('pointsExceedBalance');

    // Points count as non-cash: they can never produce change.
    const pointsOverDue = summarizePayments(3_000, [entry('points', 4_000, { points: 40 })], { ...rules, maxPointsAmount: 10_000 });
    expect(pointsOverDue.errors).toContain('nonCashExceedsDue');
  });
});

describe('applyPayments', () => {
  it('takes change only from cash so the applied amounts equal the due', () => {
    const applied = applyPayments(10_000, [card(4_000), cash(10_000)]);
    expect(applied).toHaveLength(2);
    expect(applied[0]).toMatchObject({ method: 'card', provider: 'visa', amount: 4_000, tendered: 4_000, change: 0 });
    expect(applied[1]).toMatchObject({ method: 'cash', amount: 6_000, tendered: 10_000, change: 4_000 });
    expect(sumMoney(applied.map((payment) => payment.amount))).toBe(10_000);
  });

  it('gives change from the last cash entry backwards', () => {
    const applied = applyPayments(1_000, [cash(5_000), cash(500)]);
    expect(applied.map((payment) => payment.change)).toEqual([4_000, 500]);
    expect(applied.map((payment) => payment.amount)).toEqual([1_000, 0]);
    expect(sumMoney(applied.map((payment) => payment.amount))).toBe(1_000);

    const two = applyPayments(10_000, [cash(5_000), cash(8_000)]);
    expect(two.map((payment) => payment.amount)).toEqual([5_000, 5_000]);
    expect(two[1].change).toBe(3_000);
  });

  it('keeps non-cash entries untouched and drops empty lines', () => {
    const applied = applyPayments(10_000, [cash(0), bkash(3_000, '  TX1  '), cash(7_000)]);
    expect(applied).toHaveLength(2);
    expect(applied[0]).toMatchObject({ method: 'mobile', provider: 'bkash', amount: 3_000, change: 0, reference: 'TX1', points: 0 });
    expect(applied[1]).toMatchObject({ method: 'cash', amount: 7_000, change: 0 });
  });

  it('records redeemed points', () => {
    const applied = applyPayments(10_000, [entry('points', 2_000, { points: 20 }), cash(8_000)]);
    expect(applied[0]).toMatchObject({ method: 'points', amount: 2_000, points: 20 });
    expect(sumMoney(applied.map((payment) => payment.amount))).toBe(10_000);
  });
});

describe('suggestCashAmounts', () => {
  const NOTES = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000];

  it('suggests the next notes and round amounts above the due', () => {
    expect(suggestCashAmounts(34_550, NOTES)).toEqual([40_000, 50_000, 100_000, 200_000]);
    expect(suggestCashAmounts(4_550, NOTES)).toEqual([5_000, 10_000, 20_000, 50_000, 100_000, 200_000]);
  });

  it('includes an exactly matching note but not an equal round amount twice', () => {
    expect(suggestCashAmounts(50_000, NOTES)).toEqual([50_000, 100_000, 200_000]);
  });

  it('suggests round amounts when the due is above every note', () => {
    expect(suggestCashAmounts(250_050, NOTES)).toEqual([260_000, 300_000]);
  });

  it('returns at most six ascending suggestions', () => {
    const suggestions = suggestCashAmounts(100, [...NOTES, 500, 1_000, 2_000]);
    expect(suggestions.length).toBeLessThanOrEqual(6);
    expect([...suggestions].sort((a, b) => a - b)).toEqual(suggestions);
  });
});
