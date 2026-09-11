import { AppError } from '@/domain/errors';
import { escapeLike } from '@/domain/text';
import type { Id, InventorySummary, PageRequest, PageResult, StockMovement, StockMovementFilter } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, InventoryRepository, StockAdjustmentRecord } from '../types';
import { mapMovement } from './mappers';
import { Where, limitOffset, placeholders, toNum, toStr } from './sql';
import { auditStatement, sequenceIncrement, sequenceValue, stockChangeStatements } from './statements';

export class LocalInventoryRepository implements InventoryRepository {
  constructor(private readonly sql: SqlClient) {}

  async getSummary(expiringBefore: string): Promise<InventorySummary> {
    const row = await this.sql.get(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN p.status = 'active' AND COALESCE(sb.quantity, 0) > p.min_stock THEN 1 ELSE 0 END) AS in_stock,
              SUM(CASE WHEN p.status = 'active' AND COALESCE(sb.quantity, 0) > 0 AND COALESCE(sb.quantity, 0) <= p.min_stock THEN 1 ELSE 0 END) AS low_stock,
              SUM(CASE WHEN p.status = 'active' AND COALESCE(sb.quantity, 0) <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
              SUM(CASE WHEN p.status = 'active' AND p.expiry_date IS NOT NULL AND p.expiry_date <= ? AND COALESCE(sb.quantity, 0) > 0 THEN 1 ELSE 0 END) AS expiring,
              SUM(MAX(COALESCE(sb.quantity, 0), 0) * COALESCE(sb.avg_cost, p.purchase_price)) AS stock_value,
              SUM(MAX(COALESCE(sb.quantity, 0), 0) * p.selling_price) AS retail_value
         FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id
        WHERE p.deleted_at IS NULL`,
      [expiringBefore],
    );
    return {
      totalProducts: toNum(row?.total),
      activeProducts: toNum(row?.active),
      inStock: toNum(row?.in_stock),
      lowStock: toNum(row?.low_stock),
      outOfStock: toNum(row?.out_of_stock),
      expiringSoon: toNum(row?.expiring),
      stockValue: Math.round(toNum(row?.stock_value)),
      retailValue: Math.round(toNum(row?.retail_value)),
    };
  }

  async getStockLevels(productIds?: Id[]): Promise<Map<Id, number>> {
    const rows =
      productIds && productIds.length > 0
        ? await this.sql.all(`SELECT product_id, quantity FROM stock_balances WHERE product_id IN (${placeholders(productIds.length)})`, productIds)
        : await this.sql.all('SELECT product_id, quantity FROM stock_balances');
    return new Map(rows.map((row) => [toStr(row.product_id), toNum(row.quantity)]));
  }

  async listMovements(filter: StockMovementFilter, page: PageRequest): Promise<PageResult<StockMovement>> {
    const where = new Where()
      .when(filter.productId, 'm.product_id = ?', filter.productId ?? null)
      .when(filter.type && filter.type !== 'all', 'm.type = ?', filter.type ?? null)
      .when(filter.from, 'm.created_at >= ?', filter.from ?? null)
      .when(filter.to, 'm.created_at < ?', filter.to ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add("(p.search_text LIKE ? ESCAPE '\\' OR LOWER(COALESCE(m.reference_no, '')) LIKE ? ESCAPE '\\')", like, like);
    }
    const from = `FROM stock_movements m JOIN products p ON p.id = m.product_id ${where}`;
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count ${from}`, where.params),
      this.sql.all(`SELECT m.*, p.name_bn, p.name_en, p.sku ${from} ORDER BY m.created_at DESC, m.rowid DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapMovement), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async adjust(record: StockAdjustmentRecord, actor: Actor): Promise<StockMovement> {
    const product = await this.sql.get<{ id: string; cost: number; name_en: string; sku: string }>(
      'SELECT p.id, COALESCE(sb.avg_cost, p.purchase_price) AS cost, p.name_en, p.sku FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id WHERE p.id = ?',
      [record.productId],
    );
    if (!product) throw new AppError('notFound');
    const number = sequenceValue(record.sequenceKey);
    const statements = [
      sequenceIncrement(record.sequenceKey),
      ...stockChangeStatements(
        {
          productId: record.productId,
          type: record.type,
          quantity: record.quantity,
          unitCost: toNum(product.cost),
          referenceType: 'adjustment',
          referenceId: null,
          referenceNo: null,
          referenceNoSql: number,
          reason: record.reason,
          note: record.note,
          createdAt: record.createdAt,
        },
        actor,
      ),
      auditStatement(actor, 'stock.adjusted', 'product', record.productId, { sku: product.sku, quantity: record.quantity, reason: record.reason, note: record.note }, record.createdAt),
    ];
    await this.sql.transaction(statements);
    const row = await this.sql.get(
      `SELECT m.*, p.name_bn, p.name_en, p.sku FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE m.product_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1`,
      [record.productId],
    );
    if (!row) throw new AppError('saveFailed');
    return mapMovement(row);
  }

  async getAverageCosts(productIds?: Id[]): Promise<Map<Id, number>> {
    const base = 'SELECT p.id AS product_id, COALESCE(sb.avg_cost, p.purchase_price) AS cost FROM products p LEFT JOIN stock_balances sb ON sb.product_id = p.id WHERE p.deleted_at IS NULL';
    const rows =
      productIds && productIds.length > 0
        ? await this.sql.all(`${base} AND p.id IN (${placeholders(productIds.length)})`, productIds)
        : await this.sql.all(base);
    return new Map(rows.map((row) => [toStr(row.product_id), Math.round(toNum(row.cost))]));
  }

  async getMovementSummary(productId: Id, range: { from?: string; to?: string }) {
    const from = range.from ?? '';
    const to = range.to ?? '9999';
    const row = await this.sql.get(
      `SELECT ROUND(COALESCE(SUM(CASE WHEN created_at < ? THEN quantity ELSE 0 END), 0), 3) AS opening,
              ROUND(COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? AND quantity > 0 THEN quantity ELSE 0 END), 0), 3) AS total_in,
              ROUND(COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? AND quantity < 0 THEN -quantity ELSE 0 END), 0), 3) AS total_out,
              COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END), 0) AS movement_count
         FROM stock_movements WHERE product_id = ?`,
      [from, from, to, from, to, from, to, productId],
    );
    const opening = toNum(row?.opening);
    const totalIn = toNum(row?.total_in);
    const totalOut = toNum(row?.total_out);
    return {
      opening,
      totalIn,
      totalOut,
      closing: Math.round((opening + totalIn - totalOut) * 1000) / 1000,
      movementCount: toNum(row?.movement_count),
    };
  }
}
