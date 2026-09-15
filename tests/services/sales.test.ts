// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cartTotals } from '@/services/pricingService';
import { cancelSale, canCancel, completeSale, getSale } from '@/services/saleService';
import { createReturn, previewReturn, returnPolicy } from '@/services/returnService';
import { deleteHeldSale, holdSale, listHeldSales, recallHeldSale } from '@/services/heldSaleService';
import { cartOf, createServiceHarness, errorCode, payCard, payCash, payMobile, takeCustomer, type ServiceHarness } from '../helpers/services';

/* Sale completion, cancellation, returns and held sales against a seeded DB. */

let harness: ServiceHarness;

beforeAll(async () => {
  harness = await createServiceHarness({ user: 'karim' });
});

beforeEach(async () => {
  harness.install();
  await harness.signIn('karim');
  harness.business = structuredClone(harness.business);
});

describe('completeSale', () => {
  it('saves a cash sale with change, stock ledger, cash drawer and audit in one go', async () => {
    const [first, second] = await harness.takeProducts(2);
    const stockBefore = [harness.stockOf(first.id), harness.stockOf(second.id)];
    const shift = await harness.openShift();
    const cashBefore = harness.cashLedger(shift.id);
    const draft = cartOf([
      [first, 2],
      [second, 1],
    ]);
    const due = cartTotals(draft, harness.business).grandTotal;
    const tendered = Math.ceil(due / 100_000) * 100_000 + 50_000;

    const result = await completeSale({ draft, payments: [payCash(tendered)], customer: null, language: 'bn' });

    expect(result.invoiceNo).toMatch(/^INV-\d{8}-\d{4}$/);
    expect(result.change).toBe(tendered - due);
    expect(harness.stockOf(first.id)).toBeCloseTo(stockBefore[0] - 2, 3);
    expect(harness.stockOf(second.id)).toBeCloseTo(stockBefore[1] - 1, 3);

    const movements = harness.query<{ product_id: string; quantity: number; balance_after: number }>("SELECT product_id, quantity, balance_after FROM stock_movements WHERE reference_id = ? AND type = 'sale'", [result.saleId]);
    expect(movements).toHaveLength(2);
    for (const movement of movements) expect(movement.balance_after).toBeCloseTo(harness.stockOf(movement.product_id), 3);

    // Only the amount due goes into the drawer (tendered in, change out).
    expect(harness.cashLedger(shift.id) - cashBefore).toBe(due);
    expect(harness.count("SELECT COUNT(*) FROM audit_logs WHERE entity_id = ? AND action = 'sale.completed'", [result.saleId])).toBe(1);

    const sale = await getSale(result.saleId);
    expect(sale?.grandTotal).toBe(due);
    expect(sale?.changeDue).toBe(tendered - due);
    expect(sale?.language).toBe('bn');
    expect(sale?.items).toHaveLength(2);
  });

  it('gives sequential, unique invoice numbers', async () => {
    const product = await harness.takeProduct({ minStock: 10 });
    const numbers: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const draft = cartOf([[product, 1]]);
      const due = cartTotals(draft, harness.business).grandTotal;
      numbers.push((await completeSale({ draft, payments: [payCash(due)], customer: null, language: 'en' })).invoiceNo);
    }
    const sequence = numbers.map((value) => Number(value.slice(-4)));
    expect(new Set(numbers).size).toBe(3);
    expect(sequence[1] - sequence[0]).toBe(1);
    expect(sequence[2] - sequence[1]).toBe(1);
  });

  it('accepts a split payment (cash + card + bKash) and records every method', async () => {
    const product = await harness.takeProduct({ minStock: 5 });
    const draft = cartOf([[product, 3]]);
    const due = cartTotals(draft, harness.business).grandTotal;
    const card = Math.floor(due / 3);
    const mobile = Math.floor(due / 3);
    const cash = due - card - mobile;
    const result = await completeSale({ draft, payments: [payCash(cash), payCard(card), payMobile(mobile, 'bkash')], customer: null, language: 'bn' });
    const sale = await getSale(result.saleId);
    expect(sale?.paymentSummary).toBe('split');
    expect(sale?.payments.map((payment) => payment.method).sort()).toEqual(['card', 'cash', 'mobile']);
    expect(sale?.payments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(due);
  });

  it('rejects an insufficient payment and leaves stock untouched', async () => {
    const product = await harness.takeProduct();
    const before = harness.stockOf(product.id);
    const draft = cartOf([[product, 1]]);
    const due = cartTotals(draft, harness.business).grandTotal;
    expect(await errorCode(completeSale({ draft, payments: [payCash(due - 100)], customer: null, language: 'bn' }))).toBe('paymentInsufficient');
    expect(harness.stockOf(product.id)).toBe(before);
  });

  it('refuses to sell more than the stock unless negative stock is allowed', async () => {
    const product = await harness.takeProduct({ minStock: 3 });
    const draft = cartOf([[product, harness.stockOf(product.id) + 5]]);
    const due = cartTotals(draft, harness.business).grandTotal;
    expect(await errorCode(completeSale({ draft, payments: [payCash(due)], customer: null, language: 'bn' }))).toBe('stockInsufficient');
  });

  it('earns loyalty points for a customer and updates their totals', async () => {
    const customer = await takeCustomer(harness);
    const product = await harness.takeProduct({ minStock: 5 });
    const draft = cartOf([[product, 4]], { customerId: customer.id });
    const due = cartTotals(draft, harness.business).grandTotal;
    const result = await completeSale({ draft, payments: [payCash(due)], customer, language: 'bn' });
    const expectedPoints = Math.floor(due / harness.business.loyalty.earnStep) * harness.business.loyalty.pointsPerStep;
    expect(result.pointsEarned).toBe(expectedPoints);
    const updated = await harness.repos.customers.getById(customer.id);
    expect(updated?.loyaltyPoints).toBe(customer.loyaltyPoints + expectedPoints);
    expect(updated?.totalOrders).toBe(customer.totalOrders + 1);
    expect(updated?.totalSpent).toBe(customer.totalSpent + due);
  });

  it('needs the pos.sell permission', async () => {
    harness.withoutPermission('pos.sell');
    const product = await harness.takeProduct();
    const draft = cartOf([[product, 1]]);
    expect(await errorCode(completeSale({ draft, payments: [payCash(10_000_00)], customer: null, language: 'bn' }))).toBe('permissionDenied');
  });
});

