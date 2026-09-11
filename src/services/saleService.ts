import { APP_CONFIG } from '@/config/app.config';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { calculatePointsEarned } from '@/domain/loyalty';
import { roundQuantity, sumMoney } from '@/domain/money';
import { sequenceKey } from '@/domain/numbering';
import { applyPayments } from '@/domain/payment';
import { effectiveRate } from '@/domain/pricing';
import { findStockShortages } from '@/domain/stock';
import { repos } from '@/repositories';
import type { CancelSaleRecord, NewSaleRecord, SaleSort } from '@/repositories/types';
import type { CartDraft, CartTotals, Customer, Id, Language, Money, PageRequest, PageResult, PaymentEntry, Sale, SaleDetail, SaleFilter, Shift } from '@/types';
import { actor, ctx, requirePermission, terminal } from './context';
import { notificationService } from './notificationService';
import { paymentBreakdown } from './paymentService';
import { cartTotals, isValidQuantity } from './pricingService';

/* ==========================================================================
   Sale completion (spec §27). Validates, prices, takes payment, then saves
   everything in ONE database transaction (sale, items, payments, stock
   ledger, cash drawer, customer, loyalty, audit). If saving fails the cart
   is untouched; printing happens afterwards and can never undo a sale.
   ========================================================================== */

export interface CompleteSaleInput {
  draft: CartDraft;
  payments: PaymentEntry[];
  customer: Customer | null;
  language: Language;
}

export interface CompletedSale {
  saleId: Id;
  invoiceNo: string;
  totals: CartTotals;
  change: Money;
  paid: Money;
  pointsEarned: number;
  productIds: Id[];
}

export async function currentShift(): Promise<Shift | null> {
  return repos().shifts.getOpenShift(terminal().counterId);
}

export function validateCart(draft: CartDraft): void {
  if (draft.lines.length === 0) throw new AppError('cartEmpty');
  if (draft.lines.length > APP_CONFIG.pos.maxCartLines) throw new AppError('cartFull');
  for (const line of draft.lines) {
    if (!isValidQuantity(line.quantity, line.weighted)) throw new AppError('invalidQuantity');
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0) throw new AppError('invalidPrice');
  }
}

/** Throws stockInsufficient with the first problem product when stock is short. */
export async function validateStock(draft: CartDraft): Promise<void> {
  if (ctx().business().inventory.allowNegativeStock) return;
  const productIds = [...new Set(draft.lines.map((line) => line.productId))];
  const stock = await repos().inventory.getStockLevels(productIds);
  const shortages = findStockShortages(draft.lines, stock);
  if (shortages.length > 0) {
    const first = shortages[0];
    const line = draft.lines.find((entry) => entry.productId === first.productId);
    const name = line ? (ctx().language() === 'bn' ? line.name.bn : line.name.en) : '';
    throw new AppError('stockInsufficient', { name, available: first.available });
  }
}

export async function completeSale(input: CompleteSaleInput): Promise<CompletedSale> {
  requirePermission('pos.sell');
  const { draft, customer } = input;
  const business = ctx().business();

  // 1–2. Cart and stock
  validateCart(draft);
  await validateStock(draft);

  // 3–6. Totals
  const totals = cartTotals(draft, business);

  // 7. Payment
  const breakdown = paymentBreakdown(totals.grandTotal, input.payments, customer);
  if (!breakdown.isSufficient || breakdown.errors.length > 0) {
    throw new AppError(breakdown.errors.includes('insufficient') || breakdown.errors.includes('noPayment') ? 'paymentInsufficient' : 'paymentInvalid');
  }
  const applied = applyPayments(totals.grandTotal, input.payments);

  // Shift and counter
  const { counterId, branchId } = terminal();
  const shift = await currentShift();
  if (!shift && business.shift.requireOpenShift) throw new AppError('shiftNotOpen');
  const counters = await repos().counters.list();
  const counter = counters.find((entry) => entry.id === counterId);

  // Loyalty
  const pointsPayments = applied.filter((payment) => payment.method === 'points');
  const pointsRedeemed = pointsPayments.reduce((sum, payment) => sum + payment.points, 0);
  const pointsAmount = sumMoney(pointsPayments.map((payment) => payment.amount));
  const pointsEarned = customer ? calculatePointsEarned(totals.grandTotal - pointsAmount, business.loyalty) : 0;

  const methods = new Set(applied.map((payment) => payment.method));
  const now = ctx().now();
  const record: NewSaleRecord = {
    id: newId(),
    createdAt: now.toISOString(),
    sequenceKey: sequenceKey(business.sales.invoicePrefix || APP_CONFIG.numbering.invoicePrefix, now),
    branchId,
    counterId,
    counterName: counter?.name.en ?? '',
    shiftId: shift?.id ?? null,
    cashier: actor(),
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, type: customer.customerType } : null,
    language: input.language,
    currencyCode: business.currency.code,
    totals,
    lines: draft.lines.map((line, index) => ({ lineNo: index + 1, line: { ...line, quantity: roundQuantity(line.quantity) }, totals: totals.lines[index] })),
    orderDiscount: draft.orderDiscount,
    payments: applied,
    paymentSummary: methods.size > 1 ? 'split' : (applied[0]?.method ?? 'cash'),
    pointsEarned,
    pointsRedeemed,
    note: draft.note.trim(),
  };

  // 8–15. Save (transaction)
  const saved = await repos().sales.create(record);

  // Large discount alert (non-blocking)
  const rate = effectiveRate(totals.discountTotal, totals.subtotal);
  if (rate >= business.discount.largeDiscountRate && totals.discountTotal > 0) {
    void notificationService.largeDiscount(saved.invoiceNo, rate).catch(() => undefined);
  }

  return {
    saleId: saved.id,
    invoiceNo: saved.invoiceNo,
    totals,
    change: breakdown.change,
    paid: breakdown.tendered,
    pointsEarned,
    productIds: [...new Set(draft.lines.map((line) => line.productId))],
  };
}

