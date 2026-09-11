import { useId, useState } from 'react';
import { Ruler, Save } from 'lucide-react';
import { useLocalize, useT, type TranslationKey } from '@/i18n';
import { catalogService } from '@/services/catalogService';
import { useCatalogStore } from '@/stores/catalogStore';
import { toast } from '@/stores/uiStore';
import type { Unit } from '@/types';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { parseWholeNumber, UNIT_CODE_PATTERN } from './catalogUtils';

interface UnitEditorModalProps {
  /** Unit to edit, or null to create one. */
  unit: Unit | null;
  onClose: () => void;
}

type UnitField = 'code' | 'nameBn' | 'nameEn' | 'shortBn' | 'shortEn' | 'sortOrder';

/** Add / edit a selling unit (code, names, short names, fractions, order, status). */
export function UnitEditorModal({ unit, onClose }: UnitEditorModalProps) {
  const t = useT();
  const localize = useLocalize();
  const formId = useId();
  const units = useCatalogStore((state) => state.units);
  const [form, setForm] = useState(() => ({
    code: unit?.id ?? '',
    nameBn: unit?.name.bn ?? '',
    nameEn: unit?.name.en ?? '',
    shortBn: unit?.short.bn ?? '',
    shortEn: unit?.short.en ?? '',
    allowDecimal: unit?.allowDecimal ?? false,
    sortOrder: String(unit?.sortOrder ?? units.reduce((max, entry) => Math.max(max, entry.sortOrder + 1), 0)),
    isActive: unit?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Partial<Record<UnitField, TranslationKey>>>({});
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as UnitField];
      return next;
    });
  };

  const save = async () => {
    const code = form.code.trim().toLowerCase();
    const sortOrder = parseWholeNumber(form.sortOrder);
    const found: Partial<Record<UnitField, TranslationKey>> = {};
    if (!unit) {
      if (!code) found.code = 'validation.required';
      else if (!UNIT_CODE_PATTERN.test(code)) found.code = 'catalog.units.editor.codeInvalid';
      else if (units.some((entry) => entry.id.toLowerCase() === code)) found.code = 'errors.duplicateCode';
    }
    if (!form.nameBn.trim()) found.nameBn = 'validation.required';
    if (!form.nameEn.trim()) found.nameEn = 'validation.required';
    if (!form.shortBn.trim()) found.shortBn = 'validation.required';
    if (!form.shortEn.trim()) found.shortEn = 'validation.required';
    if (sortOrder === null || sortOrder < 0) found.sortOrder = 'validation.invalidQuantity';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await catalogService.saveUnit({
        id: unit?.id ?? code,
        name: { bn: form.nameBn.trim(), en: form.nameEn.trim() },
        short: { bn: form.shortBn.trim(), en: form.shortEn.trim() },
        allowDecimal: form.allowDecimal,
        sortOrder: sortOrder ?? 0,
        isActive: form.isActive,
      });
      await useCatalogStore.getState().reloadCatalog();
      toast.success({ key: 'catalog.units.saved', params: { name: localize(saved.name) } });
      onClose();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const errorText = (field: UnitField) => {
    const key = errors[field];
    return key ? t(key) : undefined;
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      title={unit ? t('catalog.units.editor.editTitle') : t('catalog.units.editor.newTitle')}
      description={t('catalog.units.editor.description')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
          <Ruler size={20} aria-hidden />
        </span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={Save} loading={saving}>
            {t('common.actions.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormField
          label={t('catalog.units.editor.code')}
          required={!unit}
          className="sm:col-span-2"
          error={errorText('code')}
          hint={unit ? t('catalog.units.editor.codeLocked') : t('catalog.units.editor.codeHint')}
        >
          {(id) => (
            <Input
              id={id}
              data-autofocus={unit ? undefined : true}
              value={form.code}
              disabled={Boolean(unit)}
              maxLength={16}
              autoComplete="off"
              className="font-mono"
              invalid={Boolean(errors.code)}
              onChange={(event) => update({ code: event.target.value.toLowerCase().replace(/\s+/g, '-') })}
            />
          )}
        </FormField>
        <FormField label={t('common.labels.nameBn')} required error={errorText('nameBn')}>
          {(id) => <Input id={id} data-autofocus={unit ? true : undefined} lang="bn" value={form.nameBn} invalid={Boolean(errors.nameBn)} onChange={(event) => update({ nameBn: event.target.value })} />}
        </FormField>
        <FormField label={t('common.labels.nameEn')} required error={errorText('nameEn')}>
          {(id) => <Input id={id} value={form.nameEn} invalid={Boolean(errors.nameEn)} onChange={(event) => update({ nameEn: event.target.value })} />}
        </FormField>
        <FormField label={t('catalog.units.editor.shortBn')} required error={errorText('shortBn')} hint={t('catalog.units.editor.shortHint')}>
          {(id) => <Input id={id} lang="bn" maxLength={12} value={form.shortBn} invalid={Boolean(errors.shortBn)} onChange={(event) => update({ shortBn: event.target.value })} />}
        </FormField>
        <FormField label={t('catalog.units.editor.shortEn')} required error={errorText('shortEn')}>
          {(id) => <Input id={id} maxLength={12} value={form.shortEn} invalid={Boolean(errors.shortEn)} onChange={(event) => update({ shortEn: event.target.value })} />}
        </FormField>
        <FormField label={t('catalog.units.editor.sortOrder')} error={errorText('sortOrder')} hint={t('catalog.units.editor.sortOrderHint')}>
          {(id) => <Input id={id} inputMode="numeric" className="tnum" value={form.sortOrder} invalid={Boolean(errors.sortOrder)} onChange={(event) => update({ sortOrder: event.target.value })} />}
        </FormField>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Switch checked={form.allowDecimal} onChange={(allowDecimal) => update({ allowDecimal })} label={t('catalog.units.editor.allowDecimal')} description={t('catalog.units.editor.allowDecimalHint')} />
          <Switch checked={form.isActive} onChange={(isActive) => update({ isActive })} label={t('catalog.units.editor.active')} description={t('catalog.units.editor.activeHint')} />
        </div>
      </form>
    </Modal>
  );
}
