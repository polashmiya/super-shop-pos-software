import { AppError } from '@/domain/errors';
import { escapeLike } from '@/domain/text';
import type { Expense, ExpenseCategory, ExpenseFilter, ExpenseInput, ExpenseStatus, Id, PageRequest, PageResult } from '@/types';
import type { SqlClient, SqlStatement } from '@/types/database';
import type { Actor, ExpenseRepository } from '../types';
import { mapExpense } from './mappers';
import { Where, limitOffset, toBool, toNum, toStr } from './sql';
import { auditStatement, cashMovementStatement, sequenceIncrement, sequenceValue } from './statements';

const EXPENSE_SELECT = `SELECT e.*, ec.name_bn AS category_name_bn, ec.name_en AS category_name_en
  FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id`;

export class LocalExpenseRepository implements ExpenseRepository {
  constructor(private readonly sql: SqlClient) {}

  async categories(): Promise<ExpenseCategory[]> {
    const rows = await this.sql.all('SELECT * FROM expense_categories ORDER BY sort_order, name_en');
    return rows.map((row) => ({
      id: toStr(row.id),
      code: toStr(row.code),
      name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
      icon: toStr(row.icon, 'Receipt'),
      sortOrder: toNum(row.sort_order),
      isActive: toBool(row.is_active),
    }));
  }

  async list(filter: ExpenseFilter, page: PageRequest): Promise<PageResult<Expense>> {
    const where = new Where()
      .add('e.deleted_at IS NULL')
      .when(filter.from, 'e.created_at >= ?', filter.from ?? null)
      .when(filter.to, 'e.created_at < ?', filter.to ?? null)
      .when(filter.categoryId && filter.categoryId !== 'all', 'e.category_id = ?', filter.categoryId ?? null)
      .when(filter.status && filter.status !== 'all', 'e.status = ?', filter.status ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add("(LOWER(e.description) LIKE ? ESCAPE '\\' OR LOWER(e.expense_no) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(e.user_name, '')) LIKE ? ESCAPE '\\')", like, like, like);
    }
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM expenses e ${where}`, where.params),
      this.sql.all(`${EXPENSE_SELECT} ${where} ORDER BY e.created_at DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapExpense), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async getById(id: Id): Promise<Expense | null> {
    const row = await this.sql.get(`${EXPENSE_SELECT} WHERE e.id = ?`, [id]);
    return row ? mapExpense(row) : null;
  }

  async create(input: Parameters<ExpenseRepository['create']>[0], actor: Actor): Promise<Expense> {
    const number = sequenceValue(input.sequenceKey);
    const expenseNo = { sql: '(SELECT expense_no FROM expenses WHERE id = ?)', params: [input.id] };
    const fromDrawer = input.paidFrom === 'cash_drawer' && input.shiftId !== null && input.counterId !== null;
    const statements: SqlStatement[] = [
      sequenceIncrement(input.sequenceKey),
      {
        sql: `INSERT INTO expenses (id, expense_no, category_id, amount, description, expense_date, paid_from, shift_id, counter_id, user_id, user_name, approved_by,
                approved_by_name, status, created_at, updated_at, version, sync_status)
              VALUES (?, ${number.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'local')`,
        params: [
          input.id,
          ...number.params,
          input.categoryId,
          input.amount,
          input.description.trim(),
          input.expenseDate,
          fromDrawer ? 'cash_drawer' : 'office',
          fromDrawer ? input.shiftId : null,
          fromDrawer ? input.counterId : null,
          actor.id,
          actor.name,
          input.status === 'approved' ? actor.id : null,
          input.status === 'approved' ? actor.name : null,
          input.status,
          input.createdAt,
          input.createdAt,
        ],
      },
    ];
    if (fromDrawer && input.shiftId && input.counterId) {
      statements.push(
        cashMovementStatement(
          {
            shiftId: input.shiftId,
            counterId: input.counterId,
            type: 'expense',
            amount: -input.amount,
            referenceType: 'expense',
            referenceId: input.id,
            referenceNo: null,
            referenceNoSql: expenseNo,
            note: input.description.trim(),
            createdAt: input.createdAt,
          },
          actor,
        ),
      );
    }
    statements.push(auditStatement(actor, 'expense.created', 'expense', input.id, { amount: input.amount, paidFrom: input.paidFrom }, input.createdAt));
    await this.sql.transaction(statements);
    const created = await this.getById(input.id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }

  async update(id: Id, input: ExpenseInput, actor: Actor): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError('notFound');
    // Amounts already taken from a drawer are corrected via the cash ledger.
    if (existing.paidFrom === 'cash_drawer' && existing.amount !== input.amount) throw new AppError('expenseNotEditable');
    const now = new Date().toISOString();
    await this.sql.transaction([
      {
        sql: 'UPDATE expenses SET category_id = ?, amount = ?, description = ?, expense_date = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        params: [input.categoryId, input.amount, input.description.trim(), input.expenseDate, now, id],
      },
      auditStatement(actor, 'expense.created', 'expense', id, { updated: true, amount: input.amount }, now),
    ]);
  }

