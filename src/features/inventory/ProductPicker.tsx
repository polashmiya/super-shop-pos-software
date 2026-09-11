import { useMemo, useState } from 'react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { searchProducts, useCatalogStore } from '@/stores/catalogStore';
import type { Product } from '@/types';
import { cn } from '@/components/ui/cn';
import { Combobox } from '@/components/ui/Combobox';
import { ProductImage } from '@/components/product/ProductImage';

interface ProductPickerProps {
  onSelect: (product: Product) => void;
  placeholder: string;
  ariaLabel: string;
  /** Show inactive products too (ledger lookups). */
  includeInactive?: boolean;
  /** Show the purchase price next to the stock (purchase orders). */
  showCost?: boolean;
  autoFocus?: boolean;
  className?: string;
}

const RESULT_LIMIT = 12;

/** Searches the in-memory catalogue (Bangla/English name, SKU, barcode, brand) — instant, offline. */
export function ProductPicker({ onSelect, placeholder, ariaLabel, includeInactive, showCost, autoFocus, className }: ProductPickerProps) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const products = useCatalogStore((state) => state.products);
  const haystacks = useCatalogStore((state) => state.haystacks);
  const unitById = useCatalogStore((state) => state.unitById);
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => (query.trim() ? searchProducts(products, haystacks, query, { limit: RESULT_LIMIT, includeInactive }) : []),
    [products, haystacks, query, includeInactive],
  );

  return (
    <Combobox
      className={className}
      query={query}
      onQueryChange={setQuery}
      results={results}
      getKey={(product) => product.id}
      autoFocus={autoFocus}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      emptyText={t('common.states.noResultsFor', { query: query.trim() })}
      onSelect={(product) => {
        onSelect(product);
        setQuery('');
      }}
      renderItem={(product) => {
        const unit = unitById.get(product.unitId);
        const unitShort = unit ? localize(unit.short) : undefined;
        const low = product.stock <= product.minStock;
        return (
          <div className="flex items-center gap-3 px-2.5 py-2">
            <ProductImage product={product} className="h-10 w-10 shrink-0" iconSize={18} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{localize(product.name)}</p>
              <p className="type-caption truncate text-fg-subtle">
                <span className="font-mono">{product.sku}</span>
                {product.barcode ? ` · ${product.barcode}` : ''}
                {product.status === 'inactive' ? ` · ${t('common.labels.inactive')}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className={cn('text-sm font-semibold tnum', product.stock <= 0 ? 'text-danger-text' : low ? 'text-warning-text' : 'text-fg')}>
                {t('inventory.shared.inStockShort', { qty: format.quantity(product.stock, unitShort) })}
              </p>
              {showCost && <p className="type-caption text-fg-subtle tnum">{t('inventory.shared.costShort', { amount: format.money(product.purchasePrice) })}</p>}
            </div>
          </div>
        );
      }}
    />
  );
}
