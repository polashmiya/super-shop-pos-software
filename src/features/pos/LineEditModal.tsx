import { useState } from 'react';
import { PencilLine, Tag } from 'lucide-react';
import { parseMoneyInput, parseQuantityInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { ProductImage } from '@/components/product/ProductImage';
import { overridePrice, setLineQuantity } from './posActions';
import { usePosUi } from './posUiStore';

type Field = 'quantity' | 'price' | 'note';

/** Edit a cart line: quantity (keypad), price override (permission-aware), note. */
export function LineEditModal() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'lineEdit') return null;
  return <LineEditDialog key={dialog.lineId} lineId={dialog.lineId} initialField={dialog.focus ?? 'quantity'} />;
}

function LineEditDialog({ lineId, initialField }: { lineId: string; initialField: Field }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const close = usePosUi((state) => state.close);
  const open = usePosUi((state) => state.open);
  const line = usePosStore((state) => state.draft.lines.find((entry) => entry.lineId === lineId));
  const product = useCatalogStore((state) => (line ? state.byId.get(line.productId) : undefined));
  const unit = useCatalogStore((state) => (line ? state.unitById.get(line.unitId) : undefined));
  const showKeypad = useSettingsStore((state) => state.device.pos.showNumericKeypad);
  const canOverride = useCan('pos.priceOverride');
  const [field, setField] = useState<Field>(initialField);
  const [quantity, setQuantity] = useState(line ? String(line.quantity) : '1');
  const [price, setPrice] = useState(line ? String(line.unitPrice / 100) : '0');
  const [reason, setReason] = useState(line?.priceOverride?.reason ?? '');
  const [note, setNote] = useState(line?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(true);

  if (!line) return null;

  const save = async () => {
    setBusy(true);
    try {
      const qty = parseQuantityInput(quantity);
      if (qty === null || !setLineQuantity(line.lineId, qty)) return;
      const nextPrice = parseMoneyInput(price);
      if (nextPrice === null) throw new Error('price');
      if (nextPrice !== line.unitPrice && !(await overridePrice(line.lineId, nextPrice, reason))) return;
      usePosStore.getState().setLineNote(line.lineId, note.trim());
      if (nextPrice !== line.unitPrice) toast.success('pos.priceOverride.applied');
      close();
      usePosStore.getState().requestFocus();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const keypadTarget = field === 'price' ? setPrice : setQuantity;
  const unitShort = unit ? localize(unit.short) : '';

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={t('pos.lineEdit.title')}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button icon={Tag} variant="ghost" onClick={() => open({ type: 'discount', lineId: line.lineId })}>
            {t('pos.cart.discount')}
          </Button>
          <Button onClick={close}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('pos.lineEdit.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <ProductImage product={{ image: line.image, categoryId: product?.categoryId ?? '' }} className="h-14 w-14 shrink-0" iconSize={22} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{localize(line.name)}</p>
            <p className="type-caption text-fg-subtle">
              {line.sku} · {t('pos.priceOverride.original')}: {format.money(line.originalPrice)}
              {product ? ` · ${t('pos.stock.available', { count: format.quantity(product.stock) })}` : ''}
            </p>
          </div>
        </div>

        <SegmentedControl
          ariaLabel={t('pos.lineEdit.title')}
          fullWidth
          value={field}
          onChange={(next) => {
            setField(next);
            setFresh(true);
          }}
          options={[
            { value: 'quantity', label: t('pos.lineEdit.quantity') },
            { value: 'price', label: t('pos.cart.priceOverride') },
            { value: 'note', label: t('pos.lineEdit.note'), icon: PencilLine },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            {field === 'quantity' && (
              <FormField label={`${t('pos.lineEdit.quantity')}${unitShort ? ` (${unitShort})` : ''}`}>
                {(id) => (
                  <Input
                    id={id}
                    data-autofocus
                    inputMode="decimal"
                    inputSize="xl"
                    value={quantity}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setQuantity(event.target.value.replace(/[^\d.০-৯]/g, ''))}
                    className="text-end text-3xl font-bold tnum"
                  />
                )}
              </FormField>
            )}
            {field === 'price' && (
              <>
                <FormField label={t('pos.priceOverride.newPrice')} hint={canOverride ? undefined : t('auth.approvalTitle')}>
                  {(id) => (
                    <Input
                      id={id}
                      data-autofocus
                      inputMode="decimal"
                      inputSize="xl"
                      value={price}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => setPrice(event.target.value.replace(/[^\d.০-৯]/g, ''))}
                      className="text-end text-3xl font-bold tnum"
                    />
                  )}
                </FormField>
                <FormField label={t('pos.priceOverride.reason')}>{(id) => <Input id={id} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} />}</FormField>
              </>
            )}
            {field === 'note' && (
              <FormField label={t('pos.lineEdit.note')}>
                {(id) => <Input id={id} data-autofocus value={note} placeholder={t('pos.lineEdit.notePlaceholder')} onChange={(event) => setNote(event.target.value)} maxLength={200} />}
              </FormField>
            )}
          </div>
          {showKeypad && field !== 'note' && (
            <NumericKeypad
              className="w-60"
              allowDecimal={field === 'price' || line.weighted}
              backLabel={t('common.actions.remove')}
              onKey={(key) => {
                keypadTarget((current) => applyKeypadKey(fresh && key !== 'back' ? '' : current, key, field === 'price' ? 2 : 3, 7));
                setFresh(false);
              }}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
