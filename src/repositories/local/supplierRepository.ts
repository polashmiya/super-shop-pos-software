import { APP_CONFIG } from '@/config/app.config';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { escapeLike, normalizeSearch, tokenize } from '@/domain/text';
import type { Id, Supplier, SupplierInput, SupplierPayment, SupplierSummary } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, SupplierRepository } from '../types';
import { mapSupplier } from './mappers';
import { SqlError, Where, toNullableStr, toNum, toStr } from './sql';
import { auditStatement } from './statements';

export class LocalSupplierRepository implements SupplierRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(search?: string, status: 'active' | 'inactive' | 'all' = 'all'): Promise<Supplier[]> {
    const where = new Where().add('deleted_at IS NULL').when(status !== 'all', 'status = ?', status);
    for (const token of tokenize(search ?? '').slice(0, 5)) where.add("search_text LIKE ? ESCAPE '\\'", `%${escapeLike(token)}%`);
    const rows = await this.sql.all(`SELECT * FROM suppliers ${where} ORDER BY name COLLATE NOCASE`, where.params);
    return rows.map(mapSupplier);
  }

  async getById(id: Id): Promise<Supplier | null> {
    const row = await this.sql.get('SELECT * FROM suppliers WHERE id = ?', [id]);
    return row ? mapSupplier(row) : null;
  }

  private async nextCode(): Promise<string> {
    const row = await this.sql.get('SELECT COUNT(*) AS count FROM suppliers');
    let sequence = toNum(row?.count) + 1;
    for (;;) {
      const code = `${APP_CONFIG.numbering.supplierPrefix}-${String(sequence).padStart(4, '0')}`;
      const taken = await this.sql.get('SELECT 1 AS taken FROM suppliers WHERE code = ?', [code]);
      if (!taken) return code;
      sequence += 1;
    }
  }

  private searchText(input: SupplierInput, code: string): string {
    return normalizeSearch(`${input.name} ${input.company} ${input.contactPerson} ${input.phone} ${code}`);
  }

  async create(input: SupplierInput, actor: Actor): Promise<Supplier> {
    const id = input.id ?? newId();
    const now = new Date().toISOString();
    const code = await this.nextCode();
    try {
      await this.sql.transaction([
        {
          sql: `INSERT INTO suppliers (id, code, name, company, phone, email, address, contact_person, opening_balance, status, notes, search_text, created_at, updated_at, version, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'local')`,
          params: [id, code, input.name.trim(), input.company.trim(), input.phone.trim(), input.email.trim(), input.address.trim(), input.contactPerson.trim(), input.openingBalance, input.status, input.notes.trim(), this.searchText(input, code), now, now],
        },
        auditStatement(actor, 'supplier.saved', 'supplier', id, { name: input.name }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateCode');
      throw new AppError('saveFailed', {}, error);
    }
    const created = await this.getById(id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }

  async update(id: Id, input: SupplierInput, actor: Actor): Promise<Supplier> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError('notFound');
    const now = new Date().toISOString();
    await this.sql.transaction([
      {
        sql: `UPDATE suppliers SET name = ?, company = ?, phone = ?, email = ?, address = ?, contact_person = ?, opening_balance = ?, status = ?, notes = ?, search_text = ?,
                updated_at = ?, version = version + 1 WHERE id = ?`,
        params: [input.name.trim(), input.company.trim(), input.phone.trim(), input.email.trim(), input.address.trim(), input.contactPerson.trim(), input.openingBalance, input.status, input.notes.trim(), this.searchText(input, existing.code), now, id],
      },
      auditStatement(actor, 'supplier.saved', 'supplier', id, { name: input.name }, now),
    ]);
    const updated = await this.getById(id);
    if (!updated) throw new AppError('saveFailed');
    return updated;
  }

  async summaries(): Promise<Map<Id, SupplierSummary>> {
    const rows = await this.sql.all(
      `SELECT s.id,
              s.opening_balance,
              COALESCE((SELECT SUM(grand_total) FROM purchases p WHERE p.supplier_id = s.id AND p.status IN ('received', 'partially_received')), 0) AS total_purchases,
              COALESCE((SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id AND p.status <> 'cancelled'), 0) AS purchase_count,
              COALESCE((SELECT SUM(amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id), 0) AS total_paid,
              (SELECT MAX(order_date) FROM purchases p WHERE p.supplier_id = s.id AND p.status <> 'cancelled') AS last_purchase_at
         FROM suppliers s WHERE s.deleted_at IS NULL`,
    );
    return new Map(
      rows.map((row) => {
        const totalPurchases = toNum(row.total_purchases);
        const totalPaid = toNum(row.total_paid);
        return [
          toStr(row.id),
          {
            supplierId: toStr(row.id),
            totalPurchases,
            purchaseCount: toNum(row.purchase_count),
            totalPaid,
            outstanding: toNum(row.opening_balance) + totalPurchases - totalPaid,
            lastPurchaseAt: toNullableStr(row.last_purchase_at),
          },
        ];
      }),
    );
  }

  async payments(supplierId: Id): Promise<SupplierPayment[]> {
    const rows = await this.sql.all('SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY paid_at DESC', [supplierId]);
    return rows.map((row) => ({
      id: toStr(row.id),
      supplierId: toStr(row.supplier_id),
      purchaseId: toNullableStr(row.purchase_id),
      amount: toNum(row.amount),
      method: toStr(row.method) as SupplierPayment['method'],
      reference: toStr(row.reference),
      note: toStr(row.note),
      userId: toNullableStr(row.user_id),
      paidAt: toStr(row.paid_at),
    }));
  }

  async addPayment(payment: Omit<SupplierPayment, 'id'>, actor: Actor): Promise<SupplierPayment> {
    const id = newId();
    const statements = [
      {
        sql: 'INSERT INTO supplier_payments (id, supplier_id, purchase_id, amount, method, reference, note, user_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [id, payment.supplierId, payment.purchaseId, payment.amount, payment.method, payment.reference, payment.note, actor.id, payment.paidAt],
      },
      auditStatement(actor, 'supplier.paid', 'supplier', payment.supplierId, { amount: payment.amount, method: payment.method }, payment.paidAt),
    ];
    if (payment.purchaseId) {
      statements.push({
        sql: 'UPDATE purchases SET paid_amount = MIN(grand_total, paid_amount + ?), updated_at = ?, version = version + 1 WHERE id = ?',
        params: [payment.amount, payment.paidAt, payment.purchaseId],
      });
    }
    await this.sql.transaction(statements);
    return { ...payment, id, userId: actor.id };
  }
}
