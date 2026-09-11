import { useState } from 'react';
import { ArrowRight, PackageMinus, PackagePlus, ShieldAlert, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { parseQuantityInput, roundQuantity } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { inventoryService } from '@/services/inventoryService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { AdjustmentReason, Id, Product } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { SegmentedControl } from '@/components/ui/Controls';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { EmptyState } from '@/components/ui/States';
import { ProductImage } from '@/components/product/ProductImage';
import { ADJUSTMENT_REASONS, REASON_ICONS, allowsDecimal } from './inventoryHelpers';
import { ProductStockBadge } from './InventoryBits';

type Direction = 'increase' | 'decrease';

/** Reasons that always mean stock left the shelf. */
const SHRINK_REASONS: readonly AdjustmentReason[] = ['damage', 'lost', 'expired'];

interface StockAdjustDialogProps {
  /** Product to adjust; the dialog is open while this is set. */
  productId: Id | null;
  onClose: () => void;
  onAdjusted?: () => void;
}

/**
 * Stock adjustment (increase / decrease) with a mandatory reason. Every
 * adjustment is written to the stock ledger by the inventory service.
 */
export function StockAdjustDialog({ productId, onClose, onAdjusted }: StockAdjustDialogProps) {
  const product = useCatalogStore((state) => (productId ? state.byId.get(productId) : undefined));
  if (!productId || !product) return null;
  return <AdjustForm key={product.id} product={product} onClose={onClose} onAdjusted={onAdjusted} />;
}

function AdjustForm({ product, onClose, onAdjusted }: { product: Product; onClose: () => void; onAdjusted?: () => void }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const canAdjust = useCan('inventory.adjust');
  const unit = useCatalogStore((state) => state.unitById.get(product.unitId));
  const allowNegative = useSettingsStore((state) => state.business.inventory.allowNegativeStock);
  const showKeypad = useSettingsStore((state) => state.device.pos.showNumericKeypad);
  const [direction, setDirection] = useState<Direction>('decrease');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<AdjustmentReason | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const decimals = allowsDecimal(product, unit);
  const unitShort = unit ? localize(unit.short) : '';
  const parsed = parseQuantityInput(quantity);
  const signed = parsed === null ? 0 : direction === 'increase' ? parsed : -parsed;
  const next = roundQuantity(product.stock + signed);

  let quantityError: string | null = null;
  if (parsed === null || parsed <= 0) quantityError = t('validation.invalidQuantity');
  else if (!decimals && !Number.isInteger(parsed)) quantityError = t('inventory.adjust.wholeOnly');
  else if (direction === 'decrease' && next < 0 && !allowNegative) quantityError = t('inventory.adjust.negativeBlocked', { available: format.quantity(Math.max(0, product.stock), unitShort) });
  const reasonError = reason ? null : t('inventory.adjust.reasonRequired');
  const valid = !quantityError && !reasonError;
  const hasQuantity = parsed !== null && parsed > 0;

  const chooseReason = (value: AdjustmentReason) => {
    setReason(value);
    if (SHRINK_REASONS.includes(value)) setDirection('decrease');
  };

  const save = async () => {
    setSubmitted(true);
    if (!valid || parsed === null || !reason) return;
    setBusy(true);
    try {
      const previous = product.stock;
      await inventoryService.adjust({ productId: product.id, direction, quantity: parsed, reason, note }, previous);
      await useCatalogStore.getState().refreshStock([product.id]);
      toast.success('inventory.adjust.saved', {
        key: 'inventory.adjust.savedDetail',
        params: { name: localize(product.name), from: format.quantity(previous, unitShort), to: format.quantity(next, unitShort) },
      });
      onAdjusted?.();
      onClose();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
      <SlidersHorizontal size={20} aria-hidden />
    </span>
  );

  if (!canAdjust) {
    return (
      <Modal open onClose={onClose} size="sm" title={t('inventory.adjust.title')} icon={header} closeLabel={t('common.actions.close')} footer={<Button onClick={onClose}>{t('common.actions.close')}</Button>}>
        <EmptyState icon={ShieldAlert} title={t('errors.permissionDenied')} description={t('inventory.adjust.noPermission')} compact />
      </Modal>
    );
  }

  const nextTone = next < 0 ? 'danger' : next <= product.minStock ? 'warning' : 'success';

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={t('inventory.adjust.title')}
      description={t('inventory.adjust.description')}
      icon={header}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={submitted && !valid} onClick={() => void save()}>
            {t('inventory.adjust.save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <ProductImage product={product} className="h-14 w-14 shrink-0" iconSize={24} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-fg">{localize(product.name)}</p>
            <p className="type-caption truncate text-fg-subtle">
              <span className="font-mono">{product.sku}</span>
              {unit ? ` · ${localize(unit.name)}` : ''}
              {` · ${t('inventory.adjust.minStock', { qty: format.quantity(product.minStock, unitShort) })}`}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <p className="type-caption text-fg-subtle">{t('inventory.adjust.current')}</p>
            <p className="text-xl font-bold text-fg tnum">{format.quantity(product.stock, unitShort)}</p>
          </div>
        </div>

        <div className={cn('grid gap-5', showKeypad && 'md:grid-cols-[minmax(0,1fr)_15rem]')}>
          <div className="flex min-w-0 flex-col gap-4">
            <SegmentedControl
              ariaLabel={t('inventory.adjust.direction')}
              fullWidth
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'increase', label: t('inventory.adjust.increase'), icon: PackagePlus },
                { value: 'decrease', label: t('inventory.adjust.decrease'), icon: PackageMinus },
              ]}
            />
            <FormField label={unitShort ? t('inventory.adjust.quantityIn', { unit: unitShort }) : t('common.labels.quantity')} required error={submitted || hasQuantity ? (quantityError ?? undefined) : undefined} hint={decimals ? t('inventory.adjust.decimalHint') : t('inventory.adjust.wholeHint')}>
              {(id) => (
                <Input
                  id={id}
                  data-autofocus
                  inputMode="decimal"
                  inputSize="xl"
                  autoComplete="off"
                  value={quantity}
                  invalid={Boolean((submitted || hasQuantity) && quantityError)}
                  placeholder="0"
                  onChange={(event) => setQuantity(event.target.value.replace(/[^\d.০-৯]/g, ''))}
                  trailing={unitShort ? <span className="pe-3 text-base font-semibold text-fg-muted">{unitShort}</span> : undefined}
                  className="text-end text-2xl font-bold tnum"
                />
              )}
            </FormField>

            <fieldset className="flex flex-col gap-2">
              <legend className="type-label mb-1.5 text-fg-muted">
                {t('common.labels.reason')}
                <span className="ms-0.5 text-danger-text" aria-hidden>
                  *
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ADJUSTMENT_REASONS.map((value) => {
                  const Icon = REASON_ICONS[value];
                  const selected = reason === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseReason(value)}
                      className={cn(
                        'flex min-h-touch items-center gap-2 rounded-lg border px-3 text-start text-sm font-medium transition-base',
                        selected ? 'border-primary bg-primary-soft text-fg ring-1 ring-primary' : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg',
                      )}
                    >
                      <Icon size={16} aria-hidden className={selected ? 'text-primary' : 'text-fg-subtle'} />
                      <span className="truncate">{t(`enums.adjustmentReason.${value}`)}</span>
                    </button>
                  );
                })}
              </div>
              {submitted && reasonError && (
                <p role="alert" className="type-caption text-danger-text">
                  {reasonError}
                </p>
              )}
            </fieldset>

            <FormField label={t('common.labels.note')} hint={t('common.labels.optional')}>
              {(id) => <Textarea id={id} rows={2} value={note} maxLength={240} placeholder={t('inventory.adjust.notePlaceholder')} onChange={(event) => setNote(event.target.value)} />}
            </FormField>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface-2 p-4" aria-live="polite">
              <p className="type-label text-fg-muted">{t('inventory.adjust.preview')}</p>
              <div className="mt-2 flex items-center gap-2 text-lg font-bold tnum">
                <span className="text-fg-muted">{format.quantity(product.stock)}</span>
                <ArrowRight size={18} aria-hidden className="text-fg-subtle" />
                <span className={nextTone === 'danger' ? 'text-danger-text' : nextTone === 'warning' ? 'text-warning-text' : 'text-success-text'}>{format.quantity(hasQuantity ? next : product.stock, unitShort)}</span>
              </div>
              {hasQuantity && <ProductStockBadgePreview product={product} next={next} />}
              {hasQuantity && next < 0 && allowNegative && (
                <p className="type-caption mt-2 flex items-start gap-1.5 text-warning-text">
                  <TriangleAlert size={14} aria-hidden className="mt-px shrink-0" />
                  {t('inventory.adjust.negativeAllowed')}
                </p>
              )}
            </div>
            {showKeypad && <NumericKeypad allowDecimal={decimals} backLabel={t('common.actions.remove')} onKey={(key) => setQuantity((current) => applyKeypadKey(current, key, decimals ? 3 : 0, 7))} />}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** How the product's status badge will look after the adjustment. */
function ProductStockBadgePreview({ product, next }: { product: Product; next: number }) {
  return (
    <div className="mt-2">
      <ProductStockBadge product={{ ...product, stock: next }} />
    </div>
  );
}
