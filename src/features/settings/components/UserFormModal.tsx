import { useId, useState } from 'react';
import { Check, UserPlus, UserRoundPen } from 'lucide-react';
import { AVATAR_COLORS } from '@/config/theme.config';
import { ROLE_ORDER } from '@/config/permissions';
import { isAppError } from '@/domain/errors';
import { useLocalize, useT } from '@/i18n';
import { pinBounds, toUserInput, userService, validateUserForm, type UserField, type UserFormErrors } from '@/services/userService';
import { useAuthStore } from '@/stores/authStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { RoleId, User, UserInput } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Select, Switch } from '@/components/ui/Controls';
import { Avatar } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface FormState {
  nameBn: string;
  nameEn: string;
  username: string;
  roleId: RoleId;
  phone: string;
  email: string;
  counterId: string;
  avatarColor: string;
  isActive: boolean;
  pin: string;
  pinConfirm: string;
}

function initialState(user: User | null, suggestedColor: string): FormState {
  const input = user ? toUserInput(user) : null;
  return {
    nameBn: input?.name.bn ?? '',
    nameEn: input?.name.en ?? '',
    username: input?.username ?? '',
    roleId: input?.roleId ?? 'cashier',
    phone: input?.phone ?? '',
    email: input?.email ?? '',
    counterId: input?.defaultCounterId ?? '',
    avatarColor: input?.avatarColor ?? suggestedColor,
    isActive: input?.isActive ?? true,
    pin: '',
    pinConfirm: '',
  };
}

const digitsOnly = (value: string, max: number) => value.replace(/[^\d০-৯]/g, '').slice(0, max);

