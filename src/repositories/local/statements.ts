import { newId } from '@/domain/ids';
import { SEQUENCE_SQL, formattedSequenceSql } from '@/domain/numbering';
import type { AuditAction, Id, IsoDateTime, Money, StockMovementType } from '@/types';
import type { SqlStatement, SqlValue } from '@/types/database';
import type { Actor } from '../types';

/* ==========================================================================
   Reusable SQL statement builders for transactional writes. They keep the
   stock ledger, cash drawer ledger, document numbers and audit trail
   consistent no matter which repository performs the business action.
   ========================================================================== */

export function auditStatement(
  actor: Actor | null,
  action: AuditAction,
  entity: string,
  entityId: Id | null,
  details: Record<string, unknown>,
  createdAt: IsoDateTime = new Date().toISOString(),
): SqlStatement {
  return {
    sql: 'INSERT INTO audit_logs (id, user_id, user_name, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId(), actor?.id ?? null, actor?.name ?? null, action, entity, entityId, JSON.stringify(details), createdAt],
  };
}

/** Increments a document sequence (e.g. "INV-20260910") inside a transaction. */
export function sequenceIncrement(key: string): SqlStatement {
  return { sql: SEQUENCE_SQL.increment, params: [key] };
}

/** SQL expression + params producing the formatted document number for a key. */
export function sequenceValue(key: string, digits?: number): { sql: string; params: SqlValue[] } {
  return { sql: digits ? formattedSequenceSql(digits) : SEQUENCE_SQL.formatted, params: [key, key] };
}

export interface StockChange {
  productId: Id;
  type: StockMovementType;
  /** Signed quantity (+ in, − out). */
  quantity: number;
  unitCost: Money;
  referenceType: string | null;
  referenceId: Id | null;
  referenceNo: string | null;
  /** Use a SQL expression for the reference number (e.g. a new invoice number). */
  referenceNoSql?: { sql: string; params: SqlValue[] };
  reason?: string | null;
  note?: string;
  createdAt: IsoDateTime;
  /** Recalculate the moving-average cost (purchases). */
  updateAverageCost?: boolean;
}

/**
 * Two statements per stock change: update the cached balance, then append a
 * ledger entry whose balance_after is read from the updated balance.
 */
export function stockChangeStatements(change: StockChange, actor: Actor | null): SqlStatement[] {
  const quantity = Math.round(change.quantity * 1000) / 1000;
  const balanceSql = change.updateAverageCost
    ? `INSERT INTO stock_balances (product_id, quantity, avg_cost, last_movement_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         avg_cost = CASE WHEN MAX(stock_balances.quantity, 0) + excluded.quantity > 0
                         THEN CAST(ROUND((MAX(stock_balances.quantity, 0) * stock_balances.avg_cost + excluded.quantity * excluded.avg_cost) / (MAX(stock_balances.quantity, 0) + excluded.quantity)) AS INTEGER)
                         ELSE excluded.avg_cost END,
         quantity = ROUND(stock_balances.quantity + excluded.quantity, 3),
         last_movement_at = excluded.last_movement_at,
         updated_at = excluded.updated_at`
    : `INSERT INTO stock_balances (product_id, quantity, avg_cost, last_movement_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         quantity = ROUND(stock_balances.quantity + excluded.quantity, 3),
         last_movement_at = excluded.last_movement_at,
         updated_at = excluded.updated_at`;
  const referenceNo = change.referenceNoSql ?? { sql: '?', params: [change.referenceNo] };
  return [
    { sql: balanceSql, params: [change.productId, quantity, change.unitCost, change.createdAt, change.createdAt] },
    {
      sql: `INSERT INTO stock_movements (id, product_id, type, quantity, balance_after, unit_cost, reference_type, reference_id, reference_no, reason, note, user_id, user_name, created_at)
            VALUES (?, ?, ?, ?, (SELECT quantity FROM stock_balances WHERE product_id = ?), ?, ?, ?, ${referenceNo.sql}, ?, ?, ?, ?, ?)`,
      params: [
        newId(),
        change.productId,
        change.type,
        quantity,
        change.productId,
        change.unitCost,
        change.referenceType,
        change.referenceId,
        ...referenceNo.params,
        change.reason ?? null,
        change.note ?? '',
        actor?.id ?? null,
        actor?.name ?? null,
        change.createdAt,
      ],
    },
  ];
}

export interface CashChange {
  shiftId: Id;
  counterId: Id;
  type: 'opening' | 'sale' | 'refund' | 'expense' | 'cash_in' | 'cash_out' | 'closing';
  amount: Money;
  referenceType: string | null;
  referenceId: Id | null;
  referenceNo: string | null;
  referenceNoSql?: { sql: string; params: SqlValue[] };
  note?: string;
  createdAt: IsoDateTime;
  id?: Id;
}

export function cashMovementStatement(change: CashChange, actor: Actor | null): SqlStatement {
  const referenceNo = change.referenceNoSql ?? { sql: '?', params: [change.referenceNo] };
  return {
    sql: `INSERT INTO cash_movements (id, shift_id, counter_id, type, amount, reference_type, reference_id, reference_no, note, user_id, user_name, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ${referenceNo.sql}, ?, ?, ?, ?)`,
    params: [
      change.id ?? newId(),
      change.shiftId,
      change.counterId,
      change.type,
      change.amount,
      change.referenceType,
      change.referenceId,
      ...referenceNo.params,
      change.note ?? '',
      actor?.id ?? null,
      actor?.name ?? null,
      change.createdAt,
    ],
  };
}

/** Adds/removes loyalty points and writes the transaction with the new balance. */
export function loyaltyStatements(
  input: {
    customerId: Id;
    type: 'earn' | 'redeem' | 'adjust' | 'reverse';
    points: number;
    saleId: Id | null;
    invoiceNo: string | null;
    invoiceNoSql?: { sql: string; params: SqlValue[] };
    note: string;
    createdAt: IsoDateTime;
  },
  actor: Actor | null,
): SqlStatement[] {
  const invoice = input.invoiceNoSql ?? { sql: '?', params: [input.invoiceNo] };
  return [
    {
      sql: 'UPDATE customers SET loyalty_points = MAX(0, loyalty_points + ?), updated_at = ?, version = version + 1 WHERE id = ?',
      params: [input.points, input.createdAt, input.customerId],
    },
    {
      sql: `INSERT INTO customer_loyalty_transactions (id, customer_id, sale_id, invoice_no, type, points, balance_after, note, user_id, user_name, created_at)
            VALUES (?, ?, ?, ${invoice.sql}, ?, ?, (SELECT loyalty_points FROM customers WHERE id = ?), ?, ?, ?, ?)`,
      params: [
        newId(),
        input.customerId,
        input.saleId,
        ...invoice.params,
        input.type,
        input.points,
        input.customerId,
        input.note,
        actor?.id ?? null,
        actor?.name ?? null,
        input.createdAt,
      ],
    },
  ];
}
