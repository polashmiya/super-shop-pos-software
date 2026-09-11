import { getStockStatus } from '@/domain/stock';
import type { Translate } from '@/i18n';
import { searchProducts } from '@/stores/catalogStore';
import type { BilingualText, Brand, Category, Id, Language, Product, StockStatus, Unit } from '@/types';
import { csvMoney, toCsv, type CsvCell } from '@/utils/csv';
import type { SortState } from '@/components/ui/DataTable';
import type { ProductListFilters } from './productListStore';

/* ==========================================================================
   Pure helpers for the product list: filtering, sorting, KPIs and CSV.
   All products live in memory (catalog store), so this is instant.
   ========================================================================== */

export type StockLevel = Exclude<StockStatus, 'inactive'>;

/** Stock level independent of the active flag (the status column shows that separately). */
export function stockLevel(product: Pick<Product, 'stock' | 'minStock' | 'expiryDate'>, expiringDays: number, today: Date = new Date()): StockLevel {
  return getStockStatus({ status: 'active', stock: product.stock, minStock: product.minStock, expiryDate: product.expiryDate }, expiringDays, today) as StockLevel;
}

export function filterProducts(products: readonly Product[], haystacks: ReadonlyMap<Id, string>, filters: ProductListFilters, expiringDays: number): Product[] {
  const base = searchProducts(products, haystacks, filters.query, {
    categoryId: filters.categoryId === 'all' ? null : filters.categoryId,
    includeInactive: true,
    featuredOnly: filters.featured,
  });
  const today = new Date();
  return base.filter((product) => {
    if (filters.status !== 'all' && product.status !== filters.status) return false;
    if (filters.brandId === 'none' && product.brandId !== null) return false;
    if (filters.brandId !== 'all' && filters.brandId !== 'none' && product.brandId !== filters.brandId) return false;
    if (filters.stock !== 'all' && stockLevel(product, expiringDays, today) !== filters.stock) return false;
    return true;
  });
}

export interface ProductSortContext {
  language: Language;
  categoryById: ReadonlyMap<Id, Category>;
  brandById: ReadonlyMap<Id, Brand>;
}

const collators = new Map<Language, Intl.Collator>();

function collator(language: Language): Intl.Collator {
  let value = collators.get(language);
  if (!value) {
    value = new Intl.Collator(language === 'bn' ? 'bn' : 'en', { numeric: true, sensitivity: 'base' });
    collators.set(language, value);
  }
  return value;
}

function localized(text: BilingualText | undefined, language: Language): string {
  if (!text) return '';
  return language === 'bn' ? text.bn || text.en : text.en || text.bn;
}

type SortValue = (product: Product, context: ProductSortContext) => string | number;

const SORT_VALUES: Record<string, SortValue> = {
  name: (product, { language }) => localized(product.name, language),
  barcode: (product) => product.barcode,
  category: (product, { language, categoryById }) => localized(categoryById.get(product.categoryId)?.name, language),
  brand: (product, { language, brandById }) => localized(product.brandId ? brandById.get(product.brandId)?.name : undefined, language),
  price: (product) => product.sellingPrice,
  cost: (product) => product.purchasePrice,
  vat: (product) => product.taxRate,
  stock: (product) => product.stock,
  status: (product) => product.status,
};

export function sortProducts(rows: readonly Product[], sort: SortState, context: ProductSortContext): Product[] {
  const value = SORT_VALUES[sort.key];
  if (!value) return [...rows];
  const factor = sort.direction === 'asc' ? 1 : -1;
  const compareText = collator(context.language).compare;
  return [...rows].sort((a, b) => {
    const left = value(a, context);
    const right = value(b, context);
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : compareText(String(left), String(right));
    return result * factor || compareText(localized(a.name, context.language), localized(b.name, context.language));
  });
}

export interface ProductKpis {
  total: number;
  active: number;
  inactive: number;
  lowStock: number;
  outOfStock: number;
}

export function productKpis(products: readonly Product[], expiringDays: number): ProductKpis {
  const today = new Date();
  const kpis: ProductKpis = { total: products.length, active: 0, inactive: 0, lowStock: 0, outOfStock: 0 };
  for (const product of products) {
    if (product.status !== 'active') {
      kpis.inactive += 1;
      continue;
    }
    kpis.active += 1;
    const level = stockLevel(product, expiringDays, today);
    if (level === 'out_of_stock') kpis.outOfStock += 1;
    else if (level === 'low_stock') kpis.lowStock += 1;
  }
  return kpis;
}

export interface ProductCsvContext {
  t: Translate;
  language: Language;
  categoryById: ReadonlyMap<Id, Category>;
  brandById: ReadonlyMap<Id, Brand>;
  unitById: ReadonlyMap<string, Unit>;
}

/** Spreadsheet-friendly export (plain ASCII numbers, money as 1234.50). */
export function productsCsv(rows: readonly Product[], { t, language, categoryById, brandById, unitById }: ProductCsvContext): string {
  const headers = [
    t('common.labels.sku'),
    t('common.labels.barcode'),
    t('common.labels.nameBn'),
    t('common.labels.nameEn'),
    t('common.labels.category'),
    t('common.labels.subcategory'),
    t('common.labels.brand'),
    t('common.labels.unit'),
    t('catalog.form.fields.purchasePrice'),
    t('catalog.form.fields.sellingPrice'),
    t('catalog.form.fields.mrp'),
    t('catalog.products.export.promo'),
    `${t('common.labels.vat')} %`,
    t('common.labels.stock'),
    t('catalog.form.fields.minStock'),
    t('catalog.form.fields.maxStock'),
    t('common.labels.status'),
    t('catalog.products.export.featured'),
    t('catalog.products.export.weighted'),
    t('catalog.products.export.expiry'),
  ];
  const yesNo = (value: boolean) => (value ? t('common.labels.yes') : t('common.labels.no'));
  const data: CsvCell[][] = rows.map((product) => {
    const unit = unitById.get(product.unitId);
    const promo = product.discount ? (product.discount.type === 'percent' ? `${product.discount.value / 100}%` : csvMoney(product.discount.value)) : '';
    return [
      product.sku,
      product.barcode,
      product.name.bn,
      product.name.en,
      localized(categoryById.get(product.categoryId)?.name, language),
      localized(product.subcategoryId ? categoryById.get(product.subcategoryId)?.name : undefined, language),
      localized(product.brandId ? brandById.get(product.brandId)?.name : undefined, language),
      unit ? localized(unit.short, language) : product.unitId,
      csvMoney(product.purchasePrice),
      csvMoney(product.sellingPrice),
      product.mrp !== null ? csvMoney(product.mrp) : '',
      promo,
      product.taxRate / 100,
      product.stock,
      product.minStock,
      product.maxStock,
      t(`enums.productStatus.${product.status}`),
      yesNo(product.featured),
      yesNo(product.weighted),
      product.expiryDate ?? '',
    ];
  });
  return toCsv(headers, data);
}
