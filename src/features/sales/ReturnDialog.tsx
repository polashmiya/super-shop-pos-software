import { useState, type ReactNode } from 'react';
import { CheckCheck, Gift, Info, Minus, PackageCheck, PackageX, Plus, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { parseQuantityInput, roundQuantity } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { affectedProducts, createReturn, previewReturn, returnableItems, returnPolicy, type ReturnPreviewLine } from '@/services/returnService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { RefundMethod, ReturnCondition, ReturnRequestLine, SaleDetail, SaleItem, SaleReturn } from '@/types';
import { Button } from '@/components/ui/Button';
import { ChoiceCard, SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';
import { ProductImage } from '@/components/product/ProductImage';
import { approveReturn, refreshAfterSaleChange, returnApprovalPermission } from './saleActions';
import { REFUND_ICONS, REFUND_METHODS, defaultRefundMethod } from './saleMeta';

/* ==========================================================================
   Partial return of a completed sale: choose quantities (never more than
   what is left; decimals for weighed items), condition (good stock goes
   back on the shelf), reason and refund method. The refund preview uses the
   same calculation as the saved return (discounts and VAT included).
   ========================================================================== */

const REASON_KEYS = ['defective', 'expired', 'wrongItem', 'changedMind', 'quality', 'billing'] as const;

interface ReturnDialogProps {
  sale: SaleDetail;
  onClose: () => void;
  onCompleted: (result: SaleReturn) => void;
}

export function ReturnDialog({ sale, onClose, onCompleted }: ReturnDialogProps) {
  const t = useT();
  const format = useFormat();
  const unitById = useCatalogStore((state) => state.unitById);
  const shift = useShiftStore((state) => state.shift);
  const cashierDays = useSettingsStore((state) => state.business.sales.cashierReturnWindowDays);
  const returnDays = useSettingsStore((state) => state.business.sales.returnWindowDays);
  const [policy] = useState(() => returnPolicy(sale));
  const [entries] = useState(() => returnableItems(sale));
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, ReturnCondition>>({});
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<RefundMethod>(() => defaultRefundMethod(sale));
  const [busy, setBusy] = useState(false);

  const originalMethod = defaultRefundMethod(sale);
  const isWeighted = (item: SaleItem): boolean => unitById.get(item.unitId)?.allowDecimal ?? !Number.isInteger(item.quantity);

  const request: ReturnRequestLine[] = entries.flatMap(({ item, remaining }) => {
    const quantity = parseQuantityInput(quantities[item.id] ?? '') ?? 0;
    if (quantity <= 0 || remaining <= 0) return [];
    return [{ saleItemId: item.id, quantity: Math.min(roundQuantity(quantity), remaining), condition: conditions[item.id] ?? 'good' }];
  });

  let preview: { lines: ReturnPreviewLine[]; refundTotal: number; taxTotal: number } = { lines: [], refundTotal: 0, taxTotal: 0 };
  try {
    preview = previewReturn(sale, request);
  } catch {
    // Quantities are clamped to what is returnable, so this only guards against stale data.
  }
  const previewById = new Map(preview.lines.map((line) => [line.saleItemId, line]));
  const restockCount = preview.lines.filter((line) => line.restock).reduce((sum, line) => sum + line.quantity, 0);
  const damagedCount = preview.lines.filter((line) => !line.restock).reduce((sum, line) => sum + line.quantity, 0);
  const quantityTotal = roundQuantity(preview.lines.reduce((sum, line) => sum + line.quantity, 0));
  const pointsToReverse =
    sale.customerId && sale.pointsEarned > 0 && sale.grandTotal > 0 ? Math.min(sale.pointsEarned, Math.floor((sale.pointsEarned * preview.refundTotal) / sale.grandTotal)) : 0;
  const cashBlocked = method === 'cash' && !shift;
  const approval = returnApprovalPermission(policy);
  const openEntries = entries.filter((entry) => entry.remaining > 0);
  const doneEntries = entries.filter((entry) => entry.remaining <= 0);

  const setQuantity = (item: SaleItem, remaining: number, value: number) => {
    const next = Math.max(0, Math.min(roundQuantity(value), remaining));
    setQuantities((current) => ({ ...current, [item.id]: next > 0 ? String(next) : '' }));
  };

  const selectAll = () => {
    setQuantities(Object.fromEntries(openEntries.map(({ item, remaining }) => [item.id, String(remaining)])));
  };

  const submit = async () => {
    if (preview.lines.length === 0 || cashBlocked || busy) return;
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setBusy(true);
    try {
      const approvedBy = await approveReturn(sale, policy, format.money(preview.refundTotal));
      if (approvedBy === false) return;
      const result = await createReturn({ sale, lines: request, reason, refundMethod: method, note, approvedBy });
      toast.success(
        { key: 'sales.returnDialog.done', params: { no: result.returnNo } },
        { key: 'sales.returnDialog.doneHint', params: { amount: format.money(result.refundTotal), method: t(`enums.refundMethod.${result.refundMethod}`) } },
      );
      refreshAfterSaleChange(affectedProducts(result));
      onCompleted(result);
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const title = t('sales.returnDialog.title', { invoice: sale.invoiceNo });
  const description = t('sales.returnDialog.description', { date: format.dateTime(sale.createdAt), total: format.money(sale.grandTotal) });
  const icon = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
      <RotateCcw size={20} aria-hidden />
    </span>
  );

  if (!policy.returnable) {
    const message =
      policy.reason === 'cancelled'
        ? t('sales.returnDialog.blocked.cancelled')
        : policy.reason === 'fullyReturned'
          ? t('sales.returnDialog.blocked.fullyReturned')
          : t('sales.returnDialog.blocked.windowExpired', { days: returnDays });
    return (
      <Modal open onClose={onClose} size="sm" title={title} description={description} icon={icon} closeLabel={t('common.actions.close')} footer={<Button onClick={onClose}>{t('common.actions.close')}</Button>}>
        <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-4">
          <Info size={20} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
          <p className="type-body text-fg">{message}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="xl"
      title={title}
      description={description}
      icon={icon}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" icon={RotateCcw} loading={busy} disabled={preview.lines.length === 0 || cashBlocked} onClick={() => void submit()}>
            {preview.lines.length > 0 ? t('sales.returnDialog.submit', { amount: format.money(preview.refundTotal) }) : t('sales.returnDialog.submitEmpty')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex min-w-0 flex-col gap-5">
          {(approval !== null || policy.ageDays > 0) && (
            <div className={cn('flex items-start gap-3 rounded-lg px-4 py-3', approval ? 'bg-warning-soft text-warning-text' : 'bg-surface-2 text-fg-muted')}>
              {approval ? <ShieldCheck size={18} aria-hidden className="mt-0.5 shrink-0" /> : <Info size={18} aria-hidden className="mt-0.5 shrink-0" />}
              <p className="type-body-sm">
                {approval === 'sales.returnAny'
                  ? t('sales.returnDialog.needsApprovalAge', { days: cashierDays })
                  : approval === 'sales.return'
                    ? t('sales.returnDialog.needsApprovalPermission')
                    : t('sales.returnDialog.ageInfo', { count: policy.ageDays, days: returnDays })}
              </p>
            </div>
          )}

          <section aria-labelledby="return-items-title" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 id="return-items-title" className="type-h3 text-fg">
                {t('sales.returnDialog.itemsTitle')}
              </h3>
              <Button variant="ghost" icon={CheckCheck} onClick={selectAll}>
                {t('sales.returnDialog.selectAll')}
              </Button>
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {openEntries.map(({ item, remaining }) => (
                <ReturnItemRow
                  key={item.id}
                  item={item}
                  remaining={remaining}
                  weighted={isWeighted(item)}
                  value={quantities[item.id] ?? ''}
                  condition={conditions[item.id] ?? 'good'}
                  refund={previewById.get(item.id)?.refund ?? 0}
                  onText={(text) => setQuantities((current) => ({ ...current, [item.id]: text }))}
                  onSet={(value) => setQuantity(item, remaining, value)}
                  onCondition={(condition) => setConditions((current) => ({ ...current, [item.id]: condition }))}
                />
              ))}
              {doneEntries.map(({ item }) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 opacity-60">
                  <DoneItem item={item} />
                </li>
              ))}
            </ul>
          </section>

          <FormField label={t('sales.returnDialog.reason')} required error={reasonError ? t('validation.required') : undefined}>
            {(id) => (
              <Input
                id={id}
                value={reason}
                maxLength={160}
                placeholder={t('sales.returnDialog.reasonPlaceholder')}
                invalid={reasonError}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value.trim()) setReasonError(false);
                }}
              />
            )}
          </FormField>
          <div className="-mt-3 flex flex-wrap gap-1.5" aria-label={t('sales.returnDialog.quickReasons')} role="group">
            {REASON_KEYS.map((key) => {
              const text = t(`sales.returnDialog.reasons.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={reason === text}
                  onClick={() => {
                    setReason(text);
                    setReasonError(false);
                  }}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-base',
                    reason === text ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
                  )}
                >
                  {text}
                </button>
              );
            })}
          </div>
          <FormField label={t('sales.returnDialog.note')} hint={t('common.labels.optional')}>
            {(id) => <Input id={id} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />}
          </FormField>
        </div>

        <aside className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="type-h3 mb-2 text-fg">{t('sales.returnDialog.refundMethod')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {REFUND_METHODS.map((option) => {
                const Icon = REFUND_ICONS[option];
                return (
                  <ChoiceCard key={option} selected={method === option} onClick={() => setMethod(option)} className="gap-1.5">
                    <Icon size={20} aria-hidden className="text-fg-muted" />
                    <span className="type-label text-fg">{t(`enums.refundMethod.${option}`)}</span>
                    {option === originalMethod && <span className="type-caption text-fg-subtle">{t('sales.returnDialog.originalMethod')}</span>}
                  </ChoiceCard>
                );
              })}
            </div>
            {cashBlocked && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 type-body-sm text-danger-text">
                <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                <span>
                  {t('errors.shiftNotOpen')} {t('sales.returnDialog.cashNeedsShift')}
                </span>
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4" aria-live="polite">
            <h3 className="type-label text-fg-muted">{t('sales.returnDialog.summary')}</h3>
            <SummaryRow label={t('sales.returnDialog.itemsSelected')} value={format.integer(preview.lines.length)} />
            <SummaryRow label={t('common.labels.quantity')} value={format.quantity(quantityTotal)} />
            {restockCount > 0 && (
              <SummaryRow
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <PackageCheck size={15} aria-hidden className="text-success-text" />
                    {t('sales.returnDialog.backToStock')}
                  </span>
                }
                value={format.quantity(roundQuantity(restockCount))}
              />
            )}
            {damagedCount > 0 && (
              <SummaryRow
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <PackageX size={15} aria-hidden className="text-danger-text" />
                    {t('sales.returnDialog.damaged')}
                  </span>
                }
                value={format.quantity(roundQuantity(damagedCount))}
              />
            )}
            {preview.taxTotal > 0 && <SummaryRow label={t('sales.returnDialog.vatIncluded')} value={format.money(preview.taxTotal)} />}
            {pointsToReverse > 0 && (
              <SummaryRow
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Gift size={15} aria-hidden className="text-fg-subtle" />
                    {t('sales.returnDialog.pointsReversed')}
                  </span>
                }
                value={`−${format.integer(pointsToReverse)}`}
              />
            )}
            <div className="mt-1 flex items-end justify-between gap-3 border-t border-border pt-3">
              <span className="type-h3 text-fg-muted">{t('sales.returnDialog.refund')}</span>
              <span className="text-[1.7rem] leading-none font-extrabold text-fg tnum">{format.money(preview.refundTotal)}</span>
            </div>
          </div>
        </aside>
      </form>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 type-body-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="font-semibold text-fg tnum">{value}</span>
    </div>
  );
}

interface ReturnItemRowProps {
  item: SaleItem;
  remaining: number;
  weighted: boolean;
  value: string;
  condition: ReturnCondition;
  refund: number;
  onText: (text: string) => void;
  onSet: (value: number) => void;
  onCondition: (condition: ReturnCondition) => void;
}

function ReturnItemRow({ item, remaining, weighted, value, condition, refund, onText, onSet, onCondition }: ReturnItemRowProps) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const product = useCatalogStore((state) => state.byId.get(item.productId));
  const unit = useCatalogStore((state) => state.unitById.get(item.unitId));
  const unitLabel = unit ? localize(unit.short) : '';
  const quantity = parseQuantityInput(value) ?? 0;
  const selected = quantity > 0;
  const step = weighted ? 0.25 : 1;
  const name = localize(item.name);

  return (
    <li className={cn('flex flex-col gap-3 px-3 py-3 transition-base', selected && 'bg-primary-soft/40')}>
      <div className="flex items-center gap-3">
        {product ? <ProductImage product={product} className="h-11 w-11 shrink-0" iconSize={20} /> : <span className="h-11 w-11 shrink-0 rounded-md bg-image-tile" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">{name}</p>
          <p className="type-caption truncate text-fg-subtle tnum">
            {t('sales.returnDialog.itemMeta', {
              price: format.money(item.unitPrice),
              sold: format.quantity(item.quantity, unitLabel),
              left: format.quantity(remaining, unitLabel),
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t('sales.returnDialog.quantityFor', { name })}>
          <button
            type="button"
            onClick={() => onSet(quantity - step)}
            disabled={quantity <= 0}
            aria-label={t('pos.cart.decrease')}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted transition-base hover:bg-surface-3 hover:text-fg disabled:opacity-40"
          >
            <Minus size={17} aria-hidden />
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            placeholder="0"
            aria-label={t('sales.returnDialog.quantityFor', { name })}
            onChange={(event) => {
              const text = event.target.value.replace(/[^\d.০-৯]/g, '');
              if (!weighted && text.includes('.')) return;
              const parsed = parseQuantityInput(text);
              if (text !== '' && parsed === null) return;
              if (parsed !== null && parsed > remaining) onSet(remaining);
              else onText(text);
            }}
            className="h-11 w-16 rounded-md border border-border bg-surface-2 text-center text-[0.95rem] font-semibold text-fg tnum focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSet(quantity + step)}
            disabled={quantity >= remaining}
            aria-label={t('pos.cart.increase')}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-muted transition-base hover:bg-surface-3 hover:text-fg disabled:opacity-40"
          >
            <Plus size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onSet(quantity >= remaining ? 0 : remaining)}
            className="ms-1 h-11 rounded-md px-2.5 text-xs font-semibold text-primary transition-base hover:bg-primary-soft"
          >
            {quantity >= remaining ? t('common.actions.clear') : t('sales.returnDialog.all')}
          </button>
        </div>
        <span className={cn('w-24 shrink-0 text-end font-semibold tnum', selected ? 'text-fg' : 'text-fg-subtle')}>{format.money(refund)}</span>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-3 ps-14">
          <span className="type-caption text-fg-subtle">{t('sales.returnDialog.condition')}</span>
          <SegmentedControl<ReturnCondition>
            size="sm"
            ariaLabel={t('sales.returnDialog.conditionFor', { name })}
            value={condition}
            onChange={onCondition}
            options={[
              { value: 'good', label: t('enums.returnCondition.good'), icon: PackageCheck },
              { value: 'damaged', label: t('enums.returnCondition.damaged'), icon: PackageX },
            ]}
          />
        </div>
      )}
    </li>
  );
}

function DoneItem({ item }: { item: SaleItem }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  return (
    <>
      <span className="h-11 w-11 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{localize(item.name)}</p>
        <p className="type-caption text-fg-subtle tnum">{t('sales.returnDialog.returnedQty', { qty: format.quantity(item.returnedQuantity) })}</p>
      </div>
      <Badge size="sm" tone="info">
        {t('enums.saleStatus.returned')}
      </Badge>
    </>
  );
}
