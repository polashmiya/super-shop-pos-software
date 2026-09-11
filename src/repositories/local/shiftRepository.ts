import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { SHIFT_SEQUENCE_DIGITS } from '@/domain/numbering';
import { calculateShiftTotals } from '@/domain/shift';
import type { CashMovement, Counter, Id, PageRequest, PageResult, Shift, ShiftFilter, ShiftTotals } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, CounterRepository, ShiftRepository } from '../types';
import { mapCashMovement, mapCounter, mapShift } from './mappers';
import { SqlError, Where, limitOffset, toNum } from './sql';
import { auditStatement, cashMovementStatement, sequenceIncrement, sequenceValue } from './statements';

const SHIFT_SELECT = 'SELECT cs.*, c.name_en AS counter_name FROM cash_sessions cs JOIN counters c ON c.id = cs.counter_id';

export class LocalShiftRepository implements ShiftRepository {
  constructor(private readonly sql: SqlClient) {}

  async getOpenShift(counterId: Id): Promise<Shift | null> {
    const row = await this.sql.get(`${SHIFT_SELECT} WHERE cs.counter_id = ? AND cs.status = 'open'`, [counterId]);
    return row ? mapShift(row) : null;
  }

  async getById(id: Id): Promise<Shift | null> {
    const row = await this.sql.get(`${SHIFT_SELECT} WHERE cs.id = ?`, [id]);
    return row ? mapShift(row) : null;
  }

