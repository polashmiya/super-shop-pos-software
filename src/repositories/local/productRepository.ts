import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { escapeLike, normalizeSearch, tokenize } from '@/domain/text';
import type { Id, PriceHistoryEntry, Product, ProductBarcode, ProductInput, ProductStatus } from '@/types';
import type { SqlClient, SqlStatement } from '@/types/database';
import type { Actor, ProductRepository, ProductSaleRow } from '../types';
import { mapProduct, PRODUCT_SELECT } from './mappers';
import { SqlError, bool, placeholders, toBool, toNullableNum, toNullableStr, toNum, toStr } from './sql';
import { auditStatement, stockChangeStatements } from './statements';

/* ==========================================================================
   Products on SQLite. Barcodes live in product_barcodes (UNIQUE), stock in
   stock_balances, price changes in price_history.
   ========================================================================== */

function translateConstraint(error: unknown): never {
  if (error instanceof SqlError && error.code === 'constraint_unique') {
    if (error.detail.includes('barcode')) throw new AppError('duplicateBarcode');
    if (error.detail.includes('sku')) throw new AppError('duplicateSku');
  }
  if (error instanceof AppError) throw error;
  throw new AppError('saveFailed', {}, error);
}

export class LocalProductRepository implements ProductRepository {
  constructor(private readonly sql: SqlClient) {}

  async getAll(): Promise<Product[]> {
    const rows = await this.sql.all(`${PRODUCT_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.name_en COLLATE NOCASE`);
    return rows.map(mapProduct);
  }

  async getById(id: Id): Promise<Product | null> {
    const row = await this.sql.get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
    return row ? mapProduct(row) : null;
  }

  async search(query: string, limit = 50): Promise<Product[]> {
    const tokens = tokenize(query).slice(0, 6);
    if (tokens.length === 0) return [];
    const clauses = tokens.map(() => "p.search_text LIKE ? ESCAPE '\\'").join(' AND ');
    const rows = await this.sql.all(
      `${PRODUCT_SELECT} WHERE p.deleted_at IS NULL AND ${clauses} ORDER BY p.status, p.featured DESC, p.name_en LIMIT ?`,
      [...tokens.map((token) => `%${escapeLike(token)}%`), limit],
    );
    return rows.map(mapProduct);
  }

