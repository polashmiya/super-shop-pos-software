import { useMemo, type RefObject } from 'react';
import { FilterX, Star } from 'lucide-react';
import { useLocalize, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select, type SelectOption } from '@/components/ui/Controls';
import { cn } from '@/components/ui/cn';
import { categoryTree } from './catalogUtils';
import { hasActiveFilters, STOCK_LEVEL_FILTERS, type ProductListFilters, type ProductStatusFilter, type StockLevelFilter } from './productListStore';

/** Indents subcategories inside the native category <select> (two em spaces). */
const SUB_INDENT = '  ';

interface ProductFiltersProps {
  filters: ProductListFilters;
  onChange: (patch: Partial<ProductListFilters>) => void;
  onClear: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
}

/** Search + category / brand / status / stock / featured filters for the product list. */
export function ProductFilters({ filters, onChange, onClear, searchRef }: ProductFiltersProps) {
  const t = useT();
  const localize = useLocalize();
  const categories = useCatalogStore((state) => state.categories);
  const brands = useCatalogStore((state) => state.brands);

  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: t('catalog.products.filters.allCategories') },
      ...categoryTree(categories).flatMap(({ category, children }) => [
        { value: category.id, label: localize(category.name) },
        ...children.map((child) => ({ value: child.id, label: `${SUB_INDENT}${localize(child.name)}` })),
      ]),
    ],
    [categories, localize, t],
  );

  const brandOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: t('catalog.products.filters.allBrands') },
      { value: 'none', label: t('catalog.products.filters.withoutBrand') },
      ...[...brands].sort((a, b) => localize(a.name).localeCompare(localize(b.name))).map((brand) => ({ value: brand.id, label: localize(brand.name) })),
    ],
    [brands, localize, t],
  );

  const statusOptions: Array<SelectOption<ProductStatusFilter>> = [
    { value: 'all', label: t('catalog.products.filters.allStatuses') },
    { value: 'active', label: t('enums.productStatus.active') },
    { value: 'inactive', label: t('enums.productStatus.inactive') },
  ];

  const stockOptions: Array<SelectOption<StockLevelFilter>> = [
    { value: 'all', label: t('catalog.products.filters.allStock') },
    ...STOCK_LEVEL_FILTERS.map((level) => ({ value: level, label: t(`enums.stockStatus.${level}`) })),
  ];

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="min-w-[15rem] flex-[1_1_16rem]">
        <SearchInput
          ref={searchRef}
          value={filters.query}
          onChange={(query) => onChange({ query })}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && filters.query) {
              event.stopPropagation();
              onChange({ query: '' });
            }
          }}
          clearLabel={t('common.actions.clear')}
          placeholder={t('catalog.products.searchPlaceholder')}
          aria-label={t('catalog.products.searchLabel')}
        />
      </div>
      <div className="w-52">
        <Select value={filters.categoryId} options={categoryOptions} onChange={(categoryId) => onChange({ categoryId })} aria-label={t('catalog.products.filters.category')} />
      </div>
      <div className="w-44">
        <Select value={filters.brandId} options={brandOptions} onChange={(brandId) => onChange({ brandId })} aria-label={t('catalog.products.filters.brand')} />
      </div>
      <div className="w-40">
        <Select<ProductStatusFilter> value={filters.status} options={statusOptions} onChange={(status) => onChange({ status })} aria-label={t('catalog.products.filters.status')} />
      </div>
      <div className="w-44">
        <Select<StockLevelFilter> value={filters.stock} options={stockOptions} onChange={(stock) => onChange({ stock })} aria-label={t('catalog.products.filters.stock')} />
      </div>
      <button
        type="button"
        aria-pressed={filters.featured}
        onClick={() => onChange({ featured: !filters.featured })}
        className={cn(
          'inline-flex min-h-touch items-center gap-2 rounded-md border px-3.5 text-[0.9rem] font-medium whitespace-nowrap transition-base',
          filters.featured ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg',
        )}
      >
        <Star size={16} aria-hidden className={filters.featured ? 'fill-current' : undefined} />
        {t('catalog.products.filters.featured')}
      </button>
      {hasActiveFilters(filters) && (
        <Button variant="ghost" icon={FilterX} onClick={onClear}>
          {t('common.actions.clearFilters')}
        </Button>
      )}
    </div>
  );
}
