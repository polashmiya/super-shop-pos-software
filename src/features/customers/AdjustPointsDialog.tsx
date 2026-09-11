import { useState } from 'react';
import { ArrowRight, Coins, Minus, Plus } from 'lucide-react';
import { toAsciiDigits } from '@/domain/text';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService } from '@/services/peopleService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';

const NOTE_KEYS = ['goodwill', 'correction', 'promotion', 'expired'] as const;

interface AdjustPointsDialogProps {
  customer: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

/** Manual loyalty correction (+/−) with a required note; recorded in the loyalty ledger and audit log. */
export function AdjustPointsDialog({ customer, onClose, onSaved }: AdjustPointsDialogProps) {
  const t = useT();
  const format = useFormat();
  const pointValue = useSettingsStore((state) => state.business.loyalty.pointValue);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [pointsText, setPointsText] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ points?: string; note?: string }>({});
  const [saving, setSaving] = useState(false);

  const ascii = toAsciiDigits(pointsText.trim());
  const points = /^\d+$/.test(ascii) ? Number(ascii) : 0;
  const signed = mode === 'add' ? points : -points;
  const newBalance = Math.max(0, customer.loyaltyPoints + signed);

  const save = async () => {
    const next: { points?: string; note?: string } = {};
    if (points <= 0) next.points = t('validation.mustBePositive');
    else if (mode === 'remove' && points > customer.loyaltyPoints) next.points = t('customers.loyalty.adjust.tooMany', { count: customer.loyaltyPoints });
    if (!note.trim()) next.note = t('validation.required');
    setErrors(next);
    if (next.points || next.note) return;
    setSaving(true);
    try {
      const updated = await customerService.adjustPoints(customer.id, signed, note);
      toast.success({ key: 'customers.loyalty.adjust.done', params: { name: customer.name, balance: updated.loyaltyPoints } });
      onSaved(updated);
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      title={t('customers.loyalty.adjust.title')}
      description={customer.name}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <Coins size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('customers.loyalty.adjust.save')}
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
        <SegmentedControl
          fullWidth
          ariaLabel={t('customers.loyalty.adjust.direction')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'add', label: t('customers.loyalty.adjust.add'), icon: Plus },
            { value: 'remove', label: t('customers.loyalty.adjust.remove'), icon: Minus },
          ]}
        />
        <FormField label={t('customers.loyalty.adjust.points')} required error={errors.points}>
          {(id) => (
            <Input
              id={id}
              data-autofocus
              inputMode="numeric"
              inputSize="lg"
              value={pointsText}
              placeholder="0"
              invalid={Boolean(errors.points)}
              onChange={(event) => {
                setPointsText(event.target.value.replace(/[^\d০-৯]/g, '').slice(0, 7));
                if (errors.points) setErrors((current) => ({ ...current, points: undefined }));
              }}
              className="text-end text-xl font-bold tnum"
            />
          )}
        </FormField>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3" aria-live="polite">
          <div>
            <p className="type-caption text-fg-subtle">{t('customers.loyalty.adjust.current')}</p>
            <p className="text-lg font-bold text-fg tnum">{format.integer(customer.loyaltyPoints)}</p>
          </div>
          <ArrowRight size={18} aria-hidden className="text-fg-subtle" />
          <div className="text-end">
            <p className="type-caption text-fg-subtle">{t('customers.loyalty.adjust.newBalance')}</p>
            <p className={cn('text-lg font-bold tnum', signed > 0 ? 'text-success-text' : signed < 0 ? 'text-warning-text' : 'text-fg')}>{format.integer(newBalance)}</p>
            <p className="type-caption text-fg-subtle">{t('customers.loyalty.worth', { amount: format.money(newBalance * pointValue) })}</p>
          </div>
        </div>

        <FormField label={t('customers.loyalty.adjust.note')} required error={errors.note}>
          {(id) => (
            <Input
              id={id}
              value={note}
              maxLength={160}
              placeholder={t('customers.loyalty.adjust.notePlaceholder')}
              invalid={Boolean(errors.note)}
              onChange={(event) => {
                setNote(event.target.value);
                if (errors.note) setErrors((current) => ({ ...current, note: undefined }));
              }}
            />
          )}
        </FormField>
        <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('customers.loyalty.adjust.quickNotes')}>
          {NOTE_KEYS.map((key) => {
            const text = t(`customers.loyalty.adjust.notes.${key}`);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={note === text}
                onClick={() => {
                  setNote(text);
                  setErrors((current) => ({ ...current, note: undefined }));
                }}
                className={cn(
                  'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-base',
                  note === text ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
