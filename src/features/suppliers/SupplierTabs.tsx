import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { HandCoins, Package, ShoppingCart } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Product, Purchase, SupplierPayment } from '@/types';
import { Badge } from '@/components/ui/Display';
import { DataTable, type Column, type PaginationProps } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/States';
import { ProductCell, ProductStockBadge } from '@/features/inventory/InventoryBits';
import { DueAmount, PurchaseStatusBadge } from '@/features/purchases/PurchaseBits';
import { localDate, purchaseDue } from '@/features/purchases/purchaseHelpers';
import { PAYMENT_METHOD_ICONS } from './supplierHelpers';

/* The three tabs of the supplier screen: purchase orders, payments, products. */

export function SupplierPurchasesTable({ rows, loading, pagination }: { rows: Purchase[]; loading: boolean; pagination?: PaginationProps }) {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const columns: Array<Column<Purchase>> = [
    { key: 'po', header: t('inventory.purchases.columns.poNo'), cell: (purchase) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{purchase.poNo}</span> },
    { key: 'date', header: t('inventory.purchases.columns.orderDate'), cell: (purchase) => <span className="whitespace-nowrap tnum">{format.date(localDate(purchase.orderDate))}</span> },
    { key: 'items', header: t('common.labels.items'), align: 'end', hideable: true, cell: (purchase) => format.integer(purchase.itemCount) },
    { key: 'total', header: t('common.labels.total'), align: 'end', cell: (purchase) => <span className="font-semibold text-fg">{format.money(purchase.grandTotal)}</span> },
    { key: 'paid', header: t('inventory.shared.paid'), align: 'end', hideable: true, cell: (purchase) => format.money(purchase.paidAmount) },
    { key: 'due', header: t('inventory.shared.due'), align: 'end', cell: (purchase) => <DueAmount amount={purchase.status === 'cancelled' ? 0 : purchaseDue(purchase)} /> },
    { key: 'status', header: t('common.labels.status'), cell: (purchase) => <PurchaseStatusBadge status={purchase.status} /> },
  ];
  return (
    <DataTable
      ariaLabel={t('inventory.suppliers.detail.tabs.purchases')}
      columns={columns}
      rows={rows}
      rowKey={(purchase) => purchase.id}
      loading={loading}
      onRowClick={(purchase) => navigate(`/purchases/${purchase.id}`)}
      pagination={pagination}
      empty={<EmptyState compact icon={ShoppingCart} title={t('inventory.suppliers.detail.purchasesEmpty')} description={t('inventory.suppliers.detail.purchasesEmptyHint')} />}
    />
  );
}

export function SupplierPaymentsTable({ rows, loading, poNumbers }: { rows: SupplierPayment[]; loading: boolean; poNumbers: ReadonlyMap<string, string> }) {
  const t = useT();
  const format = useFormat();
  const columns: Array<Column<SupplierPayment>> = [
    { key: 'date', header: t('common.labels.dateTime'), cell: (payment) => <span className="whitespace-nowrap tnum">{format.dateTime(payment.paidAt)}</span> },
    { key: 'amount', header: t('common.labels.amount'), align: 'end', cell: (payment) => <span className="font-semibold text-fg">{format.money(payment.amount)}</span> },
    {
      key: 'method',
      header: t('common.labels.method'),
      cell: (payment) => (
        <Badge size="sm" icon={PAYMENT_METHOD_ICONS[payment.method]}>
          {t(`inventory.payment.methods.${payment.method}`)}
        </Badge>
      ),
    },
    {
      key: 'order',
      header: t('inventory.suppliers.detail.paymentFor'),
      cell: (payment) =>
        payment.purchaseId ? (
          <Link to={`/purchases/${payment.purchaseId}`} className="font-mono text-[0.86rem] text-primary hover:underline">
            {poNumbers.get(payment.purchaseId) ?? '…'}
          </Link>
        ) : (
          <span className="text-fg-subtle">{t('inventory.payment.onAccount')}</span>
        ),
    },
    { key: 'reference', header: t('common.labels.reference'), hideable: true, cell: (payment) => <span className="text-fg-muted">{payment.reference || '—'}</span> },
    { key: 'note', header: t('common.labels.note'), hideable: true, cell: (payment) => <span className="block max-w-64 truncate text-fg-muted">{payment.note || '—'}</span> },
  ];
  return (
    <DataTable
      ariaLabel={t('inventory.suppliers.detail.tabs.payments')}
      columns={columns}
      rows={rows}
      rowKey={(payment) => payment.id}
      loading={loading}
      empty={<EmptyState compact icon={HandCoins} title={t('inventory.suppliers.detail.paymentsEmpty')} description={t('inventory.suppliers.detail.paymentsEmptyHint')} />}
    />
  );
}

export function SupplierProductsTable({ supplierId }: { supplierId: string }) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const products = useCatalogStore((state) => state.products);
  const unitById = useCatalogStore((state) => state.unitById);
  const rows = useMemo(() => products.filter((product) => product.supplierId === supplierId).sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock)), [products, supplierId]);
  const columns: Array<Column<Product>> = [
    { key: 'product', header: t('inventory.columns.product'), cell: (product) => <ProductCell product={product} to={`/products/${product.id}`} meta={product.sku} size="sm" /> },
    {
      key: 'stock',
      header: t('inventory.columns.currentStock'),
      align: 'end',
      cell: (product) => {
        const unit = unitById.get(product.unitId);
        return <span className="font-semibold text-fg tnum">{format.quantity(product.stock, unit ? localize(unit.short) : undefined)}</span>;
      },
    },
    { key: 'min', header: t('inventory.columns.minStock'), align: 'end', hideable: true, cell: (product) => format.quantity(product.minStock) },
    { key: 'cost', header: t('inventory.shared.unitCost'), align: 'end', hideable: true, cell: (product) => format.money(product.purchasePrice) },
    { key: 'status', header: t('common.labels.status'), cell: (product) => <ProductStockBadge product={product} /> },
  ];
  return (
    <DataTable
      ariaLabel={t('inventory.suppliers.detail.tabs.products')}
      columns={columns}
      rows={rows}
      rowKey={(product) => product.id}
      empty={<EmptyState compact icon={Package} title={t('inventory.suppliers.detail.productsEmpty')} description={t('inventory.suppliers.detail.productsEmptyHint')} />}
    />
  );
}
