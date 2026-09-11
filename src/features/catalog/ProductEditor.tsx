import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { CircleDot, Images, LayoutGrid, PackagePlus, Pencil, Save, TriangleAlert } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { useLocalize, useT } from '@/i18n';
import { productService, skuPrefixFor } from '@/services/catalogService';
import { findByCode, useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Id, Product, Supplier, Unit } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader, SectionHeader } from '@/components/ui/Display';
import { suggestedArtFolder } from './artwork';
import { InventorySection } from './InventorySection';
import { PricingSection } from './PricingSection';
import { BasicSection, ClassificationSection, CodesSection } from './ProductFormSections';
import { ProductImageField } from './ProductImageField';
import { ProductPosPreview } from './ProductPosPreview';
import { emptyProductForm, formToInput, normalizeBarcode, productToForm, type ProductFormErrors, type ProductFormState } from './productForm';
import { LEAVE_WITHOUT_PROMPT, useUnsavedChangesPrompt } from './useUnsavedChangesPrompt';

/* ==========================================================================
   Product form (create + edit): sectioned cards on the left, image and a
   live POS preview on the right, Save / Cancel in the footer. Errors show
   inline after the first save attempt and update live while fixing them.
   ========================================================================== */

interface ProductEditorProps {
  /** Product to edit, or null to create one. */
  product: Product | null;
  /** The product's additional (non-primary) barcodes. */
  extraBarcodes: readonly string[];
  suppliers: readonly Supplier[];
}

function defaultUnitId(units: readonly Unit[]): string {
  return (units.find((unit) => unit.id === 'pcs' && unit.isActive) ?? units.find((unit) => unit.isActive) ?? units[0])?.id ?? '';
}

/** Form state without the (possibly large) image, for change detection. */
function snapshot(form: ProductFormState): string {
  return JSON.stringify({ ...form, image: null });
}

/** Field that caused a duplicate SKU / barcode error (looked up in the in-memory catalogue). */
function duplicateErrors(code: 'duplicateSku' | 'duplicateBarcode', form: ProductFormState, productId: Id | null): ProductFormErrors {
  if (code === 'duplicateSku') return { sku: 'errors.duplicateSku' };
  const usedElsewhere = (value: string) => {
    const owner = value ? findByCode(value) : null;
    return owner !== null && owner.id !== productId;
  };
  if (usedElsewhere(normalizeBarcode(form.barcode))) return { barcode: 'errors.duplicateBarcode' };
  const index = form.extraBarcodes.findIndex((value) => usedElsewhere(normalizeBarcode(value)));
  return index >= 0 ? { [`extra-${index}`]: 'errors.duplicateBarcode' } : {};
}

