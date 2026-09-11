import { Ban, FilePenLine, PackageCheck, PackageOpen, Send, type LucideIcon } from 'lucide-react';
import { parseLocalDate } from '@/domain/dates';
import { roundQuantity } from '@/domain/money';
import { getFormatters } from '@/hooks/useFormat';
import { pick, t, getLanguage } from '@/i18n';
import { purchaseService } from '@/services/purchaseService';
import { confirmAction, toast } from '@/stores/uiStore';
import type { IsoDate, Purchase, PurchaseDetail, PurchaseItem, PurchaseStatus, Supplier } from '@/types';
import type { Tone } from '@/components/ui/Display';
import { previewA4Report } from '@/features/inventory/exportHelpers';

/* ==========================================================================
   Purchase order rules for the UI (what can be done in which status) and
   shared actions (mark ordered, cancel with confirmation, print the PO).
   ========================================================================== */

export const PURCHASE_STATUSES: readonly PurchaseStatus[] = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

export function parsePurchaseStatus(value: string | null): PurchaseStatus | 'all' {
  return PURCHASE_STATUSES.includes(value as PurchaseStatus) ? (value as PurchaseStatus) : 'all';
}

export function purchaseStatusBadge(status: PurchaseStatus): { tone: Tone; icon: LucideIcon } {
  switch (status) {
    case 'draft':
      return { tone: 'neutral', icon: FilePenLine };
    case 'ordered':
      return { tone: 'info', icon: Send };
    case 'partially_received':
      return { tone: 'warning', icon: PackageOpen };
    case 'received':
      return { tone: 'success', icon: PackageCheck };
    case 'cancelled':
    default:
      return { tone: 'danger', icon: Ban };
  }
}

export const canEditPurchase = (purchase: Pick<Purchase, 'status'>): boolean => purchase.status === 'draft' || purchase.status === 'ordered';
export const canCancelPurchase = canEditPurchase;
export const canMarkOrdered = (purchase: Pick<Purchase, 'status'>): boolean => purchase.status === 'draft';
export const canReceivePurchase = (purchase: Pick<Purchase, 'status'>): boolean =>
  purchase.status === 'draft' || purchase.status === 'ordered' || purchase.status === 'partially_received';

export const purchaseDue = (purchase: Pick<Purchase, 'grandTotal' | 'paidAmount'>): number => Math.max(0, purchase.grandTotal - purchase.paidAmount);

/** Payments are taken once the order is confirmed (advance) or received, never on drafts or cancelled orders. */
export const canPayPurchase = (purchase: Pick<Purchase, 'status' | 'grandTotal' | 'paidAmount'>): boolean =>
  purchase.status !== 'draft' && purchase.status !== 'cancelled' && purchaseDue(purchase) > 0;

export const pendingQuantity = (item: Pick<PurchaseItem, 'quantity' | 'receivedQuantity'>): number => roundQuantity(Math.max(0, item.quantity - item.receivedQuantity));

/** Share of ordered units already received (0…1). */
export function receivedShare(items: ReadonlyArray<Pick<PurchaseItem, 'quantity' | 'receivedQuantity'>>): number {
  const ordered = items.reduce((sum, item) => sum + item.quantity, 0);
  if (ordered <= 0) return 0;
  return Math.min(1, items.reduce((sum, item) => sum + Math.min(item.receivedQuantity, item.quantity), 0) / ordered);
}

/** Calendar dates (yyyy-mm-dd) are local dates — never parse them as UTC. */
export const localDate = (value: IsoDate | null): Date | null => (value ? parseLocalDate(value) : null);

/* ------------------------------ shared actions ------------------------------ */

export async function markPurchaseOrdered(purchase: Purchase): Promise<boolean> {
  try {
    await purchaseService.markOrdered(purchase);
    toast.success({ key: 'inventory.purchases.markedOrdered', params: { poNo: purchase.poNo } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

export async function cancelPurchaseWithConfirm(purchase: Purchase): Promise<boolean> {
  const ok = await confirmAction({
    title: t('inventory.purchases.confirmCancelTitle', { poNo: purchase.poNo }),
    message: t('inventory.purchases.confirmCancelMessage'),
    confirmLabel: t('inventory.purchases.actions.cancel'),
    cancelLabel: t('inventory.purchases.keepOrder'),
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await purchaseService.cancel(purchase);
    toast.success({ key: 'inventory.purchases.cancelled', params: { poNo: purchase.poNo } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

/** A4 purchase order print-out (items, totals, supplier and delivery details). */
export async function printPurchaseOrder(purchase: PurchaseDetail, supplier: Supplier | null): Promise<void> {
  const format = getFormatters();
  const language = getLanguage();
  const due = purchaseDue(purchase);
  const subtitle = [
    supplier ? [supplier.name, supplier.company, supplier.phone ? format.digits(supplier.phone) : '', supplier.address].filter(Boolean).join(' · ') : purchase.supplierName,
    `${t('inventory.purchaseDetail.orderDate')}: ${format.date(localDate(purchase.orderDate))}`,
    purchase.expectedDate ? `${t('inventory.purchaseDetail.expectedDate')}: ${format.date(localDate(purchase.expectedDate))}` : '',
  ]
    .filter(Boolean)
    .join('  |  ');
  await previewA4Report({
    title: `${t('inventory.purchaseDetail.printTitle')} ${purchase.poNo}`,
    subtitle,
    kpis: [
      { label: t('common.labels.status'), value: t(`enums.purchaseStatus.${purchase.status}`) },
      { label: t('common.labels.items'), value: format.integer(purchase.items.length) },
      { label: t('inventory.purchaseDetail.grandTotal'), value: format.money(purchase.grandTotal, { decimals: 'always' }) },
      { label: t('inventory.shared.paid'), value: format.money(purchase.paidAmount, { decimals: 'always' }) },
      { label: t('inventory.shared.due'), value: format.money(due, { decimals: 'always' }) },
    ],
    sections: [
      {
        headers: [
          '#',
          t('inventory.columns.product'),
          t('common.labels.sku'),
          t('inventory.purchaseDetail.ordered'),
          t('inventory.purchaseDetail.received'),
          t('inventory.shared.unitCost'),
          t('common.labels.discount'),
          t('common.labels.vat'),
          t('inventory.shared.lineTotal'),
        ],
        numeric: [true, false, false, true, true, true, true, true, true],
        rows: purchase.items.map((item, index) => [
          format.integer(index + 1),
          pick(item.name, language),
          item.sku,
          format.quantity(item.quantity),
          format.quantity(item.receivedQuantity),
          format.money(item.unitCost, { decimals: 'always' }),
          item.discountAmount > 0 ? format.money(item.discountAmount, { decimals: 'always' }) : '—',
          item.taxAmount > 0 ? `${format.money(item.taxAmount, { decimals: 'always' })} (${format.percent(item.taxRate)})` : '—',
          format.money(item.lineTotal, { decimals: 'always' }),
        ]),
        totals: [
          '',
          t('inventory.purchaseDetail.grandTotal'),
          '',
          '',
          '',
          format.money(purchase.subtotal, { decimals: 'always' }),
          purchase.discountTotal > 0 ? format.money(purchase.discountTotal, { decimals: 'always' }) : '—',
          purchase.taxTotal > 0 ? format.money(purchase.taxTotal, { decimals: 'always' }) : '—',
          format.money(purchase.grandTotal, { decimals: 'always' }),
        ],
      },
    ],
    fileName: `${purchase.poNo}.pdf`,
  });
}
