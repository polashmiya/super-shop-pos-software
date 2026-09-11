import { useState } from 'react';
import { Percent, Tag } from 'lucide-react';
import { parseMoneyInput, parsePercentInput } from '@/domain/money';
import { calculateDiscountAmount } from '@/domain/pricing';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { cartTotals, checkDiscount, userDiscountLimit } from '@/services/pricingService';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { DiscountType } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { useCartTotals } from './useCartTotals';
import { applyLineDiscount, applyOrderDiscount } from './posActions';
import { usePosUi } from './posUiStore';

const REASON_KEYS = ['regular', 'damaged', 'promo', 'bulk', 'manager'] as const;

/** Item or cart discount (percent / fixed) with limit + approval handling. */
export function DiscountModal() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'discount') return null;
  return <DiscountDialog lineId={dialog.lineId} />;
}

function DiscountDialog({ lineId }: { lineId: string | null }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const close = usePosUi((state) => state.close);
  const lines = usePosStore((state) => state.draft.lines);
  const orderDiscount = usePosStore((state) => state.draft.orderDiscount);
  const showKeypad = useSettingsStore((state) => state.device.pos.showNumericKeypad);
  const totals = useCartTotals();
  const line = lineId ? lines.find((entry) => entry.lineId === lineId) : undefined;
  const existing = line ? (line.discountSource === 'manual' ? line.discount : null) : orderDiscount?.source === 'manual' ? orderDiscount : null;
  const [type, setType] = useState<DiscountType>(existing?.type ?? 'percent');
  const [value, setValue] = useState(existing ? (existing.type === 'percent' ? String(existing.value / 100) : String(existing.value / 100)) : '');
  const [reason, setReason] = useState(line ? line.discountReason : orderDiscount?.reason ?? '');
  const [busy, setBusy] = useState(false);

  const base = line ? Math.round(line.unitPrice * line.quantity) : totals.subtotal - totals.itemDiscountTotal;
  const parsed = type === 'percent' ? parsePercentInput(value) : parseMoneyInput(value);
  const discount = parsed !== null ? { type, value: parsed } : null;
  const check = discount ? checkDiscount(discount, base) : null;
  const amount = discount ? calculateDiscountAmount(base, discount) : 0;
  const limit = userDiscountLimit();

  // Exact preview: run the real pricing engine on the cart with this discount applied.
  const newTotal =
    !discount || check?.error
      ? totals.grandTotal
      : cartTotals({
          lines: line ? lines.map((entry) => (entry.lineId === line.lineId ? { ...entry, discount, discountSource: 'manual' as const } : entry)) : lines,
          orderDiscount: line ? orderDiscount : { ...discount, source: 'manual' as const, reason, approvedBy: null },
        }).grandTotal;

  const apply = async (remove = false) => {
    setBusy(true);
    try {
      const ok = line ? await applyLineDiscount(line.lineId, remove ? null : discount, reason) : await applyOrderDiscount(remove ? null : discount, reason);
      if (ok) {
        toast.success(remove ? 'pos.discount.removed' : 'pos.discount.applied');
        close();
        usePosStore.getState().requestFocus();
      }
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const errorKey = check?.error ? (`pos.discount.errors.${check.error}` as const) : null;

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={line ? t('pos.discount.itemTitle') : t('pos.discount.orderTitle')}
      description={line ? localize(line.name) : t('pos.discount.base', { amount: format.money(base) })}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text">
          <Tag size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={() => void apply(true)} disabled={busy}>
              {t('pos.discount.remove')}
            </Button>
          )}
          <Button onClick={close}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!discount || Boolean(check?.error)} onClick={() => void apply()}>
            {t('pos.discount.apply')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (discount && !check?.error) void apply();
        }}
      >
        <div className="flex flex-col gap-4">
          <SegmentedControl
            ariaLabel={t('common.labels.type')}
            fullWidth
            value={type}
            onChange={(next) => {
              setType(next);
              setValue('');
            }}
            options={[
              { value: 'percent', label: t('pos.discount.typePercent'), icon: Percent },
              { value: 'fixed', label: t('pos.discount.typeFixed'), icon: Tag },
            ]}
          />
          <FormField label={t('pos.discount.value')} error={errorKey ? t(errorKey) : undefined} hint={t('pos.discount.limit', { rate: `${format.number(limit / 100, 1)}%` })}>
            {(id) => (
              <Input
                id={id}
                data-autofocus
                inputMode="decimal"
                inputSize="xl"
                value={value}
                onChange={(event) => setValue(event.target.value.replace(/[^\d.০-৯]/g, ''))}
                trailing={<span className="pe-3 text-lg font-semibold text-fg-muted">{type === 'percent' ? '%' : '৳'}</span>}
                className="text-end text-2xl font-bold tnum"
              />
            )}
          </FormField>
          <FormField label={t('pos.discount.reason')}>
            {(id) => <Input id={id} value={reason} placeholder={t('pos.discount.reasonPlaceholder')} onChange={(event) => setReason(event.target.value)} maxLength={120} />}
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {REASON_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => setReason(t(`pos.discount.reasons.${key}`))} className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg">
                {t(`pos.discount.reasons.${key}`)}
              </button>
            ))}
          </div>
          {discount && !check?.error && (
            <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-semibold text-success-text">
              {t('pos.discount.preview', { amount: format.money(amount), total: format.money(newTotal) })}
              {check?.needsApproval && <span className="mt-1 block font-normal text-warning-text">{t('pos.discount.needsApproval')}</span>}
            </p>
          )}
        </div>
        {showKeypad && <NumericKeypad backLabel={t('common.actions.remove')} className="w-60" onKey={(key) => setValue((current) => applyKeypadKey(current, key, 2, 8))} />}
      </form>
    </Modal>
  );
}
