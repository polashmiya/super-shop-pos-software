import { useState } from 'react';
import { MonitorCog, MonitorSmartphone } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { useLanguage, useT } from '@/i18n';
import { counterService } from '@/services/shiftService';
import { toast } from '@/stores/uiStore';
import type { Counter, CounterStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { counterName } from './cashMeta';

type Field = 'code' | 'nameBn' | 'nameEn' | 'active';

interface CounterFormModalProps {
  /** null = new counter. */
  counter: Counter | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Add a checkout counter or rename / activate / deactivate one. */
export function CounterFormModal({ counter, onClose, onSaved }: CounterFormModalProps) {
  const t = useT();
  const language = useLanguage();
  const [code, setCode] = useState(counter?.code ?? '');
  const [nameBn, setNameBn] = useState(counter?.name.bn ?? '');
  const [nameEn, setNameEn] = useState(counter?.name.en ?? '');
  const [active, setActive] = useState(counter ? counter.status !== 'maintenance' : true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  const clearError = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }));

  const save = async () => {
    const next: Partial<Record<Field, string>> = {};
    if (!counter && !code.trim()) next.code = t('validation.required');
    if (!nameBn.trim()) next.nameBn = t('validation.required');
    if (!nameEn.trim()) next.nameEn = t('validation.required');
    if (counter?.shiftId && !active) next.active = t('cash.counters.deactivateBlocked');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const name = { bn: nameBn.trim(), en: nameEn.trim() };
    setSaving(true);
    try {
      if (counter) {
        const status: CounterStatus = active ? (counter.status === 'maintenance' ? 'closed' : counter.status) : 'maintenance';
        await counterService.update(counter.id, name, status);
        toast.success('cash.counters.form.saved');
      } else {
        const created = await counterService.create(code.trim().toUpperCase(), name);
        if (!active) await counterService.update(created.id, created.name, 'maintenance');
        toast.success({ key: 'cash.counters.form.created', params: { code: created.code } });
      }
      onSaved();
    } catch (error) {
      if (isAppError(error) && error.code === 'duplicateCode') setErrors((current) => ({ ...current, code: t('errors.duplicateCode') }));
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const Icon = counter ? MonitorCog : MonitorSmartphone;

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      title={counter ? t('cash.counters.form.editTitle', { name: counterName(counter, language) }) : t('cash.counters.form.addTitle')}
      description={counter ? counter.code : undefined}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <Icon size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {counter ? t('common.actions.saveChanges') : t('cash.counters.add')}
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
        <FormField label={t('cash.counters.form.code')} required={!counter} hint={t('cash.counters.form.codeHint')} error={errors.code} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              autoFocus={!counter}
              maxLength={8}
              autoComplete="off"
              value={code}
              disabled={Boolean(counter)}
              invalid={Boolean(errors.code)}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                clearError('code');
              }}
              className="font-mono uppercase"
            />
          )}
        </FormField>
        <FormField label={t('common.labels.nameBn')} required error={errors.nameBn}>
          {(id) => (
            <Input
              id={id}
              autoFocus={Boolean(counter)}
              maxLength={60}
              autoComplete="off"
              value={nameBn}
              invalid={Boolean(errors.nameBn)}
              onChange={(event) => {
                setNameBn(event.target.value);
                clearError('nameBn');
              }}
            />
          )}
        </FormField>
        <FormField label={t('common.labels.nameEn')} required error={errors.nameEn}>
          {(id) => (
            <Input
              id={id}
              maxLength={60}
              autoComplete="off"
              value={nameEn}
              invalid={Boolean(errors.nameEn)}
              onChange={(event) => {
                setNameEn(event.target.value);
                clearError('nameEn');
              }}
            />
          )}
        </FormField>
        <div className="sm:col-span-2">
          <Switch
            checked={active}
            onChange={(checked) => {
              setActive(checked);
              clearError('active');
            }}
            label={t('cash.counters.form.active')}
            description={t('cash.counters.form.activeHint')}
          />
          {errors.active && (
            <p role="alert" className="type-caption text-danger-text">
              {errors.active}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
