import { Ban, CircleCheck, CircleX, EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import type { Expense } from '@/types';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { approveExpense, deleteExpense, rejectExpense, voidExpense } from './expenseActions';

interface ExpenseRowActionsProps {
  expense: Expense;
  onEdit: (expense: Expense) => void;
  /** Called after a status change or deletion. */
  onChanged: () => void;
}

/** Edit, approve / reject, void and delete (managers with expenses.approve only). */
export function ExpenseRowActions({ expense, onEdit, onChanged }: ExpenseRowActionsProps) {
  const t = useT();
  const after = (run: () => Promise<boolean>) => () => {
    void run().then((changed) => {
      if (changed) onChanged();
    });
  };

  const items: Array<MenuItem | 'separator'> = [
    { key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: () => onEdit(expense) },
    ...(expense.status !== 'approved' ? [{ key: 'approve', label: t('common.actions.approve'), icon: CircleCheck, onSelect: after(() => approveExpense(expense)) }] : []),
    ...(expense.status === 'pending' ? [{ key: 'reject', label: t('common.actions.reject'), icon: CircleX, onSelect: after(() => rejectExpense(expense)) }] : []),
    ...(expense.status === 'approved' ? [{ key: 'void', label: t('cash.expenses.void'), icon: Ban, onSelect: after(() => voidExpense(expense)) }] : []),
    'separator',
    { key: 'delete', label: t('common.actions.delete'), icon: Trash2, danger: true, onSelect: after(() => deleteExpense(expense)) },
  ];

  return (
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu items={items} width={220} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('cash.expenses.rowActions', { no: expense.expenseNo })} tooltipSide="left" />} />
    </div>
  );
}
