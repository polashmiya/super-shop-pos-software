import { useState } from 'react';
import { CheckCheck, Eraser, PackageCheck } from 'lucide-react';
import { parseQuantityInput, roundQuantity } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { purchaseService } from '@/services/purchaseService';
import { useCatalogStore } from '@/stores/catalogStore';
import { toast } from '@/stores/uiStore';
import type { PurchaseDetail } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { allowsDecimal } from '@/features/inventory/inventoryHelpers';
import { ProductCell } from '@/features/inventory/InventoryBits';
import { pendingQuantity } from './purchaseHelpers';
import { quantityToInput } from './purchaseForm';

interface ReceiveDialogProps {
  purchase: PurchaseDetail;
  open: boolean;
  onClose: () => void;
  onReceived: () => void;
}

/** Goods receiving note (GRN): quantities default to what is still pending; stock is updated in one transaction. */
export function ReceiveDialog({ purchase, open, onClose, onReceived }: ReceiveDialogProps) {
  if (!open) return null;
  return <ReceiveForm purchase={purchase} onClose={onClose} onReceived={onReceived} />;
}

function ReceiveForm({ purchase, onClose, onReceived }: Omit<ReceiveDialogProps, 'open'>) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const byId = useCatalogStore((state) => state.byId);
  const unitById = useCatalogStore((state) => state.unitById);
  const pendingItems = purchase.items.filter((item) => pendingQuantity(item) > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(pendingItems.map((item) => [item.id, quantityToInput(pendingQuantity(item))])));
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = pendingItems.map((item) => {
    const product = byId.get(item.productId);
    const unit = product ? unitById.get(product.unitId) : undefined;
    const decimals = product ? allowsDecimal(product, unit) : true;
    const pending = pendingQuantity(item);
    const text = quantities[item.id] ?? '';
    const parsed = text.trim() === '' ? 0 : parseQuantityInput(text);
    let error: string | null = null;
    if (parsed === null) error = t('validation.invalidQuantity');
    else if (!decimals && !Number.isInteger(parsed)) error = t('inventory.receive.wholeOnly');
    else if (parsed > pending + 0.0005) error = t('inventory.receive.tooMuch', { pending: format.quantity(pending) });
    return { item, product, unitShort: unit ? localize(unit.short) : '', pending, quantity: parsed ?? 0, error };
  });
  const receiving = rows.filter((row) => !row.error && row.quantity > 0);
  const hasErrors = rows.some((row) => row.error);
  const units = roundQuantity(receiving.reduce((sum, row) => sum + row.quantity, 0));

  const setAll = (fill: boolean) => setQuantities(Object.fromEntries(pendingItems.map((item) => [item.id, fill ? quantityToInput(pendingQuantity(item)) : ''])));

  const submit = async () => {
    setSubmitted(true);
    if (hasErrors) return;
    if (receiving.length === 0) {
      toast.error('inventory.receive.nothing');
      return;
    }
    setBusy(true);
    try {
      const receipt = await purchaseService.receive(
        purchase,
        receiving.map((row) => ({ purchaseItemId: row.item.id, quantity: row.quantity })),
        note,
      );
      await useCatalogStore.getState().refreshStock(receiving.map((row) => row.item.productId));
      toast.success({ key: 'inventory.receive.done', params: { grnNo: receipt.grnNo } }, { key: 'inventory.receive.doneHint', params: { count: receiving.length } });
      onReceived();
      onClose();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="xl"
      title={t('inventory.receive.title')}
      description={t('inventory.receive.description', { poNo: purchase.poNo, supplier: purchase.supplierName })}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
          <PackageCheck size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <p className="type-body-sm me-auto text-fg-muted" aria-live="polite">
            {receiving.length > 0 ? t('inventory.receive.summary', { count: receiving.length, qty: format.quantity(units) }) : t('inventory.receive.nothing')}
          </p>
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="success" icon={PackageCheck} loading={busy} disabled={receiving.length === 0 || (submitted && hasErrors)} onClick={() => void submit()}>
            {t('inventory.receive.submit')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-body-sm text-fg-muted">{t('inventory.receive.hint')}</p>
          <div className="flex gap-2">
            <Button size="sm" icon={CheckCheck} onClick={() => setAll(true)}>
              {t('inventory.receive.fillAll')}
            </Button>
            <Button size="sm" variant="ghost" icon={Eraser} onClick={() => setAll(false)}>
              {t('inventory.receive.clearAll')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-[0.9rem]">
            <thead>
              <tr className="bg-surface-2">
                <th scope="col" className="h-11 border-b border-border px-3 text-start type-label text-fg-muted">
                  {t('inventory.columns.product')}
                </th>
                <th scope="col" className="h-11 border-b border-border px-3 text-end type-label text-fg-muted">
                  {t('inventory.purchaseDetail.ordered')}
                </th>
                <th scope="col" className="h-11 border-b border-border px-3 text-end type-label text-fg-muted">
                  {t('inventory.purchaseDetail.received')}
                </th>
                <th scope="col" className="h-11 border-b border-border px-3 text-end type-label text-fg-muted">
                  {t('inventory.purchaseDetail.pending')}
                </th>
                <th scope="col" className="h-11 w-44 border-b border-border px-3 text-end type-label text-fg-muted">
                  {t('inventory.receive.receiveNow')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item.id} className="align-top">
                  <td className="border-b border-border px-3 py-2.5">
                    <ProductCell size="sm" product={{ name: row.item.name, image: row.product?.image ?? null, categoryId: row.product?.categoryId ?? '' }} meta={<span className="font-mono">{row.item.sku}</span>} />
                  </td>
                  <td className="border-b border-border px-3 pt-4 text-end text-fg-muted tnum">{format.quantity(row.item.quantity)}</td>
                  <td className="border-b border-border px-3 pt-4 text-end text-fg-muted tnum">{format.quantity(row.item.receivedQuantity)}</td>
                  <td className="border-b border-border px-3 pt-4 text-end font-semibold text-fg tnum">{format.quantity(row.pending, row.unitShort)}</td>
                  <td className="border-b border-border px-3 py-2.5">
                    <Input
                      aria-label={t('inventory.receive.quantityFor', { name: localize(row.item.name) })}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0"
                      value={quantities[row.item.id] ?? ''}
                      invalid={Boolean(row.error)}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => {
                        const value = event.target.value.replace(/[^\d.০-৯]/g, '');
                        setQuantities((current) => ({ ...current, [row.item.id]: value }));
                      }}
                      trailing={row.unitShort ? <span className="pe-2 text-xs text-fg-subtle">{row.unitShort}</span> : undefined}
                      className={cn('text-end font-semibold tnum', row.quantity > 0 && !row.error && 'text-success-text')}
                    />
                    {row.error && <p className="type-caption mt-1 text-end text-danger-text">{row.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FormField label={t('inventory.receive.note')} hint={t('common.labels.optional')}>
          {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} placeholder={t('inventory.receive.notePlaceholder')} onChange={(event) => setNote(event.target.value)} />}
        </FormField>
      </form>
    </Modal>
  );
}
