import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { escapeLike } from '@/domain/text';
import type { GoodsReceipt, Id, PageRequest, PageResult, Purchase, PurchaseDetail, PurchaseFilter, PurchaseStatus } from '@/types';
import type { SqlClient, SqlRow, SqlStatement } from '@/types/database';
import type { Actor, PurchaseRecord, PurchaseRepository, ReceiveRecord } from '../types';
import { mapPurchase, mapPurchaseItem } from './mappers';
import { Where, limitOffset, toNullableStr, toNum, toStr } from './sql';
import { auditStatement, sequenceIncrement, sequenceValue, stockChangeStatements } from './statements';

export class LocalPurchaseRepository implements PurchaseRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(filter: PurchaseFilter, page: PageRequest): Promise<PageResult<Purchase>> {
    const where = new Where()
      .add('deleted_at IS NULL')
      .when(filter.status && filter.status !== 'all', 'status = ?', filter.status ?? null)
      .when(filter.supplierId && filter.supplierId !== 'all', 'supplier_id = ?', filter.supplierId ?? null)
      .when(filter.from, 'created_at >= ?', filter.from ?? null)
      .when(filter.to, 'created_at < ?', filter.to ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add("(LOWER(po_no) LIKE ? ESCAPE '\\' OR LOWER(supplier_name) LIKE ? ESCAPE '\\')", like, like);
    }
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM purchases ${where}`, where.params),
      this.sql.all(`SELECT * FROM purchases ${where} ORDER BY created_at DESC, rowid DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapPurchase), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async getById(id: Id): Promise<PurchaseDetail | null> {
    const row = await this.sql.get('SELECT * FROM purchases WHERE id = ?', [id]);
    if (!row) return null;
    const [items, receipts, receiptItems] = await Promise.all([
      this.sql.all('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY rowid', [id]),
      this.sql.all('SELECT * FROM goods_receipts WHERE purchase_id = ? ORDER BY received_at', [id]),
      this.sql.all('SELECT gri.* FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id = gri.receipt_id WHERE gr.purchase_id = ?', [id]),
    ]);
    return {
      ...mapPurchase(row),
      items: items.map(mapPurchaseItem),
      receipts: receipts.map((receipt) => this.mapReceipt(receipt, receiptItems)),
    };
  }

  private mapReceipt(receipt: SqlRow, items: SqlRow[]): GoodsReceipt {
    const id = toStr(receipt.id);
    return {
      id,
      grnNo: toStr(receipt.grn_no),
      purchaseId: toStr(receipt.purchase_id),
      receivedBy: toNullableStr(receipt.received_by),
      receivedByName: toNullableStr(receipt.received_by_name),
      receivedAt: toStr(receipt.received_at),
      note: toStr(receipt.note),
      items: items
        .filter((item) => item.receipt_id === id)
        .map((item) => ({ purchaseItemId: toStr(item.purchase_item_id), productId: toStr(item.product_id), quantity: toNum(item.quantity), unitCost: toNum(item.unit_cost) })),
    };
  }

  private itemStatements(record: PurchaseRecord): SqlStatement[] {
    return record.items.map((item) => ({
      sql: `INSERT INTO purchase_items (id, purchase_id, product_id, name_bn, name_en, sku, quantity, received_quantity, unit_cost, discount_amount, tax_rate, tax_amount, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      params: [item.id, record.id, item.productId, item.name.bn, item.name.en, item.sku, item.quantity, item.unitCost, item.discountAmount, item.taxRate, item.taxAmount, item.lineTotal],
    }));
  }

  async create(record: PurchaseRecord, actor: Actor): Promise<{ id: Id; poNo: string }> {
    if (!record.sequenceKey) throw new AppError('saveFailed');
    const number = sequenceValue(record.sequenceKey);
    const results = await this.sql.transaction([
      sequenceIncrement(record.sequenceKey),
      {
        sql: `INSERT INTO purchases (id, po_no, supplier_id, supplier_name, status, order_date, expected_date, subtotal, discount_total, tax_total, grand_total, paid_amount,
                note, created_by, created_by_name, received_at, item_count, created_at, updated_at, version, sync_status)
              VALUES (?, ${number.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?, ?, 1, 'local')`,
        params: [
          record.id,
          ...number.params,
          record.supplierId,
          record.supplierName,
          record.status,
          record.orderDate,
          record.expectedDate,
          record.subtotal,
          record.discountTotal,
          record.taxTotal,
          record.grandTotal,
          record.note,
          actor.id,
          actor.name,
          record.items.length,
          record.createdAt,
          record.createdAt,
        ],
      },
      ...this.itemStatements(record),
      auditStatement(actor, 'purchase.created', 'purchase', record.id, { supplier: record.supplierName, total: record.grandTotal, status: record.status }, record.createdAt),
      { sql: 'SELECT po_no FROM purchases WHERE id = ?', params: [record.id], mode: 'get' },
    ]);
    const last = results[results.length - 1] as SqlRow | null;
    return { id: record.id, poNo: toStr(last?.po_no) };
  }

  async update(record: PurchaseRecord, actor: Actor): Promise<void> {
    const existing = await this.sql.get<{ status: string }>('SELECT status FROM purchases WHERE id = ?', [record.id]);
    if (!existing) throw new AppError('notFound');
    if (existing.status !== 'draft' && existing.status !== 'ordered') throw new AppError('purchaseNotEditable');
    const now = new Date().toISOString();
    await this.sql.transaction([
      {
        sql: `UPDATE purchases SET supplier_id = ?, supplier_name = ?, status = ?, order_date = ?, expected_date = ?, subtotal = ?, discount_total = ?, tax_total = ?,
                grand_total = ?, note = ?, item_count = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
        params: [
          record.supplierId,
          record.supplierName,
          record.status,
          record.orderDate,
          record.expectedDate,
          record.subtotal,
          record.discountTotal,
          record.taxTotal,
          record.grandTotal,
          record.note,
          record.items.length,
          now,
          record.id,
        ],
      },
      { sql: 'DELETE FROM purchase_items WHERE purchase_id = ?', params: [record.id] },
      ...this.itemStatements(record),
      auditStatement(actor, 'purchase.updated', 'purchase', record.id, { total: record.grandTotal, status: record.status }, now),
    ]);
  }

  async setStatus(id: Id, status: PurchaseStatus, actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    await this.sql.transaction([
      { sql: 'UPDATE purchases SET status = ?, updated_at = ?, version = version + 1 WHERE id = ?', params: [status, now, id] },
      auditStatement(actor, status === 'cancelled' ? 'purchase.cancelled' : 'purchase.updated', 'purchase', id, { status }, now),
    ]);
  }

  async receive(record: ReceiveRecord, actor: Actor): Promise<GoodsReceipt> {
    const number = sequenceValue(record.sequenceKey);
    const grnNo = { sql: '(SELECT grn_no FROM goods_receipts WHERE id = ?)', params: [record.receiptId] };
    const statements: SqlStatement[] = [
      sequenceIncrement(record.sequenceKey),
      {
        sql: `INSERT INTO goods_receipts (id, grn_no, purchase_id, received_by, received_by_name, received_at, note) VALUES (?, ${number.sql}, ?, ?, ?, ?, ?)`,
        params: [record.receiptId, ...number.params, record.purchaseId, actor.id, actor.name, record.receivedAt, record.note],
      },
    ];
    for (const line of record.lines) {
      statements.push(
        {
          sql: 'INSERT INTO goods_receipt_items (id, receipt_id, purchase_item_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          params: [newId(), record.receiptId, line.purchaseItemId, line.productId, line.quantity, line.unitCost],
        },
        {
          sql: 'UPDATE purchase_items SET received_quantity = ROUND(received_quantity + ?, 3) WHERE id = ?',
          params: [line.quantity, line.purchaseItemId],
        },
        ...stockChangeStatements(
          {
            productId: line.productId,
            type: 'purchase',
            quantity: line.quantity,
            unitCost: line.unitCost,
            referenceType: 'purchase',
            referenceId: record.purchaseId,
            referenceNo: null,
            referenceNoSql: grnNo,
            createdAt: record.receivedAt,
            updateAverageCost: true,
          },
          actor,
        ),
        {
          sql: 'UPDATE products SET purchase_price = ?, updated_at = ?, version = version + 1 WHERE id = ? AND purchase_price <> ?',
          params: [line.unitCost, record.receivedAt, line.productId, line.unitCost],
        },
      );
    }
    statements.push(
      {
        sql: 'UPDATE purchases SET status = ?, received_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        params: [record.nextStatus, record.receivedAt, record.receivedAt, record.purchaseId],
      },
      auditStatement(actor, 'purchase.received', 'purchase', record.purchaseId, { poNo: record.poNo, lines: record.lines.length, status: record.nextStatus }, record.receivedAt),
    );
    await this.sql.transaction(statements);
    const detail = await this.getById(record.purchaseId);
    const receipt = detail?.receipts.find((entry) => entry.id === record.receiptId);
    if (!receipt) throw new AppError('saveFailed');
    return receipt;
  }

  async countByStatus(): Promise<Record<PurchaseStatus, number>> {
    const rows = await this.sql.all('SELECT status, COUNT(*) AS count FROM purchases WHERE deleted_at IS NULL GROUP BY status');
    const result: Record<PurchaseStatus, number> = { draft: 0, ordered: 0, partially_received: 0, received: 0, cancelled: 0 };
    for (const row of rows) result[toStr(row.status) as PurchaseStatus] = toNum(row.count);
    return result;
  }

  async totals(filter: PurchaseFilter) {
    const where = new Where()
      .add('deleted_at IS NULL')
      .when(filter.status && filter.status !== 'all', 'status = ?', filter.status ?? null)
      .when(!filter.status || filter.status === 'all', "status <> 'cancelled'")
      .when(filter.supplierId && filter.supplierId !== 'all', 'supplier_id = ?', filter.supplierId ?? null)
      .when(filter.from, 'created_at >= ?', filter.from ?? null)
      .when(filter.to, 'created_at < ?', filter.to ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add("(LOWER(po_no) LIKE ? ESCAPE '\\' OR LOWER(supplier_name) LIKE ? ESCAPE '\\')", like, like);
    }
    const row = await this.sql.get(`SELECT COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS total, COALESCE(SUM(paid_amount), 0) AS paid FROM purchases ${where}`, where.params);
    return { count: toNum(row?.count), grandTotal: toNum(row?.total), paidAmount: toNum(row?.paid) };
  }
}