describe('cancelSale', () => {
  it('restores stock and reverses cash, and needs approval for a cashier without permission', async () => {
    const product = await harness.takeProduct({ minStock: 5 });
    const shift = await harness.openShift();
    const before = harness.stockOf(product.id);
    const draft = cartOf([[product, 2]]);
    const due = cartTotals(draft, harness.business).grandTotal;
    const { saleId } = await completeSale({ draft, payments: [payCash(due)], customer: null, language: 'bn' });
    const cashAfterSale = harness.cashLedger(shift.id);
    const sale = await getSale(saleId);
    if (!sale) throw new Error('sale missing');
    expect(canCancel(sale).allowed).toBe(true);

    harness.withoutPermission('sales.cancel');
    expect(await errorCode(cancelSale(sale, 'Wrong items', null))).toBe('approvalRequired');

    await cancelSale(sale, 'Wrong items', 'Nusrat Jahan');
    const cancelled = await getSale(saleId);
    expect(cancelled?.status).toBe('cancelled');
    expect(harness.stockOf(product.id)).toBeCloseTo(before, 3);
    expect(harness.cashLedger(shift.id)).toBe(cashAfterSale - due);
  });
});

describe('returns', () => {
  it('refunds a partial return proportionally, restocks good items only and blocks over-returns', async () => {
    const [good, damaged] = await harness.takeProducts(2, { minStock: 6 });
    const draft = cartOf([
      [good, 4],
      [damaged, 2],
    ]);
    const due = cartTotals(draft, harness.business).grandTotal;
    const { saleId } = await completeSale({ draft, payments: [payCash(due)], customer: null, language: 'bn' });
    const sale = await getSale(saleId);
    if (!sale) throw new Error('sale missing');
    const goodItem = sale.items.find((item) => item.productId === good.id);
    const damagedItem = sale.items.find((item) => item.productId === damaged.id);
    if (!goodItem || !damagedItem) throw new Error('items missing');
    const goodStock = harness.stockOf(good.id);
    const damagedStock = harness.stockOf(damaged.id);

    expect(returnPolicy(sale).returnable).toBe(true);
    const request = [
      { saleItemId: goodItem.id, quantity: 1, condition: 'good' as const },
      { saleItemId: damagedItem.id, quantity: 1, condition: 'damaged' as const },
    ];
    const preview = previewReturn(sale, request);
    expect(preview.lines.find((line) => line.saleItemId === goodItem.id)?.refund).toBe(Math.round(goodItem.lineTotal / 4));

    const saved = await createReturn({ sale, lines: request, reason: 'Packet torn', refundMethod: 'cash', note: '', approvedBy: null });
    expect(saved.returnNo).toMatch(/^RET-\d{8}-\d{4}$/);
    expect(saved.refundTotal).toBe(preview.refundTotal);
    expect(harness.stockOf(good.id)).toBeCloseTo(goodStock + 1, 3);
    expect(harness.stockOf(damaged.id)).toBeCloseTo(damagedStock, 3);

    const after = await getSale(saleId);
    if (!after) throw new Error('sale missing');
    expect(after.status).toBe('partially_returned');
    expect(after.returnedTotal).toBe(saved.refundTotal);
    expect(() => previewReturn(after, [{ saleItemId: damagedItem.id, quantity: 2, condition: 'good' }])).toThrow();

    // Returning everything left makes the sale fully returned, and the refunds add up to what was paid.
    await createReturn({
      sale: after,
      lines: [
        { saleItemId: goodItem.id, quantity: 3, condition: 'good' },
        { saleItemId: damagedItem.id, quantity: 1, condition: 'good' },
      ],
      reason: 'Customer returned all',
      refundMethod: 'cash',
      note: '',
      approvedBy: null,
    });
    const final = await getSale(saleId);
    expect(final?.status).toBe('returned');
    expect(final?.returnedTotal).toBe(due);
    expect(returnPolicy(final ?? after).returnable).toBe(false);
  });
});

describe('held sales', () => {
  it('holds, recalls (removing it from the list) and deletes carts', async () => {
    const [first, second] = await harness.takeProducts(2);
    const held = await holdSale(cartOf([[first, 2]], { note: 'Customer went to ATM' }), null, 'ATM');
    const other = await holdSale(cartOf([[second, 1]]), null, 'Later');
    expect((await listHeldSales()).map((entry) => entry.id)).toEqual(expect.arrayContaining([held.id, other.id]));

    const recalled = await recallHeldSale(held);
    expect(recalled.lines[0].productId).toBe(first.id);
    expect(recalled.lines[0].quantity).toBe(2);
    expect(recalled.note).toBe('Customer went to ATM');
    expect((await listHeldSales()).some((entry) => entry.id === held.id)).toBe(false);

    await deleteHeldSale(other.id);
    expect((await listHeldSales()).some((entry) => entry.id === other.id)).toBe(false);
  });
});