export function ProductEditor({ product, extraBarcodes, suppliers }: ProductEditorProps) {
  const t = useT();
  const localize = useLocalize();
  const navigate = useNavigate();
  const formId = useId();
  const formRef = useRef<HTMLFormElement | null>(null);
  const products = useCatalogStore((state) => state.products);
  const categoryById = useCatalogStore((state) => state.categoryById);
  const unitById = useCatalogStore((state) => state.unitById);

  const [initial] = useState<ProductFormState>(() => {
    if (product) return productToForm(product, extraBarcodes);
    const { tax, inventory } = useSettingsStore.getState().business;
    return emptyProductForm({ unitId: defaultUnitId(useCatalogStore.getState().units), taxRate: tax.defaultRate, minStock: inventory.defaultMinStock, maxStock: inventory.defaultMaxStock });
  });
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ProductFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState<'sku' | 'barcode' | null>(null);
  const editing = product !== null;

  const validation = useMemo(() => formToInput(form, editing), [form, editing]);
  const errors = useMemo<ProductFormErrors>(() => (submitted ? { ...validation.errors, ...serverErrors } : serverErrors), [submitted, validation, serverErrors]);
  const errorCount = Object.keys(errors).length;
  const dirty = useMemo(() => form.image !== initial.image || snapshot(form) !== snapshot(initial), [form, initial]);
  const suggestedFolder = useMemo(
    () => suggestedArtFolder(form.subcategoryId || null, products, categoryById) ?? suggestedArtFolder(form.categoryId || null, products, categoryById),
    [form.subcategoryId, form.categoryId, products, categoryById],
  );
  const unit = unitById.get(form.unitId);
  const unitShort = unit ? localize(unit.short) : '';

  useUnsavedChangesPrompt(dirty && !saving, () =>
    confirmAction({
      title: t('catalog.form.discardTitle'),
      message: t('catalog.form.discardMessage'),
      confirmLabel: t('catalog.form.discardConfirm'),
      cancelLabel: t('catalog.form.keepEditing'),
      tone: 'danger',
    }),
  );

  const update = useCallback((patch: Partial<ProductFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    if ('sku' in patch || 'barcode' in patch || 'extraBarcodes' in patch) setServerErrors((current) => (Object.keys(current).length > 0 ? {} : current));
  }, []);

  const suggestSku = async (categoryId: string, onlyIfEmpty = false) => {
    setSuggesting('sku');
    try {
      const sku = await productService.nextSku(skuPrefixFor(categoryById.get(categoryId)));
      setForm((current) => (onlyIfEmpty && current.sku.trim() ? current : { ...current, sku }));
      setServerErrors({});
    } catch {
      toast.error('catalog.form.errors.suggestFailed');
    } finally {
      setSuggesting(null);
    }
  };

  const generateBarcode = async () => {
    setSuggesting('barcode');
    try {
      update({ barcode: await productService.suggestBarcode() });
    } catch {
      toast.error('catalog.form.errors.suggestFailed');
    } finally {
      setSuggesting(null);
    }
  };

  const changeCategory = (categoryId: string) => {
    update({ categoryId, subcategoryId: '' });
    // A new product gets a SKU from its category right away (the user can still change it).
    if (!editing && !form.sku.trim()) void suggestSku(categoryId, true);
  };

  const focusFirstError = () => {
    window.requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!field) return;
      field.focus({ preventScroll: true });
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const save = async () => {
    if (saving) return;
    setSubmitted(true);
    const { input, errors: found } = formToInput(form, editing);
    const count = Object.keys(found).length;
    if (count > 0) {
      toast.error({ key: 'catalog.form.fixErrors', params: { count } });
      focusFirstError();
      return;
    }
    setSaving(true);
    try {
      const saved = product ? await productService.update(product.id, input, form.priceReason.trim()) : await productService.create(input);
      useCatalogStore.getState().upsert(saved);
      toast.success({ key: product ? 'catalog.form.updated' : 'catalog.form.created', params: { name: localize(saved.name) } });
      navigate(`/products/${saved.id}`, { replace: true, state: LEAVE_WITHOUT_PROMPT });
    } catch (error) {
      if (isAppError(error) && (error.code === 'duplicateSku' || error.code === 'duplicateBarcode')) {
        setServerErrors(duplicateErrors(error.code, form, product?.id ?? null));
        focusFirstError();
      }
      toast.fromError(error);
      setSaving(false);
    }
  };

  // Scanners end a barcode with Enter: never let that submit the whole form.
  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={product ? Pencil : PackagePlus}
        title={product ? t('catalog.form.editTitle') : t('catalog.form.newTitle')}
        description={product ? `${localize(product.name)} · ${product.sku}` : t('catalog.form.newDescription')}
        breadcrumb={[
          { label: t('catalog.products.title'), to: '/products' },
          ...(product ? [{ label: localize(product.name), to: `/products/${product.id}` }] : []),
          { label: product ? t('common.actions.edit') : t('common.labels.new') },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {submitted && errorCount > 0 && (
          <p role="alert" className="type-body-sm mb-5 flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-3 font-medium text-danger-text">
            <TriangleAlert size={17} aria-hidden className="shrink-0" />
            {t('catalog.form.fixErrors', { count: errorCount })}
          </p>
        )}
        <form
          id={formId}
          ref={formRef}
          noValidate
          onKeyDown={onFormKeyDown}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]"
        >
          <div className="flex min-w-0 flex-col gap-5">
            <BasicSection form={form} errors={errors} update={update} />
            <ClassificationSection form={form} errors={errors} update={update} suppliers={suppliers} onCategoryChange={changeCategory} />
            <PricingSection form={form} errors={errors} update={update} product={product} />
            <InventorySection form={form} errors={errors} update={update} product={product} unitShort={unitShort} />
            <CodesSection form={form} errors={errors} update={update} suggesting={suggesting} onSuggestSku={() => void suggestSku(form.categoryId)} onGenerateBarcode={() => void generateBarcode()} />
          </div>
          <aside className="flex min-w-0 flex-col gap-5">
            <Card className="flex flex-col gap-4">
              <SectionHeader icon={Images} title={t('catalog.form.sections.image')} description={t('catalog.form.sections.imageHint')} />
              <ProductImageField image={form.image} categoryId={form.categoryId} suggestedFolder={suggestedFolder} onChange={(image) => update({ image })} />
            </Card>
            <Card className="flex flex-col gap-4">
              <SectionHeader icon={LayoutGrid} title={t('catalog.form.sections.preview')} description={t('catalog.form.sections.previewHint')} />
              <ProductPosPreview form={form} product={product} />
            </Card>
          </aside>
        </form>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg-subtle px-6 py-3">
        <p aria-live="polite" className="type-body-sm flex items-center gap-2 text-fg-muted">
          {dirty && (
            <>
              <CircleDot size={14} aria-hidden className="text-warning" />
              {t('common.states.unsavedChanges')}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => navigate(product ? `/products/${product.id}` : '/products')} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={Save} loading={saving}>
            {t('catalog.form.save')}
          </Button>
        </div>
      </footer>
    </div>
  );
}
