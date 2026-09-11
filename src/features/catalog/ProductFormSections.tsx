import { useMemo } from 'react';
import { Barcode, FileText, FolderTree, Plus, ScanBarcode, Trash2, WandSparkles } from 'lucide-react';
import { isAcceptableBarcode } from '@/domain/barcode';
import { useLocalize, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Controls';
import { Card, SectionHeader } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { BarcodeImage } from './BarcodeImage';
import { categoryTree } from './catalogUtils';
import { normalizeBarcode, type ProductSectionProps } from './productForm';

/* Basic information, classification and codes sections of the product form. */

export function BasicSection({ form, errors, update }: ProductSectionProps) {
  const t = useT();
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={FileText} title={t('catalog.form.sections.basic')} description={t('catalog.form.sections.basicHint')} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('common.labels.nameBn')} required error={err('nameBn')}>
          {(id) => <Input id={id} lang="bn" data-autofocus value={form.nameBn} placeholder={t('catalog.form.placeholders.nameBn')} invalid={Boolean(errors.nameBn)} onChange={(event) => update({ nameBn: event.target.value })} />}
        </FormField>
        <FormField label={t('common.labels.nameEn')} required error={err('nameEn')}>
          {(id) => <Input id={id} value={form.nameEn} placeholder={t('catalog.form.placeholders.nameEn')} invalid={Boolean(errors.nameEn)} onChange={(event) => update({ nameEn: event.target.value })} />}
        </FormField>
        <FormField label={t('common.labels.descriptionBn')}>
          {(id) => <Textarea id={id} lang="bn" rows={3} value={form.descriptionBn} placeholder={t('catalog.form.placeholders.descriptionBn')} onChange={(event) => update({ descriptionBn: event.target.value })} />}
        </FormField>
        <FormField label={t('common.labels.descriptionEn')}>
          {(id) => <Textarea id={id} rows={3} value={form.descriptionEn} placeholder={t('catalog.form.placeholders.descriptionEn')} onChange={(event) => update({ descriptionEn: event.target.value })} />}
        </FormField>
      </div>
    </Card>
  );
}

interface ClassificationProps extends ProductSectionProps {
  suppliers: readonly Supplier[];
  onCategoryChange: (categoryId: string) => void;
}

export function ClassificationSection({ form, errors, update, suppliers, onCategoryChange }: ClassificationProps) {
  const t = useT();
  const localize = useLocalize();
  const categories = useCatalogStore((state) => state.categories);
  const brands = useCatalogStore((state) => state.brands);
  const units = useCatalogStore((state) => state.units);
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);

  const categoryOptions: SelectOption[] = [
    { value: '', label: t('catalog.form.placeholders.selectCategory'), disabled: true },
    ...tree.filter((node) => node.category.isActive || node.category.id === form.categoryId).map((node) => ({ value: node.category.id, label: localize(node.category.name) })),
  ];
  const subcategories = tree.find((node) => node.category.id === form.categoryId)?.children.filter((child) => child.isActive || child.id === form.subcategoryId) ?? [];
  const subcategoryOptions: SelectOption[] = [{ value: '', label: t('catalog.form.placeholders.noSubcategory') }, ...subcategories.map((child) => ({ value: child.id, label: localize(child.name) }))];
  const brandOptions: SelectOption[] = [
    { value: '', label: t('catalog.form.placeholders.noBrand') },
    ...brands
      .filter((brand) => brand.isActive || brand.id === form.brandId)
      .sort((a, b) => localize(a.name).localeCompare(localize(b.name)))
      .map((brand) => ({ value: brand.id, label: localize(brand.name) })),
  ];
  const unitOptions: SelectOption[] = [
    ...(form.unitId ? [] : [{ value: '', label: t('catalog.form.placeholders.selectUnit'), disabled: true }]),
    ...units.filter((unit) => unit.isActive || unit.id === form.unitId).map((unit) => ({ value: unit.id, label: `${localize(unit.name)} (${localize(unit.short)})` })),
  ];
  const supplierOptions: SelectOption[] = [
    { value: '', label: t('catalog.form.placeholders.noSupplier') },
    ...suppliers.filter((supplier) => supplier.status === 'active' || supplier.id === form.supplierId).map((supplier) => ({ value: supplier.id, label: supplier.company ? `${supplier.name} · ${supplier.company}` : supplier.name })),
  ];

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={FolderTree} title={t('catalog.form.sections.classification')} description={t('catalog.form.sections.classificationHint')} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('common.labels.category')} required error={err('categoryId')}>
          {(id) => <Select id={id} value={form.categoryId} options={categoryOptions} invalid={Boolean(errors.categoryId)} aria-invalid={errors.categoryId ? true : undefined} onChange={onCategoryChange} />}
        </FormField>
        <FormField label={t('common.labels.subcategory')}>
          {(id) => <Select id={id} value={form.subcategoryId} options={subcategoryOptions} disabled={!form.categoryId || subcategories.length === 0} onChange={(subcategoryId) => update({ subcategoryId })} />}
        </FormField>
        <FormField label={t('common.labels.brand')}>{(id) => <Select id={id} value={form.brandId} options={brandOptions} onChange={(brandId) => update({ brandId })} />}</FormField>
        <FormField label={t('common.labels.unit')} required error={err('unitId')}>
          {(id) => <Select id={id} value={form.unitId} options={unitOptions} invalid={Boolean(errors.unitId)} aria-invalid={errors.unitId ? true : undefined} onChange={(unitId) => update({ unitId })} />}
        </FormField>
        <FormField label={t('common.labels.supplier')} className="md:col-span-2">
          {(id) => <Select id={id} value={form.supplierId} options={supplierOptions} onChange={(supplierId) => update({ supplierId })} />}
        </FormField>
      </div>
    </Card>
  );
}

