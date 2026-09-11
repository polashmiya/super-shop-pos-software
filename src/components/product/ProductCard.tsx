import { memo } from 'react';
import { Info, Plus } from 'lucide-react';
import { PRODUCT_IMAGE_HEIGHT } from '@/config/theme.config';
import type { ProductCardDisplay } from './layout';
import { getStockStatus } from '@/domain/stock';
import { calculateDiscountAmount } from '@/domain/pricing';
import type { Translate } from '@/i18n';
import type { Language, Product, StockStatus, Unit } from '@/types';
import type { Formatters } from '@/utils/format';
import { cn } from '@/components/ui/cn';
import { ProductImage } from './ProductImage';


interface ProductCardProps {
  product: Product;
  unit: Unit | undefined;
  display: ProductCardDisplay;
  language: Language;
  t: Translate;
  format: Formatters;
  flashing: boolean;
  inCart: number;
  onAdd: (product: Product) => void;
  onInfo: (product: Product) => void;
}

const STATUS_DOT: Record<StockStatus, string> = {
  in_stock: 'bg-success',
  low_stock: 'bg-warning',
  out_of_stock: 'bg-danger',
  expiring: 'bg-warning',
  inactive: 'bg-fg-subtle',
};


export const ProductCard = memo(function ProductCard({ product, unit, display, language, t, format, flashing, inCart, onAdd, onInfo }: ProductCardProps) {
  const primary = language === 'bn' ? product.name.bn : product.name.en;
  const secondary = language === 'bn' ? product.name.en : product.name.bn;
  const status = getStockStatus(product, display.expiringDays);
  const discountAmount = product.discount ? calculateDiscountAmount(product.sellingPrice, product.discount) : 0;
  const finalPrice = product.sellingPrice - discountAmount;
  const compareAt = discountAmount > 0 ? product.sellingPrice : product.mrp && product.mrp > product.sellingPrice ? product.mrp : null;
  const offRate = compareAt ? Math.round(((compareAt - finalPrice) / compareAt) * 100) : 0;
  const unitShort = unit ? (language === 'bn' ? unit.short.bn : unit.short.en) : '';
  const unavailable = status === 'out_of_stock' || status === 'inactive';

  const stockText =
    status === 'out_of_stock'
      ? t('pos.stock.outOfStock')
      : status === 'inactive'
        ? t('pos.stock.inactive')
        : status === 'low_stock'
          ? t('pos.stock.lowStock', { count: format.quantity(product.stock) })
          : t('pos.stock.available', { count: format.quantity(product.stock) });

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition-base',
        'hover:border-border-strong hover:shadow-md focus-within:border-primary',
        flashing ? 'border-primary ring-2 ring-primary/40' : inCart > 0 ? 'border-primary/50' : 'border-border',
        unavailable && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={() => onAdd(product)}
        aria-label={t('pos.card.addLabel', { name: primary })}
        className="flex h-full w-full flex-col text-start outline-none active:scale-[0.99]"
      >
        {display.showImage && (
          <div className="relative w-full shrink-0 p-1.5 pb-0" style={{ height: PRODUCT_IMAGE_HEIGHT[display.imageSize] }}>
            <ProductImage product={product} className="h-full w-full" iconSize={display.imageSize === 'sm' ? 26 : 34} />
          </div>
        )}
        <div className={cn('flex min-h-0 flex-1 flex-col gap-0.5 px-2.5 pb-2', display.showImage ? 'pt-2' : 'pt-2.5')}>
          <p className="line-clamp-2 text-[0.86rem] leading-snug font-semibold text-fg" title={primary}>
            {primary}
          </p>
          {display.showSecondaryName && <p className="truncate text-[0.72rem] text-fg-subtle">{secondary}</p>}
          <div className="mt-auto flex items-baseline gap-1.5 pt-1">
            <span className="type-price text-fg">{format.money(finalPrice)}</span>
            {product.weighted && unitShort && <span className="text-[0.72rem] text-fg-subtle">/{unitShort}</span>}
            {display.showMrp && compareAt && <span className="text-[0.74rem] text-fg-subtle line-through tnum">{format.money(compareAt)}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-[0.7rem] text-fg-muted">
            {display.showStock && (
              <>
                <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
                <span className="truncate">{stockText}</span>
              </>
            )}
            {(display.showSku || display.showBarcode) && (
              <span className="ms-auto truncate font-mono text-[0.66rem] text-fg-subtle">{display.showBarcode ? product.barcode : product.sku}</span>
            )}
          </div>
        </div>
      </button>

      {display.showDiscount && offRate > 0 && (
        <span className="pointer-events-none absolute start-2 top-2 rounded-md bg-danger px-1.5 py-0.5 text-[0.68rem] font-bold text-danger-fg shadow-sm tnum">
          {t('pos.card.off', { value: `${format.integer(offRate)}%` })}
        </span>
      )}
      {inCart > 0 && (
        <span className="pointer-events-none absolute end-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-fg shadow-sm tnum">
          {format.quantity(inCart)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onInfo(product)}
        aria-label={t('pos.card.details')}
        className={cn(
          'absolute end-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-fg-muted opacity-0 shadow-sm ring-1 ring-border transition-base',
          'group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg',
          display.showImage ? (inCart > 0 ? 'top-9' : 'top-2') : 'bottom-2',
        )}
      >
        <Info size={16} aria-hidden />
      </button>
      {!display.showImage && (
        <span aria-hidden className="pointer-events-none absolute end-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg group-hover:flex">
          <Plus size={14} />
        </span>
      )}
    </div>
  );
});
