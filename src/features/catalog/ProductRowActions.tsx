import { useNavigate } from 'react-router';
import { ClipboardList, Eye, MoreHorizontal, Pencil, Power, PowerOff, SlidersHorizontal } from 'lucide-react';
import { useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import type { Product } from '@/types';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { changeProductStatus } from './catalogActions';

/** "⋯" menu on a product row: view, edit, activate/deactivate, stock shortcuts. */
export function ProductRowActions({ product }: { product: Product }) {
  const t = useT();
  const localize = useLocalize();
  const navigate = useNavigate();
  const canManage = useCan('products.manage');
  const canAdjust = useCan('inventory.adjust');
  const canViewStock = useCan('inventory.view');

  const items: Array<MenuItem | 'separator'> = [{ key: 'view', label: t('catalog.products.actions.view'), icon: Eye, onSelect: () => navigate(`/products/${product.id}`) }];
  if (canManage) {
    items.push({ key: 'edit', label: t('catalog.products.actions.edit'), icon: Pencil, onSelect: () => navigate(`/products/${product.id}/edit`) });
    items.push(
      product.status === 'active'
        ? { key: 'deactivate', label: t('common.actions.deactivate'), icon: PowerOff, danger: true, onSelect: () => void changeProductStatus([product], 'inactive') }
        : { key: 'activate', label: t('common.actions.activate'), icon: Power, onSelect: () => void changeProductStatus([product], 'active') },
    );
  }
  if (canAdjust || canViewStock) items.push('separator');
  if (canAdjust) items.push({ key: 'adjust', label: t('catalog.products.actions.adjustStock'), icon: SlidersHorizontal, onSelect: () => navigate(`/inventory?adjust=${product.id}`) });
  if (canViewStock) items.push({ key: 'ledger', label: t('catalog.products.actions.stockLedger'), icon: ClipboardList, onSelect: () => navigate(`/inventory/ledger?product=${product.id}`) });

  return (
    // Stop clicks/keys (also from the portalled menu) reaching the row, which opens the product.
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <DropdownMenu
        items={items}
        width={232}
        trigger={({ ref, ...props }) => <IconButton ref={ref} icon={MoreHorizontal} label={t('catalog.products.rowActions', { name: localize(product.name) })} tooltip={false} size="sm" {...props} />}
      />
    </div>
  );
}
