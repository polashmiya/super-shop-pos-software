import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import type { PurchaseDetail } from '@/types';
import { cn } from '@/components/ui/cn';
import { Card, Meter, SectionHeader } from '@/components/ui/Display';
import { ProductCell } from '@/features/inventory/InventoryBits';
import { TotalLine } from './PurchaseBits';
import { pendingQuantity, purchaseDue, receivedShare } from './purchaseHelpers';

/** Ordered / received / pending per item with progress, plus the order totals. */
export function PurchaseItemsCard({ purchase }: { purchase: PurchaseDetail }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const canViewProducts = useCan('products.view');
  const byId = useCatalogStore((state) => state.byId);
  const unitById = useCatalogStore((state) => state.unitById);
  const share = receivedShare(purchase.items);
  const due = purchaseDue(purchase);
  const headerClass = 'h-11 border-b border-border bg-surface-2 px-3 type-label whitespace-nowrap text-fg-muted';

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <SectionHeader title={t('inventory.purchaseDetail.items')} description={t('common.units.items', { count: purchase.items.length })} />
        {purchase.status !== 'cancelled' && (
          <div className="flex min-w-60 items-center gap-3">
            <Meter value={share} tone={share >= 1 ? 'success' : share > 0 ? 'warning' : 'info'} label={t('inventory.purchaseDetail.progress')} className="h-2 flex-1" />
            <span className="type-body-sm whitespace-nowrap text-fg-muted tnum">{share >= 1 ? t('inventory.purchaseDetail.fullyReceived') : t('inventory.purchaseDetail.receivedPercent', { percent: format.percentValue(share * 100, 0) })}</span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-[0.9rem]" aria-label={t('inventory.purchaseDetail.items')}>
          <thead>
            <tr>
              <th scope="col" className={cn(headerClass, 'text-start')}>
                {t('inventory.columns.product')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('inventory.purchaseDetail.ordered')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('inventory.purchaseDetail.received')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('inventory.purchaseDetail.pending')}
              </th>
              <th scope="col" className={cn(headerClass, 'w-36 text-start')}>
                {t('inventory.purchaseDetail.progress')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('inventory.shared.unitCost')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('common.labels.discount')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('common.labels.vat')}
              </th>
              <th scope="col" className={cn(headerClass, 'text-end')}>
                {t('inventory.shared.lineTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => {
              const product = byId.get(item.productId);
              const unit = product ? unitById.get(product.unitId) : undefined;
              const unitShort = unit ? localize(unit.short) : undefined;
              const pending = pendingQuantity(item);
              const itemShare = item.quantity > 0 ? Math.min(1, item.receivedQuantity / item.quantity) : 0;
              return (
                <tr key={item.id}>
                  <td className="h-row border-b border-border px-3 py-2">
                    <ProductCell
                      size="sm"
                      product={{ name: item.name, image: product?.image ?? null, categoryId: product?.categoryId ?? '' }}
                      to={canViewProducts && product ? `/products/${product.id}` : null}
                      meta={<span className="font-mono">{item.sku}</span>}
                    />
                  </td>
                  <td className="border-b border-border px-3 text-end tnum">{format.quantity(item.quantity, unitShort)}</td>
                  <td className="border-b border-border px-3 text-end text-success-text tnum">{format.quantity(item.receivedQuantity)}</td>
                  <td className={cn('border-b border-border px-3 text-end tnum', pending > 0 && purchase.status !== 'cancelled' ? 'font-semibold text-warning-text' : 'text-fg-subtle')}>{format.quantity(pending)}</td>
                  <td className="border-b border-border px-3">
                    <Meter value={itemShare} tone={itemShare >= 1 ? 'success' : itemShare > 0 ? 'warning' : 'info'} label={t('inventory.purchaseDetail.itemProgress', { name: localize(item.name) })} />
                  </td>
                  <td className="border-b border-border px-3 text-end tnum">{format.money(item.unitCost)}</td>
                  <td className="border-b border-border px-3 text-end text-fg-muted tnum">{item.discountAmount > 0 ? `−${format.money(item.discountAmount)}` : '—'}</td>
                  <td className="border-b border-border px-3 text-end text-fg-muted tnum">{item.taxAmount > 0 ? `${format.money(item.taxAmount)} · ${format.percent(item.taxRate)}` : '—'}</td>
                  <td className="border-b border-border px-3 text-end font-semibold tnum">{format.money(item.lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end p-5">
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <TotalLine label={t('common.labels.subtotal')} value={format.money(purchase.subtotal)} />
          {purchase.discountTotal > 0 && <TotalLine label={t('common.labels.discount')} value={`−${format.money(purchase.discountTotal)}`} />}
          <TotalLine label={t('common.labels.vat')} value={format.money(purchase.taxTotal)} />
          <TotalLine strong label={t('inventory.purchaseDetail.grandTotal')} value={format.money(purchase.grandTotal)} />
          <TotalLine label={t('inventory.shared.paid')} value={format.money(purchase.paidAmount)} tone={purchase.paidAmount > 0 ? 'success' : undefined} />
          {purchase.status !== 'cancelled' && <TotalLine label={t('inventory.shared.due')} value={format.money(due)} tone={due > 0 ? 'danger' : undefined} />}
        </div>
      </div>
    </Card>
  );
}