export function getSale(id: Id): Promise<SaleDetail | null> {
  return repos().sales.getById(id);
}

export function findSaleByInvoice(invoiceNo: string): Promise<SaleDetail | null> {
  return repos().sales.findByInvoice(invoiceNo);
}

export function listSales(filter: SaleFilter, page: PageRequest, sort?: SaleSort): Promise<PageResult<Sale>> {
  const scoped: SaleFilter = ctx().can('sales.viewAll') ? filter : { ...filter, cashierId: ctx().user()?.id ?? 'none' };
  return repos().sales.list(scoped, page, sort);
}

export interface CancelCheck {
  allowed: boolean;
  reason: 'notCompleted' | 'windowExpired' | 'disabled' | null;
}

export function canCancel(sale: Sale): CancelCheck {
  const business = ctx().business();
  if (!business.sales.allowCancel) return { allowed: false, reason: 'disabled' };
  if (sale.status !== 'completed') return { allowed: false, reason: 'notCompleted' };
  const ageHours = (ctx().now().getTime() - new Date(sale.createdAt).getTime()) / 3_600_000;
  if (ageHours > business.sales.cancelWindowHours) return { allowed: false, reason: 'windowExpired' };
  return { allowed: true, reason: null };
}

/**
 * Cancels a completed sale with an audit trail: stock goes back, cash is
 * refunded from the current drawer, customer totals and points are reversed.
 * The original sale record is kept (status "cancelled").
 */
export async function cancelSale(sale: SaleDetail, reason: string, approvedBy: string | null): Promise<void> {
  const check = canCancel(sale);
  if (!check.allowed) throw new AppError(check.reason === 'windowExpired' ? 'cancelWindowExpired' : 'saleNotCancellable');
  if (!ctx().can('sales.cancel') && !approvedBy) throw new AppError('approvalRequired');
  if (!reason.trim()) throw new AppError('validation');
  const shift = await currentShift();
  const cashRefund = sumMoney(sale.payments.filter((payment) => payment.method === 'cash').map((payment) => payment.amount));
  if (cashRefund > 0 && !shift) throw new AppError('shiftNotOpen');
  const record: CancelSaleRecord = {
    saleId: sale.id,
    invoiceNo: sale.invoiceNo,
    reason: reason.trim(),
    approvedBy: approvedBy ?? ctx().user()?.name.en ?? '',
    cancelledAt: ctx().now().toISOString(),
    shiftId: shift?.id ?? null,
    counterId: shift?.counterId ?? terminal().counterId,
    cashRefund,
    pointsToReverse: sale.pointsEarned,
    pointsToRestore: sale.pointsRedeemed,
    customerId: sale.customerId,
    grandTotal: sale.grandTotal,
    lines: sale.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
  };
  await repos().sales.cancel(record, actor());
}

export async function logReprint(sale: Sale): Promise<void> {
  await repos().audit.log({ action: 'sale.reprinted', entity: 'sale', entityId: sale.id, details: { invoiceNo: sale.invoiceNo } }, actor());
}

/** Payment methods used by each sale (sales lists show the methods behind "split"). */
export function paymentMethodsForSales(saleIds: Id[]): Promise<Record<Id, Array<Exclude<Sale['paymentSummary'], 'split'>>>> {
  if (saleIds.length === 0) return Promise.resolve({});
  return repos().sales.paymentMethods(saleIds);
}
