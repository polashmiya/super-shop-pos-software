import type { ReactNode } from 'react';
import { Calculator, StickyNote } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SaleDetail } from '@/types';
import { Card, SectionHeader } from '@/components/ui/Display';
import { cn } from '@/components/ui/cn';

function Row({ label, value, tone, note, strong }: { label: ReactNode; value: ReactNode; tone?: 'success' | 'warning'; note?: ReactNode; strong?: boolean }) {
  const color = tone === 'success' ? 'text-success-text' : tone === 'warning' ? 'text-warning-text' : strong ? 'text-fg' : 'text-fg-muted';
  return (
    <div className="flex flex-col">
      <div className={cn('flex items-baseline justify-between gap-3', color, strong && 'font-semibold')}>
        <dt>{label}</dt>
        <dd className="tnum">{value}</dd>
      </div>
      {note && <p className="type-caption text-fg-subtle">{note}</p>}
    </div>
  );
}

/** Money breakdown of a sale: subtotal → discounts → VAT → rounding → TOTAL, then paid, change and refunds. */
export function SaleTotalsCard({ sale, className }: { sale: SaleDetail; className?: string }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const taxLabel = useSettingsStore((state) => (language === 'bn' ? state.business.tax.labelBn : state.business.tax.labelEn)) || t('common.labels.vat');
  const cancelled = sale.status === 'cancelled';

  return (
    <Card className={className}>
      <SectionHeader icon={Calculator} title={t('sales.detail.totals.title')} />
      <dl className="mt-4 flex flex-col gap-2 type-body-sm">
        <Row label={t('common.labels.subtotal')} value={format.money(sale.subtotal)} />
        {sale.itemDiscountTotal > 0 && <Row tone="success" label={t('sales.detail.totals.itemDiscounts')} value={`−${format.money(sale.itemDiscountTotal)}`} />}
        {sale.orderDiscountTotal > 0 && (
          <Row
            tone="success"
            label={t('sales.detail.totals.cartDiscount')}
            value={`−${format.money(sale.orderDiscountTotal)}`}
            note={sale.discountReason ? t('sales.detail.totals.discountReason', { reason: sale.discountReason }) : undefined}
          />
        )}
        {sale.taxTotal > 0 && <Row label={sale.taxMode === 'inclusive' ? t('sales.detail.totals.vatIncluded', { label: taxLabel }) : taxLabel} value={format.money(sale.taxTotal)} />}
        {sale.roundingAdjustment !== 0 && <Row label={t('sales.detail.totals.rounding')} value={format.money(sale.roundingAdjustment, { signed: true })} />}
        <div className="my-1 flex items-end justify-between gap-3 border-t border-border pt-3">
          <dt className="type-h3 text-fg">{t('sales.detail.totals.total')}</dt>
          <dd className={cn('type-total', cancelled ? 'text-fg-subtle line-through' : 'text-fg')}>{format.money(sale.grandTotal)}</dd>
        </div>
        <Row strong label={t('sales.detail.totals.paid')} value={format.money(sale.paidTotal)} />
        <Row label={t('sales.detail.totals.change')} value={format.money(sale.changeDue)} />
        {sale.returnedTotal > 0 && (
          <>
            <Row tone="warning" label={t('sales.detail.totals.refunded')} value={`−${format.money(sale.returnedTotal)}`} />
            <Row strong label={t('sales.detail.totals.net')} value={format.money(Math.max(0, sale.grandTotal - sale.returnedTotal))} />
          </>
        )}
        {(sale.pointsEarned > 0 || sale.pointsRedeemed > 0) && <div className="my-1 border-t border-border" aria-hidden />}
        {sale.pointsEarned > 0 && <Row label={t('sales.detail.totals.pointsEarned')} value={`+${format.integer(sale.pointsEarned)}`} />}
        {sale.pointsRedeemed > 0 && <Row label={t('sales.detail.totals.pointsRedeemed')} value={`−${format.integer(sale.pointsRedeemed)}`} />}
      </dl>
      {sale.note && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 type-body-sm text-fg-muted">
          <StickyNote size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span className="selectable">{sale.note}</span>
        </p>
      )}
    </Card>
  );
}
