// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_SETTINGS } from '@/config/defaults';
import { calculatePointsEarned, maxRedeemableAmount, moneyToPoints, pointsToMoney } from '@/domain/loyalty';
import type { LoyaltySettings } from '@/types';

// 1 point per ৳100 spent, 1 point = ৳1, redeem from 50 points, at most 50% of a bill.
const SETTINGS: LoyaltySettings = { enabled: true, pointsPerStep: 1, earnStep: 10_000, pointValue: 100, minRedeemPoints: 50, maxRedeemRate: 5_000 };

describe('loyalty defaults', () => {
  it('match the documented rule', () => {
    expect(DEFAULT_BUSINESS_SETTINGS.loyalty).toEqual(SETTINGS);
  });
});

describe('calculatePointsEarned', () => {
  it('earns whole steps of the amount paid', () => {
    expect(calculatePointsEarned(25_000, SETTINGS)).toBe(2);
    expect(calculatePointsEarned(9_999, SETTINGS)).toBe(0);
    expect(calculatePointsEarned(10_000, SETTINGS)).toBe(1);
    expect(calculatePointsEarned(25_000, { ...SETTINGS, pointsPerStep: 3 })).toBe(6);
  });

  it('earns nothing when disabled, for zero amounts or a broken step', () => {
    expect(calculatePointsEarned(25_000, { ...SETTINGS, enabled: false })).toBe(0);
    expect(calculatePointsEarned(0, SETTINGS)).toBe(0);
    expect(calculatePointsEarned(-5_000, SETTINGS)).toBe(0);
    expect(calculatePointsEarned(25_000, { ...SETTINGS, earnStep: 0 })).toBe(0);
  });
});

describe('points ⇄ money', () => {
  it('converts whole points to money', () => {
    expect(pointsToMoney(10, SETTINGS)).toBe(1_000);
    expect(pointsToMoney(10.9, SETTINGS)).toBe(1_000);
    expect(pointsToMoney(-5, SETTINGS)).toBe(0);
  });

  it('converts money to whole points', () => {
    expect(moneyToPoints(1_050, SETTINGS)).toBe(10);
    expect(moneyToPoints(99, SETTINGS)).toBe(0);
    expect(moneyToPoints(1_000, { ...SETTINGS, pointValue: 0 })).toBe(0);
  });
});

describe('maxRedeemableAmount', () => {
  it('is limited by balance, the bill share and the due', () => {
    expect(maxRedeemableAmount(200, 30_000, SETTINGS)).toBe(15_000); // 50% of the bill
    expect(maxRedeemableAmount(80, 30_000, SETTINGS)).toBe(8_000); // the balance
    expect(maxRedeemableAmount(1_000, 30_000, { ...SETTINGS, maxRedeemRate: 10_000 })).toBe(30_000); // the due
  });

  it('only redeems whole points', () => {
    expect(maxRedeemableAmount(1_000, 1_550, SETTINGS)).toBe(700); // 775 → 7 points
  });

  it('needs the minimum balance and an enabled programme', () => {
    expect(maxRedeemableAmount(49, 30_000, SETTINGS)).toBe(0);
    expect(maxRedeemableAmount(50, 30_000, SETTINGS)).toBe(5_000);
    expect(maxRedeemableAmount(200, 30_000, { ...SETTINGS, enabled: false })).toBe(0);
  });
});
