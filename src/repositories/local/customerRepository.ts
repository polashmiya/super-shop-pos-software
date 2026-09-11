import { APP_CONFIG } from '@/config/app.config';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { escapeLike, normalizeSearch, tokenize } from '@/domain/text';
import { normalizePhone } from '@/domain/validation';
import type { Customer, CustomerInput, CustomerType, Id, LoyaltyTransaction, PageRequest, PageResult, Sale } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, CustomerFilter, CustomerRepository } from '../types';
import { mapCustomer, mapLoyalty, mapSale } from './mappers';
import { SqlError, Where, limitOffset, toNum, toStr } from './sql';
import { auditStatement, loyaltyStatements } from './statements';

const SORTS: Record<NonNullable<CustomerFilter['sort']>, string> = {
  name: 'name COLLATE NOCASE',
  totalSpent: 'total_spent',
  lastPurchase: 'last_purchase_at',
  points: 'loyalty_points',
  createdAt: 'created_at',
};

export class LocalCustomerRepository implements CustomerRepository {
  constructor(private readonly sql: SqlClient) {}

  private searchWhere(query: string | undefined, where: Where): void {
    const tokens = tokenize(query ?? '').slice(0, 5);
    for (const token of tokens) where.add("search_text LIKE ? ESCAPE '\\'", `%${escapeLike(token)}%`);
  }

  async list(filter: CustomerFilter, page: PageRequest): Promise<PageResult<Customer>> {
    const where = new Where().add('deleted_at IS NULL').when(filter.type && filter.type !== 'all', 'customer_type = ?', filter.type ?? null);
    this.searchWhere(filter.search, where);
    const sort = SORTS[filter.sort ?? 'name'];
    const direction = filter.direction === 'desc' ? 'DESC' : filter.direction === 'asc' ? 'ASC' : filter.sort && filter.sort !== 'name' ? 'DESC' : 'ASC';
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM customers ${where}`, where.params),
      this.sql.all(`SELECT * FROM customers ${where} ORDER BY ${sort} ${direction} NULLS LAST, rowid ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapCustomer), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async search(query: string, limit: number): Promise<Customer[]> {
    const where = new Where().add('deleted_at IS NULL').add('is_active = 1');
    this.searchWhere(query, where);
    const rows = await this.sql.all(`SELECT * FROM customers ${where} ORDER BY total_orders DESC LIMIT ?`, [...where.params, limit]);
    return rows.map(mapCustomer);
  }

  async getById(id: Id): Promise<Customer | null> {
    const row = await this.sql.get('SELECT * FROM customers WHERE id = ?', [id]);
    return row ? mapCustomer(row) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const row = await this.sql.get('SELECT * FROM customers WHERE phone = ? AND deleted_at IS NULL', [normalized]);
    return row ? mapCustomer(row) : null;
  }

  private async nextCode(): Promise<string> {
    const row = await this.sql.get<{ code: string | null }>(
      `SELECT code FROM customers WHERE code LIKE '${APP_CONFIG.numbering.customerPrefix}-%' ORDER BY code DESC LIMIT 1`,
    );
    const last = Number(toStr(row?.code).split('-')[1] ?? 0);
    return `${APP_CONFIG.numbering.customerPrefix}-${String((Number.isFinite(last) ? last : 0) + 1).padStart(5, '0')}`;
  }

  private searchText(input: CustomerInput, code: string, phone: string): string {
    return normalizeSearch(`${input.name} ${phone} ${input.email} ${code}`);
  }

  async create(input: CustomerInput & { code?: string }, actor: Actor): Promise<Customer> {
    const id = input.id ?? newId();
    const now = new Date().toISOString();
    const code = input.code ?? (await this.nextCode());
    const phone = normalizePhone(input.phone);
    try {
      await this.sql.transaction([
        {
          sql: `INSERT INTO customers (id, code, name, phone, email, address, customer_type, discount_rate, notes, search_text, is_active, created_at, updated_at, version, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, 'local')`,
          params: [id, code, input.name.trim(), phone, input.email.trim(), input.address.trim(), input.customerType, input.discountRate, input.notes.trim(), this.searchText(input, code, phone), now, now],
        },
        auditStatement(actor, 'customer.saved', 'customer', id, { code, name: input.name }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError(error.detail.includes('phone') ? 'duplicatePhone' : 'duplicateCode');
      throw new AppError('saveFailed', {}, error);
    }
    const created = await this.getById(id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }

  async update(id: Id, input: CustomerInput, actor: Actor): Promise<Customer> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError('notFound');
    const now = new Date().toISOString();
    const phone = normalizePhone(input.phone);
    try {
      await this.sql.transaction([
        {
          sql: `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, customer_type = ?, discount_rate = ?, notes = ?, search_text = ?, updated_at = ?,
                  version = version + 1 WHERE id = ?`,
          params: [input.name.trim(), phone, input.email.trim(), input.address.trim(), input.customerType, input.discountRate, input.notes.trim(), this.searchText(input, existing.code, phone), now, id],
        },
        auditStatement(actor, 'customer.saved', 'customer', id, { code: existing.code, name: input.name }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicatePhone');
      throw new AppError('saveFailed', {}, error);
    }
    const updated = await this.getById(id);
    if (!updated) throw new AppError('saveFailed');
    return updated;
  }

  async delete(id: Id, actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    // Soft delete; the phone is released so it can be registered again.
    await this.sql.transaction([
      { sql: "UPDATE customers SET deleted_at = ?, is_active = 0, phone = '', updated_at = ?, version = version + 1 WHERE id = ?", params: [now, now, id] },
      auditStatement(actor, 'customer.deleted', 'customer', id, {}, now),
    ]);
  }

  async purchaseHistory(customerId: Id, page: PageRequest): Promise<PageResult<Sale>> {
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get('SELECT COUNT(*) AS count FROM sales WHERE customer_id = ?', [customerId]),
      this.sql.all(`SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC ${limit.sql}`, [customerId, ...limit.params]),
    ]);
    return { rows: rows.map(mapSale), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async loyaltyHistory(customerId: Id, limit: number): Promise<LoyaltyTransaction[]> {
    const rows = await this.sql.all('SELECT * FROM customer_loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', [customerId, limit]);
    return rows.map(mapLoyalty);
  }

  async adjustPoints(customerId: Id, points: number, note: string, actor: Actor): Promise<Customer> {
    const now = new Date().toISOString();
    await this.sql.transaction([
      ...loyaltyStatements({ customerId, type: 'adjust', points, saleId: null, invoiceNo: null, note, createdAt: now }, actor),
      auditStatement(actor, 'loyalty.adjusted', 'customer', customerId, { points, note }, now),
    ]);
    const updated = await this.getById(customerId);
    if (!updated) throw new AppError('notFound');
    return updated;
  }

  async countByType(): Promise<Record<CustomerType, number>> {
    const rows = await this.sql.all('SELECT customer_type, COUNT(*) AS count FROM customers WHERE deleted_at IS NULL GROUP BY customer_type');
    const result: Record<CustomerType, number> = { walk_in: 0, regular: 0, vip: 0, wholesale: 0 };
    for (const row of rows) result[toStr(row.customer_type) as CustomerType] = toNum(row.count);
    return result;
  }
}
