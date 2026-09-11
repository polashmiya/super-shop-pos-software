import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { escapeLike } from '@/domain/text';
import type { HeldSale, Id, PageRequest, PageResult, Sale, SaleDetail, SaleFilter, SaleReturn } from '@/types';
import type { SqlClient, SqlRow, SqlStatement } from '@/types/database';
import type { Actor, CancelSaleRecord, HeldSaleRepository, NewReturnRecord, NewSaleRecord, SaleRepository, SaleSort } from '../types';
import { mapHeldSale, mapPayment, mapReturn, mapReturnItem, mapSale, mapSaleItem } from './mappers';
import { Where, bool, limitOffset, placeholders, toNum, toStr } from './sql';
import { auditStatement, cashMovementStatement, loyaltyStatements, sequenceIncrement, sequenceValue, stockChangeStatements } from './statements';

/* ==========================================================================
   Sales, returns and held carts on SQLite. A completed sale is written in ONE
   transaction: number, sale, items, payments, stock ledger, cash drawer,
   customer totals, loyalty and audit — all or nothing.
   ========================================================================== */

const SORT_COLUMNS: Record<SaleSort['field'], string> = {
  createdAt: 's.created_at',
  grandTotal: 's.grand_total',
  invoiceNo: 's.invoice_no',
  itemCount: 's.item_count',
};

function invoiceOf(saleId: Id): { sql: string; params: string[] } {
  return { sql: '(SELECT invoice_no FROM sales WHERE id = ?)', params: [saleId] };
}

export class LocalSaleRepository implements SaleRepository {
  constructor(private readonly sql: SqlClient) {}

