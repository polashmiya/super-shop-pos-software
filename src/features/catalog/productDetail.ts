import { daysBetween, parseLocalDate, resolvePeriod } from '@/domain/dates';
import { roundQuantity } from '@/domain/money';
import type { IsoDate, IsoDateTime, Product } from '@/types';
import type { Tone } from '@/components/ui/Display';

/* ==========================================================================
   Pure helpers for the product detail screen (stock plan, expiry, periods).
   ========================================================================== */

export interface StockPlan {
  /** Meter fill 0–1: stock relative to the maximum (or to twice the minimum without one). */
  fill: number;
  tone: Tone;
  out: boolean;
  /** At or below the minimum stock. */
  low: boolean;
  hasMax: boolean;
  /** Quantity that brings the stock back up to the maximum (0 when not needed). */
  reorder: number;
}

export function stockPlan(product: Pick<Product, 'stock' | 'minStock' | 'maxStock'>): StockPlan {
  const stock = Math.max(0, product.stock);
  const hasMax = product.maxStock > 0;
  const scale = hasMax ? product.maxStock : Math.max(product.minStock * 2, stock, 1);
  const out = product.stock <= 0;
  const low = product.stock <= product.minStock;
  return {
    fill: Math.min(1, stock / scale),
    tone: out ? 'danger' : low ? 'warning' : 'success',
    out,
    low,
    hasMax,
    reorder: hasMax && product.stock < product.maxStock ? roundQuantity(product.maxStock - product.stock) : 0,
  };
}

export interface ExpiryInfo {
  /** Days from today until the expiry date (negative = already expired). */
  days: number;
  expired: boolean;
  tone: Tone;
}

export function expiryInfo(expiryDate: IsoDate | null, expiringDays: number, today: Date = new Date()): ExpiryInfo | null {
  if (!expiryDate) return null;
  const days = daysBetween(today, parseLocalDate(expiryDate));
  return { days, expired: days < 0, tone: days < 0 ? 'danger' : days <= expiringDays ? 'warning' : 'neutral' };
}

/** Start of the "last 30 days" window (today included), the same as the reports period. */
export function last30DaysStart(): IsoDateTime {
  return resolvePeriod('last_30_days').from;
}
