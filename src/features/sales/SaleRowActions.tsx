import { Ban, EllipsisVertical, Eye, FileText, Printer, RotateCcw } from 'lucide-react';
import { useT } from '@/i18n';
import type { Sale } from '@/types';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';

export interface SaleRowActionHandlers {
  onView: (sale: Sale) => void;
  onReprint?: (sale: Sale) => void;
  onInvoice?: (sale: Sale) => void;
  onReturn?: (sale: Sale) => void;
  onCancel?: (sale: Sale) => void;
}

/** Row action menu of a sale (View, Print receipt, A4 invoice, Return, Cancel). Missing handlers hide the entry. */
export function SaleRowActions({ sale, onView, onReprint, onInvoice, onReturn, onCancel }: SaleRowActionHandlers & { sale: Sale }) {
  const t = useT();
  const items: Array<MenuItem | 'separator'> = [{ key: 'view', label: t('sales.actions.view'), icon: Eye, onSelect: () => onView(sale) }];
  if (onReprint) items.push({ key: 'receipt', label: t('sales.actions.printReceipt'), icon: Printer, onSelect: () => onReprint(sale) });
  if (onInvoice) items.push({ key: 'invoice', label: t('sales.actions.printInvoice'), icon: FileText, onSelect: () => onInvoice(sale) });
  if (onReturn || onCancel) items.push('separator');
  if (onReturn) items.push({ key: 'return', label: t('sales.actions.return'), icon: RotateCcw, onSelect: () => onReturn(sale) });
  if (onCancel) items.push({ key: 'cancel', label: t('sales.actions.cancel'), icon: Ban, danger: true, onSelect: () => onCancel(sale) });

  return (
    // Keeps clicks and Enter inside the menu from also opening the row.
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <DropdownMenu items={items} width={240} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('sales.actions.menu', { invoice: sale.invoiceNo })} tooltipSide="left" />} />
    </div>
  );
}
