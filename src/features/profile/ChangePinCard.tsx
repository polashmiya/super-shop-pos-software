import { useId, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { toAsciiDigits } from '@/domain/text';
import { validatePin } from '@/domain/validation';
import { useT } from '@/i18n';
import { pinBounds, userService } from '@/services/userService';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/Input';
import { SettingBlock, SettingsCard } from '@/features/settings/components/SettingsCard';

type Field = 'current' | 'next' | 'confirm';

const digitsOnly = (value: string, max: number) => value.replace(/[^\d০-৯]/g, '').slice(0, max);

/** The signed-in user changes their own PIN (the current PIN is required). */
export function ChangePinCard() {
  const t = useT();
  const formId = useId();
  const { min, max } = pinBounds();
  const [values, setValues] = useState<Record<Field, string>>({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: Field, value: string) => {
    setValues((previous) => ({ ...previous, [field]: digitsOnly(value, max) }));
    setError(null);
  };

  const submit = async () => {
    const next = toAsciiDigits(values.next);
    if (!values.current) return setError({ field: 'current', text: t('validation.required') });
    if (validatePin(next, min, max)) return setError({ field: 'next', text: t('settings.users.errors.invalidPin', { min, max }) });
    if (toAsciiDigits(values.confirm) !== next) return setError({ field: 'confirm', text: t('settings.users.errors.pinMismatch') });
    if (toAsciiDigits(values.current) === next) return setError({ field: 'next', text: t('settings.profile.samePin') });
    setSaving(true);
    try {
      await userService.changeOwnPin(values.current, next);
      setValues({ current: '', next: '', confirm: '' });
      toast.success('settings.profile.pinChanged');
    } catch (reason) {
      if (isAppError(reason) && reason.code === 'loginFailed') setError({ field: 'current', text: t('settings.profile.wrongPin') });
      else toast.fromError(reason);
    } finally {
      setSaving(false);
    }
  };

  const field = (name: Field, label: string, hint?: string) => (
    <FormField label={label} hint={hint} error={error?.field === name ? error.text : undefined}>
      {(id) => (
        <Input
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete={name === 'current' ? 'current-password' : 'new-password'}
          value={values[name]}
          invalid={error?.field === name}
          className="tracking-[0.35em]"
          onChange={(event) => set(name, event.target.value)}
        />
      )}
    </FormField>
  );

  return (
    <SettingsCard icon={KeyRound} title={t('settings.profile.changePin')} description={t('settings.profile.changePinHint')}>
      <SettingBlock>
        <form
          id={formId}
          noValidate
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {field('current', t('settings.profile.currentPin'))}
          {field('next', t('settings.profile.newPin'), t('settings.profile.pinHint', { min, max }))}
          {field('confirm', t('settings.users.form.pinConfirm'))}
          <div className="sm:col-span-3">
            <Button type="submit" variant="primary" icon={KeyRound} loading={saving} disabled={!values.current || !values.next || !values.confirm}>
              {t('settings.profile.savePin')}
            </Button>
          </div>
        </form>
      </SettingBlock>
    </SettingsCard>
  );
}
