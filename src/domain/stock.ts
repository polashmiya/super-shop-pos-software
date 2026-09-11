import type { Product, StockStatus } from '@/types/catalog';
import type { Id, IsoDate } from '@/types/common';
import type { StockMovementType } from '@/types/inventory';
import { daysBetween, parseLocalDate } from './dates';
import { roundQuantity } from './money';

/* ==========================================================================
   Stock rules. The current stock is a cached balance; the stock ledger
   (stock_movements) is the source of truth: Σ movements = balance.
   ========================================================================== */

/** Movement types that add stock (positive quantity). */
export const STOCK_IN_TYPES: readonly StockMovementType[] = ['opening', 'purchase', 'return', 'transfer_in', 'cancel'];

/** Movement types that remove stock (negative quantity). */
export const STOCK_OUT_TYPES: readonly StockMovementType[] = ['sale', 'damage', 'transfer_out'];

export function signedQuantity(type: StockMovementType, quantity: number): number {
  const magnitude = Math.abs(roundQuantity(quantity));
  if (type === 'adjustment') return roundQuantity(quantity);
  return STOCK_OUT_TYPES.includes(type) ? -magnitude : magnitude;
}

/** Replays movements onto an opening balance. */
export function applyMovements(opening: number, movements: ReadonlyArray<{ quantity: number }>): number {
  return roundQuantity(movements.reduce((balance, movement) => balance + movement.quantity, opening));
}

export function isExpiringSoon(expiryDate: IsoDate | null, withinDays: number, today: Date = new Date()): boolean {
  if (!expiryDate) return false;
  return daysBetween(today, parseLocalDate(expiryDate)) <= withinDays;
}

export function isExpired(expiryDate: IsoDate | null, today: Date = new Date()): boolean {
  if (!expiryDate) return false;
  return daysBetween(today, parseLocalDate(expiryDate)) < 0;
}

export function getStockStatus(
  product: Pick<Product, 'status' | 'stock' | 'minStock' | 'expiryDate'>,
  expiringDays: number,
  today: Date = new Date(),
): StockStatus {
  if (product.status === 'inactive') return 'inactive';
  if (product.stock <= 0) return 'out_of_stock';
  if (isExpiringSoon(product.expiryDate, expiringDays, today)) return 'expiring';
  if (product.stock <= product.minStock) return 'low_stock';
  return 'in_stock';
}

export interface StockShortage {
  productId: Id;
  requested: number;
  available: number;
}

/** Lines whose requested quantity exceeds the stock on hand (aggregated per product). */
export function findStockShortages(
  lines: ReadonlyArray<{ productId: Id; quantity: number }>,
  stock: ReadonlyMap<Id, number>,
): StockShortage[] {
  const requested = new Map<Id, number>();
  for (const line of lines) requested.set(line.productId, roundQuantity((requested.get(line.productId) ?? 0) + line.quantity));
  const shortages: StockShortage[] = [];
  for (const [productId, quantity] of requested) {
    const available = stock.get(productId) ?? 0;
    if (quantity > available) shortages.push({ productId, requested: quantity, available });
  }
  return shortages;
}

/** Moving average cost after receiving `quantity` at `unitCost`. */
export function movingAverageCost(currentQty: number, currentCost: number, quantity: number, unitCost: number): number {
  const baseQty = Math.max(0, currentQty);
  const totalQty = baseQty + quantity;
  if (totalQty <= 0) return unitCost;
  return Math.round((baseQty * currentCost + quantity * unitCost) / totalQty);
}