  async create(record: NewSaleRecord): Promise<{ id: Id; invoiceNo: string }> {
    const { totals } = record;
    const invoice = sequenceValue(record.sequenceKey);
    const saleInvoice = invoiceOf(record.id);
    const statements: SqlStatement[] = [sequenceIncrement(record.sequenceKey)];

    statements.push({
      sql: `INSERT INTO sales (id, invoice_no, branch_id, counter_id, counter_name, shift_id, cashier_id, cashier_name, customer_id, customer_name, customer_phone,
              customer_type, status, language, currency_code, item_count, total_quantity, subtotal, item_discount_total, order_discount_total, discount_total,
              discount_reason, discount_approved_by, tax_total, tax_mode, rounding_adjustment, grand_total, paid_total, change_due, returned_total, points_earned,
              points_redeemed, payment_summary, note, created_at, updated_at, version, sync_status)
            VALUES (?, ${invoice.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, 'local')`,
      params: [
        record.id,
        ...invoice.params,
        record.branchId,
        record.counterId,
        record.counterName,
        record.shiftId,
        record.cashier.id,
        record.cashier.name,
        record.customer?.id ?? null,
        record.customer?.name ?? '',
        record.customer?.phone ?? '',
        record.customer?.type ?? null,
        record.language,
        record.currencyCode,
        totals.itemCount,
        Math.round(totals.totalQuantity * 1000) / 1000,
        totals.subtotal,
        totals.itemDiscountTotal,
        totals.orderDiscountTotal,
        totals.discountTotal,
        record.orderDiscount?.reason ?? '',
        record.orderDiscount?.approvedBy ?? null,
        totals.taxTotal,
        totals.taxMode,
        totals.roundingAdjustment,
        totals.grandTotal,
        record.payments.reduce((sum, payment) => sum + payment.tendered, 0),
        record.payments.reduce((sum, payment) => sum + payment.change, 0),
        record.pointsEarned,
        record.pointsRedeemed,
        record.paymentSummary,
        record.note,
        record.createdAt,
        record.createdAt,
      ],
    });

    for (const { lineNo, line, totals: lineTotals } of record.lines) {
      statements.push({
        sql: `INSERT INTO sale_items (id, sale_id, line_no, product_id, sku, barcode, name_bn, name_en, unit_id, quantity, unit_price, original_price, mrp, cost_price,
                discount_type, discount_value, discount_amount, order_discount_amount, tax_rate, tax_amount, line_subtotal, line_total, returned_quantity, note,
                price_overridden, override_by, override_reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        params: [
          newId(),
          record.id,
          lineNo,
          line.productId,
          line.sku,
          line.barcode,
          line.name.bn,
          line.name.en,
          line.unitId,
          line.quantity,
          line.unitPrice,
          line.originalPrice,
          line.mrp,
          line.costPrice,
          line.discount?.type ?? null,
          line.discount?.value ?? 0,
          lineTotals.itemDiscount,
          lineTotals.orderDiscount,
          line.taxRate,
          lineTotals.tax,
          lineTotals.subtotal,
          lineTotals.total,
          line.note,
          bool(line.priceOverride !== null),
          line.priceOverride?.byName ?? null,
          line.priceOverride?.reason ?? '',
        ],
      });
      statements.push(
        ...stockChangeStatements(
          {
            productId: line.productId,
            type: 'sale',
            quantity: -line.quantity,
            unitCost: line.costPrice,
            referenceType: 'sale',
            referenceId: record.id,
            referenceNo: null,
            referenceNoSql: saleInvoice,
            createdAt: record.createdAt,
          },
          record.cashier,
        ),
      );
    }

    let cashApplied = 0;
    for (const payment of record.payments) {
      statements.push({
        sql: `INSERT INTO payments (id, sale_id, shift_id, counter_id, method, provider, amount, tendered, change_amount, reference, points, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newId(),
          record.id,
          record.shiftId,
          record.counterId,
          payment.method,
          payment.provider,
          payment.amount,
          payment.tendered,
          payment.change,
          payment.reference,
          payment.points,
          record.createdAt,
        ],
      });
      if (payment.method === 'cash') cashApplied += payment.amount;
    }

    if (record.shiftId && cashApplied > 0) {
      statements.push(
        cashMovementStatement(
          {
            shiftId: record.shiftId,
            counterId: record.counterId,
            type: 'sale',
            amount: cashApplied,
            referenceType: 'sale',
            referenceId: record.id,
            referenceNo: null,
            referenceNoSql: saleInvoice,
            createdAt: record.createdAt,
          },
          record.cashier,
        ),
      );
    }

    if (record.customer) {
      statements.push({
        sql: 'UPDATE customers SET total_spent = total_spent + ?, total_orders = total_orders + 1, last_purchase_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        params: [totals.grandTotal, record.createdAt, record.createdAt, record.customer.id],
      });
      if (record.pointsRedeemed > 0) {
        statements.push(
          ...loyaltyStatements(
            { customerId: record.customer.id, type: 'redeem', points: -record.pointsRedeemed, saleId: record.id, invoiceNo: null, invoiceNoSql: saleInvoice, note: '', createdAt: record.createdAt },
            record.cashier,
          ),
        );
      }
      if (record.pointsEarned > 0) {
        statements.push(
          ...loyaltyStatements(
            { customerId: record.customer.id, type: 'earn', points: record.pointsEarned, saleId: record.id, invoiceNo: null, invoiceNoSql: saleInvoice, note: '', createdAt: record.createdAt },
            record.cashier,
          ),
        );
      }
    }

    statements.push(auditStatement(record.cashier, 'sale.completed', 'sale', record.id, { total: totals.grandTotal, items: totals.itemCount }, record.createdAt));
    if (record.orderDiscount?.source === 'manual' || record.lines.some(({ line }) => line.discountSource === 'manual')) {
      statements.push(
        auditStatement(
          record.cashier,
          'discount.applied',
          'sale',
          record.id,
          { amount: totals.discountTotal, reason: record.orderDiscount?.reason ?? '', approvedBy: record.orderDiscount?.approvedBy ?? null },
          record.createdAt,
        ),
      );
    }
    for (const { line } of record.lines) {
      if (line.priceOverride) {
        statements.push(
          auditStatement(
            record.cashier,
            'price.overridden',
            'product',
            line.productId,
            { saleId: record.id, from: line.originalPrice, to: line.unitPrice, by: line.priceOverride.byName, reason: line.priceOverride.reason },
            record.createdAt,
          ),
        );
      }
    }
    statements.push({ sql: 'SELECT invoice_no FROM sales WHERE id = ?', params: [record.id], mode: 'get' });

    const results = await this.sql.transaction(statements);
    const last = results[results.length - 1] as SqlRow | null;
    const invoiceNo = toStr(last?.invoice_no);
    if (!invoiceNo) throw new AppError('saveFailed');
    return { id: record.id, invoiceNo };
  }

