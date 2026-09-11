import { APP_CONFIG } from '@/config/app.config';
import { addDays, startOfDay, toLocalDate } from '@/domain/dates';
import { AppError } from '@/domain/errors';
import { roundQuantity } from '@/domain/money';
import { sequenceKey } from '@/domain/numbering';
import { repos } from '@/repositories';
import type { Id, InventorySummary, PageRequest, PageResult, StockAdjustmentInput, StockMovement, StockMovementFilter } from '@/types';
import { actor, ctx, requirePermission } from './context';

/* ==========================================================================
   Inventory: summary, stock ledger and adjustments (spec §35–37). Every
   change creates a stock movement; the balance is never edited directly.
   ========================================================================== */

export const inventoryService = {
  summary(): Promise<InventorySummary> {
    const days = ctx().business().inventory.expiryAlertDays;
    return repos().inventory.getSummary(toLocalDate(addDays(startOfDay(ctx().now()), days)));
  },

  stockLevels(productIds?: Id[]): Promise<Map<Id, number>> {
    return repos().inventory.getStockLevels(productIds);
  },

  movements(filter: StockMovementFilter, page: PageRequest): Promise<PageResult<StockMovement>> {
    return repos().inventory.listMovements(filter, page);
  },

  async adjust(input: StockAdjustmentInput, currentStock: number): Promise<StockMovement> {
    requirePermission('inventory.adjust');
    const quantity = roundQuantity(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new AppError('invalidQuantity');
    if (!input.reason) throw new AppError('validation');
    const signed = input.direction === 'increase' ? quantity : -quantity;
    if (signed < 0 && !ctx().business().inventory.allowNegativeStock && currentStock + signed < 0) {
      throw new AppError('stockInsufficient', { name: '', available: currentStock });
    }
    const now = ctx().now();
    return repos().inventory.adjust(
      {
        productId: input.productId,
        type: input.reason === 'damage' || input.reason === 'expired' || input.reason === 'lost' ? (signed < 0 ? 'damage' : 'adjustment') : 'adjustment',
        quantity: signed,
        reason: input.reason,
        note: input.note.trim(),
        sequenceKey: sequenceKey(APP_CONFIG.numbering.adjustmentPrefix, now),
        createdAt: now.toISOString(),
      },
      actor(),
    );
  },

  /** Moving-average unit cost per product (poisha; falls back to the purchase price). */
  averageCosts(productIds?: Id[]) {
    return repos().inventory.getAverageCosts(productIds);
  },

  /** Opening balance, stock in/out and closing balance of one product for a period. */
  movementSummary(productId: Id, range: { from?: string; to?: string }) {
    return repos().inventory.getMovementSummary(productId, range);
  },
};
