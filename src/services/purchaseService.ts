import { APP_CONFIG } from '@/config/app.config';
import { toLocalDate } from '@/domain/dates';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { multiplyMoney, percentOf, roundQuantity, sumMoney } from '@/domain/money';
import { sequenceKey } from '@/domain/numbering';
import { repos } from '@/repositories';
import type { PurchaseRecord, PurchaseRecordItem } from '@/repositories/types';
import type { GoodsReceipt, Id, Money, PageRequest, PageResult, Product, Purchase, PurchaseDetail, PurchaseFilter, PurchaseInput, PurchaseStatus, ReceiveLineInput } from '@/types';
import { actor, ctx, requirePermission } from './context';

/* ==========================================================================
   Purchases (spec §38): purchase orders (draft → ordered), goods receiving
   (GRN) with partial receipts, moving-average cost and stock ledger entries.
   ========================================================================== */

export interface PurchaseTotals {
  items: Array<{ subtotal: Money; discount: Money; tax: Money; total: Money }>;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  grandTotal: Money;
}

export function calculatePurchaseTotals(items: PurchaseInput['items']): PurchaseTotals {
  const lines = items.map((item) => {
    const subtotal = multiplyMoney(item.unitCost, item.quantity);
    const discount = Math.min(item.discountAmount, subtotal);
    const tax = percentOf(subtotal - discount, item.taxRate);
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  });
  return {
    items: lines,
    subtotal: sumMoney(lines.map((line) => line.subtotal)),
    discountTotal: sumMoney(lines.map((line) => line.discount)),
    taxTotal: sumMoney(lines.map((line) => line.tax)),
    grandTotal: sumMoney(lines.map((line) => line.total)),
  };
}

function toRecord(input: PurchaseInput, products: Map<Id, Product>, supplierName: string, id: Id): PurchaseRecord {
  if (input.items.length === 0) throw new AppError('validation');
  const totals = calculatePurchaseTotals(input.items);
  const items: PurchaseRecordItem[] = input.items.map((item, index) => {
    const product = products.get(item.productId);
    if (!product) throw new AppError('notFound');
    if (!(item.quantity > 0) || !Number.isSafeInteger(item.unitCost) || item.unitCost < 0) throw new AppError('validation');
    return {
      id: newId(),
      productId: item.productId,
      name: product.name,
      sku: product.sku,
      quantity: roundQuantity(item.quantity),
      unitCost: item.unitCost,
      discountAmount: totals.items[index].discount,
      taxRate: item.taxRate,
      taxAmount: totals.items[index].tax,
      lineTotal: totals.items[index].total,
    };
  });
  const now = ctx().now();
  return {
    id,
    sequenceKey: sequenceKey(APP_CONFIG.numbering.purchasePrefix, now),
    supplierId: input.supplierId,
    supplierName,
    status: input.status,
    orderDate: input.orderDate || toLocalDate(now),
    expectedDate: input.expectedDate,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
    note: input.note.trim(),
    items,
    createdAt: now.toISOString(),
  };
}

async function productMap(ids: Id[]): Promise<Map<Id, Product>> {
  const products = await Promise.all([...new Set(ids)].map((id) => repos().products.getById(id)));
  return new Map(products.filter((product): product is Product => product !== null).map((product) => [product.id, product]));
}

export const purchaseService = {
  list(filter: PurchaseFilter, page: PageRequest): Promise<PageResult<Purchase>> {
    return repos().purchases.list(filter, page);
  },
  getById(id: Id): Promise<PurchaseDetail | null> {
    return repos().purchases.getById(id);
  },
  countByStatus(): Promise<Record<PurchaseStatus, number>> {
    return repos().purchases.countByStatus();
  },
  async create(input: PurchaseInput): Promise<{ id: Id; poNo: string }> {
    requirePermission('purchases.manage');
    const supplier = await repos().suppliers.getById(input.supplierId);
    if (!supplier) throw new AppError('validation');
    const record = toRecord(input, await productMap(input.items.map((item) => item.productId)), supplier.name, newId());
    return repos().purchases.create(record, actor());
  },
  async update(id: Id, input: PurchaseInput): Promise<void> {
    requirePermission('purchases.manage');
    const supplier = await repos().suppliers.getById(input.supplierId);
    if (!supplier) throw new AppError('validation');
    const record = toRecord(input, await productMap(input.items.map((item) => item.productId)), supplier.name, id);
    await repos().purchases.update({ ...record, sequenceKey: null }, actor());
  },
  async markOrdered(purchase: Purchase): Promise<void> {
    requirePermission('purchases.manage');
    if (purchase.status !== 'draft') throw new AppError('purchaseNotEditable');
    await repos().purchases.setStatus(purchase.id, 'ordered', actor());
  },
  async cancel(purchase: Purchase): Promise<void> {
    requirePermission('purchases.manage');
    if (purchase.status !== 'draft' && purchase.status !== 'ordered') throw new AppError('purchaseNotEditable');
    await repos().purchases.setStatus(purchase.id, 'cancelled', actor());
  },
  /** Receives goods (GRN). Quantities are validated against what is still pending. */
  async receive(purchase: PurchaseDetail, lines: ReceiveLineInput[], note: string): Promise<GoodsReceipt> {
    requirePermission('purchases.receive');
    if (purchase.status !== 'ordered' && purchase.status !== 'partially_received' && purchase.status !== 'draft') throw new AppError('purchaseNotReceivable');
    const items = new Map(purchase.items.map((item) => [item.id, item]));
    const receiveLines = lines
      .filter((line) => line.quantity > 0)
      .map((line) => {
        const item = items.get(line.purchaseItemId);
        if (!item) throw new AppError('notFound');
        const pending = roundQuantity(item.quantity - item.receivedQuantity);
        const quantity = roundQuantity(line.quantity);
        if (quantity > pending + 0.0005) throw new AppError('receiveQuantityInvalid');
        return { purchaseItemId: item.id, productId: item.productId, quantity, unitCost: item.unitCost };
      });
    if (receiveLines.length === 0) throw new AppError('receiveQuantityInvalid');
    const received = new Map(receiveLines.map((line) => [line.purchaseItemId, line.quantity]));
    const complete = purchase.items.every((item) => roundQuantity(item.receivedQuantity + (received.get(item.id) ?? 0)) >= item.quantity - 0.0005);
    const now = ctx().now();
    return repos().purchases.receive(
      {
        purchaseId: purchase.id,
        poNo: purchase.poNo,
        receiptId: newId(),
        sequenceKey: sequenceKey(APP_CONFIG.numbering.receiptPrefix, now),
        receivedAt: now.toISOString(),
        note: note.trim(),
        lines: receiveLines,
        nextStatus: complete ? 'received' : 'partially_received',
      },
      actor(),
    );
  },

  /** Count, value and paid amount of the purchases matching a filter (cancelled excluded unless asked for). */
  totals(filter: PurchaseFilter) {
    return repos().purchases.totals(filter);
  },
};