  private async detail(row: SqlRow): Promise<SaleDetail> {
    const sale = mapSale(row);
    const [items, payments, returns, returnItems] = await Promise.all([
      this.sql.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY line_no', [sale.id]),
      this.sql.all('SELECT * FROM payments WHERE sale_id = ? ORDER BY created_at, rowid', [sale.id]),
      this.sql.all('SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at', [sale.id]),
      this.sql.all('SELECT ri.* FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE r.sale_id = ?', [sale.id]),
    ]);
    const itemsByReturn = new Map<string, SaleReturn['items']>();
    for (const item of returnItems.map(mapReturnItem)) {
      const list = itemsByReturn.get(item.returnId) ?? [];
      list.push(item);
      itemsByReturn.set(item.returnId, list);
    }
    return {
      ...sale,
      items: items.map(mapSaleItem),
      payments: payments.map(mapPayment),
      returns: returns.map((entry) => {
        const mapped = mapReturn(entry);
        return { ...mapped, items: itemsByReturn.get(mapped.id) ?? [] };
      }),
    };
  }

  async getById(id: Id): Promise<SaleDetail | null> {
    const row = await this.sql.get('SELECT * FROM sales WHERE id = ?', [id]);
    return row ? this.detail(row) : null;
  }

  async findByInvoice(invoiceNo: string): Promise<SaleDetail | null> {
    const row = await this.sql.get('SELECT * FROM sales WHERE invoice_no = ? COLLATE NOCASE', [invoiceNo.trim()]);
    return row ? this.detail(row) : null;
  }

  private filterWhere(filter: SaleFilter): Where {
    const where = new Where()
      .when(filter.from, 's.created_at >= ?', filter.from ?? null)
      .when(filter.to, 's.created_at < ?', filter.to ?? null)
      .when(filter.status && filter.status !== 'all', 's.status = ?', filter.status ?? null)
      .when(filter.cashierId && filter.cashierId !== 'all', 's.cashier_id = ?', filter.cashierId ?? null)
      .when(filter.counterId && filter.counterId !== 'all', 's.counter_id = ?', filter.counterId ?? null)
      .when(filter.customerId, 's.customer_id = ?', filter.customerId ?? null)
      .when(filter.shiftId, 's.shift_id = ?', filter.shiftId ?? null)
      .when(filter.paymentMethod && filter.paymentMethod !== 'all', 'EXISTS (SELECT 1 FROM payments pm WHERE pm.sale_id = s.id AND pm.method = ?)', filter.paymentMethod ?? null);
    const search = filter.search?.trim();
    if (search) {
      const like = `%${escapeLike(search.toLowerCase())}%`;
      where.add(
        `(LOWER(s.invoice_no) LIKE ? ESCAPE '\\' OR LOWER(s.customer_name) LIKE ? ESCAPE '\\' OR s.customer_phone LIKE ? ESCAPE '\\' OR LOWER(s.cashier_name) LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND (si.barcode = ? OR LOWER(si.sku) = ? OR LOWER(si.name_en) LIKE ? ESCAPE '\\' OR si.name_bn LIKE ? ESCAPE '\\')))`,
        like,
        like,
        like,
        like,
        search,
        search.toLowerCase(),
        like,
        `%${escapeLike(search)}%`,
      );
    }
    return where;
  }

