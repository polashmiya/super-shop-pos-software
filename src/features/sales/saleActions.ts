import { toLocalDate } from '@/domain/dates';
import { t } from '@/i18n';
import { buildSaleInvoice, buildSaleReceipt, openPrintPreview, printResultMessage, printWithSettings } from '@/features/printing/printService';
import type { SaleSort } from '@/repositories/types';
import { dataService } from '@/services/dataService';
import type { ReturnPolicy } from '@/services/returnService';
import { cancelSale, listSales, logReprint, paymentMethodsForSales } from '@/services/saleService';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { requestApproval, toast } from '@/stores/uiStore';
import type { Id, PrintResult, Sale, SaleDetail, SaleFilter } from '@/types';
import { csvMoney, exportFileName, toCsv } from '@/utils/csv';
import { saleProductIds } from './saleMeta';

/* ==========================================================================
   Sales actions used by the list and the detail screen. Completed sales are
   immutable: corrections happen only through a return or a cancellation,
   both of which leave an audit trail.
   ========================================================================== */

const isPrinted = (result: PrintResult): boolean => result.outcome === 'printed' || result.outcome === 'saved-pdf';

/** Reprints the receipt ("REPRINT" marked) and records it in the audit log. */
export async function reprintReceipt(sale: SaleDetail): Promise<boolean> {
  try {
    const request = await buildSaleReceipt(sale, true);
    const { printer } = useSettingsStore.getState().device;
    const silent = printer.autoPrint || !printer.showPreview;
    const result = await printWithSettings(request);
    if (!result) return false;
    const printed = isPrinted(result);
    // The preview dialog reports its own outcome; silent printing needs a message here.
    if (silent) {
      if (printed) toast.success({ text: printResultMessage(result) });
      else toast.error({ text: printResultMessage(result) });
    }
    if (printed) await logReprint(sale).catch(() => undefined);
    return printed;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

/** Opens the A4 tax invoice in the print preview. */
export async function printInvoice(sale: SaleDetail): Promise<void> {
  try {
    await openPrintPreview(await buildSaleInvoice(sale));
  } catch (error) {
    toast.fromError(error);
  }
}

/** Keeps the POS catalogue stock and the drawer totals in step after a return/cancel. */
export function refreshAfterSaleChange(productIds: Id[]): void {
  void useCatalogStore
    .getState()
    .refreshStock(productIds)
    .catch(() => undefined);
  void useShiftStore
    .getState()
    .refreshTotals()
    .catch(() => undefined);
}

/** True when cancelling needs a manager's PIN (no permission, or the shop requires it). */
export function cancelNeedsApproval(): boolean {
  return !useAuthStore.getState().can('sales.cancel') || useSettingsStore.getState().business.security.requireManagerForCancel;
}

/**
 * Cancels a sale after the manager approval the settings require.
 * Returns false when the approval was declined; throws service errors.
 */
export async function cancelWithApproval(sale: SaleDetail, reason: string): Promise<boolean> {
  let approvedBy: string | null = null;
  if (cancelNeedsApproval()) {
    const approver = await requestApproval({ permission: 'sales.cancel', action: t('sales.cancel.approvalAction', { invoice: sale.invoiceNo }) });
    if (!approver) return false;
    approvedBy = approver.name.en;
  }
  await cancelSale(sale, reason, approvedBy);
  refreshAfterSaleChange(saleProductIds(sale));
  return true;
}

/** Whether a return needs a manager and which permission the approver must hold. */
export function returnApprovalPermission(policy: ReturnPolicy): 'sales.return' | 'sales.returnAny' | null {
  if (policy.needsApproval) return 'sales.returnAny';
  return useAuthStore.getState().can('sales.return') ? null : 'sales.return';
}

/** Asks for the approval a return needs. Resolves with the approver's name, null (not needed) or false (declined). */
export async function approveReturn(sale: SaleDetail, policy: ReturnPolicy, amount: string): Promise<string | null | false> {
  const permission = returnApprovalPermission(policy);
  if (!permission) return null;
  const approver = await requestApproval({ permission, action: t('sales.returnDialog.approvalAction', { invoice: sale.invoiceNo, amount }) });
  return approver ? approver.name.en : false;
}

/* ------------------------------- CSV export ------------------------------ */

const EXPORT_LIMIT = 5_000;
const EXPORT_PAGE = 1_000;

const pad = (value: number): string => String(value).padStart(2, '0');

function localTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface ExportNames {
  cashier: (sale: Sale) => string;
  counter: (sale: Sale) => string;
}

/** Exports the sales of the current filter (up to 5,000 rows) as CSV. */
export async function exportSalesCsv(filter: SaleFilter, sort: SaleSort, names: ExportNames): Promise<void> {
  try {
    const rows: Sale[] = [];
    let total = 0;
    for (let page = 1; rows.length < EXPORT_LIMIT; page += 1) {
      const result = await listSales(filter, { page, pageSize: EXPORT_PAGE }, sort);
      total = result.total;
      rows.push(...result.rows);
      if (result.rows.length < EXPORT_PAGE || rows.length >= total) break;
    }
    const exported = rows.slice(0, EXPORT_LIMIT);
    if (exported.length === 0) {
      toast.info('sales.export.empty');
      return;
    }
    const methods = await paymentMethodsForSales(exported.filter((sale) => sale.paymentSummary === 'split').map((sale) => sale.id));
    const headers = [
      t('sales.columns.invoice'),
      t('common.labels.date'),
      t('common.labels.time'),
      t('common.labels.cashier'),
      t('common.labels.counter'),
      t('common.labels.customer'),
      t('common.labels.phone'),
      t('sales.columns.items'),
      t('common.labels.quantity'),
      t('sales.columns.payment'),
      t('common.labels.subtotal'),
      t('common.labels.discount'),
      t('common.labels.vat'),
      t('common.labels.total'),
      t('sales.columns.refunded'),
      t('common.labels.status'),
    ];
    const lines = exported.map((sale) => {
      const payment =
        sale.paymentSummary === 'split' && methods[sale.id]?.length
          ? methods[sale.id].map((method) => t(`enums.paymentMethod.${method}`)).join(' + ')
          : t(`enums.paymentMethod.${sale.paymentSummary}`);
      return [
        sale.invoiceNo,
        toLocalDate(new Date(sale.createdAt)),
        localTime(sale.createdAt),
        names.cashier(sale),
        names.counter(sale),
        sale.customerName || t('common.labels.walkIn'),
        sale.customerPhone,
        sale.itemCount,
        sale.totalQuantity,
        payment,
        csvMoney(sale.subtotal),
        csvMoney(sale.discountTotal),
        csvMoney(sale.taxTotal),
        csvMoney(sale.grandTotal),
        csvMoney(sale.returnedTotal),
        t(`enums.saleStatus.${sale.status}`),
      ];
    });
    const saved = await dataService.saveFile(exportFileName('sales', 'csv'), toCsv(headers, lines), 'csv');
    if (saved.ok) {
      toast.success({ key: 'sales.export.done', params: { count: exported.length } }, total > EXPORT_LIMIT ? { key: 'sales.export.limited', params: { count: EXPORT_LIMIT } } : undefined);
    } else if (saved.reason !== 'cancelled') {
      toast.error('errors.saveFailed');
    }
  } catch (error) {
    toast.fromError(error);
  }
}
