import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { pick, useLanguage, useT, type TranslationKey } from '@/i18n';
import { shiftService } from '@/services/shiftService';
import { useCan } from '@/stores/authStore';
import { requestApproval, toast } from '@/stores/uiStore';
import type { Money, Shift } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';
import { CashCountInput } from './CashCountInput';
import { CASH_IN_REASONS, CASH_OUT_REASONS, countValue, emptyCount, MOVEMENT_QUICK_AMOUNTS, type CashCountState, type CashInReason, type CashOutReason } from './cashMeta';

export type MovementType = 'cash_in' | 'cash_out';

interface CashMovementDialogProps {
  shift: Shift;
  /** Cash the drawer should hold now (expected cash). */
  drawerCash: Money;
  initialType: MovementType;
  /** Blind count: do not show the drawer amount. */
  hideDrawer?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Reason = CashInReason | CashOutReason;

function reasonKey(type: MovementType, reason: Reason): TranslationKey {
  return type === 'cash_in' ? `cash.movement.reasons.in.${reason as CashInReason}` : `cash.movement.reasons.out.${reason as CashOutReason}`;
}

/** Adds cash to or takes cash out of the drawer, with a reason and manager approval where needed. */
export function CashMovementDialog({ shift, drawerCash, initialType, hideDrawer, onClose, onSaved }: CashMovementDialogProps) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const canManage = useCan('cash.manage');
  const [type, setType] = useState<MovementType>(initialType);
  const [reason, setReason] = useState<Reason>(initialType === 'cash_in' ? CASH_IN_REASONS[0] : CASH_OUT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [count, setCount] = useState<CashCountState>(() => emptyCount());
  const [errors, setErrors] = useState<{ amount?: string; details?: string }>({});
  const [saving, setSaving] = useState(false);

  const reasons: readonly Reason[] = type === 'cash_in' ? CASH_IN_REASONS : CASH_OUT_REASONS;
  const typeLabel = type === 'cash_in' ? t('cash.movement.titleIn') : t('cash.movement.titleOut');

  const changeType = (next: MovementType) => {
    setType(next);
    setReason(next === 'cash_in' ? CASH_IN_REASONS[0] : CASH_OUT_REASONS[0]);
    setErrors({});
  };

  const save = async () => {
    const amount = countValue(count);
    const nextErrors: { amount?: string; details?: string } = {};
    if (amount === null || amount <= 0) nextErrors.amount = t('validation.mustBePositive');
    else if (type === 'cash_out' && amount > drawerCash) nextErrors.amount = t('cash.movement.exceeds', { amount: format.money(Math.max(0, drawerCash)) });
    if (reason === 'other' && !details.trim()) nextErrors.details = t('cash.movement.detailsRequired');
    setErrors(nextErrors);
    if (amount === null || Object.keys(nextErrors).length > 0) return;

    const reasonLabel = t(reasonKey(type, reason));
    let note = details.trim() ? `${reasonLabel}: ${details.trim()}` : reasonLabel;
    if (!canManage) {
      const approver = await requestApproval({ permission: 'cash.manage', action: t('cash.movement.approvalAction', { type: typeLabel, amount: format.money(amount) }) });
      if (!approver) {
        toast.error('cash.movement.approvalDeclined');
        return;
      }
      note = `${note} (${t('cash.movement.approvedNote', { name: pick(approver.name, language) })})`;
    }
    setSaving(true);
    try {
      await shiftService.cashInOut(shift, type, amount, note, drawerCash);
      toast.success({ key: type === 'cash_in' ? 'cash.movement.savedIn' : 'cash.movement.savedOut', params: { amount: format.money(amount) } });
      onSaved();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const Icon = type === 'cash_in' ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      title={typeLabel}
      description={type === 'cash_in' ? t('cash.movement.descriptionIn') : t('cash.movement.descriptionOut')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', type === 'cash_in' ? 'bg-info-soft text-info-text' : 'bg-primary-soft text-primary-soft-fg')}>
          <Icon size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" icon={Icon} loading={saving} onClick={() => void save()}>
            {type === 'cash_in' ? t('cash.movement.submitIn') : t('cash.movement.submitOut')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SegmentedControl<MovementType>
          ariaLabel={t('cash.movement.type')}
          value={type}
          onChange={changeType}
          fullWidth
          options={[
            { value: 'cash_in', label: t('cash.movement.titleIn'), icon: ArrowDownToLine },
            { value: 'cash_out', label: t('cash.movement.titleOut'), icon: ArrowUpFromLine },
          ]}
        />
        <FormField label={t('cash.movement.reason')} required>
          {(id) => <Select<Reason> id={id} value={reason} onChange={setReason} options={reasons.map((value) => ({ value, label: t(reasonKey(type, value)) }))} />}
        </FormField>
        <CashCountInput
          state={count}
          onChange={(next) => {
            setCount(next);
            if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
          }}
          label={t('common.labels.amount')}
          allowNotes={false}
          autoFocus
          quickAmounts={MOVEMENT_QUICK_AMOUNTS}
          error={errors.amount}
          hint={hideDrawer ? undefined : t('cash.movement.inDrawer', { amount: format.money(drawerCash) })}
        />
        <FormField label={t('cash.movement.details')} required={reason === 'other'} error={errors.details}>
          {(id) => (
            <Input
              id={id}
              maxLength={200}
              autoComplete="off"
              value={details}
              placeholder={t('cash.movement.detailsPlaceholder')}
              invalid={Boolean(errors.details)}
              onChange={(event) => {
                setDetails(event.target.value);
                if (errors.details) setErrors((current) => ({ ...current, details: undefined }));
              }}
            />
          )}
        </FormField>
        {!canManage && (
          <p className="flex items-start gap-2 rounded-lg bg-info-soft p-3 type-body-sm text-info-text">
            <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0" />
            {t('cash.movement.managerHint')}
          </p>
        )}
      </form>
    </Modal>
  );
}
