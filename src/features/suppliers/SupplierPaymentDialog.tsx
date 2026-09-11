import { useState } from 'react';
import { Banknote, CreditCard, HandCoins, Landmark, Smartphone, TriangleAlert } from 'lucide-react';
import { parseMoneyInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Money, Purchase, Supplier, SupplierPayment } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { minorToInput } from '@/features/purchases/purchaseForm';
import { purchaseDue } from '@/features/purchases/purchaseHelpers';

type Method = SupplierPayment['method'];

interface SupplierPaymentDialogProps {
  open: boolean;
  supplier: Pick<Supplier, 'id' | 'name'>;
  /** Pay against this purchase order (locked). */
  purchase?: Purchase | null;
  /** Orders the user may pay against (supplier screen); omit for a locked purchase. */
  openPurchases?: Purchase[];
  /** Supplier's outstanding balance (for the "advance" hint on general payments). */
  outstanding?: Money;
  onClose: () => void;
  onPaid: () => void;
}

/** Records a payment to a supplier — against a purchase order or on account. */
export function SupplierPaymentDialog(props: SupplierPaymentDialogProps) {
  if (!props.open) return null;
  return <PaymentForm {...props} />;
}

function PaymentForm({ supplier, purchase, openPurchases = [], outstanding, onClose, onPaid }: SupplierPaymentDialogProps) {
  const t = useT();
  const format = useFormat();
  const currency = useSettingsStore((state) => state.business.currency.symbol);
  const [purchaseId, setPurchaseId] = useState<string>(purchase?.id ?? '');
  const selected = purchase ?? openPurchases.find((entry) => entry.id === purchaseId) ?? null;
  const [amount, setAmount] = useState(() => (purchase ? minorToInput(purchaseDue(purchase)) : ''));
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const due = selected ? purchaseDue(selected) : null;
  const parsed = parseMoneyInput(amount);
  let amountError: string | null = null;
  if (parsed === null || parsed <= 0) amountError = t('validation.invalidAmount');
  else if (due !== null && parsed > due) amountError = t('inventory.payment.aboveDue', { amount: format.money(due) });
  const advance = !selected && parsed !== null && outstanding !== undefined && parsed > Math.max(0, outstanding);

  const submit = async () => {
    setSubmitted(true);
    if (amountError || parsed === null) return;
    setBusy(true);
    try {
      await supplierService.pay({ supplierId: supplier.id, purchaseId: selected?.id ?? null, amount: parsed, method, reference: reference.trim(), note: note.trim() });
      toast.success({ key: 'inventory.payment.done', params: { amount: format.money(parsed), name: supplier.name } });
      onPaid();
      onClose();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const purchaseOptions = [
    { value: '', label: t('inventory.payment.onAccount') },
    ...openPurchases.map((entry) => ({ value: entry.id, label: t('inventory.payment.purchaseOption', { poNo: entry.poNo, due: format.money(purchaseDue(entry)) }) })),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="md"
      title={purchase ? t('inventory.payment.titleForPo', { poNo: purchase.poNo }) : t('inventory.payment.title')}
      description={supplier.name}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <HandCoins size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" icon={HandCoins} loading={busy} disabled={submitted && Boolean(amountError)} onClick={() => void submit()}>
            {t('inventory.payment.submit')}
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
        {!purchase && openPurchases.length > 0 && (
          <FormField label={t('inventory.payment.purchase')}>
            {(id) => (
              <Select
                id={id}
                value={purchaseId}
                options={purchaseOptions}
                onChange={(value) => {
                  setPurchaseId(value);
                  const entry = openPurchases.find((candidate) => candidate.id === value);
                  if (entry) setAmount(minorToInput(purchaseDue(entry)));
                }}
              />
            )}
          </FormField>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3">
          <span className="type-body-sm text-fg-muted">{due !== null ? t('inventory.payment.dueOnOrder') : t('inventory.payment.outstanding')}</span>
          <span className="text-lg font-bold text-fg tnum">{format.money(due ?? Math.max(0, outstanding ?? 0))}</span>
        </div>

        <FormField label={t('common.labels.amount')} required error={submitted || parsed !== null ? (amountError ?? undefined) : undefined}>
          {(id) => (
            <div className="flex items-start gap-2">
              <Input
                id={id}
                data-autofocus
                inputMode="decimal"
                inputSize="xl"
                autoComplete="off"
                placeholder="0"
                value={amount}
                invalid={Boolean((submitted || parsed !== null) && amountError)}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.,০-৯]/g, ''))}
                trailing={<span className="pe-3 text-lg font-semibold text-fg-muted">{currency}</span>}
                className="text-end text-2xl font-bold tnum"
              />
              {due !== null && due > 0 && (
                <Button size="lg" onClick={() => setAmount(minorToInput(due))}>
                  {t('inventory.payment.payFull')}
                </Button>
              )}
            </div>
          )}
        </FormField>
        {advance && (
          <p className="type-body-sm flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-warning-text">
            <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t('inventory.payment.advanceWarning')}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="type-label text-fg-muted">{t('inventory.payment.method')}</span>
          <SegmentedControl
            ariaLabel={t('inventory.payment.method')}
            fullWidth
            value={method}
            onChange={setMethod}
            options={[
              { value: 'cash', label: t('inventory.payment.methods.cash'), icon: Banknote },
              { value: 'bank', label: t('inventory.payment.methods.bank'), icon: Landmark },
              { value: 'mobile', label: t('inventory.payment.methods.mobile'), icon: Smartphone },
              { value: 'card', label: t('inventory.payment.methods.card'), icon: CreditCard },
            ]}
          />
        </div>

        <FormField label={t('common.labels.reference')} hint={t('common.labels.optional')}>
          {(id) => <Input id={id} value={reference} maxLength={80} placeholder={t('inventory.payment.referencePlaceholder')} onChange={(event) => setReference(event.target.value)} />}
        </FormField>
        <FormField label={t('common.labels.note')} hint={t('common.labels.optional')}>
          {(id) => <Textarea id={id} rows={2} value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} />}
        </FormField>
      </form>
    </Modal>
  );
}
