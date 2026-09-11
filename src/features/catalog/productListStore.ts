import { create } from 'zustand';
import { APP_CONFIG } from '@/config/app.config';
import type { SortState } from '@/components/ui/DataTable';

/* ==========================================================================
   Product list view state (filters, sort, paging). Kept outside the page so
   the list looks the same when the user comes back from a product.
   ========================================================================== */

export type ProductStatusFilter = 'all' | 'active' | 'inactive';
export type StockLevelFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring';

export interface ProductListFilters {
  query: string;
  /** 'all' or a category / subcategory id. */
  categoryId: string;
  /** 'all', 'none' (products without a brand) or a brand id. */
  brandId: string;
  status: ProductStatusFilter;
  stock: StockLevelFilter;
  featured: boolean;
}

export const DEFAULT_PRODUCT_FILTERS: ProductListFilters = {
  query: '',
  categoryId: 'all',
  brandId: 'all',
  status: 'all',
  stock: 'all',
  featured: false,
};

export const STOCK_LEVEL_FILTERS: ReadonlyArray<Exclude<StockLevelFilter, 'all'>> = ['in_stock', 'low_stock', 'out_of_stock', 'expiring'];

interface ProductListState {
  filters: ProductListFilters;
  sort: SortState | null;
  page: number;
  pageSize: number;
  setFilters(patch: Partial<ProductListFilters>): void;
  resetFilters(patch?: Partial<ProductListFilters>): void;
  setSort(sort: SortState | null): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
}

export const useProductListStore = create<ProductListState>((set) => ({
  filters: DEFAULT_PRODUCT_FILTERS,
  sort: null,
  page: 1,
  pageSize: APP_CONFIG.tables.defaultPageSize,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch }, page: 1 })),
  resetFilters: (patch) => set({ filters: { ...DEFAULT_PRODUCT_FILTERS, ...patch }, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
}));

export function hasActiveFilters(filters: ProductListFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.categoryId !== 'all' ||
    filters.brandId !== 'all' ||
    filters.status !== 'all' ||
    filters.stock !== 'all' ||
    filters.featured
  );
}

/** Filters passed in the URL (links from categories, brands, dashboards). */
export function filtersFromParams(params: URLSearchParams): Partial<ProductListFilters> | null {
  const patch: Partial<ProductListFilters> = {};
  const category = params.get('category');
  const brand = params.get('brand');
  const status = params.get('status');
  const stock = params.get('stock');
  const query = params.get('q');
  if (category) patch.categoryId = category;
  if (brand) patch.brandId = brand;
  if (status === 'active' || status === 'inactive') patch.status = status;
  if (stock && (STOCK_LEVEL_FILTERS as readonly string[]).includes(stock)) patch.stock = stock as StockLevelFilter;
  if (query) patch.query = query;
  if (params.get('featured') === '1') patch.featured = true;
  return Object.keys(patch).length > 0 ? patch : null;
}
