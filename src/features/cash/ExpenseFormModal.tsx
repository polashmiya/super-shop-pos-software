import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LockOpen, ReceiptText, TriangleAlert } from 'lucide-react';
import { toLocalDate } from '@/domain/dates';
import { parseMoneyInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { defaultReportFilter } from '@/services/reportService';
import { expenseService } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { Expense, ExpenseCategory, ExpensePaidFrom } from '@/types';
import { Button } from '@/components/ui/Button';
import { ChoiceCard, Select } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn, controlBase } from '@/components/ui/cn';
import { amountText, joinExpenseDescription, PAID_FROM_ICONS, PAID_FROM_OPTIONS, sanitizeAmount, splitExpenseDescription } from './cashMeta';

type Field = 'category' | 'amount' | 'date' | 'note' | 'paidFrom';

interface ExpenseFormModalProps {
  /** null = new expense. */
  expense: Expense | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => void;
}

/** Record or correct an expense. Drawer expenses need an open shift and keep their amount once saved. */
export function ExpenseFormModal({ expense, categories, onClose, onSaved }: ExpenseFormModalProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const navigate = useNavigate();
  const canApprove = useCan('expenses.approve');
  const shift = useShiftStore((state) => state.shift);
  const [today] = useState(() => toLocalDate(new Date(defaultReportFilter('today').from)));
  const [initial] = useState(() => splitExpenseDescription(expense?.description ?? ''));
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [amount, setAmount] = useState(expense ? amountText(expense.amount) : '');
  const [date, setDate] = useState(expense?.expenseDate ?? today);
  const [paidFrom, setPaidFrom] = useState<ExpensePaidFrom>(expense?.paidFrom ?? (shift ? 'cash_drawer' : 'office'));
  const [reference, setReference] = useState(initial.reference);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  const editing = expense !== null;
  const amountLocked = editing && expense.paidFrom === 'cash_drawer';
  const drawerBlocked = !editing && paidFrom === 'cash_drawer' && !shift;
  const parsed = parseMoneyInput(amount);
  const clearError = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }));

  const save = async () => {
    const next: Partial<Record<Field, string>> = {};
    if (!categoryId) next.category = t('cash.expenses.form.categoryRequired');
    if (parsed === null || parsed <= 0) next.amount = t('validation.mustBePositive');
    if (!date || date > today) next.date = t('cash.expenses.form.dateInvalid');
    if (!note.trim()) next.note = t('cash.expenses.form.noteRequired');
    if (drawerBlocked) next.paidFrom = t('cash.expenses.form.drawerNoShift');
    setErrors(next);
    if (parsed === null || Object.keys(next).length > 0) return;
    const input = { categoryId, amount: parsed, description: joinExpenseDescription(note, reference), expenseDate: date, paidFrom };
    setSaving(true);
    try {
      if (expense) {
        await expenseService.update(expense.id, { ...input, paidFrom: expense.paidFrom });
        toast.success('cash.expenses.form.updated');
      } else {
        const created = await expenseService.create(input);
        toast.success({ key: 'cash.expenses.form.saved', params: { no: created.expenseNo } });
      }
      if (paidFrom === 'cash_drawer') void useShiftStore.getState().refreshTotals().catch(() => undefined);
      onSaved();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = [
    { value: '', label: t('cash.expenses.form.categoryPlaceholder'), disabled: true },
    ...categories.filter((category) => category.isActive || category.id === expense?.categoryId).map((category) => ({ value: category.id, label: localize(category.name) })),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title={expense ? t('cash.expenses.form.editTitle', { no: expense.expenseNo }) : t('cash.expenses.form.addTitle')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <ReceiptText size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={saving} disabled={drawerBlocked} onClick={() => void save()}>
            {expense ? t('common.actions.saveChanges') : t('cash.expenses.add')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormField label={t('common.labels.category')} required error={errors.category}>
          {(id) => (
            <Select
              id={id}
              value={categoryId}
              invalid={Boolean(errors.category)}
              options={categoryOptions}
              onChange={(value) => {
                setCategoryId(value);
                clearError('category');
              }}
            />
          )}
        </FormField>
        <FormField label={t('common.labels.amount')} required error={errors.amount} hint={amountLocked ? t('cash.expenses.form.amountLocked') : parsed !== null ? format.money(parsed) : undefined}>
          {(id) => (
            <Input
              id={id}
              autoFocus={!editing}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              disabled={amountLocked}
              invalid={Boolean(errors.amount)}
              placeholder={format.integer(0)}
              onChange={(event) => {
                setAmount(sanitizeAmount(event.target.value));
                clearError('amount');
              }}
              className="text-end font-semibold tnum"
            />
          )}
        </FormField>
        <FormField label={t('cash.expenses.form.date')} required error={errors.date}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={date}
              max={today}
              aria-invalid={Boolean(errors.date) || undefined}
              onChange={(event) => {
                setDate(event.target.value);
                clearError('date');
              }}
              className={cn(controlBase, 'min-h-touch')}
            />
          )}
        </FormField>
        <FormField label={t('common.labels.reference')}>
          {(id) => <Input id={id} maxLength={40} autoComplete="off" value={reference} placeholder={t('cash.expenses.form.referencePlaceholder')} onChange={(event) => setReference(event.target.value)} />}
        </FormField>
        <FormField label={t('common.labels.description')} required error={errors.note} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              maxLength={200}
              autoComplete="off"
              value={note}
              invalid={Boolean(errors.note)}
              placeholder={t('cash.expenses.form.notePlaceholder')}
              onChange={(event) => {
                setNote(event.target.value);
                clearError('note');
              }}
            />
          )}
        </FormField>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="type-label mb-1.5 text-fg-muted">{t('cash.expenses.form.paidFrom')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PAID_FROM_OPTIONS.map((option) => {
              const Icon = PAID_FROM_ICONS[option];
              const hint = option === 'office' ? t('cash.expenses.form.officeHint') : shift ? t('cash.expenses.form.drawerHint', { shift: shift.shiftNo }) : t('cash.expenses.form.drawerNoShift');
              return (
                <ChoiceCard
                  key={option}
                  selected={paidFrom === option}
                  disabled={editing}
                  onClick={() => {
                    setPaidFrom(option);
                    clearError('paidFrom');
                  }}
                >
                  <span className="flex items-center gap-2 pe-6 font-semibold text-fg">
                    <Icon size={18} aria-hidden />
                    {t(`enums.paidFrom.${option}`)}
                  </span>
                  <span className="type-caption mt-1 text-fg-muted">{hint}</span>
                </ChoiceCard>
              );
            })}
          </div>
          {editing && <p className="type-caption text-fg-subtle">{t('cash.expenses.form.sourceLocked')}</p>}
          {drawerBlocked && (
            <div className="flex items-start gap-3 rounded-lg bg-warning-soft p-3 text-warning-text">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t('cash.expenses.form.noShiftTitle')}</p>
                <p className="type-body-sm">{t('cash.expenses.form.noShiftMessage')}</p>
              </div>
              <Button
                icon={LockOpen}
                onClick={() => {
                  onClose();
                  navigate('/shift');
                }}
              >
                {t('cash.expenses.form.openShift')}
              </Button>
            </div>
          )}
        </fieldset>
        {!editing && !canApprove && <p className="type-body-sm text-fg-muted sm:col-span-2">{t('cash.expenses.form.pendingNote')}</p>}
      </form>
    </Modal>
  );
}
