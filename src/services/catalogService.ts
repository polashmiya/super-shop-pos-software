import { isAcceptableBarcode, makeInStoreBarcode } from '@/domain/barcode';
import { AppError } from '@/domain/errors';
import { toAsciiDigits } from '@/domain/text';
import { repos } from '@/repositories';
import type { BrandInput, CategoryInput } from '@/repositories/types';
import type { Brand, Category, Id, PriceHistoryEntry, Product, ProductBarcode, ProductInput, ProductStatus, Unit } from '@/types';
import { actor, requirePermission } from './context';

/* ==========================================================================
   Products, categories, brands and units: validation + persistence.
   Validation returns i18n keys per field so forms can show them inline.
   ========================================================================== */

export type ProductFieldErrors = Partial<Record<'nameBn' | 'nameEn' | 'sku' | 'barcode' | 'categoryId' | 'unitId' | 'sellingPrice' | 'purchasePrice' | 'mrp' | 'minStock' | 'taxRate' | 'openingStock', string>>;

export function validateProductInput(input: ProductInput): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  if (!input.name.bn.trim()) errors.nameBn = 'validation.required';
  if (!input.name.en.trim()) errors.nameEn = 'validation.required';
  if (!input.sku.trim()) errors.sku = 'validation.required';
  else if (input.sku.trim().length > 32) errors.sku = 'validation.tooLong';
  if (!input.barcode.trim()) errors.barcode = 'validation.required';
  else if (!isAcceptableBarcode(toAsciiDigits(input.barcode.trim()))) errors.barcode = 'validation.invalidBarcode';
  if (!input.categoryId) errors.categoryId = 'validation.required';
  if (!input.unitId) errors.unitId = 'validation.required';
  if (!Number.isSafeInteger(input.sellingPrice) || input.sellingPrice <= 0) errors.sellingPrice = 'validation.mustBePositive';
  if (!Number.isSafeInteger(input.purchasePrice) || input.purchasePrice < 0) errors.purchasePrice = 'validation.invalidAmount';
  if (input.mrp !== null && input.mrp < input.sellingPrice) errors.mrp = 'validation.mrpBelowPrice';
  if (input.minStock < 0 || input.maxStock < 0) errors.minStock = 'validation.invalidQuantity';
  else if (input.maxStock > 0 && input.minStock > input.maxStock) errors.minStock = 'validation.minAboveMax';
  if (input.taxRate < 0 || input.taxRate > 10_000) errors.taxRate = 'validation.invalidPercent';
  if ((input.openingStock ?? 0) < 0) errors.openingStock = 'validation.invalidQuantity';
  return errors;
}

async function assertUnique(input: ProductInput, exceptId?: Id): Promise<void> {
  const products = repos().products;
  if (await products.isSkuTaken(input.sku, exceptId)) throw new AppError('duplicateSku');
  for (const barcode of [input.barcode, ...(input.extraBarcodes ?? [])].map((code) => toAsciiDigits(code.trim())).filter(Boolean)) {
    if (await products.isBarcodeTaken(barcode, exceptId)) throw new AppError('duplicateBarcode');
  }
  const all = [input.barcode, ...(input.extraBarcodes ?? [])].map((code) => code.trim()).filter(Boolean);
  if (new Set(all).size !== all.length) throw new AppError('duplicateBarcode');
}

function normalize(input: ProductInput): ProductInput {
  return {
    ...input,
    sku: input.sku.trim().toUpperCase(),
    barcode: toAsciiDigits(input.barcode.trim()),
    extraBarcodes: (input.extraBarcodes ?? []).map((code) => toAsciiDigits(code.trim())).filter(Boolean),
  };
}

export const productService = {
  getAll(): Promise<Product[]> {
    return repos().products.getAll();
  },
  getById(id: Id): Promise<Product | null> {
    return repos().products.getById(id);
  },
  findByBarcode(code: string): Promise<Product | null> {
    return repos().products.findByBarcode(toAsciiDigits(code));
  },
  async create(input: ProductInput): Promise<Product> {
    requirePermission('products.manage');
    const normalized = normalize(input);
    if (Object.keys(validateProductInput(normalized)).length > 0) throw new AppError('validation');
    await assertUnique(normalized);
    return repos().products.create(normalized, actor());
  },
  async update(id: Id, input: ProductInput, reason = ''): Promise<Product> {
    requirePermission('products.manage');
    const normalized = normalize(input);
    if (Object.keys(validateProductInput(normalized)).length > 0) throw new AppError('validation');
    await assertUnique(normalized, id);
    return repos().products.update(id, normalized, actor(), reason);
  },
  async setStatus(ids: Id[], status: ProductStatus): Promise<void> {
    requirePermission('products.manage');
    await repos().products.setStatus(ids, status, actor());
  },
  barcodes(productId: Id): Promise<ProductBarcode[]> {
    return repos().products.getBarcodes(productId);
  },
  priceHistory(productId: Id): Promise<PriceHistoryEntry[]> {
    return repos().products.getPriceHistory(productId);
  },
  salesHistory(productId: Id, limit = 50) {
    return repos().products.getSalesHistory(productId, limit);
  },
  nextSku(prefix: string): Promise<string> {
    return repos().products.nextSku(prefix);
  },
  /** Suggests an unused in-store EAN-13 barcode (prefix 2). */
  async suggestBarcode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = makeInStoreBarcode(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
      if (!(await repos().products.isBarcodeTaken(candidate))) return candidate;
    }
    throw new AppError('saveFailed');
  },
};

export const catalogService = {
  listCategories(): Promise<Category[]> {
    return repos().catalog.listCategories();
  },
  async saveCategory(input: CategoryInput): Promise<Category> {
    requirePermission('products.manage');
    if (!input.name.bn.trim() || !input.name.en.trim() || !input.code.trim()) throw new AppError('validation');
    return repos().catalog.saveCategory({ ...input, code: input.code.trim().toLowerCase().replace(/\s+/g, '-') }, actor());
  },
  listBrands(): Promise<Array<Brand & { productCount: number }>> {
    return repos().catalog.listBrands();
  },
  async saveBrand(input: BrandInput): Promise<Brand> {
    requirePermission('products.manage');
    if (!input.name.bn.trim() || !input.name.en.trim() || !input.code.trim()) throw new AppError('validation');
    return repos().catalog.saveBrand({ ...input, code: input.code.trim().toLowerCase().replace(/\s+/g, '-') }, actor());
  },
  listUnits(): Promise<Unit[]> {
    return repos().catalog.listUnits();
  },
  async saveUnit(unit: Unit): Promise<Unit> {
    requirePermission('products.manage');
    if (!unit.id.trim() || !unit.name.bn.trim() || !unit.name.en.trim()) throw new AppError('validation');
    return repos().catalog.saveUnit(unit);
  },
  categoryProductCounts(): Promise<Map<Id, number>> {
    return repos().catalog.categoryProductCounts();
  },
};

/** Default SKU prefix for a category (first letters of the English name). */
export function skuPrefixFor(category: Category | undefined): string {
  if (!category) return 'PRD';
  const letters = category.name.en.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'PRD').padEnd(3, 'X');
}

/** Uploaded product photos are resized to fit this box and stored as WebP data URLs. */
export const PRODUCT_IMAGE_MAX_SIDE = 360;
export const PRODUCT_IMAGE_MAX_BYTES = 350 * 1024;

/** Net units and amount sold since `since` (ISO time; cancelled sales and returns excluded) and the last sale time. */
export function productSalesSummary(productId: Id, since: string) {
  return repos().products.getSalesSummary(productId, since);
}
