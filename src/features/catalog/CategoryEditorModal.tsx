import { createElement, useId, useState } from 'react';
import { FolderTree, Save } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { useLocalize, useT, type TranslationKey } from '@/i18n';
import { catalogService } from '@/services/catalogService';
import { useCatalogStore } from '@/stores/catalogStore';
import { toast } from '@/stores/uiStore';
import type { Category } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select, Switch } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';
import { CATEGORY_ICONS, categoryIcon } from '@/components/product/categoryIcons';
import { categoryTree, DEFAULT_CATALOG_COLOR, parseWholeNumber, slugify, tintStyle } from './catalogUtils';
import { ColorSwatchPicker } from './ColorSwatchPicker';

interface CategoryEditorModalProps {
  /** Category to edit, or null to create one. */
  category: Category | null;
  /** Parent for a new subcategory. */
  parentId?: string | null;
  onClose: () => void;
}

type CategoryField = 'nameBn' | 'nameEn' | 'code' | 'sortOrder';

const ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Add / edit a category or subcategory (names, code, parent, icon, colour, order, status). */
export function CategoryEditorModal({ category, parentId = null, onClose }: CategoryEditorModalProps) {
  const t = useT();
  const localize = useLocalize();
  const formId = useId();
  const categories = useCatalogStore((state) => state.categories);
  const categoryById = useCatalogStore((state) => state.categoryById);
  const hasChildren = category ? categories.some((entry) => entry.parentId === category.id) : false;
  const parents = categoryTree(categories)
    .map((node) => node.category)
    .filter((entry) => entry.id !== category?.id);

  const [form, setForm] = useState(() => {
    const parent = parentId ? categoryById.get(parentId) : undefined;
    const siblings = categories.filter((entry) => (entry.parentId ?? null) === (category?.parentId ?? parentId));
    return {
      nameBn: category?.name.bn ?? '',
      nameEn: category?.name.en ?? '',
      code: category?.code ?? '',
      parentId: category?.parentId ?? parentId ?? '',
      icon: category?.icon ?? parent?.icon ?? 'Package',
      color: category?.color ?? parent?.color ?? DEFAULT_CATALOG_COLOR,
      sortOrder: String(category?.sortOrder ?? siblings.reduce((max, entry) => Math.max(max, entry.sortOrder + 1), 0)),
      isActive: category?.isActive ?? true,
    };
  });
  const [codeEdited, setCodeEdited] = useState(Boolean(category));
  const [errors, setErrors] = useState<Partial<Record<CategoryField, TranslationKey>>>({});
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key as CategoryField];
      return next;
    });
  };

  const save = async () => {
    const sortOrder = parseWholeNumber(form.sortOrder);
    const found: Partial<Record<CategoryField, TranslationKey>> = {};
    if (!form.nameBn.trim()) found.nameBn = 'validation.required';
    if (!form.nameEn.trim()) found.nameEn = 'validation.required';
    if (!slugify(form.code)) found.code = 'validation.required';
    if (sortOrder === null || sortOrder < 0) found.sortOrder = 'validation.invalidQuantity';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await catalogService.saveCategory({
        id: category?.id,
        parentId: hasChildren ? null : form.parentId || null,
        code: slugify(form.code),
        name: { bn: form.nameBn.trim(), en: form.nameEn.trim() },
        icon: form.icon,
        color: form.color,
        image: category?.image ?? null,
        sortOrder: sortOrder ?? 0,
        isActive: form.isActive,
      });
      await useCatalogStore.getState().reloadCatalog();
      toast.success({ key: 'catalog.categories.saved', params: { name: localize(saved.name) } });
      onClose();
    } catch (error) {
      if (isAppError(error) && error.code === 'duplicateCode') setErrors({ code: 'errors.duplicateCode' });
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const isSub = Boolean(hasChildren ? null : form.parentId);
  const title = category ? t('catalog.categories.editor.editTitle') : parentId ? t('catalog.categories.editor.newSubTitle') : t('catalog.categories.editor.newTitle');

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title={title}
      description={t('catalog.categories.editor.description')}
      closeLabel={t('common.actions.close')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
          <FolderTree size={20} aria-hidden />
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
        <div aria-label={t('catalog.categories.editor.preview')} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg" style={tintStyle(form.color, 22)}>
            {createElement(categoryIcon(form.icon), { size: 24, 'aria-hidden': true })}
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-h3 truncate text-fg">{localize({ bn: form.nameBn, en: form.nameEn }) || title}</p>
            <p className="type-caption truncate text-fg-subtle">
              {isSub && form.parentId ? `${localize(categoryById.get(form.parentId)?.name)} › ` : ''}
              <span className="font-mono">{slugify(form.code) || '—'}</span>
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.labels.nameBn')} required error={errors.nameBn && t(errors.nameBn)}>
            {(id) => <Input id={id} data-autofocus value={form.nameBn} lang="bn" invalid={Boolean(errors.nameBn)} onChange={(event) => update({ nameBn: event.target.value })} />}
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
          <FormField label={t('catalog.categories.editor.parent')} hint={hasChildren ? t('catalog.categories.editor.parentLocked') : undefined}>
            {(id) => (
              <Select
                id={id}
                value={hasChildren ? '' : form.parentId}
                disabled={hasChildren}
                onChange={(value) => update({ parentId: value })}
                options={[{ value: '', label: t('catalog.categories.editor.topLevel') }, ...parents.map((entry) => ({ value: entry.id, label: localize(entry.name) }))]}
              />
            )}
          </FormField>
          <FormField label={t('catalog.categories.editor.code')} required error={errors.code && t(errors.code)} hint={t('catalog.categories.editor.codeHint')}>
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
          <FormField label={t('catalog.categories.editor.sortOrder')} error={errors.sortOrder && t(errors.sortOrder)} hint={t('catalog.categories.editor.sortOrderHint')}>
            {(id) => <Input id={id} inputMode="numeric" value={form.sortOrder} className="tnum" invalid={Boolean(errors.sortOrder)} onChange={(event) => update({ sortOrder: event.target.value })} />}
          </FormField>
          <div className="flex items-end">
            <Switch className="w-full" checked={form.isActive} onChange={(isActive) => update({ isActive })} label={t('catalog.categories.editor.active')} description={t('catalog.categories.editor.activeHint')} />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="type-label mb-2 text-fg-muted">{t('catalog.categories.editor.icon')}</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
            {ICON_NAMES.map((name) => {
              const Icon = CATEGORY_ICONS[name];
              const selected = form.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  aria-label={t('catalog.categories.editor.iconOption', { name })}
                  onClick={() => update({ icon: name })}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-md border transition-base',
                    selected ? 'border-primary bg-primary-soft text-primary-soft-fg ring-1 ring-primary' : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg',
                  )}
                >
                  <Icon size={19} aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="type-label mb-2 text-fg-muted">{t('catalog.categories.editor.color')}</legend>
          <ColorSwatchPicker value={form.color} onChange={(color) => update({ color })} label={t('catalog.categories.editor.color')} />
        </fieldset>
      </form>
    </Modal>
  );
}
