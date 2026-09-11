import { APP_CONFIG } from '@/config/app.config';
import { toLocalDate } from '@/domain/dates';
import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import { sequenceKey } from '@/domain/numbering';
import { calculateCashDifference } from '@/domain/shift';
import { repos } from '@/repositories';
import type {
  CashMovement,
  Counter,
  CounterStatus,
  Expense,
  ExpenseCategory,
  ExpenseFilter,
  ExpenseInput,
  ExpenseStatus,
  Id,
  Money,
  PageRequest,
  PageResult,
  Shift,
  ShiftFilter,
  ShiftTotals,
  ShiftWithTotals,
} from '@/types';
import { actor, ctx, requirePermission, terminal } from './context';

/* ==========================================================================
   Shifts, cash drawer, counters and expenses (spec §41–44).
   ========================================================================== */

export const shiftService = {
  current(): Promise<Shift | null> {
    return repos().shifts.getOpenShift(terminal().counterId);
  },

  async currentWithTotals(): Promise<ShiftWithTotals | null> {
    const shift = await repos().shifts.getOpenShift(terminal().counterId);
    if (!shift) return null;
    return { ...shift, totals: await repos().shifts.computeTotals(shift.id, shift.openingCash) };
  },

  async withTotals(shift: Shift): Promise<ShiftWithTotals> {
    const totals = shift.closingTotals ?? (await repos().shifts.computeTotals(shift.id, shift.openingCash));
    return { ...shift, totals };
  },

  totals(shift: Shift): Promise<ShiftTotals> {
    return repos().shifts.computeTotals(shift.id, shift.openingCash);
  },

  getById(id: Id): Promise<Shift | null> {
    return repos().shifts.getById(id);
  },

  list(filter: ShiftFilter, page: PageRequest): Promise<PageResult<Shift>> {
    const scoped = ctx().can('shift.viewAll') ? filter : { ...filter, userId: ctx().user()?.id ?? 'none' };
    return repos().shifts.list(scoped, page);
  },

  async open(openingCash: Money, note: string): Promise<Shift> {
    requirePermission('shift.operate');
    if (!Number.isSafeInteger(openingCash) || openingCash < 0) throw new AppError('invalidPrice');
    const { counterId, branchId } = terminal();
    const counters = await repos().counters.list();
    const counter = counters.find((entry) => entry.id === counterId);
    if (counter?.status === 'maintenance') throw new AppError('permissionDenied');
    const existing = await repos().shifts.getOpenShift(counterId);
    if (existing) throw new AppError('shiftAlreadyOpen');
    const now = ctx().now();
    return repos().shifts.open(
      { id: newId(), sequenceKey: sequenceKey(APP_CONFIG.numbering.shiftPrefix, now), counterId, branchId, openingCash, note: note.trim(), openedAt: now.toISOString() },
      actor(),
    );
  },

  /** Returns whether closing with this count needs a manager's approval. */
  needsApproval(expected: Money, actual: Money): boolean {
    return Math.abs(calculateCashDifference(expected, actual)) > ctx().business().shift.maxDifference && !ctx().can('cash.manage');
  },

  async close(shift: Shift, actualCash: Money, note: string, approvedBy: string | null): Promise<Shift> {
    requirePermission('shift.operate');
    if (!Number.isSafeInteger(actualCash) || actualCash < 0) throw new AppError('invalidPrice');
    const totals = await repos().shifts.computeTotals(shift.id, shift.openingCash);
    const difference = calculateCashDifference(totals.expectedCash, actualCash);
    if (this.needsApproval(totals.expectedCash, actualCash) && !approvedBy) throw new AppError('differenceNeedsApproval');
    return repos().shifts.close({ id: shift.id, totals, actualCash, difference, note: note.trim(), closedAt: ctx().now().toISOString(), approvedBy }, actor());
  },

  cashMovements(shiftId: Id): Promise<CashMovement[]> {
    return repos().shifts.cashMovements(shiftId);
  },

  async cashInOut(shift: Shift, type: 'cash_in' | 'cash_out', amount: Money, note: string, currentCash: Money): Promise<CashMovement> {
    if (!ctx().can('cash.manage') && !ctx().can('shift.operate')) throw new AppError('permissionDenied');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError('invalidPrice');
    if (type === 'cash_out' && amount > currentCash) throw new AppError('invalidPrice');
    if (!note.trim()) throw new AppError('validation');
    return repos().shifts.addCashMovement({ shiftId: shift.id, counterId: shift.counterId, type, amount, note: note.trim(), createdAt: ctx().now().toISOString() }, actor());
  },
};

