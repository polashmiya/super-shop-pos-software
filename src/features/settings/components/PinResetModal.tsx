import { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { validatePin } from '@/domain/validation';
import { toAsciiDigits } from '@/domain/text';
import { useLocalize, useT } from '@/i18n';
import { pinBounds, userService } from '@/services/userService';
import { toast } from '@/stores/uiStore';
import type { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

const digitsOnly = (value: string, max: number) => value.replace(/[^\d০-৯]/g, '').slice(0, max);

/** Sets a new PIN for a staff member who forgot theirs (manager/admin only). */
export function PinResetModal({ user, onClose }: { user: User; onClose: () => void }) {
  const t = useT();
  const localize = useLocalize();
  const formId = useId();
  const { min, max } = pinBounds();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<{ field: 'pin' | 'confirm'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const name = localize(user.name);

  const submit = async () => {
    const digits = toAsciiDigits(pin);
    if (validatePin(digits, min, max)) {
      setError({ field: 'pin', text: t('settings.users.errors.invalidPin', { min, max }) });
      return;
    }
    if (toAsciiDigits(confirm) !== digits) {
      setError({ field: 'confirm', text: t('settings.users.errors.pinMismatch') });
      return;
    }
    setSaving(true);
    try {
      await userService.resetPin(user.id, digits);
      toast.success({ key: 'settings.users.pinChanged', params: { name } });
      onClose();
    } catch (reason) {
      toast.fromError(reason);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      dismissible={!saving}
      closeLabel={t('common.actions.close')}
      title={t('settings.users.pinTitle', { name })}
      description={t('settings.users.pinDescription')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <KeyRound size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving} disabled={!pin || !confirm}>
            {t('settings.users.pinSave')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label={t('settings.users.form.pin')} hint={t('settings.users.form.pinHint', { min, max })} error={error?.field === 'pin' ? error.text : undefined}>
          {(id) => (
            <Input
              id={id}
              data-autofocus
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              invalid={error?.field === 'pin'}
              inputSize="lg"
              className="text-center tracking-[0.4em]"
              onChange={(event) => {
                setPin(digitsOnly(event.target.value, max));
                setError(null);
              }}
            />
          )}
        </FormField>
        <FormField label={t('settings.users.form.pinConfirm')} error={error?.field === 'confirm' ? error.text : undefined}>
          {(id) => (
            <Input
              id={id}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              invalid={error?.field === 'confirm'}
              inputSize="lg"
              className="text-center tracking-[0.4em]"
              onChange={(event) => {
                setConfirm(digitsOnly(event.target.value, max));
                setError(null);
              }}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