  async list(filter: SaleFilter, page: PageRequest, sort: SaleSort = { field: 'createdAt', direction: 'desc' }): Promise<PageResult<Sale>> {
    const where = this.filterWhere(filter);
    const limit = limitOffset(page.page, page.pageSize);
    const order = `${SORT_COLUMNS[sort.field] ?? 's.created_at'} ${sort.direction === 'asc' ? 'ASC' : 'DESC'}`;
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM sales s ${where}`, where.params),
      this.sql.all(`SELECT s.* FROM sales s ${where} ORDER BY ${order}, s.rowid DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapSale), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async searchInvoices(query: string, limit: number): Promise<Sale[]> {
    const like = `%${escapeLike(query.trim().toUpperCase())}%`;
    const rows = await this.sql.all(
      `SELECT * FROM sales WHERE UPPER(invoice_no) LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`,
      [like, like, limit],
    );
    return rows.map(mapSale);
  }

  async cancel(record: CancelSaleRecord, actor: Actor): Promise<void> {
    const statements: SqlStatement[] = [
      {
        sql: "UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'completed'",
        params: [record.cancelledAt, record.approvedBy, record.reason, record.cancelledAt, record.saleId],
      },
    ];
    for (const line of record.lines) {
      statements.push(
        ...stockChangeStatements(
          {
            productId: line.productId,
            type: 'cancel',
            quantity: line.quantity,
            unitCost: 0,
            referenceType: 'sale',
            referenceId: record.saleId,
            referenceNo: record.invoiceNo,
            note: record.reason,
            createdAt: record.cancelledAt,
          },
          actor,
        ),
      );
    }
    if (record.shiftId && record.cashRefund > 0) {
      statements.push(
        cashMovementStatement(
          {
            shiftId: record.shiftId,
            counterId: record.counterId,
            type: 'refund',
            amount: -record.cashRefund,
            referenceType: 'sale',
            referenceId: record.saleId,
            referenceNo: record.invoiceNo,
            note: record.reason,
            createdAt: record.cancelledAt,
          },
          actor,
        ),
      );
    }
    if (record.customerId) {
      statements.push({
        sql: 'UPDATE customers SET total_spent = MAX(0, total_spent - ?), total_orders = MAX(0, total_orders - 1), updated_at = ?, version = version + 1 WHERE id = ?',
        params: [record.grandTotal, record.cancelledAt, record.customerId],
      });
      if (record.pointsToReverse > 0) {
        statements.push(
          ...loyaltyStatements(
            { customerId: record.customerId, type: 'reverse', points: -record.pointsToReverse, saleId: record.saleId, invoiceNo: record.invoiceNo, note: record.reason, createdAt: record.cancelledAt },
            actor,
          ),
        );
      }
      if (record.pointsToRestore > 0) {
        statements.push(
          ...loyaltyStatements(
            { customerId: record.customerId, type: 'adjust', points: record.pointsToRestore, saleId: record.saleId, invoiceNo: record.invoiceNo, note: record.reason, createdAt: record.cancelledAt },
            actor,
          ),
        );
      }
    }
    statements.push(auditStatement(actor, 'sale.cancelled', 'sale', record.saleId, { invoiceNo: record.invoiceNo, reason: record.reason, approvedBy: record.approvedBy }, record.cancelledAt));
    await this.sql.transaction(statements);
  }