  async list(filter: ShiftFilter, page: PageRequest): Promise<PageResult<Shift>> {
    const where = new Where()
      .when(filter.counterId && filter.counterId !== 'all', 'cs.counter_id = ?', filter.counterId ?? null)
      .when(filter.userId && filter.userId !== 'all', 'cs.opened_by = ?', filter.userId ?? null)
      .when(filter.status && filter.status !== 'all', 'cs.status = ?', filter.status ?? null)
      .when(filter.from, 'cs.opened_at >= ?', filter.from ?? null)
      .when(filter.to, 'cs.opened_at < ?', filter.to ?? null);
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM cash_sessions cs ${where}`, where.params),
      this.sql.all(`${SHIFT_SELECT} ${where} ORDER BY cs.opened_at DESC ${limit.sql}`, [...where.params, ...limit.params]),
    ]);
    return { rows: rows.map(mapShift), total: toNum(countRow?.count), page: page.page, pageSize: page.pageSize };
  }

  async open(input: Parameters<ShiftRepository['open']>[0], actor: Actor): Promise<Shift> {
    const number = sequenceValue(input.sequenceKey, SHIFT_SEQUENCE_DIGITS);
    const shiftNo = { sql: '(SELECT shift_no FROM cash_sessions WHERE id = ?)', params: [input.id] };
    try {
      await this.sql.transaction([
        sequenceIncrement(input.sequenceKey),
        {
          sql: `INSERT INTO cash_sessions (id, shift_no, counter_id, branch_id, opened_by, opened_by_name, status, opening_cash, note, opened_at, created_at, updated_at, version, sync_status)
                VALUES (?, ${number.sql}, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, 1, 'local')`,
          params: [input.id, ...number.params, input.counterId, input.branchId, actor.id, actor.name, input.openingCash, input.note, input.openedAt, input.openedAt, input.openedAt],
        },
        cashMovementStatement(
          {
            shiftId: input.id,
            counterId: input.counterId,
            type: 'opening',
            amount: input.openingCash,
            referenceType: 'shift',
            referenceId: input.id,
            referenceNo: null,
            referenceNoSql: shiftNo,
            createdAt: input.openedAt,
          },
          actor,
        ),
        { sql: "UPDATE counters SET status = 'open', assigned_user_id = ?, updated_at = ?, version = version + 1 WHERE id = ?", params: [actor.id, input.openedAt, input.counterId] },
        auditStatement(actor, 'shift.opened', 'shift', input.id, { openingCash: input.openingCash }, input.openedAt),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('shiftAlreadyOpen');
      throw new AppError('saveFailed', {}, error);
    }
    const shift = await this.getById(input.id);
    if (!shift) throw new AppError('saveFailed');
    return shift;
  }

  async close(input: Parameters<ShiftRepository['close']>[0], actor: Actor): Promise<Shift> {
    const shift = await this.getById(input.id);
    if (!shift) throw new AppError('notFound');
    if (shift.status !== 'open') throw new AppError('shiftNotOpen');
    await this.sql.transaction([
      {
        sql: `UPDATE cash_sessions SET status = 'closed', closed_by = ?, closed_by_name = ?, closing_totals = ?, actual_cash = ?, difference = ?, note = ?, closed_at = ?,
                updated_at = ?, version = version + 1 WHERE id = ? AND status = 'open'`,
        params: [actor.id, actor.name, JSON.stringify(input.totals), input.actualCash, input.difference, input.note, input.closedAt, input.closedAt, input.id],
      },
      cashMovementStatement(
        {
          shiftId: input.id,
          counterId: shift.counterId,
          type: 'closing',
          amount: -input.actualCash,
          referenceType: 'shift',
          referenceId: input.id,
          referenceNo: shift.shiftNo,
          note: input.note,
          createdAt: input.closedAt,
        },
        actor,
      ),
      { sql: "UPDATE counters SET status = 'closed', assigned_user_id = NULL, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'open'", params: [input.closedAt, shift.counterId] },
      auditStatement(
        actor,
        'shift.closed',
        'shift',
        input.id,
        { shiftNo: shift.shiftNo, expected: input.totals.expectedCash, actual: input.actualCash, difference: input.difference, approvedBy: input.approvedBy },
        input.closedAt,
      ),
    ]);
    const closed = await this.getById(input.id);
    if (!closed) throw new AppError('saveFailed');
    return closed;
  }

  async computeTotals(shiftId: Id, openingCash: number): Promise<ShiftTotals> {
    const [payments, sales, returns, movements] = await Promise.all([
      this.sql.get(
        `SELECT COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount END), 0) AS cash,
                COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount END), 0) AS card,
                COALESCE(SUM(CASE WHEN p.method = 'mobile' THEN p.amount END), 0) AS mobile,
                COALESCE(SUM(CASE WHEN p.method = 'points' THEN p.amount END), 0) AS points
           FROM payments p JOIN sales s ON s.id = p.sale_id
          WHERE s.shift_id = ? AND s.status <> 'cancelled'`,
        [shiftId],
      ),
      this.sql.get(
        `SELECT COUNT(*) AS count, COALESCE(SUM(discount_total), 0) AS discount, COALESCE(SUM(tax_total), 0) AS tax
           FROM sales WHERE shift_id = ? AND status <> 'cancelled'`,
        [shiftId],
      ),
      this.sql.get(
        `SELECT COALESCE(SUM(refund_total), 0) AS total, COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN refund_total END), 0) AS cash
           FROM returns WHERE shift_id = ?`,
        [shiftId],
      ),
      this.sql.get(
        `SELECT COALESCE(SUM(CASE WHEN type = 'expense' THEN -amount END), 0) AS expenses,
                COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount END), 0) AS cash_in,
                COALESCE(SUM(CASE WHEN type = 'cash_out' THEN -amount END), 0) AS cash_out
           FROM cash_movements WHERE shift_id = ?`,
        [shiftId],
      ),
    ]);
    const cashExpenses = toNum(movements?.expenses);
    return calculateShiftTotals({
      openingCash,
      cashSales: toNum(payments?.cash),
      cardSales: toNum(payments?.card),
      mobileSales: toNum(payments?.mobile),
      pointsRedeemed: toNum(payments?.points),
      salesCount: toNum(sales?.count),
      returnsTotal: toNum(returns?.total),
      cashRefunds: toNum(returns?.cash),
      cashExpenses,
      expensesTotal: cashExpenses,
      cashIn: toNum(movements?.cash_in),
      cashOut: toNum(movements?.cash_out),
      discountTotal: toNum(sales?.discount),
      taxTotal: toNum(sales?.tax),
    });
  }

  async cashMovements(shiftId: Id): Promise<CashMovement[]> {
    const rows = await this.sql.all('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY created_at, rowid', [shiftId]);
    return rows.map(mapCashMovement);
  }

  async addCashMovement(input: Parameters<ShiftRepository['addCashMovement']>[0], actor: Actor): Promise<CashMovement> {
    const id = newId();
    const signed = input.type === 'cash_out' ? -Math.abs(input.amount) : Math.abs(input.amount);
    await this.sql.transaction([
      cashMovementStatement({ id, shiftId: input.shiftId, counterId: input.counterId, type: input.type, amount: signed, referenceType: null, referenceId: null, referenceNo: null, note: input.note, createdAt: input.createdAt }, actor),
      auditStatement(actor, input.type === 'cash_in' ? 'cash.in' : 'cash.out', 'shift', input.shiftId, { amount: Math.abs(input.amount), note: input.note }, input.createdAt),
    ]);
    const row = await this.sql.get('SELECT * FROM cash_movements WHERE id = ?', [id]);
    if (!row) throw new AppError('saveFailed');
    return mapCashMovement(row);
  }

  /* ----------------------- History & reconciliation ----------------------- */

  private searchWhere(filter: Parameters<ShiftRepository['search']>[0]): Where {
    return new Where()
      .when(filter.counterId && filter.counterId !== 'all', 'cs.counter_id = ?', filter.counterId ?? null)
      .when(filter.userId && filter.userId !== 'all', 'cs.opened_by = ?', filter.userId ?? null)
      .when(filter.status && filter.status !== 'all', 'cs.status = ?', filter.status ?? null)
      .when(filter.from, 'cs.opened_at >= ?', filter.from ?? null)
      .when(filter.to, 'cs.opened_at < ?', filter.to ?? null)
      .when(filter.differenceOnly, "cs.status = 'closed' AND COALESCE(cs.difference, 0) <> 0");
  }

  async search(filter: Parameters<ShiftRepository['search']>[0], page: PageRequest): ReturnType<ShiftRepository['search']> {
    const where = this.searchWhere(filter);
    const limit = limitOffset(page.page, page.pageSize);
    const [countRow, rows] = await Promise.all([
      this.sql.get(`SELECT COUNT(*) AS count FROM cash_sessions cs ${where}`, where.params),
      this.sql.all(
        `SELECT cs.*, c.name_en AS counter_name,
                (SELECT COUNT(*) FROM sales s WHERE s.shift_id = cs.id AND s.status <> 'cancelled') AS sales_count,
                (SELECT COALESCE(SUM(s.grand_total), 0) FROM sales s WHERE s.shift_id = cs.id AND s.status <> 'cancelled') AS sales_total,
                (SELECT COALESCE(SUM(cm.amount), 0) FROM cash_movements cm WHERE cm.shift_id = cs.id AND cm.type <> 'closing') AS drawer_cash
           FROM cash_sessions cs JOIN counters c ON c.id = cs.counter_id ${where}
          ORDER BY cs.opened_at DESC ${limit.sql}`,
        [...where.params, ...limit.params],
      ),
    ]);
    return {
      rows: rows.map((row) => ({ ...mapShift(row), salesCount: toNum(row.sales_count), salesTotal: toNum(row.sales_total), drawerCash: toNum(row.drawer_cash) })),
      total: toNum(countRow?.count),
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  async summary(filter: Parameters<ShiftRepository['summary']>[0]): ReturnType<ShiftRepository['summary']> {
    const where = this.searchWhere(filter);
    const row = await this.sql.get(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN cs.status = 'open' THEN 1 ELSE 0 END), 0) AS open_count,
              COALESCE(SUM(CASE WHEN cs.difference < 0 THEN -cs.difference ELSE 0 END), 0) AS short_total,
              COALESCE(SUM(CASE WHEN cs.difference < 0 THEN 1 ELSE 0 END), 0) AS short_count,
              COALESCE(SUM(CASE WHEN cs.difference > 0 THEN cs.difference ELSE 0 END), 0) AS over_total,
              COALESCE(SUM(CASE WHEN cs.difference > 0 THEN 1 ELSE 0 END), 0) AS over_count,
              COALESCE(SUM((SELECT COALESCE(SUM(s.grand_total), 0) FROM sales s WHERE s.shift_id = cs.id AND s.status <> 'cancelled')), 0) AS sales_total
         FROM cash_sessions cs ${where}`,
      where.params,
    );
    return {
      count: toNum(row?.count),
      openCount: toNum(row?.open_count),
      salesTotal: toNum(row?.sales_total),
      shortTotal: toNum(row?.short_total),
      shortCount: toNum(row?.short_count),
      overTotal: toNum(row?.over_total),
      overCount: toNum(row?.over_count),
    };
  }

  async activity(shiftId: Id): ReturnType<ShiftRepository['activity']> {
    const [payments, counts] = await Promise.all([
      this.sql.all(
        `SELECT p.method AS method, NULLIF(p.provider, '') AS provider, COUNT(DISTINCT p.sale_id) AS count, COALESCE(SUM(p.amount), 0) AS amount
           FROM payments p JOIN sales s ON s.id = p.sale_id
          WHERE s.shift_id = ? AND s.status <> 'cancelled'
          GROUP BY p.method, NULLIF(p.provider, '')
          ORDER BY amount DESC`,
        [shiftId],
      ),
      this.sql.get(
        `SELECT COUNT(*) AS sales, COALESCE(SUM(total_quantity), 0) AS items,
                (SELECT COUNT(*) FROM sales c WHERE c.shift_id = ? AND c.status = 'cancelled') AS cancelled,
                (SELECT COUNT(*) FROM returns r WHERE r.shift_id = ?) AS returns
           FROM sales WHERE shift_id = ? AND status <> 'cancelled'`,
        [shiftId, shiftId, shiftId],
      ),
    ]);
    type Activity = Awaited<ReturnType<ShiftRepository['activity']>>;
    return {
      payments: payments.map((row) => ({
        method: (typeof row.method === 'string' ? row.method : 'cash') as Activity['payments'][number]['method'],
        provider: typeof row.provider === 'string' && row.provider ? row.provider : null,
        amount: toNum(row.amount),
        count: toNum(row.count),
      })),
      salesCount: toNum(counts?.sales),
      itemsSold: toNum(counts?.items),
      cancelledCount: toNum(counts?.cancelled),
      returnsCount: toNum(counts?.returns),
    };
  }
}