interface CodesProps extends ProductSectionProps {
  suggesting: 'sku' | 'barcode' | null;
  onSuggestSku: () => void;
  onGenerateBarcode: () => void;
}

export function CodesSection({ form, errors, update, suggesting, onSuggestSku, onGenerateBarcode }: CodesProps) {
  const t = useT();
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const primary = normalizeBarcode(form.barcode);

  const setExtra = (index: number, value: string) => update({ extraBarcodes: form.extraBarcodes.map((code, position) => (position === index ? value : code)) });

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={ScanBarcode} title={t('catalog.form.sections.codes')} description={t('catalog.form.sections.codesHint')} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t('catalog.form.fields.sku')} required error={err('sku')} hint={t('catalog.form.fields.skuHint')}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={form.sku} autoComplete="off" placeholder={t('catalog.form.placeholders.sku')} className="font-mono uppercase" invalid={Boolean(errors.sku)} onChange={(event) => update({ sku: event.target.value.toUpperCase() })} />
              <Button icon={WandSparkles} loading={suggesting === 'sku'} onClick={onSuggestSku}>
                {t('catalog.form.fields.suggestSku')}
              </Button>
            </div>
          )}
        </FormField>
        <FormField label={t('catalog.form.fields.barcode')} required error={err('barcode')} hint={t('catalog.form.fields.barcodeHint')}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} value={form.barcode} autoComplete="off" placeholder={t('catalog.form.placeholders.barcode')} className="font-mono" invalid={Boolean(errors.barcode)} onChange={(event) => update({ barcode: event.target.value })} />
              <Button icon={Barcode} loading={suggesting === 'barcode'} onClick={onGenerateBarcode}>
                {t('catalog.form.fields.generateBarcode')}
              </Button>
            </div>
          )}
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <span className="type-label text-fg-muted">{t('catalog.form.fields.barcodePreview')}</span>
        {isAcceptableBarcode(primary) ? (
          <BarcodeImage value={primary} height={60} className="self-start" />
        ) : (
          <p className="type-body-sm rounded-md border border-dashed border-border-strong px-4 py-5 text-center text-fg-subtle">{t('catalog.form.fields.barcodePreviewEmpty')}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="type-label text-fg-muted">{t('catalog.form.fields.extraBarcodes')}</p>
            <p className="type-caption text-fg-subtle">{t('catalog.form.fields.extraBarcodesHint')}</p>
          </div>
          <Button variant="soft" size="sm" icon={Plus} onClick={() => update({ extraBarcodes: [...form.extraBarcodes, ''] })}>
            {t('catalog.form.fields.addBarcode')}
          </Button>
        </div>
        {form.extraBarcodes.length === 0 ? (
          <p className="type-body-sm text-fg-subtle">{t('catalog.form.fields.noExtraBarcodes')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {form.extraBarcodes.map((code, index) => (
              <li key={index}>
                <FormField label={<span className="sr-only">{t('catalog.form.fields.extraBarcodes')}</span>} error={err(`extra-${index}`)}>
                  {(id) => (
                    <div className="flex gap-2">
                      <Input
                        id={id}
                        value={code}
                        autoComplete="off"
                        autoFocus={code === '' && index === form.extraBarcodes.length - 1}
                        placeholder={t('catalog.form.placeholders.extraBarcode')}
                        className="font-mono"
                        invalid={Boolean(errors[`extra-${index}`])}
                        onChange={(event) => setExtra(index, event.target.value)}
                      />
                      <IconButton
                        icon={Trash2}
                        variant="danger"
                        label={t('catalog.form.fields.removeBarcode', { code: code || '—' })}
                        onClick={() => update({ extraBarcodes: form.extraBarcodes.filter((_, position) => position !== index) })}
                      />
                    </div>
                  )}
                </FormField>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
