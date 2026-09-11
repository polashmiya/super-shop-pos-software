import { APP_CONFIG } from '@/config/app.config';
import { daysBetween } from '@/domain/dates';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { roundQuantity, sumMoney } from '@/domain/money';
import { sequenceKey } from '@/domain/numbering';
import { calculateRefund, remainingReturnable } from '@/domain/refund';
import { repos } from '@/repositories';
import type { NewReturnLine, NewReturnRecord } from '@/repositories/types';
import type { Id, Money, PageRequest, PageResult, RefundMethod, ReturnRequestLine, SaleDetail, SaleFilter, SaleItem, SaleReturn } from '@/types';
import { actor, ctx, terminal } from './context';
import { currentShift } from './saleService';

/* ==========================================================================
   Sales returns (spec §34): partial returns, refunds proportional to what
   was paid per line (discounts and VAT included), stock restored for items
   in good condition, cash refunded from the current drawer, loyalty points
   reversed. The original sale is never modified except its return totals.
   ========================================================================== */

export interface ReturnableItem {
  item: SaleItem;
  remaining: number;
  refundedAmount: Money;
  refundedTax: Money;
}

export function returnableItems(sale: SaleDetail): ReturnableItem[] {
  return sale.items.map((item) => {
    const previous = sale.returns.flatMap((entry) => entry.items).filter((entry) => entry.saleItemId === item.id);
    return {
      item,
      remaining: remainingReturnable(item),
      refundedAmount: sumMoney(previous.map((entry) => entry.refundAmount)),
      refundedTax: sumMoney(previous.map((entry) => entry.taxAmount)),
    };
  });
}

export interface ReturnPolicy {
  returnable: boolean;
  reason: 'cancelled' | 'fullyReturned' | 'windowExpired' | null;
  /** The cashier's own window has passed; a manager must approve. */
  needsApproval: boolean;
  ageDays: number;
}

export function returnPolicy(sale: SaleDetail): ReturnPolicy {
  const business = ctx().business();
  const ageDays = daysBetween(new Date(sale.createdAt), ctx().now());
  if (sale.status === 'cancelled') return { returnable: false, reason: 'cancelled', needsApproval: false, ageDays };
  if (sale.status === 'returned' || returnableItems(sale).every((entry) => entry.remaining <= 0)) {
    return { returnable: false, reason: 'fullyReturned', needsApproval: false, ageDays };
  }
  if (ageDays > business.sales.returnWindowDays) return { returnable: false, reason: 'windowExpired', needsApproval: false, ageDays };
  const canAny = ctx().can('sales.returnAny');
  const needsApproval = !canAny && ageDays > business.sales.cashierReturnWindowDays;
  return { returnable: true, reason: null, needsApproval, ageDays };
}

export interface ReturnPreviewLine extends NewReturnLine {
  remaining: number;
}

/** Calculates refund lines for the requested quantities (used for preview and saving). */
export function previewReturn(sale: SaleDetail, request: ReturnRequestLine[]): { lines: ReturnPreviewLine[]; refundTotal: Money; taxTotal: Money } {
  const items = new Map(returnableItems(sale).map((entry) => [entry.item.id, entry]));
  const lines: ReturnPreviewLine[] = [];
  for (const requested of request) {
    const entry = items.get(requested.saleItemId);
    if (!entry || requested.quantity <= 0) continue;
    const quantity = roundQuantity(requested.quantity);
    if (quantity > entry.remaining + 0.0005) throw new AppError('returnQuantityInvalid');
    const refund = calculateRefund(
      {
        quantity: entry.item.quantity,
        lineTotal: entry.item.lineTotal,
        taxAmount: entry.item.taxAmount,
        returnedQuantity: entry.item.returnedQuantity,
        refundedAmount: entry.refundedAmount,
        refundedTax: entry.refundedTax,
      },
      quantity,
    );
    lines.push({
      saleItemId: entry.item.id,
      productId: entry.item.productId,
      name: entry.item.name,
      quantity: refund.quantity,
      unitPrice: entry.item.unitPrice,
      refund: refund.refund,
      tax: refund.tax,
      restock: requested.condition === 'good',
      condition: requested.condition,
      remaining: entry.remaining,
    });
  }
  return { lines, refundTotal: sumMoney(lines.map((line) => line.refund)), taxTotal: sumMoney(lines.map((line) => line.tax)) };
}

export interface CreateReturnInput {
  sale: SaleDetail;
  lines: ReturnRequestLine[];
  reason: string;
  refundMethod: RefundMethod;
  note: string;
  approvedBy: string | null;
}

export async function createReturn(input: CreateReturnInput): Promise<SaleReturn> {
  if (!ctx().can('sales.return') && !input.approvedBy) throw new AppError('permissionDenied');
  const policy = returnPolicy(input.sale);
  if (!policy.returnable) throw new AppError(policy.reason === 'windowExpired' ? 'returnWindowExpired' : 'saleNotReturnable');
  if (policy.needsApproval && !input.approvedBy) throw new AppError('approvalRequired');
  if (!input.reason.trim()) throw new AppError('validation');

  const preview = previewReturn(input.sale, input.lines);
  if (preview.lines.length === 0) throw new AppError('returnQuantityInvalid');

  const shift = await currentShift();
  if (input.refundMethod === 'cash' && !shift) throw new AppError('shiftNotOpen');

  const sale = input.sale;
  const pointsReversed =
    sale.customerId && sale.pointsEarned > 0 && sale.grandTotal > 0
      ? Math.min(sale.pointsEarned, Math.floor((sale.pointsEarned * preview.refundTotal) / sale.grandTotal))
      : 0;
  const now = ctx().now();
  const record: NewReturnRecord = {
    id: newId(),
    createdAt: now.toISOString(),
    sequenceKey: sequenceKey(APP_CONFIG.numbering.returnPrefix, now),
    saleId: sale.id,
    invoiceNo: sale.invoiceNo,
    shiftId: shift?.id ?? null,
    counterId: shift?.counterId ?? terminal().counterId,
    cashier: actor(),
    customerId: sale.customerId,
    reason: input.reason.trim(),
    refundMethod: input.refundMethod,
    refundTotal: preview.refundTotal,
    taxTotal: preview.taxTotal,
    approvedBy: input.approvedBy,
    note: input.note.trim(),
    lines: preview.lines.map(({ remaining: _remaining, ...line }) => line),
    pointsReversed,
  };
  return repos().sales.createReturn(record);
}

export function listReturns(filter: SaleFilter, page: PageRequest): Promise<PageResult<SaleReturn>> {
  return repos().sales.listReturns(filter, page);
}

export function affectedProducts(result: SaleReturn): Id[] {
  return [...new Set(result.items.map((item) => item.productId))];
}
