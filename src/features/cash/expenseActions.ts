import { t } from '@/i18n';
import { counterService, expenseService } from '@/services/shiftService';
import { useShiftStore } from '@/stores/shiftStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Expense, ExpenseStatus } from '@/types';

/* ==========================================================================
   Expense status changes and deletion (confirmed, toasted). Each returns
   true when something changed so the screen can reload.
   ========================================================================== */

function refreshDrawer(expense: Expense): void {
  if (expense.paidFrom === 'cash_drawer') void useShiftStore.getState().refreshTotals().catch(() => undefined);
}

async function setStatus(expense: Expense, status: ExpenseStatus): Promise<boolean> {
  try {
    await expenseService.setStatus(expense.id, status);
    toast.success({ key: status === 'approved' ? 'cash.expenses.approved' : 'cash.expenses.rejected', params: { no: expense.expenseNo } });
    refreshDrawer(expense);
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

export function approveExpense(expense: Expense): Promise<boolean> {
  return setStatus(expense, 'approved');
}

export function rejectExpense(expense: Expense): Promise<boolean> {
  return setStatus(expense, 'rejected');
}

/** Voids an approved expense (it no longer counts as spent; it can be approved again). */
export async function voidExpense(expense: Expense): Promise<boolean> {
  const ok = await confirmAction({
    title: t('cash.expenses.confirmVoidTitle', { no: expense.expenseNo }),
    message: t('cash.expenses.confirmVoidMessage'),
    confirmLabel: t('cash.expenses.void'),
    tone: 'danger',
  });
  return ok ? setStatus(expense, 'rejected') : false;
}

/** Deletes an expense; money taken from the drawer of a still-open shift goes back into it. */
export async function deleteExpense(expense: Expense): Promise<boolean> {
  let backToDrawer = false;
  if (expense.paidFrom === 'cash_drawer' && expense.shiftId) {
    const counters = await counterService.list().catch(() => []);
    backToDrawer = counters.some((counter) => counter.shiftId === expense.shiftId);
  }
  const ok = await confirmAction({
    title: t('cash.expenses.confirmDeleteTitle', { no: expense.expenseNo }),
    message: backToDrawer ? `${t('cash.expenses.confirmDeleteMessage')} ${t('cash.expenses.confirmDeleteDrawer')}` : t('cash.expenses.confirmDeleteMessage'),
    confirmLabel: t('common.actions.delete'),
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await expenseService.remove(expense.id);
    toast.success({ key: 'cash.expenses.deleted', params: { no: expense.expenseNo } });
    refreshDrawer(expense);
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}
