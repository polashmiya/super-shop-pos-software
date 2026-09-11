import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ListPlus, PackagePlus, Save, Send, ShoppingCart, TriangleAlert } from 'lucide-react';
import { toLocalDate } from '@/domain/dates';
import { parseQuantityInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { calculatePurchaseTotals, purchaseService } from '@/services/purchaseService';
import { useCatalogStore } from '@/stores/catalogStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Id, Product, PurchaseDetail, PurchaseInput, Supplier } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { Card, PageHeader, SectionHeader } from '@/components/ui/Display';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/States';
import { allowsDecimal, reorderQuantity } from '@/features/inventory/inventoryHelpers';
import { ProductPicker } from '@/features/inventory/ProductPicker';
import { PurchaseLinesTable } from './PurchaseLinesTable';
import { checkLine, formSnapshot, hasLineErrors, lineFromItem, lineFromProduct, quantityToInput, type DraftLine } from './purchaseForm';

interface PurchaseEditorProps {
  purchase: PurchaseDetail | null;
  suppliers: Supplier[];
  presetSupplierId: string | null;
  presetProductId: string | null;
}

/** Create or edit a purchase order (draft → ordered). */
export function PurchaseEditor({ purchase, suppliers, presetSupplierId, presetProductId }: PurchaseEditorProps) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const navigate = useNavigate();
  const products = useCatalogStore((state) => state.products);
  const byId = useCatalogStore((state) => state.byId);
  const unitById = useCatalogStore((state) => state.unitById);

  const decimalsFor = (product: Product | undefined): boolean => (product ? allowsDecimal(product, unitById.get(product.unitId)) : true);
  const activeSupplier = (id: string | null | undefined): boolean => Boolean(id && suppliers.some((supplier) => supplier.id === id && supplier.status === 'active'));

  const [initial] = useState(() => {
    const presetProduct = presetProductId ? byId.get(presetProductId) : undefined;
    const supplierId = purchase?.supplierId ?? (activeSupplier(presetSupplierId) ? (presetSupplierId as string) : activeSupplier(presetProduct?.supplierId) ? (presetProduct?.supplierId as string) : '');
    const lines: DraftLine[] = purchase
      ? purchase.items.map(lineFromItem)
      : presetProduct
        ? [lineFromProduct(presetProduct, reorderQuantity(presetProduct, decimalsFor(presetProduct)))]
        : [];
    return { supplierId, orderDate: purchase?.orderDate ?? toLocalDate(new Date()), expectedDate: purchase?.expectedDate ?? '', note: purchase?.note ?? '', lines };
  });
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [orderDate, setOrderDate] = useState(initial.orderDate);
  const [expectedDate, setExpectedDate] = useState(initial.expectedDate);
  const [note, setNote] = useState(initial.note);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'ordered' | null>(null);

  const checks = useMemo(
    () =>
      lines.map((line) => {
        const product = byId.get(line.productId);
        return checkLine(line, product ? allowsDecimal(product, unitById.get(product.unitId)) : true);
      }),
    [lines, byId, unitById],
  );
  const totals = useMemo(() => calculatePurchaseTotals(checks.map((check) => check.item)), [checks]);
  const dirty = formSnapshot({ supplierId, orderDate, expectedDate, note, lines }) !== formSnapshot(initial);
  const existingIds = useMemo(() => new Set(lines.map((line) => line.productId)), [lines]);
  const lowStock = useMemo(
    () => (supplierId ? products.filter((product) => product.supplierId === supplierId && product.status === 'active' && product.stock <= product.minStock && !existingIds.has(product.id)) : []),
    [products, supplierId, existingIds],
  );

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const supplierOptions = [
    { value: '', label: t('inventory.purchaseForm.selectSupplier'), disabled: true },
    ...suppliers
      .filter((supplier) => supplier.status === 'active' || supplier.id === supplierId)
      .map((supplier) => ({ value: supplier.id, label: supplier.status === 'active' ? supplier.name : t('inventory.purchaseForm.inactiveSupplier', { name: supplier.name }) })),
  ];
  const lineErrors = checks.some(hasLineErrors);
  const supplierError = submitted && !supplierId ? t('inventory.purchaseForm.supplierRequired') : undefined;
  const orderDateError = submitted && !orderDate ? t('validation.required') : undefined;
  const totalQuantity = checks.reduce((sum, check) => sum + check.item.quantity, 0);

  const updateLine = (productId: Id, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => (line.productId === productId ? { ...line, ...patch } : line)));
  const removeLine = (productId: Id) => setLines((current) => current.filter((line) => line.productId !== productId));
  const focusQuantity = (productId: Id) => requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-line-qty="${productId}"]`)?.focus());

  const addProduct = (product: Product) => {
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      updateLine(product.id, { quantity: quantityToInput((parseQuantityInput(existing.quantity) ?? 0) + 1) });
      toast.info({ key: 'inventory.purchaseForm.alreadyAdded', params: { name: localize(product.name) } });
    } else {
      setLines((current) => [...current, lineFromProduct(product, reorderQuantity(product, decimalsFor(product)))]);
      if (!supplierId && activeSupplier(product.supplierId)) setSupplierId(product.supplierId as string);
    }
    focusQuantity(product.id);
  };

  const addLowStock = () => {
    if (lowStock.length === 0) {
      toast.info('inventory.purchaseForm.noLowStock');
      return;
    }
    setLines((current) => [...current, ...lowStock.map((product) => lineFromProduct(product, reorderQuantity(product, decimalsFor(product))))]);
    toast.success({ key: 'inventory.purchaseForm.lowStockAdded', params: { count: lowStock.length } });
  };

  const leave = async () => {
    if (dirty && !(await confirmAction({ title: t('common.confirm.discardChanges'), message: t('inventory.purchaseForm.discardMessage'), confirmLabel: t('inventory.purchaseForm.discard'), tone: 'danger' }))) return;
    navigate(purchase ? `/purchases/${purchase.id}` : '/purchases');
  };

  const save = async (status: 'draft' | 'ordered') => {
    setSubmitted(true);
    if (!supplierId || !orderDate) {
      toast.error('errors.validation');
      return;
    }
    if (lines.length === 0) {
      toast.error('inventory.purchaseForm.itemsRequired');
      return;
    }
    if (lineErrors) {
      toast.error('inventory.purchaseForm.invalidLines');
      return;
    }
    const input: PurchaseInput = { supplierId, orderDate, expectedDate: expectedDate || null, note, status, items: checks.map((check) => check.item) };
    setBusy(status);
    try {
      if (purchase) {
        await purchaseService.update(purchase.id, input);
        toast.success({ key: 'inventory.purchaseForm.updated', params: { poNo: purchase.poNo } });
        navigate(`/purchases/${purchase.id}`, { replace: true });
      } else {
        const created = await purchaseService.create(input);
        toast.success({ key: 'inventory.purchaseForm.created', params: { poNo: created.poNo } });
        navigate(`/purchases/${created.id}`, { replace: true });
      }
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(null);
    }
  };

  const editingOrdered = purchase?.status === 'ordered';

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ShoppingCart}
        title={purchase ? t('inventory.purchaseForm.editTitle', { poNo: purchase.poNo }) : t('inventory.purchaseForm.newTitle')}
        description={t('inventory.purchaseForm.description')}
        breadcrumb={[{ label: t('nav.purchases'), to: '/purchases' }, ...(purchase ? [{ label: purchase.poNo, to: `/purchases/${purchase.id}` }] : []), { label: purchase ? t('common.actions.edit') : t('common.labels.new') }]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader title={t('inventory.purchaseForm.details')} />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField label={t('common.labels.supplier')} required error={supplierError} hint={selectedSupplier ? [selectedSupplier.contactPerson, selectedSupplier.phone ? format.digits(selectedSupplier.phone) : ''].filter(Boolean).join(' · ') || undefined : undefined} className="md:col-span-2">
                {(id) => <Select id={id} value={supplierId} options={supplierOptions} invalid={Boolean(supplierError)} onChange={setSupplierId} />}
              </FormField>
              <FormField label={t('inventory.purchaseForm.orderDate')} required error={orderDateError}>
                {(id) => <Input id={id} type="date" value={orderDate} invalid={Boolean(orderDateError)} onChange={(event) => setOrderDate(event.target.value)} />}
              </FormField>
              <FormField label={t('inventory.purchaseForm.expectedDate')} hint={t('common.labels.optional')}>
                {(id) => <Input id={id} type="date" value={expectedDate} min={orderDate || undefined} onChange={(event) => setExpectedDate(event.target.value)} />}
              </FormField>
              <FormField label={t('inventory.purchaseForm.note')} hint={t('common.labels.optional')} className="md:col-span-2 xl:col-span-4">
                {(id) => <Textarea id={id} rows={2} maxLength={500} value={note} placeholder={t('inventory.purchaseForm.notePlaceholder')} onChange={(event) => setNote(event.target.value)} />}
              </FormField>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex flex-col gap-3 border-b border-border p-5">
              <SectionHeader
                title={t('inventory.purchaseForm.items')}
                description={lines.length > 0 ? t('inventory.purchaseForm.itemsSummary', { count: lines.length, qty: format.quantity(totalQuantity) }) : undefined}
                action={
                  <Button icon={ListPlus} onClick={addLowStock} disabled={!supplierId || lowStock.length === 0} title={!supplierId ? t('inventory.purchaseForm.addLowStockNeedsSupplier') : undefined}>
                    {t('inventory.purchaseForm.addLowStock')}
                    {supplierId && lowStock.length > 0 ? ` (${format.integer(lowStock.length)})` : ''}
                  </Button>
                }
              />
              <ProductPicker showCost ariaLabel={t('inventory.purchaseForm.addProduct')} placeholder={t('inventory.purchaseForm.searchProduct')} onSelect={addProduct} autoFocus={!purchase && lines.length === 0} />
            </div>
            {lines.length === 0 ? (
              <EmptyState icon={PackagePlus} title={t('inventory.purchaseForm.noItems')} description={submitted ? t('inventory.purchaseForm.itemsRequired') : t('inventory.purchaseForm.noItemsHint')} />
            ) : (
              <>
                {submitted && lineErrors && (
                  <p role="alert" className="type-body-sm flex items-center gap-2 border-b border-border bg-danger-soft px-5 py-2.5 text-danger-text">
                    <TriangleAlert size={16} aria-hidden />
                    {t('inventory.purchaseForm.invalidLines')}
                  </p>
                )}
                <PurchaseLinesTable lines={lines} checks={checks} totals={totals} showErrors={submitted} onChange={updateLine} onRemove={removeLine} />
              </>
            )}
          </Card>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-bg-subtle px-6 py-3">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div>
            <dt className="type-caption text-fg-subtle">{t('common.labels.subtotal')}</dt>
            <dd className="font-semibold text-fg tnum">{format.money(totals.subtotal)}</dd>
          </div>
          <div>
            <dt className="type-caption text-fg-subtle">{t('common.labels.discount')}</dt>
            <dd className="font-semibold text-fg tnum">{totals.discountTotal > 0 ? `−${format.money(totals.discountTotal)}` : format.money(0)}</dd>
          </div>
          <div>
            <dt className="type-caption text-fg-subtle">{t('common.labels.vat')}</dt>
            <dd className="font-semibold text-fg tnum">{format.money(totals.taxTotal)}</dd>
          </div>
          <div className="border-s border-border ps-6">
            <dt className="type-caption text-fg-subtle">{t('inventory.purchaseDetail.grandTotal')}</dt>
            <dd className="text-2xl font-bold text-fg tnum">{format.money(totals.grandTotal)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void leave()} disabled={busy !== null}>
            {t('common.actions.cancel')}
          </Button>
          {editingOrdered ? (
            <Button variant="primary" icon={Save} loading={busy === 'ordered'} disabled={busy !== null} onClick={() => void save('ordered')}>
              {t('common.actions.saveChanges')}
            </Button>
          ) : (
            <>
              <Button icon={Save} loading={busy === 'draft'} disabled={busy !== null} onClick={() => void save('draft')}>
                {t('inventory.purchaseForm.saveDraft')}
              </Button>
              <Button variant="primary" icon={Send} loading={busy === 'ordered'} disabled={busy !== null} onClick={() => void save('ordered')}>
                {t('inventory.purchaseForm.saveAndOrder')}
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