/** Add or edit a staff account (PIN is set when the account is created; use "Reset PIN" later). */
export function UserFormModal({ user, suggestedColor, onClose, onSaved }: { user: User | null; suggestedColor: string; onClose: () => void; onSaved: (user: User) => void }) {
  const t = useT();
  const localize = useLocalize();
  const formId = useId();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const counters = useShiftStore((state) => state.counters);
  const [form, setForm] = useState<FormState>(() => initialState(user, suggestedColor));
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const isNew = user === null;
  const isSelf = user !== null && user.id === currentUserId;
  const { min, max } = pinBounds();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (key in errors) setErrors((previous) => ({ ...previous, [key as UserField]: undefined }));
    if (key === 'username') setUsernameTaken(false);
  };

  const message = (field: UserField): string | undefined => {
    if (field === 'username' && usernameTaken) return t('errors.duplicateUsername');
    const key = errors[field];
    if (!key) return undefined;
    if (key === 'usernameFormat') return t('settings.users.errors.usernameFormat');
    if (key === 'pinMismatch') return t('settings.users.errors.pinMismatch');
    if (key === 'invalidPin') return t('settings.users.errors.invalidPin', { min, max });
    return t(`validation.${key}`);
  };

  const submit = async () => {
    const input: UserInput = {
      username: form.username,
      name: { bn: form.nameBn, en: form.nameEn },
      roleId: form.roleId,
      phone: form.phone,
      email: form.email,
      defaultCounterId: form.counterId || null,
      avatarColor: form.avatarColor,
      isActive: isSelf ? true : form.isActive,
      pin: isNew ? form.pin : undefined,
    };
    const found = validateUserForm(input, { requirePin: isNew, pinConfirm: isNew ? form.pinConfirm : undefined });
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    try {
      const saved = isNew ? await userService.create({ ...input, pin: form.pin }) : await userService.update(user.id, input);
      toast.success({ key: isNew ? 'settings.users.form.created' : 'settings.users.form.saved', params: { name: localize(saved.name) } });
      onSaved(saved);
    } catch (error) {
      if (isAppError(error) && error.code === 'duplicateUsername') setUsernameTaken(true);
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const counterOptions = [{ value: '', label: t('settings.users.form.noCounter') }, ...counters.map((counter) => ({ value: counter.id, label: `${counter.code} · ${localize(counter.name)}` }))];
  const displayName = (form.nameEn || form.nameBn || '?').trim();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      closeLabel={t('common.actions.close')}
      title={isNew ? t('settings.users.newTitle') : t('settings.users.editTitle', { name: localize(user.name) })}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          {isNew ? <UserPlus size={20} aria-hidden /> : <UserRoundPen size={20} aria-hidden />}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {isNew ? t('settings.users.form.create') : t('settings.users.form.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <FormField label={t('settings.users.form.nameBn')} required error={message('nameBn')}>
          {(id) => <Input id={id} lang="bn" data-autofocus value={form.nameBn} maxLength={60} invalid={Boolean(message('nameBn'))} onChange={(event) => update('nameBn', event.target.value)} />}
        </FormField>
        <FormField label={t('settings.users.form.nameEn')} required error={message('nameEn')}>
          {(id) => <Input id={id} lang="en" value={form.nameEn} maxLength={60} invalid={Boolean(message('nameEn'))} onChange={(event) => update('nameEn', event.target.value)} />}
        </FormField>
        <FormField label={t('settings.users.form.username')} required error={message('username')} hint={t('settings.users.form.usernameHint')}>
          {(id) => <Input id={id} value={form.username} maxLength={32} autoComplete="off" className="font-mono" invalid={Boolean(message('username'))} onChange={(event) => update('username', event.target.value.toLowerCase())} />}
        </FormField>
        <FormField label={t('settings.users.form.role')} hint={t(`settings.users.roles.${form.roleId}`)}>
          {(id) => <Select id={id} value={form.roleId} disabled={isSelf} options={ROLE_ORDER.map((role) => ({ value: role, label: t(`enums.role.${role}`) }))} onChange={(roleId) => update('roleId', roleId)} />}
        </FormField>
        <FormField label={t('settings.users.form.phone')} error={message('phone')}>
          {(id) => <Input id={id} value={form.phone} inputMode="tel" maxLength={20} invalid={Boolean(message('phone'))} onChange={(event) => update('phone', event.target.value)} />}
        </FormField>
        <FormField label={t('settings.users.form.email')} error={message('email')}>
          {(id) => <Input id={id} type="email" value={form.email} maxLength={120} invalid={Boolean(message('email'))} onChange={(event) => update('email', event.target.value)} />}
        </FormField>
        <FormField label={t('settings.users.form.counter')}>{(id) => <Select id={id} value={form.counterId} options={counterOptions} onChange={(value) => update('counterId', value)} />}</FormField>
        <div className="flex flex-col gap-1.5">
          <span className="type-label text-fg-muted">{t('settings.users.form.color')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={displayName} color={form.avatarColor} size={40} />
            {AVATAR_COLORS.map((color, index) => (
              <button
                key={color}
                type="button"
                aria-pressed={form.avatarColor === color}
                aria-label={t('settings.users.form.colorOption', { index: index + 1 })}
                onClick={() => update('avatarColor', color)}
                className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-base', form.avatarColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'hover:scale-110')}
                style={{ backgroundColor: color }}
              >
                {form.avatarColor === color && <Check size={15} strokeWidth={3} aria-hidden className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        {isNew ? (
          <>
            <FormField label={t('settings.users.form.pin')} required error={message('pin')} hint={t('settings.users.form.pinHint', { min, max })}>
              {(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="new-password" value={form.pin} invalid={Boolean(message('pin'))} className="tracking-[0.3em]" onChange={(event) => update('pin', digitsOnly(event.target.value, max))} />}
            </FormField>
            <FormField label={t('settings.users.form.pinConfirm')} required error={message('pinConfirm')}>
              {(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="new-password" value={form.pinConfirm} invalid={Boolean(message('pinConfirm'))} className="tracking-[0.3em]" onChange={(event) => update('pinConfirm', digitsOnly(event.target.value, max))} />}
            </FormField>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Switch
              checked={isSelf ? true : form.isActive}
              disabled={isSelf}
              onChange={(value) => update('isActive', value)}
              label={t('settings.users.form.active')}
              description={isSelf ? t('settings.users.errors.ownAccount') : t('settings.users.form.activeHint')}
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
