import { Package, Pencil } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import type { SaleDetail, SaleItem } from '@/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, SectionHeader } from '@/components/ui/Display';
import { Tooltip } from '@/components/ui/Tooltip';
import { ProductImage } from '@/components/product/ProductImage';

/** Lines of a completed sale: quantities, returns, prices, discounts, VAT and notes. */
export function SaleItemsTable({ sale }: { sale: SaleDetail }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const unitById = useCatalogStore((state) => state.unitById);
  const productById = useCatalogStore((state) => state.byId);

  const unitOf = (item: SaleItem): string => {
    const unit = unitById.get(item.unitId);
    return unit ? localize(unit.short) : '';
  };

  const columns: Array<Column<SaleItem>> = [
    { key: 'line', header: '#', width: '3rem', cell: (item) => <span className="text-fg-subtle tnum">{format.integer(item.lineNo)}</span> },
    {
      key: 'product',
      header: t('sales.detail.items.product'),
      cell: (item) => {
        const product = productById.get(item.productId);
        return (
          <div className="flex min-w-[15rem] items-center gap-3 py-1">
            {product ? <ProductImage product={product} className="h-10 w-10 shrink-0" iconSize={18} /> : <span className="h-10 w-10 shrink-0 rounded-md bg-image-tile" aria-hidden />}
            <div className="min-w-0 leading-tight">
              <p className="truncate font-medium text-fg">{localize(item.name)}</p>
              <p className="type-caption truncate text-fg-subtle">
                <span className="font-mono">{item.sku}</span>
                {item.barcode ? <span className="font-mono"> · {item.barcode}</span> : null}
              </p>
              {item.note && <p className="type-caption mt-0.5 truncate text-fg-muted italic">“{item.note}”</p>}
            </div>
          </div>
        );
      },
    },
    { key: 'qty', header: t('common.labels.qty'), align: 'end', cell: (item) => <span className="whitespace-nowrap">{format.quantity(item.quantity, unitOf(item))}</span> },
    {
      key: 'returned',
      header: t('sales.detail.items.returned'),
      align: 'end',
      cell: (item) =>
        item.returnedQuantity > 0 ? (
          <span className="font-semibold whitespace-nowrap text-warning-text">{format.quantity(item.returnedQuantity, unitOf(item))}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'price',
      header: t('common.labels.unitPrice'),
      align: 'end',
      cell: (item) => (
        <div className="flex flex-col items-end gap-0.5 leading-tight">
          <span className="whitespace-nowrap">{format.money(item.unitPrice)}</span>
          {item.priceOverridden ? (
            <Tooltip content={t('sales.detail.items.priceChangedFrom', { price: format.money(item.originalPrice) })}>
              <span tabIndex={0} className="rounded-full">
                <Badge size="sm" tone="warning" icon={Pencil}>
                  {t('sales.detail.items.priceChanged')}
                </Badge>
              </span>
            </Tooltip>
          ) : item.mrp && item.mrp > item.unitPrice ? (
            <span className="type-caption text-fg-subtle line-through">{format.money(item.mrp)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'discount',
      header: t('common.labels.discount'),
      align: 'end',
      cell: (item) => {
        const total = item.discountAmount + item.orderDiscountAmount;
        if (total <= 0) return <span className="text-fg-subtle">—</span>;
        return (
          <div className="flex flex-col items-end leading-tight">
            <span className="whitespace-nowrap text-success-text">−{format.money(total)}</span>
            {item.orderDiscountAmount > 0 && item.discountAmount > 0 && (
              <span className="type-caption whitespace-nowrap text-fg-subtle">{t('sales.detail.items.cartShare', { amount: format.money(item.orderDiscountAmount) })}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'vat',
      header: t('common.labels.vat'),
      align: 'end',
      cell: (item) =>
        item.taxAmount > 0 ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="whitespace-nowrap">{format.money(item.taxAmount)}</span>
            <span className="type-caption text-fg-subtle">{format.percent(item.taxRate)}</span>
          </div>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    { key: 'total', header: t('sales.detail.items.lineTotal'), align: 'end', cell: (item) => <span className="font-semibold whitespace-nowrap text-fg">{format.money(item.lineTotal)}</span> },
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sale-items-title">
      <div id="sale-items-title">
        <SectionHeader
          icon={Package}
          title={t('sales.detail.items.title')}
          description={t('sales.detail.items.summary', { count: sale.itemCount, qty: format.quantity(sale.totalQuantity) })}
        />
      </div>
      <DataTable ariaLabel={t('sales.detail.items.title')} columns={columns} rows={sale.items} rowKey={(item) => item.id} dense />
    </section>
  );
}
