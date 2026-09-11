import type { Money } from '@/types/common';
import type { LoyaltySettings } from '@/types/settings';
import { percentOf } from './money';

/* ==========================================================================
   Loyalty points: earned on the amount paid (excluding points), redeemed
   as a payment method worth `pointValue` per point.
   ========================================================================== */

export function calculatePointsEarned(amountPaid: Money, settings: LoyaltySettings): number {
  if (!settings.enabled || amountPaid <= 0 || settings.earnStep <= 0) return 0;
  return Math.floor(amountPaid / settings.earnStep) * settings.pointsPerStep;
}

export function pointsToMoney(points: number, settings: LoyaltySettings): Money {
  return Math.max(0, Math.trunc(points)) * settings.pointValue;
}

export function moneyToPoints(amount: Money, settings: LoyaltySettings): number {
  if (settings.pointValue <= 0) return 0;
  return Math.floor(amount / settings.pointValue);
}

/** Largest money amount the customer may pay with points for a bill. */
export function maxRedeemableAmount(balance: number, due: Money, settings: LoyaltySettings): Money {
  if (!settings.enabled || balance < settings.minRedeemPoints) return 0;
  const byBalance = pointsToMoney(balance, settings);
  const byRule = percentOf(due, settings.maxRedeemRate);
  const capped = Math.min(byBalance, byRule, due);
  // Only whole points can be redeemed.
  return pointsToMoney(moneyToPoints(capped, settings), settings);
}