  async findByBarcode(code: string): Promise<Product | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const row = await this.sql.get(
      `${PRODUCT_SELECT} WHERE p.deleted_at IS NULL AND (p.id IN (SELECT product_id FROM product_barcodes WHERE barcode = ?) OR p.sku = ? COLLATE NOCASE) LIMIT 1`,
      [trimmed, trimmed],
    );
    return row ? mapProduct(row) : null;
  }

  async isBarcodeTaken(barcode: string, exceptProductId?: Id): Promise<boolean> {
    const row = await this.sql.get<{ product_id: string }>('SELECT product_id FROM product_barcodes WHERE barcode = ?', [barcode.trim()]);
    return Boolean(row && row.product_id !== exceptProductId);
  }

  async isSkuTaken(sku: string, exceptProductId?: Id): Promise<boolean> {
    const row = await this.sql.get<{ id: string }>('SELECT id FROM products WHERE sku = ? COLLATE NOCASE', [sku.trim()]);
    return Boolean(row && row.id !== exceptProductId);
  }

  async nextSku(prefix: string): Promise<string> {
    const rows = await this.sql.all<{ sku: string }>("SELECT sku FROM products WHERE sku LIKE ? ESCAPE '\\'", [`${escapeLike(prefix)}-%`]);
    let max = 0;
    for (const row of rows) {
      const value = Number(row.sku.slice(prefix.length + 1));
      if (Number.isFinite(value) && value > max) max = value;
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  private async searchText(input: ProductInput, barcodes: string[]): Promise<string> {
    const lookups = await this.sql.all<{ name_en: string; name_bn: string }>(
      `SELECT name_en, name_bn FROM categories WHERE id IN (?, ?)
       UNION ALL SELECT name_en, name_bn FROM brands WHERE id = ?`,
      [input.categoryId, input.subcategoryId ?? '', input.brandId ?? ''],
    );
    return normalizeSearch(
      [input.name.en, input.name.bn, input.sku, ...barcodes, ...lookups.flatMap((row) => [row.name_en, row.name_bn])].join(' '),
    );
  }

  private columns(input: ProductInput, searchText: string, now: string) {
    return [
      input.sku.trim(),
      input.name.bn.trim(),
      input.name.en.trim(),
      input.description.bn.trim(),
      input.description.en.trim(),
      input.categoryId,
      input.subcategoryId,
      input.brandId,
      input.unitId,
      input.supplierId,
      input.purchasePrice,
      input.sellingPrice,
      input.mrp,
      input.discount?.type ?? null,
      input.discount?.value ?? 0,
      input.taxRate,
      input.minStock,
      input.maxStock,
      input.image,
      input.status,
      bool(input.featured),
      bool(input.weighted),
      input.expiryDate,
      searchText,
      now,
    ];
  }

  async create(input: ProductInput, actor: Actor): Promise<Product> {
    const id = input.id ?? newId();
    const now = new Date().toISOString();
    const barcodes = [input.barcode.trim(), ...(input.extraBarcodes ?? []).map((code) => code.trim())].filter(Boolean);
    const searchText = await this.searchText(input, barcodes);
    const statements: SqlStatement[] = [
      {
        sql: `INSERT INTO products (sku, name_bn, name_en, description_bn, description_en, category_id, subcategory_id, brand_id, unit_id, supplier_id,
                purchase_price, selling_price, mrp, discount_type, discount_value, tax_rate, min_stock, max_stock, image, status, featured, weighted,
                expiry_date, search_text, updated_at, id, created_at, version, sync_status)
              VALUES (${placeholders(25)}, ?, ?, 1, 'local')`,
        params: [...this.columns(input, searchText, now), id, now],
      },
      ...barcodes.map((barcode, index) => ({
        sql: 'INSERT INTO product_barcodes (id, product_id, barcode, is_primary, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [newId(), id, barcode, index === 0 ? 1 : 0, now],
      })),
      {
        sql: 'INSERT INTO stock_balances (product_id, quantity, avg_cost, last_movement_at, updated_at) VALUES (?, 0, ?, NULL, ?)',
        params: [id, input.purchasePrice, now],
      },
    ];
    const openingStock = input.openingStock ?? 0;
    if (openingStock > 0) {
      statements.push(
        ...stockChangeStatements(
          {
            productId: id,
            type: 'opening',
            quantity: openingStock,
            unitCost: input.purchasePrice,
            referenceType: 'opening',
            referenceId: id,
            referenceNo: 'OPENING',
            createdAt: now,
          },
          actor,
        ),
      );
    }
    statements.push(auditStatement(actor, 'product.created', 'product', id, { sku: input.sku, name: input.name.en }, now));
    try {
      await this.sql.transaction(statements);
    } catch (error) {
      translateConstraint(error);
    }
    const created = await this.getById(id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }

  async update(id: Id, input: ProductInput, actor: Actor, reason: string): Promise<Product> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError('notFound');
    const now = new Date().toISOString();
    const extra = (input.extraBarcodes ?? []).map((code) => code.trim()).filter(Boolean);
    const barcodes = [input.barcode.trim(), ...extra].filter(Boolean);
    const searchText = await this.searchText(input, barcodes);

    const statements: SqlStatement[] = [
      {
        sql: `UPDATE products SET sku = ?, name_bn = ?, name_en = ?, description_bn = ?, description_en = ?, category_id = ?, subcategory_id = ?, brand_id = ?,
                unit_id = ?, supplier_id = ?, purchase_price = ?, selling_price = ?, mrp = ?, discount_type = ?, discount_value = ?, tax_rate = ?,
                min_stock = ?, max_stock = ?, image = ?, status = ?, featured = ?, weighted = ?, expiry_date = ?, search_text = ?, updated_at = ?,
                version = version + 1
              WHERE id = ?`,
        params: [...this.columns(input, searchText, now), id],
      },
      { sql: 'DELETE FROM product_barcodes WHERE product_id = ?', params: [id] },
      ...barcodes.map((barcode, index) => ({
        sql: 'INSERT INTO product_barcodes (id, product_id, barcode, is_primary, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [newId(), id, barcode, index === 0 ? 1 : 0, now],
      })),
    ];

    const priceChanges: Array<{ field: 'selling_price' | 'purchase_price' | 'mrp'; from: number | null; to: number | null }> = [];
    if (existing.sellingPrice !== input.sellingPrice) priceChanges.push({ field: 'selling_price', from: existing.sellingPrice, to: input.sellingPrice });
    if (existing.purchasePrice !== input.purchasePrice) priceChanges.push({ field: 'purchase_price', from: existing.purchasePrice, to: input.purchasePrice });
    if ((existing.mrp ?? null) !== (input.mrp ?? null)) priceChanges.push({ field: 'mrp', from: existing.mrp, to: input.mrp });
    for (const change of priceChanges) {
      statements.push({
        sql: 'INSERT INTO price_history (id, product_id, field, old_value, new_value, changed_by, changed_by_name, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [newId(), id, change.field, change.from, change.to, actor.id, actor.name, now, reason],
      });
    }
    if (priceChanges.length > 0) {
      statements.push(auditStatement(actor, 'product.price_changed', 'product', id, { sku: input.sku, changes: priceChanges, reason }, now));
    }
    statements.push(auditStatement(actor, 'product.updated', 'product', id, { sku: input.sku, name: input.name.en }, now));

    try {
      await this.sql.transaction(statements);
    } catch (error) {
      translateConstraint(error);
    }
    const updated = await this.getById(id);
    if (!updated) throw new AppError('saveFailed');
    return updated;
  }

  async setStatus(ids: Id[], status: ProductStatus, actor: Actor): Promise<void> {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const statements: SqlStatement[] = [];
    for (let offset = 0; offset < ids.length; offset += 400) {
      const chunk = ids.slice(offset, offset + 400);
      statements.push({
        sql: `UPDATE products SET status = ?, updated_at = ?, version = version + 1 WHERE id IN (${placeholders(chunk.length)})`,
        params: [status, now, ...chunk],
      });
    }
    statements.push(
      auditStatement(actor, status === 'active' ? 'product.activated' : 'product.deactivated', 'product', ids.length === 1 ? ids[0] : null, { count: ids.length }, now),
    );
    await this.sql.transaction(statements);
  }

  async delete(id: Id, actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    await this.sql.transaction([
      { sql: "UPDATE products SET deleted_at = ?, status = 'inactive', updated_at = ?, version = version + 1 WHERE id = ?", params: [now, now, id] },
      auditStatement(actor, 'product.deactivated', 'product', id, { deleted: true }, now),
    ]);
  }

  async getBarcodes(productId: Id): Promise<ProductBarcode[]> {
    const rows = await this.sql.all('SELECT * FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC, created_at', [productId]);
    return rows.map((row) => ({
      id: toStr(row.id),
      productId: toStr(row.product_id),
      barcode: toStr(row.barcode),
      isPrimary: toBool(row.is_primary),
      createdAt: toStr(row.created_at),
    }));
  }

  async getPriceHistory(productId: Id): Promise<PriceHistoryEntry[]> {
    const rows = await this.sql.all('SELECT * FROM price_history WHERE product_id = ? ORDER BY changed_at DESC LIMIT 100', [productId]);
    return rows.map((row) => ({
      id: toStr(row.id),
      productId: toStr(row.product_id),
      field: toStr(row.field) as PriceHistoryEntry['field'],
      oldValue: toNullableNum(row.old_value),
      newValue: toNullableNum(row.new_value),
      changedBy: toNullableStr(row.changed_by),
      changedByName: toNullableStr(row.changed_by_name),
      changedAt: toStr(row.changed_at),
      reason: toStr(row.reason),
    }));
  }

  async getSalesHistory(productId: Id, limit: number): Promise<ProductSaleRow[]> {
    const rows = await this.sql.all(
      `SELECT s.id AS sale_id, s.invoice_no, s.created_at, si.quantity, si.unit_price, si.line_total, s.customer_name, s.cashier_name
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id = ? AND s.status <> 'cancelled'
        ORDER BY s.created_at DESC LIMIT ?`,
      [productId, limit],
    );
    return rows.map((row) => ({
      saleId: toStr(row.sale_id),
      invoiceNo: toStr(row.invoice_no),
      createdAt: toStr(row.created_at),
      quantity: toNum(row.quantity),
      unitPrice: toNum(row.unit_price),
      lineTotal: toNum(row.line_total),
      customerName: toStr(row.customer_name),
      cashierName: toStr(row.cashier_name),
    }));
  }

  async getSalesSummary(productId: Id, since: string): Promise<{ quantity: number; amount: number; orders: number; lastSaleAt: string | null }> {
    const row = await this.sql.get(
      `SELECT COALESCE(SUM(CASE WHEN s.created_at >= ? THEN si.quantity - si.returned_quantity ELSE 0 END), 0) AS quantity,
              COALESCE(SUM(CASE WHEN s.created_at >= ? THEN si.line_total * (si.quantity - si.returned_quantity) / si.quantity ELSE 0 END), 0) AS amount,
              COUNT(DISTINCT CASE WHEN s.created_at >= ? THEN si.sale_id END) AS orders,
              MAX(s.created_at) AS last_sale_at
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE si.product_id = ? AND s.status <> 'cancelled'`,
      [since, since, since, productId],
    );
    return {
      quantity: Math.round(toNum(row?.quantity) * 1000) / 1000,
      amount: Math.round(toNum(row?.amount)),
      orders: toNum(row?.orders),
      lastSaleAt: toNullableStr(row?.last_sale_at),
    };
  }
}
