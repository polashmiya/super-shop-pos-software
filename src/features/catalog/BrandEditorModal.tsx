import { useId, useState } from 'react';
import { Save, Tags } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { initials } from '@/domain/text';
import { useLocalize, useT, type TranslationKey } from '@/i18n';
import { catalogService } from '@/services/catalogService';
import { useCatalogStore } from '@/stores/catalogStore';
import { toast } from '@/stores/uiStore';
import type { Brand } from '@/types';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_CATALOG_COLOR, slugify } from './catalogUtils';
import { ColorSwatchPicker } from './ColorSwatchPicker';

interface BrandEditorModalProps {
  /** Brand to edit, or null to create one. */
  brand: Brand | null;
  onClose: () => void;
}

type BrandField = 'nameBn' | 'nameEn' | 'code';

/** Add / edit a brand (names, code, colour, status). */
export function BrandEditorModal({ brand, onClose }: BrandEditorModalProps) {
  const t = useT();
  const localize = useLocalize();
  const formId = useId();
  const [form, setForm] = useState(() => ({
    nameBn: brand?.name.bn ?? '',
    nameEn: brand?.name.en ?? '',
    code: brand?.code ?? '',
    color: brand?.color ?? DEFAULT_CATALOG_COLOR,
    isActive: brand?.isActive ?? true,
  }));
  const [codeEdited, setCodeEdited] = useState(Boolean(brand));
  const [errors, setErrors] = useState<Partial<Record<BrandField, TranslationKey>>>({});
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as BrandField];
      return next;
    });
  };

  const save = async () => {
    const found: Partial<Record<BrandField, TranslationKey>> = {};
    if (!form.nameBn.trim()) found.nameBn = 'validation.required';
    if (!form.nameEn.trim()) found.nameEn = 'validation.required';
    if (!slugify(form.code)) found.code = 'validation.required';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await catalogService.saveBrand({
        id: brand?.id,
        code: slugify(form.code),
        name: { bn: form.nameBn.trim(), en: form.nameEn.trim() },
        logo: brand?.logo ?? null,
        color: form.color,
        isActive: form.isActive,
      });
      await useCatalogStore.getState().reloadCatalog();
      toast.success({ key: 'catalog.brands.saved', params: { name: localize(saved.name) } });
      onClose();
    } catch (error) {
      if (isAppError(error) && error.code === 'duplicateCode') setErrors({ code: 'errors.duplicateCode' });
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const displayName = localize({ bn: form.nameBn, en: form.nameEn });

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="md"
      title={brand ? t('catalog.brands.editor.editTitle') : t('catalog.brands.editor.newTitle')}
      description={t('catalog.brands.editor.description')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
          <Tags size={20} aria-hidden />
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
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div aria-label={t('catalog.brands.editor.preview')} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white" style={{ backgroundColor: form.color }}>
            {initials(form.nameEn || form.nameBn || '?')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-h3 truncate text-fg">{displayName || t('catalog.brands.editor.newTitle')}</p>
            <p className="type-caption truncate font-mono text-fg-subtle">{slugify(form.code) || '—'}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.labels.nameBn')} required error={errors.nameBn && t(errors.nameBn)}>
            {(id) => <Input id={id} data-autofocus lang="bn" value={form.nameBn} invalid={Boolean(errors.nameBn)} onChange={(event) => update({ nameBn: event.target.value })} />}
          </FormField>
          <FormField label={t('common.labels.nameEn')} required error={errors.nameEn && t(errors.nameEn)}>
            {(id) => (
              <Input
                id={id}
                value={form.nameEn}
                invalid={Boolean(errors.nameEn)}
                onChange={(event) => update({ nameEn: event.target.value, ...(codeEdited ? {} : { code: slugify(event.target.value) }) })}
              />
            )}
          </FormField>
          <FormField label={t('catalog.brands.editor.code')} required className="sm:col-span-2" error={errors.code && t(errors.code)} hint={t('catalog.brands.editor.codeHint')}>
            {(id) => (
              <Input
                id={id}
                value={form.code}
                className="font-mono"
                invalid={Boolean(errors.code)}
                onChange={(event) => {
                  setCodeEdited(true);
                  update({ code: event.target.value });
                }}
                onBlur={() => update({ code: slugify(form.code) })}
              />
            )}
          </FormField>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="type-label mb-2 text-fg-muted">{t('catalog.brands.editor.color')}</legend>
          <ColorSwatchPicker value={form.color} onChange={(color) => update({ color })} label={t('catalog.brands.editor.color')} />
        </fieldset>

        <Switch checked={form.isActive} onChange={(isActive) => update({ isActive })} label={t('catalog.brands.editor.active')} description={t('catalog.brands.editor.activeHint')} />
      </form>
    </Modal>
  );
}
