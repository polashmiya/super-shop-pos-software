import type { ReactNode } from 'react';
import { HandCoins, PackageCheck, PackageOpen, Wallet } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { PurchaseDetail, SupplierPayment } from '@/types';
import { Badge, Card, SectionHeader } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { PAYMENT_METHOD_ICONS } from '@/features/suppliers/supplierHelpers';

/** Goods receipts (GRN) of a purchase order, newest first. */
export function ReceiptsCard({ purchase }: { purchase: PurchaseDetail }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const itemById = new Map(purchase.items.map((item) => [item.id, item]));
  const receipts = [...purchase.receipts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <Card>
      <SectionHeader icon={PackageCheck} title={t('inventory.purchaseDetail.receipts')} description={receipts.length > 0 ? t('inventory.purchaseDetail.receiptCount', { count: receipts.length }) : undefined} />
      {receipts.length === 0 ? (
        <EmptyState compact icon={PackageOpen} title={t('inventory.purchaseDetail.receiptsEmpty')} description={t('inventory.purchaseDetail.receiptsEmptyHint')} />
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {receipts.map((receipt) => {
            const units = receipt.items.reduce((sum, line) => sum + line.quantity, 0);
            return (
              <li key={receipt.id} className="rounded-lg border border-border bg-surface-2 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-fg selectable">{receipt.grnNo}</p>
                    <p className="type-caption text-fg-subtle">
                      {format.dateTime(receipt.receivedAt)}
                      {receipt.receivedByName ? ` · ${t('inventory.purchaseDetail.receiptBy', { name: receipt.receivedByName })}` : ''}
                    </p>
                  </div>
                  <Badge tone="success" icon={PackageCheck} size="sm">
                    {t('inventory.purchaseDetail.receiptUnits', { qty: format.quantity(units) })}
                  </Badge>
                </div>
                <ul className="type-body-sm mt-2 flex flex-col gap-0.5 text-fg-muted">
                  {receipt.items.map((line) => {
                    const item = itemById.get(line.purchaseItemId);
                    return (
                      <li key={line.purchaseItemId} className="flex justify-between gap-3">
                        <span className="truncate">{item ? localize(item.name) : line.productId}</span>
                        <span className="shrink-0 text-fg tnum">× {format.quantity(line.quantity)}</span>
                      </li>
                    );
                  })}
                </ul>
                {receipt.note && <p className="type-caption mt-2 text-fg-subtle">{receipt.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Payments recorded against a purchase order. */
export function PaymentsCard({ payments, action }: { payments: SupplierPayment[]; action?: ReactNode }) {
  const t = useT();
  const format = useFormat();
  return (
    <Card>
      <SectionHeader icon={Wallet} title={t('inventory.purchaseDetail.payments')} action={action} />
      {payments.length === 0 ? (
        <EmptyState compact icon={HandCoins} title={t('inventory.purchaseDetail.paymentsEmpty')} description={t('inventory.purchaseDetail.paymentsEmptyHint')} />
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {payments.map((payment) => {
            const Icon = PAYMENT_METHOD_ICONS[payment.method] ?? Wallet;
            return (
              <li key={payment.id} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-text">
                  <Icon size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">{t(`inventory.payment.methods.${payment.method}`)}</p>
                  <p className="type-caption truncate text-fg-subtle">
                    {format.dateTime(payment.paidAt)}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </p>
                </div>
                <span className="font-bold text-success-text tnum">{format.money(payment.amount)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
