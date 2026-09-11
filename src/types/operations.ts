import type { BilingualText, EntityMeta, Id, IsoDate, IsoDateTime, Money } from './common';

/* --------------------------------------------------------------------------
   Organisation (future multi-branch ready)
   -------------------------------------------------------------------------- */

export interface Organization extends EntityMeta {
  name: BilingualText;
}

export interface Branch extends EntityMeta {
  organizationId: Id;
  code: string;
  name: BilingualText;
  address: BilingualText;
  phone: string;
  isActive: boolean;
}

export type CounterStatus = 'open' | 'closed' | 'maintenance';

export interface Counter extends EntityMeta {
  branchId: Id;
  code: string;
  name: BilingualText;
  status: CounterStatus;
  assignedUserId: Id | null;
  assignedUserName: string | null;
  /** Open shift on this counter, if any. */
  shiftId: Id | null;
  shiftNo: string | null;
  openingCash: Money;
  currentCash: Money;
}

export interface Terminal {
  id: Id;
  counterId: Id;
  name: string;
  lastSeenAt: IsoDateTime | null;
}

/* --------------------------------------------------------------------------
   Shifts (cash sessions) and the cash drawer
   -------------------------------------------------------------------------- */

export type ShiftStatus = 'open' | 'closed';

export interface ShiftTotals {
  openingCash: Money;
  cashSales: Money;
  cardSales: Money;
  mobileSales: Money;
  pointsRedeemed: Money;
  grossSales: Money;
  salesCount: number;
  returnsTotal: Money;
  cashRefunds: Money;
  expensesTotal: Money;
  cashIn: Money;
  cashOut: Money;
  discountTotal: Money;
  taxTotal: Money;
  /** openingCash + cashSales − cashRefunds − cash expenses + cashIn − cashOut. */
  expectedCash: Money;
}

export interface Shift extends EntityMeta {
  shiftNo: string;
  counterId: Id;
  counterName: string;
  branchId: Id;
  openedBy: Id;
  openedByName: string;
  closedBy: Id | null;
  closedByName: string | null;
  status: ShiftStatus;
  openingCash: Money;
  /** Snapshot of totals when the shift was closed (null while open). */
  closingTotals: ShiftTotals | null;
  actualCash: Money | null;
  difference: Money | null;
  note: string;
  openedAt: IsoDateTime;
  closedAt: IsoDateTime | null;
}

export interface ShiftWithTotals extends Shift {
  totals: ShiftTotals;
}

export type CashMovementType = 'opening' | 'sale' | 'refund' | 'expense' | 'cash_in' | 'cash_out' | 'closing';

export interface CashMovement {
  id: Id;
  shiftId: Id;
  counterId: Id;
  type: CashMovementType;
  /** Signed: positive into the drawer, negative out of it. */
  amount: Money;
  referenceType: string | null;
  referenceId: Id | null;
  referenceNo: string | null;
  note: string;
  userId: Id | null;
  userName: string | null;
  createdAt: IsoDateTime;
}

export interface ShiftFilter {
  counterId?: Id | 'all';
  userId?: Id | 'all';
  status?: ShiftStatus | 'all';
  from?: IsoDateTime;
  to?: IsoDateTime;
}

/* --------------------------------------------------------------------------
   Expenses
   -------------------------------------------------------------------------- */

export interface ExpenseCategory {
  id: Id;
  code: string;
  name: BilingualText;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export type ExpensePaidFrom = 'cash_drawer' | 'office';

export interface Expense extends EntityMeta {
  expenseNo: string;
  categoryId: Id;
  categoryName: BilingualText;
  amount: Money;
  description: string;
  expenseDate: IsoDate;
  paidFrom: ExpensePaidFrom;
  shiftId: Id | null;
  counterId: Id | null;
  userId: Id | null;
  userName: string | null;
  approvedBy: Id | null;
  approvedByName: string | null;
  status: ExpenseStatus;
}

export interface ExpenseInput {
  id?: Id;
  categoryId: Id;
  amount: Money;
  description: string;
  expenseDate: IsoDate;
  paidFrom: ExpensePaidFrom;
}

export interface ExpenseFilter {
  from?: IsoDateTime;
  to?: IsoDateTime;
  categoryId?: Id | 'all';
  status?: ExpenseStatus | 'all';
  search?: string;
}

/* --------------------------------------------------------------------------
   Audit log & notifications
   -------------------------------------------------------------------------- */

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'product.created'
  | 'product.updated'
  | 'product.deactivated'
  | 'product.activated'
  | 'product.price_changed'
  | 'category.saved'
  | 'brand.saved'
  | 'discount.applied'
  | 'price.overridden'
  | 'sale.completed'
  | 'sale.cancelled'
  | 'sale.returned'
  | 'sale.reprinted'
  | 'shift.opened'
  | 'shift.closed'
  | 'cash.in'
  | 'cash.out'
  | 'stock.adjusted'
  | 'purchase.created'
  | 'purchase.updated'
  | 'purchase.received'
  | 'purchase.cancelled'
  | 'supplier.saved'
  | 'supplier.paid'
  | 'customer.saved'
  | 'customer.deleted'
  | 'loyalty.adjusted'
  | 'expense.created'
  | 'expense.approved'
  | 'expense.rejected'
  | 'counter.updated'
  | 'settings.changed'
  | 'data.exported'
  | 'data.imported'
  | 'data.reset';

export interface AuditLog {
  id: Id;
  userId: Id | null;
  userName: string | null;
  action: AuditAction;
  entity: string;
  entityId: Id | null;
  details: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface AuditFilter {
  search?: string;
  action?: AuditAction | 'all';
  userId?: Id | 'all';
  from?: IsoDateTime;
  to?: IsoDateTime;
}

export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'expiring'
  | 'shift_reminder'
  | 'backup_reminder'
  | 'large_discount'
  | 'pending_purchase'
  | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AppNotification {
  id: Id;
  type: NotificationType;
  severity: NotificationSeverity;
  /** Translation key + params so the text follows the UI language. */
  titleKey: string;
  messageKey: string;
  params: Record<string, string | number>;
  entity: string | null;
  entityId: Id | null;
  isRead: boolean;
  dedupeKey: string;
  createdAt: IsoDateTime;
}