export class LocalCounterRepository implements CounterRepository {
  constructor(private readonly sql: SqlClient) {}

  async list(): Promise<Counter[]> {
    const rows = await this.sql.all(
      `SELECT c.*, u.name_en AS assigned_user_name, cs.id AS shift_id, cs.shift_no, COALESCE(cs.opening_cash, 0) AS opening_cash,
              COALESCE((SELECT SUM(amount) FROM cash_movements cm WHERE cm.shift_id = cs.id AND cm.type <> 'closing'), 0) AS current_cash
         FROM counters c
         LEFT JOIN cash_sessions cs ON cs.counter_id = c.id AND cs.status = 'open'
         LEFT JOIN users u ON u.id = COALESCE(cs.opened_by, c.assigned_user_id)
        WHERE c.deleted_at IS NULL
        ORDER BY c.code`,
    );
    return rows.map(mapCounter);
  }

  async update(id: Id, input: Parameters<CounterRepository['update']>[1], actor: Actor): Promise<void> {
    const now = new Date().toISOString();
    const open = await this.sql.get("SELECT id FROM cash_sessions WHERE counter_id = ? AND status = 'open'", [id]);
    // A counter with an open shift stays "open" until the shift is closed.
    const status = open ? 'open' : input.status === 'open' ? 'closed' : input.status;
    await this.sql.transaction([
      { sql: 'UPDATE counters SET name_bn = ?, name_en = ?, status = ?, updated_at = ?, version = version + 1 WHERE id = ?', params: [input.name.bn, input.name.en, status, now, id] },
      auditStatement(actor, 'counter.updated', 'counter', id, { status, name: input.name.en }, now),
    ]);
  }

  async create(input: Parameters<CounterRepository['create']>[0], actor: Actor): Promise<Counter> {
    const id = newId();
    const now = new Date().toISOString();
    try {
      await this.sql.transaction([
        {
          sql: `INSERT INTO counters (id, branch_id, code, name_bn, name_en, status, assigned_user_id, created_at, updated_at, version, sync_status)
                VALUES (?, ?, ?, ?, ?, 'closed', NULL, ?, ?, 1, 'local')`,
          params: [id, input.branchId, input.code.trim().toUpperCase(), input.name.bn, input.name.en, now, now],
        },
        auditStatement(actor, 'counter.updated', 'counter', id, { created: true, code: input.code }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateCode');
      throw new AppError('saveFailed', {}, error);
    }
    const counters = await this.list();
    const created = counters.find((counter) => counter.id === id);
    if (!created) throw new AppError('saveFailed');
    return created;
  }
}
