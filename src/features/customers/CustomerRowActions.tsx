import { EllipsisVertical, Eye, Pencil, ReceiptText, ScanBarcode, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import type { Customer } from '@/types';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';

interface CustomerRowActionsProps {
  customer: Customer;
  onView: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
  onNewSale?: (customer: Customer) => void;
  onSales?: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void;
}

/** Row menu of a customer. Missing handlers (no permission) hide the entry. */
export function CustomerRowActions({ customer, onView, onEdit, onNewSale, onSales, onDelete }: CustomerRowActionsProps) {
  const t = useT();
  const items: Array<MenuItem | 'separator'> = [{ key: 'view', label: t('customers.actions.view'), icon: Eye, onSelect: () => onView(customer) }];
  if (onEdit) items.push({ key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: () => onEdit(customer) });
  if (onNewSale) items.push({ key: 'sale', label: t('customers.actions.newSale'), icon: ScanBarcode, onSelect: () => onNewSale(customer) });
  if (onSales) items.push({ key: 'sales', label: t('customers.actions.viewSales'), icon: ReceiptText, onSelect: () => onSales(customer) });
  if (onDelete) items.push('separator', { key: 'delete', label: t('common.actions.delete'), icon: Trash2, danger: true, onSelect: () => onDelete(customer) });

  return (
    // Keeps clicks and Enter inside the menu from also opening the row.
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <DropdownMenu items={items} width={240} trigger={(props) => <IconButton {...props} icon={EllipsisVertical} label={t('customers.actions.menu', { name: customer.name })} tooltipSide="left" />} />
    </div>
  );
}
