import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from '@/domain/dates';
import { authService } from '@/services/authService';
import { inventoryService } from '@/services/inventoryService';
import { customerService, supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { loadKpis } from '@/services/reportService';
import { expenseService, shiftService } from '@/services/shiftService';
import { COUNTER_ID, createServiceHarness, demoUser, errorCode, type ServiceHarness } from '../helpers/services';

/* Purchasing, stock, cash, expenses, customers, auth and reports. */

let harness: ServiceHarness;

beforeAll(async () => {
  harness = await createServiceHarness({ user: 'nusrat' });
});

beforeEach(async () => {
  harness.install();
  await harness.signIn('nusrat');
  harness.useCounter(COUNTER_ID.C03);
});

describe('purchases', () => {
  it('creates a draft, marks it ordered, receives partially then fully, and tracks supplier dues', async () => {
    const [first, second] = await harness.takeProducts(2);
    const suppliers = await supplierService.list(undefined, 'active');
    const supplier = suppliers[0];
    const stockBefore = [harness.stockOf(first.id), harness.stockOf(second.id)];
    const { id, poNo } = await purchaseService.create({
      supplierId: supplier.id,
      orderDate: toLocalDate(harness.now),
      expectedDate: null,
      note: 'Weekly order',
      status: 'draft',
      items: [
        { productId: first.id, quantity: 10, unitCost: first.purchasePrice, discountAmount: 0, taxRate: 0 },
        { productId: second.id, quantity: 4, unitCost: second.purchasePrice, discountAmount: 0, taxRate: 0 },
      ],
    });
    expect(poNo).toMatch(/^PO-\d{8}-\d{4}$/);

    let purchase = await purchaseService.getById(id);
    if (!purchase) throw new Error('purchase missing');
    expect(purchase.status).toBe('draft');
    expect(purchase.grandTotal).toBe(first.purchasePrice * 10 + second.purchasePrice * 4);
    await purchaseService.markOrdered(purchase);

    purchase = await purchaseService.getById(id);
    if (!purchase) throw new Error('purchase missing');
    const firstItem = purchase.items.find((item) => item.productId === first.id);
    const secondItem = purchase.items.find((item) => item.productId === second.id);
    if (!firstItem || !secondItem) throw new Error('items missing');

    expect(await errorCode(purchaseService.receive(purchase, [{ purchaseItemId: firstItem.id, quantity: 11 }], ''))).toBe('receiveQuantityInvalid');

    const grn = await purchaseService.receive(purchase, [{ purchaseItemId: firstItem.id, quantity: 6 }], 'First van');
    expect(grn.grnNo).toMatch(/^GRN-\d{8}-\d{4}$/);
    expect(harness.stockOf(first.id)).toBeCloseTo(stockBefore[0] + 6, 3);
    purchase = await purchaseService.getById(id);
    if (!purchase) throw new Error('purchase missing');
    expect(purchase.status).toBe('partially_received');

    await purchaseService.receive(
      purchase,
      [
        { purchaseItemId: firstItem.id, quantity: 4 },
        { purchaseItemId: secondItem.id, quantity: 4 },
      ],
      '',
    );
    purchase = await purchaseService.getById(id);
    expect(purchase?.status).toBe('received');
    expect(purchase?.receipts).toHaveLength(2);
    expect(harness.stockOf(first.id)).toBeCloseTo(stockBefore[0] + 10, 3);
    expect(harness.stockOf(second.id)).toBeCloseTo(stockBefore[1] + 4, 3);
    const ledgerRows = harness.count("SELECT COUNT(*) FROM stock_movements WHERE reference_id = ? AND type = 'purchase'", [id]);
    expect(ledgerRows).toBe(3);

    const dueBefore = (await supplierService.summaries()).get(supplier.id)?.outstanding ?? 0;
    await supplierService.pay({ supplierId: supplier.id, purchaseId: id, amount: 50_000, method: 'bank', reference: 'CHQ-1', note: '' });
    const dueAfter = (await supplierService.summaries()).get(supplier.id)?.outstanding ?? 0;
    expect(dueBefore - dueAfter).toBe(50_000);
  });

  it('cancels a draft but never a received order', async () => {
    const product = await harness.takeProduct();
    const supplier = (await supplierService.list(undefined, 'active'))[1];
    const { id } = await purchaseService.create({ supplierId: supplier.id, orderDate: toLocalDate(harness.now), expectedDate: null, note: '', status: 'ordered', items: [{ productId: product.id, quantity: 2, unitCost: product.purchasePrice, discountAmount: 0, taxRate: 0 }] });
    const purchase = await purchaseService.getById(id);
    if (!purchase) throw new Error('purchase missing');
    await purchaseService.receive(purchase, [{ purchaseItemId: purchase.items[0].id, quantity: 2 }], '');
    const received = await purchaseService.getById(id);
    if (!received) throw new Error('purchase missing');
    expect(await errorCode(purchaseService.cancel(received))).toBe('purchaseNotEditable');
  });
});

describe('stock adjustments', () => {
  it('writes a ledger row with the reason and never lets stock go negative', async () => {
    const product = await harness.takeProduct({ minStock: 3 });
    const before = harness.stockOf(product.id);
    const movement = await inventoryService.adjust({ productId: product.id, direction: 'decrease', quantity: 2, reason: 'damage', note: 'Dropped' }, before);
    expect(movement.balanceAfter).toBeCloseTo(before - 2, 3);
    expect(harness.stockOf(product.id)).toBeCloseTo(before - 2, 3);
    // Damaged, expired or lost goods are their own ledger type (spec §36: "Damage −2").
    const row = harness.one<{ reason: string; type: string }>('SELECT reason, type FROM stock_movements WHERE id = ?', [movement.id]);
    expect(row.type).toBe('damage');
    expect(row.reason).toBe('damage');
    // Other reasons (counting error, manual correction…) are plain adjustments.
    const recount = await inventoryService.adjust({ productId: product.id, direction: 'increase', quantity: 1, reason: 'counting_error', note: '' }, before - 2);
    expect(harness.one<{ type: string }>('SELECT type FROM stock_movements WHERE id = ?', [recount.id]).type).toBe('adjustment');
    expect(await errorCode(inventoryService.adjust({ productId: product.id, direction: 'decrease', quantity: before + 10, reason: 'lost', note: '' }, before - 1))).toBeTruthy();
  });

  it('requires the inventory.adjust permission', async () => {
    const product = await harness.takeProduct();
    harness.withoutPermission('inventory.adjust');
    expect(await errorCode(inventoryService.adjust({ productId: product.id, direction: 'increase', quantity: 1, reason: 'counting_error', note: '' }, harness.stockOf(product.id)))).toBe('permissionDenied');
  });
});

describe('shifts and cash', () => {
  it('opens once per counter, tracks cash in/out and closes with the expected cash', async () => {
    harness.useCounter(COUNTER_ID.C02);
    expect(await shiftService.current()).toBeNull();
    const shift = await shiftService.open(500_000, 'Morning float');
    expect(shift.shiftNo).toMatch(/^SH-\d{8}-\d{2}$/);
    expect(await errorCode(shiftService.open(100_000, ''))).toBe('shiftAlreadyOpen');

    await shiftService.cashInOut(shift, 'cash_in', 200_000, 'Change from bank', 500_000);
    await shiftService.cashInOut(shift, 'cash_out', 50_000, 'Tea for staff', 700_000);
    expect(await errorCode(shiftService.cashInOut(shift, 'cash_out', 50_000, '', 650_000))).toBe('validation');

    const totals = await shiftService.totals(shift);
    expect(totals.expectedCash).toBe(650_000);
    expect(harness.cashLedger(shift.id)).toBe(650_000);

    const closed = await shiftService.close(shift, 649_000, 'Counted twice', null);
    expect(closed.status).toBe('closed');
    expect(closed.difference).toBe(-1_000);
    expect(await shiftService.current()).toBeNull();
  });

  it('asks for approval when a cashier closes with a large difference', async () => {
    // C04 is under maintenance in the demo shop; C02 was closed by the previous test.
    harness.useCounter(COUNTER_ID.C02);
    await harness.signIn('karim');
    const shift = await shiftService.open(300_000, '');
    const limit = harness.business.shift.maxDifference;
    expect(await errorCode(shiftService.close(shift, 300_000 + limit + 100, '', null))).toBe('differenceNeedsApproval');
    const closed = await shiftService.close(shift, 300_000 + limit + 100, 'Extra note found', 'Nusrat Jahan');
    expect(closed.difference).toBe(limit + 100);
  });
});

describe('expenses', () => {
  it('pays a cash expense from the open drawer and reduces expected cash', async () => {
    const shift = await harness.openShift(COUNTER_ID.C03);
    const before = (await shiftService.totals(shift)).expectedCash;
    const [category] = await expenseService.categories();
    const expense = await expenseService.create({ categoryId: category.id, amount: 25_000, description: 'Cleaning supplies', expenseDate: toLocalDate(harness.now), paidFrom: 'cash_drawer' });
    expect(expense.expenseNo).toMatch(/^EXP-\d{8}-\d{4}$/);
    expect(expense.status).toBe('approved');
    expect((await shiftService.totals(shift)).expectedCash).toBe(before - 25_000);
  });

  it('needs an open shift for drawer expenses', async () => {
    harness.useCounter(COUNTER_ID.C02);
    const [category] = await expenseService.categories();
    expect(await errorCode(expenseService.create({ categoryId: category.id, amount: 1_000, description: 'x', expenseDate: toLocalDate(harness.now), paidFrom: 'cash_drawer' }))).toBe('shiftNotOpen');
  });
});

describe('customers', () => {
  it('validates input, rejects duplicate phones and adjusts loyalty with a ledger row', async () => {
    const customer = await customerService.create({ name: 'Test Customer', phone: '01799-000111', email: '', address: '', customerType: 'regular', discountRate: 0, notes: '' });
    expect(customer.code).toMatch(/^CUS-\d+$/);
    expect(customer.phone).toBe('01799000111');
    expect(await errorCode(customerService.create({ name: 'Other', phone: '01799000111', email: '', address: '', customerType: 'regular', discountRate: 0, notes: '' }))).toBe('duplicatePhone');
    expect(await errorCode(customerService.create({ name: '', phone: '', email: 'bad', address: '', customerType: 'regular', discountRate: 0, notes: '' }))).toBe('validation');

    const updated = await customerService.adjustPoints(customer.id, 40, 'Goodwill');
    expect(updated.loyaltyPoints).toBe(40);
    const history = await customerService.loyaltyHistory(customer.id);
    expect(history[0].type).toBe('adjust');
    expect(history[0].balanceAfter).toBe(40);
  });
});

describe('auth', () => {
  it('logs in with the right PIN, locks out after repeated failures and finds an approver', async () => {
    const karim = demoUser('karim');
    const result = await authService.login(karim.id, karim.pin);
    expect(result.user.id).toBe(karim.id);
    expect(result.permissions).toContain('pos.sell');

    const sadia = demoUser('sadia');
    const codes: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) codes.push(await errorCode(authService.login(sadia.id, '0000')));
    expect(codes[0]).toBe('loginFailed');
    expect(codes.at(-1)).toBe('lockedOut');
    expect(await errorCode(authService.login(sadia.id, sadia.pin))).toBe('lockedOut');

    expect((await authService.approve(demoUser('nusrat').pin, 'sales.cancel'))?.id).toBe(demoUser('nusrat').id);
    expect(await authService.approve(karim.pin, 'sales.cancel')).toBeNull();
  });
});

describe('reports', () => {
  it('KPIs add up to the sales in the database', async () => {
    const range = { from: new Date(harness.now.getTime() - 30 * 86_400_000).toISOString(), to: harness.now.toISOString() };
    const kpis = await loadKpis(range);
    const sql = harness.one<{ orders: number; gross: number; tax: number }>(
      "SELECT COUNT(*) AS orders, COALESCE(SUM(grand_total), 0) AS gross, COALESCE(SUM(tax_total), 0) AS tax FROM sales WHERE status <> 'cancelled' AND created_at >= ? AND created_at < ?",
      [range.from, range.to],
    );
    expect(kpis.orders).toBe(sql.orders);
    expect(kpis.grossSales).toBe(sql.gross);
    expect(kpis.taxTotal).toBe(sql.tax);
    expect(kpis.cashSales + kpis.cardSales + kpis.mobileSales + kpis.pointsSales).toBe(kpis.grossSales);
  });
});
