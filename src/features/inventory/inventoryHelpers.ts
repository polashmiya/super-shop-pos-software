import {
  Ban,
  Calculator,
  CalendarX,
  Ellipsis,
  Flag,
  PackageX,
  PencilLine,
  SearchX,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Undo2,
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
} from 'lucide-react';
import { roundQuantity } from '@/domain/money';
import { getStockStatus, isExpiringSoon } from '@/domain/stock';
import type { AdjustmentReason, Id, Product, StockMovement, StockMovementType, StockStatus, Unit } from '@/types';
import type { Tone } from '@/components/ui/Display';

/* ==========================================================================
   Inventory helpers shared by the inventory list, stock ledger, adjustment
   dialog and purchase screens (pure functions — no React).
   ========================================================================== */

export const MOVEMENT_TYPES: readonly StockMovementType[] = ['opening', 'purchase', 'sale', 'return', 'damage', 'adjustment', 'transfer_in', 'transfer_out', 'cancel'];

export const ADJUSTMENT_REASONS: readonly AdjustmentReason[] = ['damage', 'lost', 'expired', 'counting_error', 'manual_correction', 'other'];

/** Stock status filter values offered on the inventory screen (URL `?status=`). */
export const STOCK_FILTERS = ['all', 'in_stock', 'low_stock', 'out_of_stock', 'expiring', 'inactive'] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export function parseStockFilter(value: string | null): StockFilter {
  return STOCK_FILTERS.includes(value as StockFilter) ? (value as StockFilter) : 'all';
}

/** Movement type → colour + icon (always rendered with its text label). */
export function movementBadge(type: StockMovementType): { tone: Tone; icon: LucideIcon } {
  switch (type) {
    case 'purchase':
      return { tone: 'success', icon: Truck };
    case 'sale':
      return { tone: 'primary', icon: ShoppingBag };
    case 'return':
      return { tone: 'info', icon: Undo2 };
    case 'damage':
      return { tone: 'danger', icon: PackageX };
    case 'adjustment':
      return { tone: 'warning', icon: SlidersHorizontal };
    case 'transfer_in':
      return { tone: 'info', icon: ArrowDownToLine };
    case 'transfer_out':
      return { tone: 'neutral', icon: ArrowUpFromLine };
    case 'cancel':
      return { tone: 'neutral', icon: Ban };
    case 'opening':
    default:
      return { tone: 'neutral', icon: Flag };
  }
}

export const REASON_ICONS: Record<AdjustmentReason, LucideIcon> = {
  damage: PackageX,
  lost: SearchX,
  expired: CalendarX,
  counting_error: Calculator,
  manual_correction: PencilLine,
  other: Ellipsis,
};

/** Route of the document behind a ledger entry (sale invoice or purchase order), if it has a screen. */
export function movementLink(movement: Pick<StockMovement, 'referenceType' | 'referenceId'>): string | null {
  if (!movement.referenceId) return null;
  if (movement.referenceType === 'sale') return `/sales/${movement.referenceId}`;
  if (movement.referenceType === 'purchase') return `/purchases/${movement.referenceId}`;
  return null;
}

/** Fractional quantities are allowed for weighed products and decimal units (kg, litre…). */
export function allowsDecimal(product: Pick<Product, 'weighted'>, unit: Pick<Unit, 'allowDecimal'> | undefined): boolean {
  return product.weighted || Boolean(unit?.allowDecimal);
}

/** Quantity that brings a product back up to its maximum (or twice the minimum when no maximum is set). */
export function reorderQuantity(product: Pick<Product, 'stock' | 'minStock' | 'maxStock'>, decimals: boolean): number {
  const stock = Math.max(0, product.stock);
  const target = product.maxStock > 0 ? product.maxStock : Math.max(product.minStock * 2, product.minStock + 1);
  const needed = Math.max(target - stock, 1);
  return decimals ? roundQuantity(needed) : Math.ceil(needed);
}

/**
 * Filter semantics match the inventory summary counts exactly: a product that
 * is both low and expiring appears in both lists.
 */
export function matchesStockFilter(product: Pick<Product, 'status' | 'stock' | 'minStock' | 'expiryDate'>, filter: StockFilter, expiringDays: number, today: Date): boolean {
  if (filter === 'all') return true;
  if (filter === 'inactive') return product.status === 'inactive';
  if (product.status !== 'active') return false;
  switch (filter) {
    case 'in_stock':
      return product.stock > product.minStock;
    case 'low_stock':
      return product.stock > 0 && product.stock <= product.minStock;
    case 'out_of_stock':
      return product.stock <= 0;
    case 'expiring':
      return product.stock > 0 && isExpiringSoon(product.expiryDate, expiringDays, today);
    default:
      return true;
  }
}

/** Stock status of every product (badge), computed once per render pass. */
export function stockStatuses(products: readonly Product[], expiringDays: number, today: Date): Map<Id, StockStatus> {
  return new Map(products.map((product) => [product.id, getStockStatus(product, expiringDays, today)]));
}