  async setStatus(id: Id, status: ExpenseStatus, actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    await this.sql.transaction([
      {
        sql: 'UPDATE expenses SET status = ?, approved_by = ?, approved_by_name = ?, updated_at = ?, version = version + 1 WHERE id = ?',
        params: [status, actor.id, actor.name, now, id],
      },
      auditStatement(actor, status === 'approved' ? 'expense.approved' : 'expense.rejected', 'expense', id, { status }, now),
    ]);
  }

  async delete(id: Id, actor: Actor): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new AppError('notFound');
    const now = new Date().toISOString();
    const statements: SqlStatement[] = [{ sql: 'UPDATE expenses SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?', params: [now, now, id] }];
    if (existing.paidFrom === 'cash_drawer' && existing.shiftId && existing.counterId) {
      const shift = await this.sql.get<{ status: string }>('SELECT status FROM cash_sessions WHERE id = ?', [existing.shiftId]);
      if (shift?.status === 'open') {
        statements.push(
          cashMovementStatement(
            { shiftId: existing.shiftId, counterId: existing.counterId, type: 'expense', amount: existing.amount, referenceType: 'expense', referenceId: id, referenceNo: existing.expenseNo, note: 'Reversed', createdAt: now },
            actor,
          ),
        );
      }
    }
    statements.push(auditStatement(actor, 'expense.rejected', 'expense', id, { deleted: true }, now));
    await this.sql.transaction(statements);
  }

  /* -------------------- Expense screen (by expense date) ------------------- */

  /** ISO instant → local calendar date "yyyy-mm-dd" (periods start at local midnight). */
  private static localDate(iso: string): string {
    const date = new Date(iso);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private searchWhere(filter: Parameters<ExpenseRepository['search']>[0]): Where {
    const where = new Where()
      .add('e.deleted_at IS NULL')
      .when(filter.from, 'e.expense_date >= ?', filter.from ? LocalExpenseRepository.localDate(filter.from) : null)
      .when(filter.to, 'e.expense_date < ?', filter.to ? LocalExpenseRepository.localDate(filter.to) : null)
      .when(filter.categoryId && filter.categoryId !== 'all', 'e.category_id = ?', filter.categoryId ?? null)
      .when(filter.status && filter.status !== 'all', 'e.status = ?', filter.status ?? null)
      .when(filter.paidFrom && filter.paidFrom !== 'all', 'e.paid_from = ?', filter.paidFrom ?? null);
    if (filter.search?.trim()) {
      const like = `%${escapeLike(filter.search.trim().toLowerCase())}%`;
      where.add(
        "(LOWER(e.description) LIKE ? ESCAPE '\\' OR LOWER(e.expense_no) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(e.user_name, '')) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM expense_categories sc WHERE sc.id = e.category_id AND (LOWER(sc.name_en) LIKE ? ESCAPE '\\' OR sc.name_bn LIKE ? ESCAPE '\\')))",
        like,
        like,
        like,
        like,
        `%${escapeLike(filter.search.trim())}%`,
      );
    }
    return where;
  }

  async search(filter: Parameters<ExpenseRepository['search']>[0], page: PageRequest): Promise<PageResult<Expense>> {
    const where = this.searchWhere(filter);
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM expenses e ${where}`, where.params),
      this.sql.all(`${EXPENSE_SELECT} ${where} ORDER BY e.expense_date DESC, e.created_at DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapExpense), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async summary(filter: Parameters<ExpenseRepository['summary']>[0]): ReturnType<ExpenseRepository['summary']> {
    const where = this.searchWhere(filter);
    // Rejected expenses are not money spent (unless the user filters for them).
    const spent = filter.status === 'rejected' ? '1 = 1' : "e.status <> 'rejected'";
    const [totals, categories] = await Promise.all([
      this.sql.get(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN ${spent} THEN e.amount ELSE 0 END), 0) AS total,
                COALESCE(SUM(CASE WHEN e.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
                COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END), 0) AS pending_total,
                COALESCE(SUM(CASE WHEN ${spent} AND e.paid_from = 'cash_drawer' THEN e.amount ELSE 0 END), 0) AS drawer_total,
                COALESCE(SUM(CASE WHEN ${spent} AND e.paid_from = 'office' THEN e.amount ELSE 0 END), 0) AS office_total
           FROM expenses e ${where}`,
        where.params,
      ),
      this.sql.all(
        `SELECT ec.id AS id, ec.name_bn AS name_bn, ec.name_en AS name_en, ec.icon AS icon, COUNT(*) AS count, SUM(e.amount) AS amount
           FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id ${where} AND ${spent}
          GROUP BY ec.id ORDER BY amount DESC`,
        where.params,
      ),
    ]);
    return {
      count: toNum(totals?.count),
      total: toNum(totals?.total),
      pendingCount: toNum(totals?.pending_count),
      pendingTotal: toNum(totals?.pending_total),
      drawerTotal: toNum(totals?.drawer_total),
      officeTotal: toNum(totals?.office_total),
      byCategory: categories.map((row) => ({
        categoryId: toStr(row.id),
        name: { bn: toStr(row.name_bn), en: toStr(row.name_en) },
        icon: toStr(row.icon, 'Receipt'),
        amount: toNum(row.amount),
        count: toNum(row.count),
      })),
    };
  }
}
