import { create } from 'zustand';
import { matchesTokens, normalizeSearch, toAsciiDigits, tokenize } from '@/domain/text';
import { repos } from '@/repositories';
import type { Brand, Category, Id, Product, Unit } from '@/types';

/* ==========================================================================
   In-memory catalogue for instant POS search and barcode lookup.

   All products (≈1,100) are loaded once with a precomputed, normalised
   search string (Bangla + English names, SKU, barcode, brand, category), so
   searching is a fast in-memory scan and barcode lookup is an O(1) map hit.
   ========================================================================== */

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  products: Product[];
  byId: Map<Id, Product>;
  byCode: Map<string, Id>;
  haystacks: Map<Id, string>;
  categories: Category[];
  brands: Brand[];
  units: Unit[];
  categoryById: Map<Id, Category>;
  brandById: Map<Id, Brand>;
  unitById: Map<string, Unit>;
  version: number;
  load(): Promise<void>;
  reloadProducts(): Promise<void>;
  reloadCatalog(): Promise<void>;
  upsert(product: Product): void;
  refreshStock(productIds?: Id[]): Promise<void>;
}

function buildHaystack(product: Product, brands: Map<Id, Brand>, categories: Map<Id, Category>): string {
  const brand = product.brandId ? brands.get(product.brandId) : undefined;
  const category = categories.get(product.categoryId);
  const subcategory = product.subcategoryId ? categories.get(product.subcategoryId) : undefined;
  return normalizeSearch(
    [
      product.name.en,
      product.name.bn,
      product.sku,
      product.barcode,
      brand?.name.en,
      brand?.name.bn,
      category?.name.en,
      category?.name.bn,
      subcategory?.name.en,
      subcategory?.name.bn,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function indexProducts(products: Product[], brands: Map<Id, Brand>, categories: Map<Id, Category>) {
  const byId = new Map<Id, Product>();
  const byCode = new Map<string, Id>();
  const haystacks = new Map<Id, string>();
  for (const product of products) {
    byId.set(product.id, product);
    if (product.barcode) byCode.set(product.barcode, product.id);
    byCode.set(product.sku.toUpperCase(), product.id);
    haystacks.set(product.id, buildHaystack(product, brands, categories));
  }
  return { byId, byCode, haystacks };
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  status: 'idle',
  products: [],
  byId: new Map(),
  byCode: new Map(),
  haystacks: new Map(),
  categories: [],
  brands: [],
  units: [],
  categoryById: new Map(),
  brandById: new Map(),
  unitById: new Map(),
  version: 0,

  async load() {
    set({ status: 'loading' });
    try {
      const [products, categories, brands, units] = await Promise.all([
        repos().products.getAll(),
        repos().catalog.listCategories(),
        repos().catalog.listBrands(),
        repos().catalog.listUnits(),
      ]);
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      const brandById = new Map<Id, Brand>(brands.map((brand) => [brand.id, brand]));
      set({
        status: 'ready',
        products,
        ...indexProducts(products, brandById, categoryById),
        categories,
        brands,
        units,
        categoryById,
        brandById,
        unitById: new Map(units.map((unit) => [unit.id, unit])),
        version: get().version + 1,
      });
    } catch (error) {
      set({ status: 'error' });
      throw error;
    }
  },

  async reloadProducts() {
    const products = await repos().products.getAll();
    const { brandById, categoryById } = get();
    set({ products, ...indexProducts(products, brandById, categoryById), version: get().version + 1 });
  },

  async reloadCatalog() {
    const [categories, brands, units] = await Promise.all([repos().catalog.listCategories(), repos().catalog.listBrands(), repos().catalog.listUnits()]);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const brandById = new Map<Id, Brand>(brands.map((brand) => [brand.id, brand]));
    const { products } = get();
    set({ categories, brands, units, categoryById, brandById, unitById: new Map(units.map((unit) => [unit.id, unit])), ...indexProducts(products, brandById, categoryById), version: get().version + 1 });
  },

  upsert(product) {
    const { products, brandById, categoryById } = get();
    const index = products.findIndex((entry) => entry.id === product.id);
    const next = index >= 0 ? products.map((entry) => (entry.id === product.id ? product : entry)) : [...products, product];
    set({ products: next, ...indexProducts(next, brandById, categoryById), version: get().version + 1 });
  },

  async refreshStock(productIds) {
    const levels = await repos().inventory.getStockLevels(productIds);
    if (levels.size === 0 && productIds && productIds.length > 0) return;
    const { products, byId } = get();
    const nextById = new Map(byId);
    let changed = false;
    const next = products.map((product) => {
      if (!levels.has(product.id)) return product;
      const stock = levels.get(product.id) ?? 0;
      if (stock === product.stock) return product;
      changed = true;
      const updated = { ...product, stock };
      nextById.set(product.id, updated);
      return updated;
    });
    if (changed) set({ products: next, byId: nextById, version: get().version + 1 });
  },
}));

/* --------------------------------------------------------------------------
   Search
   -------------------------------------------------------------------------- */

export interface ProductSearchOptions {
  categoryId?: Id | null;
  limit?: number;
  includeInactive?: boolean;
  featuredOnly?: boolean;
}

/** Looks up a scanned barcode or typed SKU in memory (O(1)). */
export function findByCode(code: string): Product | null {
  const state = useCatalogStore.getState();
  const clean = toAsciiDigits(code.trim());
  const id = state.byCode.get(clean) ?? state.byCode.get(clean.toUpperCase());
  return id ? (state.byId.get(id) ?? null) : null;
}

/**
 * Ranked search: exact code → name starts with query → all tokens contained.
 * Bangla digits are normalised, so "১কেজি" finds "1 kg".
 */
export function searchProducts(products: readonly Product[], haystacks: ReadonlyMap<Id, string>, query: string, options: ProductSearchOptions = {}): Product[] {
  const tokens = tokenize(query);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const inCategory = (product: Product): boolean =>
    !options.categoryId || product.categoryId === options.categoryId || product.subcategoryId === options.categoryId;
  const visible = (product: Product): boolean =>
    (options.includeInactive || product.status === 'active') && inCategory(product) && (!options.featuredOnly || product.featured);

  if (tokens.length === 0) {
    const result: Product[] = [];
    for (const product of products) {
      if (visible(product)) result.push(product);
      if (result.length >= limit) break;
    }
    return result;
  }

  const normalizedQuery = tokens.join(' ');
  const exact: Product[] = [];
  const prefix: Product[] = [];
  const rest: Product[] = [];
  for (const product of products) {
    if (!visible(product)) continue;
    const haystack = haystacks.get(product.id) ?? '';
    if (!matchesTokens(haystack, tokens)) continue;
    if (product.barcode === normalizedQuery || product.sku.toLowerCase() === normalizedQuery) exact.push(product);
    else if (normalizeSearch(product.name.en).startsWith(normalizedQuery) || normalizeSearch(product.name.bn).startsWith(normalizedQuery)) prefix.push(product);
    else rest.push(product);
    if (exact.length + prefix.length >= limit) break;
  }
  return [...exact, ...prefix, ...rest].slice(0, Number.isFinite(limit) ? limit : undefined);
}