  async createReturn(record: NewReturnRecord): Promise<SaleReturn> {
    const number = sequenceValue(record.sequenceKey);
    const returnNo = { sql: '(SELECT return_no FROM returns WHERE id = ?)', params: [record.id] };
    const statements: SqlStatement[] = [
      sequenceIncrement(record.sequenceKey),
      {
        sql: `INSERT INTO returns (id, return_no, sale_id, invoice_no, shift_id, counter_id, cashier_id, cashier_name, customer_id, reason, refund_method, refund_total,
                tax_total, approved_by, note, created_at, updated_at, version, sync_status)
              VALUES (?, ${number.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'local')`,
        params: [
          record.id,
          ...number.params,
          record.saleId,
          record.invoiceNo,
          record.shiftId,
          record.counterId,
          record.cashier.id,
          record.cashier.name,
          record.customerId,
          record.reason,
          record.refundMethod,
          record.refundTotal,
          record.taxTotal,
          record.approvedBy,
          record.note,
          record.createdAt,
          record.createdAt,
        ],
      },
    ];
    for (const line of record.lines) {
      statements.push(
        {
          sql: `INSERT INTO return_items (id, return_id, sale_item_id, product_id, name_bn, name_en, quantity, unit_price, refund_amount, tax_amount, restock, condition)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [newId(), record.id, line.saleItemId, line.productId, line.name.bn, line.name.en, line.quantity, line.unitPrice, line.refund, line.tax, bool(line.restock), line.condition],
        },
        {
          sql: 'UPDATE sale_items SET returned_quantity = ROUND(returned_quantity + ?, 3) WHERE id = ? AND ROUND(returned_quantity + ?, 3) <= quantity',
          params: [line.quantity, line.saleItemId, line.quantity],
        },
      );
      if (line.restock) {
        statements.push(
          ...stockChangeStatements(
            {
              productId: line.productId,
              type: 'return',
              quantity: line.quantity,
              unitCost: 0,
              referenceType: 'return',
              referenceId: record.id,
              referenceNo: null,
              referenceNoSql: returnNo,
              note: record.reason,
              createdAt: record.createdAt,
            },
            record.cashier,
          ),
        );
      }
    }
    statements.push({
      sql: `UPDATE sales SET returned_total = returned_total + ?,
              status = CASE WHEN (SELECT SUM(quantity - returned_quantity) FROM sale_items WHERE sale_id = ?) <= 0.0005 THEN 'returned' ELSE 'partially_returned' END,
              updated_at = ?, version = version + 1
            WHERE id = ?`,
      params: [record.refundTotal, record.saleId, record.createdAt, record.saleId],
    });
    if (record.shiftId && record.refundMethod === 'cash' && record.refundTotal > 0) {
      statements.push(
        cashMovementStatement(
          {
            shiftId: record.shiftId,
            counterId: record.counterId,
            type: 'refund',
            amount: -record.refundTotal,
            referenceType: 'return',
            referenceId: record.id,
            referenceNo: null,
            referenceNoSql: returnNo,
            note: record.reason,
            createdAt: record.createdAt,
          },
          record.cashier,
        ),
      );
    }
    if (record.customerId) {
      statements.push({
        sql: 'UPDATE customers SET total_spent = MAX(0, total_spent - ?), updated_at = ?, version = version + 1 WHERE id = ?',
        params: [record.refundTotal, record.createdAt, record.customerId],
      });
      if (record.pointsReversed > 0) {
        statements.push(
          ...loyaltyStatements(
            { customerId: record.customerId, type: 'reverse', points: -record.pointsReversed, saleId: record.saleId, invoiceNo: record.invoiceNo, note: '', createdAt: record.createdAt },
            record.cashier,
          ),
        );
      }
    }
    statements.push(auditStatement(record.cashier, 'sale.returned', 'sale', record.saleId, { invoiceNo: record.invoiceNo, refund: record.refundTotal, approvedBy: record.approvedBy }, record.createdAt));

    await this.sql.transaction(statements);
    const created = await this.returnById(record.id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }

  private async returnById(id: Id): Promise<SaleReturn | null> {
    const row = await this.sql.get('SELECT * FROM returns WHERE id = ?', [id]);
    if (!row) return null;
    const items = await this.sql.all('SELECT * FROM return_items WHERE return_id = ?', [id]);
    return { ...mapReturn(row), items: items.map(mapReturnItem) };
  }

  async listReturns(filter: SaleFilter, page: PageRequest): Promise<PageResult<SaleReturn>> {
    const where = new Where()
      .when(filter.from, 'r.created_at >= ?', filter.from ?? null)
      .when(filter.to, 'r.created_at < ?', filter.to ?? null)
      .when(filter.cashierId && filter.cashierId !== 'all', 'r.cashier_id = ?', filter.cashierId ?? null)
      .when(filter.counterId && filter.counterId !== 'all', 'r.counter_id = ?', filter.counterId ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toUpperCase())}%`;
      where.add("(UPPER(r.return_no) LIKE ? ESCAPE '\\' OR UPPER(r.invoice_no) LIKE ? ESCAPE '\\')", like, like);
    }
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM returns r ${where}`, where.params),
      this.sql.all(`SELECT r.* FROM returns r ${where} ORDER BY r.created_at DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    const ids = rows.map((row) => toStr(row.id));
    const itemRows = ids.length > 0 ? await this.sql.all(`SELECT * FROM return_items WHERE return_id IN (${placeholders(ids.length)})`, ids) : [];
    const items = itemRows.map(mapReturnItem);
    return {
      rows: rows.map((row) => {
        const mapped = mapReturn(row);
        return { ...mapped, items: items.filter((item) => item.returnId === mapped.id) };
      }),
      total: toNum(countRow?.count),
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  async paymentMethods(saleIds: Id[]): ReturnType<SaleRepository['paymentMethods']> {
    const result: Awaited<ReturnType<SaleRepository['paymentMethods']>> = {};
    const ids = [...new Set(saleIds)];
    // Chunked to stay well below the SQL parameter limit.
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const rows = await this.sql.all(`SELECT sale_id, method FROM payments WHERE sale_id IN (${placeholders(chunk.length)}) ORDER BY created_at, rowid`, chunk);
      for (const row of rows) {
        const saleId = toStr(row.sale_id);
        const method = toStr(row.method) as Sale['paymentSummary'];
        if (method === 'split') continue;
        const list = result[saleId] ?? [];
        if (!list.includes(method)) list.push(method);
        result[saleId] = list;
      }
    }
    return result;
  }
}

export class LocalHeldSaleRepository implements HeldSaleRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(counterId: Id): Promise<HeldSale[]> {
    const rows = await this.sql.all('SELECT * FROM held_sales WHERE counter_id = ? ORDER BY hold_no', [counterId]);
    return rows.map(mapHeldSale);
  }

  async count(counterId: Id): Promise<number> {
    const row = await this.sql.get('SELECT COUNT(*) AS count FROM held_sales WHERE counter_id = ?', [counterId]);
    return toNum(row?.count);
  }

  async create(input: Parameters<HeldSaleRepository['create']>[0]): Promise<HeldSale> {
    const id = newId();
    const now = new Date().toISOString();
    await this.sql.run(
      `INSERT INTO held_sales (id, hold_no, counter_id, user_id, user_name, customer_id, customer_name, label, payload, item_count, total, created_at, updated_at)
       VALUES (?, (SELECT COALESCE(MAX(hold_no), 0) + 1 FROM held_sales WHERE counter_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.counterId, input.counterId, input.user.id, input.user.name, input.customerId, input.customerName, input.label, JSON.stringify(input.draft), input.itemCount, input.total, now, now],
    );
    const row = await this.sql.get('SELECT * FROM held_sales WHERE id = ?', [id]);
    if (!row) throw new AppError('saveFailed');
    return mapHeldSale(row);
  }

  async delete(id: Id): Promise<void> {
    await this.sql.run('DELETE FROM held_sales WHERE id = ?', [id]);
  }
}