export const counterService = {
  list(): Promise<Counter[]> {
    return repos().counters.list();
  },
  async update(id: Id, name: { bn: string; en: string }, status: CounterStatus): Promise<void> {
    requirePermission('counters.manage');
    if (!name.bn.trim() || !name.en.trim()) throw new AppError('validation');
    await repos().counters.update(id, { name, status }, actor());
  },
  async create(code: string, name: { bn: string; en: string }): Promise<Counter> {
    requirePermission('counters.manage');
    if (!code.trim() || !name.bn.trim() || !name.en.trim()) throw new AppError('validation');
    return repos().counters.create({ code, name, branchId: terminal().branchId }, actor());
  },
};

export const expenseService = {
  categories(): Promise<ExpenseCategory[]> {
    return repos().expenses.categories();
  },
  list(filter: ExpenseFilter, page: PageRequest): Promise<PageResult<Expense>> {
    return repos().expenses.list(filter, page);
  },
  async create(input: ExpenseInput): Promise<Expense> {
    requirePermission('expenses.create');
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new AppError('invalidPrice');
    if (!input.categoryId) throw new AppError('validation');
    const shift = input.paidFrom === 'cash_drawer' ? await repos().shifts.getOpenShift(terminal().counterId) : null;
    if (input.paidFrom === 'cash_drawer' && !shift) throw new AppError('shiftNotOpen');
    const now = ctx().now();
    const status: ExpenseStatus = ctx().can('expenses.approve') ? 'approved' : 'pending';
    return repos().expenses.create(
      {
        ...input,
        expenseDate: input.expenseDate || toLocalDate(now),
        id: newId(),
        sequenceKey: sequenceKey(APP_CONFIG.numbering.expensePrefix, now),
        shiftId: shift?.id ?? null,
        counterId: shift?.counterId ?? null,
        status,
        createdAt: now.toISOString(),
      },
      actor(),
    );
  },
  async update(id: Id, input: ExpenseInput): Promise<void> {
    requirePermission('expenses.approve');
    await repos().expenses.update(id, input, actor());
  },
  async setStatus(id: Id, status: ExpenseStatus): Promise<void> {
    requirePermission('expenses.approve');
    await repos().expenses.setStatus(id, status, actor());
  },
  async remove(id: Id): Promise<void> {
    requirePermission('expenses.approve');
    await repos().expenses.delete(id, actor());
  },
};

/* --------------------------------------------------------------------------
   Shift history, reconciliation and expense insights (cash screens).
   -------------------------------------------------------------------------- */

type ShiftRepo = ReturnType<typeof repos>['shifts'];
type ExpenseRepo = ReturnType<typeof repos>['expenses'];
type ShiftSearch = Parameters<ShiftRepo['search']>[0];
type ExpenseSearch = Parameters<ExpenseRepo['search']>[0];

/** Users without shift.viewAll only see their own shifts. */
function scopeShifts(filter: ShiftSearch): ShiftSearch {
  return ctx().can('shift.viewAll') ? filter : { ...filter, userId: ctx().user()?.id ?? 'none' };
}

export function searchShifts(filter: ShiftSearch, page: PageRequest): ReturnType<ShiftRepo['search']> {
  return repos().shifts.search(scopeShifts(filter), page);
}

export function summarizeShifts(filter: ShiftSearch): ReturnType<ShiftRepo['summary']> {
  return repos().shifts.summary(scopeShifts(filter));
}

export function shiftActivity(shiftId: Id): ReturnType<ShiftRepo['activity']> {
  return repos().shifts.activity(shiftId);
}

export function searchExpenses(filter: ExpenseSearch, page: PageRequest): ReturnType<ExpenseRepo['search']> {
  return repos().expenses.search(filter, page);
}

export function summarizeExpenses(filter: ExpenseSearch): ReturnType<ExpenseRepo['summary']> {
  return repos().expenses.summary(filter);
}
