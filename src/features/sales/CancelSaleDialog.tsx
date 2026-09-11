import { useState, type ReactNode } from 'react';
import { Ban, Banknote, CreditCard, Gift, Info, PackageCheck, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import { sumMoney } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { canCancel } from '@/services/saleService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { SaleDetail } from '@/types';
import { Button } from '@/components/ui/Button';
import { FormField, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';
import { cancelWithApproval } from './saleActions';

/* ==========================================================================
   Cancel (void) a completed sale. The sale stays on record as "Cancelled";
   stock goes back, cash is refunded from this drawer, customer totals and
   loyalty points are reversed — all in one audited transaction.
   ========================================================================== */

const REASON_KEYS = ['customerCancelled', 'wrongItems', 'duplicate', 'paymentFailed', 'priceError'] as const;

interface CancelSaleDialogProps {
  sale: SaleDetail;
  onClose: () => void;
  onCompleted: () => void;
}

export function CancelSaleDialog({ sale, onClose, onCompleted }: CancelSaleDialogProps) {
  const t = useT();
  const format = useFormat();
  const shift = useShiftStore((state) => state.shift);
  const canCancelPermission = useCan('sales.cancel');
  const requireManager = useSettingsStore((state) => state.business.security.requireManagerForCancel);
  const cancelHours = useSettingsStore((state) => state.business.sales.cancelWindowHours);
  const [check] = useState(() => canCancel(sale));
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);

  const cashRefund = sumMoney(sale.payments.filter((payment) => payment.method === 'cash').map((payment) => payment.amount));
  const otherRefund = sumMoney(sale.payments.filter((payment) => payment.method === 'card' || payment.method === 'mobile').map((payment) => payment.amount));
  const cashBlocked = cashRefund > 0 && !shift;
  const needsApproval = !canCancelPermission || requireManager;

  const submit = async () => {
    if (busy || cashBlocked) return;
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setBusy(true);
    try {
      const done = await cancelWithApproval(sale, reason);
      if (!done) return;
      toast.success({ key: 'sales.cancel.done', params: { invoice: sale.invoiceNo } });
      onCompleted();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const icon = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-text">
      <Ban size={20} aria-hidden />
    </span>
  );
  const title = t('sales.cancel.title', { invoice: sale.invoiceNo });

  if (!check.allowed) {
    const message =
      check.reason === 'windowExpired' ? t('sales.cancel.blocked.windowExpired', { hours: cancelHours }) : check.reason === 'disabled' ? t('sales.cancel.blocked.disabled') : t('sales.cancel.blocked.notCompleted');
    return (
      <Modal open onClose={onClose} size="sm" title={title} icon={icon} closeLabel={t('common.actions.close')} footer={<Button onClick={onClose}>{t('common.actions.close')}</Button>}>
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
      size="md"
      title={title}
      description={t('sales.cancel.description')}
      icon={icon}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('sales.cancel.keep')}
          </Button>
          <Button variant="danger" icon={Ban} loading={busy} disabled={cashBlocked} onClick={() => void submit()}>
            {t('sales.cancel.confirm')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-fg">{sale.invoiceNo}</p>
            <p className="type-caption text-fg-subtle">{format.dateTime(sale.createdAt)}</p>
          </div>
          <span className="text-xl font-extrabold text-fg tnum">{format.money(sale.grandTotal)}</span>
        </div>

        <section aria-labelledby="cancel-effects" className="flex flex-col gap-2">
          <h3 id="cancel-effects" className="type-label text-fg-muted">
            {t('sales.cancel.effectsTitle')}
          </h3>
          <ul className="flex flex-col gap-2">
            <Effect icon={<PackageCheck size={17} aria-hidden />}>{t('sales.cancel.effectStock', { count: sale.itemCount })}</Effect>
            {cashRefund > 0 && <Effect icon={<Banknote size={17} aria-hidden />}>{t('sales.cancel.effectCash', { amount: format.money(cashRefund) })}</Effect>}
            {otherRefund > 0 && (
              <Effect icon={<CreditCard size={17} aria-hidden />} tone="warning">
                {t('sales.cancel.effectOther', { amount: format.money(otherRefund) })}
              </Effect>
            )}
            {sale.customerId && <Effect icon={<UserRound size={17} aria-hidden />}>{t('sales.cancel.effectCustomer', { name: sale.customerName })}</Effect>}
            {sale.pointsEarned > 0 && <Effect icon={<Gift size={17} aria-hidden />}>{t('sales.cancel.effectPointsReverse', { count: sale.pointsEarned })}</Effect>}
            {sale.pointsRedeemed > 0 && <Effect icon={<Gift size={17} aria-hidden />}>{t('sales.cancel.effectPointsRestore', { count: sale.pointsRedeemed })}</Effect>}
            {needsApproval && (
              <Effect icon={<ShieldCheck size={17} aria-hidden />} tone="warning">
                {t('sales.cancel.needsApproval')}
              </Effect>
            )}
          </ul>
        </section>

        {cashBlocked && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 type-body-sm text-danger-text">
            <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {t('errors.shiftNotOpen')} {t('sales.cancel.cashNeedsShift')}
            </span>
          </p>
        )}

        <FormField label={t('sales.cancel.reason')} required error={reasonError ? t('validation.required') : undefined}>
          {(id) => (
            <Textarea
              id={id}
              data-autofocus
              rows={2}
              value={reason}
              maxLength={200}
              invalid={reasonError}
              placeholder={t('sales.cancel.reasonPlaceholder')}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setReasonError(false);
              }}
            />
          )}
        </FormField>
        <div className="-mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t('sales.cancel.quickReasons')}>
          {REASON_KEYS.map((key) => {
            const text = t(`sales.cancel.reasons.${key}`);
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
                  reason === text ? 'border-danger bg-danger-soft text-danger-text' : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}

function Effect({ icon, tone = 'neutral', children }: { icon: ReactNode; tone?: 'neutral' | 'warning'; children: ReactNode }) {
  return (
    <li className={cn('flex items-start gap-2.5 rounded-lg px-3 py-2 type-body-sm', tone === 'warning' ? 'bg-warning-soft text-warning-text' : 'bg-surface-2 text-fg')}>
      <span className={cn('mt-0.5 shrink-0', tone === 'warning' ? '' : 'text-fg-muted')}>{icon}</span>
      <span>{children}</span>
    </li>
  );
}
