import { APP_CONFIG } from '@/config/app.config';
import { makeEan13, makeInStoreBarcode } from '@/domain/barcode';
import { hashString, stableId } from '@/domain/ids';
import { roundHalfUp, toMinor } from '@/domain/money';
import { normalizeSearch } from '@/domain/text';
import { categoryId } from './baseData';
import { BRANDS } from './catalog/brands';
import { CATEGORIES } from './catalog/categories';
import { PRODUCT_LINES } from './catalog/products';
import { SUPPLIERS } from './catalog/suppliers';
import type { CatalogBrand, CatalogCategory, CatalogSupplier } from './catalog/types';

/* ==========================================================================
   Expands the compact authoring catalog (lines × brands × sizes) into
   concrete product records with ids, SKUs, EAN-13 barcodes, prices in
   minor units, stock limits and bundled artwork paths. Deterministic.
   ========================================================================== */

export const STORE_BRAND_CODE = 'nogor-fresh';

export interface ExpandedProduct {
  id: string;
  sku: string;
  barcode: string;
  extraBarcodes: string[];
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
  categoryId: string;
  categoryCode: string;
  subcategoryId: string;
  brandId: string;
  brandCode: string;
  unitId: string;
  supplierId: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number | null;
  discountType: 'percent' | 'fixed' | null;
  discountValue: number;
  taxRate: number;
  minStock: number;
  maxStock: number;
  image: string;
  featured: boolean;
  weighted: boolean;
  shelfLifeDays: number | null;
  popularity: number;
  searchText: string;
}

export interface ExpandedCatalog {
  products: ExpandedProduct[];
  categories: CatalogCategory[];
  brands: Array<CatalogBrand & { id: string }>;
  suppliers: Array<CatalogSupplier & { id: string }>;
}

export function brandId(code: string): string {
  return stableId(`brand:${code}`);
}

export function supplierId(code: string): string {
  return stableId(`supplier:${code}`);
}

/** Cost as a share of the selling price, per category (gross margin varies by trade). */
const COST_RATIO: Record<string, number> = {
  'rice-dal': 0.9,
  flour: 0.9,
  oil: 0.92,
  spices: 0.8,
  'salt-sugar': 0.91,
  biscuits: 0.85,
  snacks: 0.82,
  beverages: 0.85,
  juice: 0.84,
  dairy: 0.88,
  frozen: 0.8,
  meat: 0.85,
  fish: 0.82,
  vegetables: 0.78,
  fruits: 0.8,
  bakery: 0.74,
  'noodles-pasta': 0.85,
  cosmetics: 0.7,
  'personal-care': 0.78,
  baby: 0.83,
  cleaning: 0.8,
  'home-care': 0.72,
  stationery: 0.7,
  kitchen: 0.72,
  others: 0.8,
};

function roundPrice(taka: number): number {
  if (taka >= 500) return Math.round(taka / 5) * 5;
  return Math.max(1, Math.round(taka));
}

function variantFor(seed: string, palette: number | undefined): number {
  if (palette && palette >= 1 && palette <= 6) return palette;
  return (hashString(seed) % 6) + 1;
}

function isLooseSize(sizeEn: string): boolean {
  return /^per\s/i.test(sizeEn.trim());
}

export function expandCatalog(): ExpandedCatalog {
  const categoriesByCode = new Map(CATEGORIES.map((category) => [category.code, category]));
  const subcategoryParent = new Map<string, string>();
  for (const category of CATEGORIES) {
    for (const subcategory of category.subcategories) subcategoryParent.set(subcategory.code, category.code);
  }
  const brandsByCode = new Map(BRANDS.map((brand) => [brand.code, brand]));
  const suppliersByCode = new Map(SUPPLIERS.map((supplier) => [supplier.code, supplier]));

  const skuCounters = new Map<string, number>();
  const usedBarcodes = new Set<string>();
  const usedNames = new Set<string>();
  let inStoreSequence = 1_000;
  const products: ExpandedProduct[] = [];

  const nextManufacturerBarcode = (brandCode: string, seed: string): string => {
    const company = String(hashString(`gs1:${brandCode}`) % 10_000).padStart(4, '0');
    let item = hashString(seed) % 100_000;
    for (let attempt = 0; attempt < 100_000; attempt += 1) {
      const code = makeEan13(`${APP_CONFIG.barcode.gs1CountryPrefix}${company}${String(item).padStart(5, '0')}`);
      if (!usedBarcodes.has(code)) {
        usedBarcodes.add(code);
        return code;
      }
      item = (item + 7_919) % 100_000;
    }
    throw new Error(`Could not allocate a barcode for ${seed}`);
  };

  const nextInStoreBarcode = (): string => {
    let code = makeInStoreBarcode(inStoreSequence);
    while (usedBarcodes.has(code)) {
      inStoreSequence += 1;
      code = makeInStoreBarcode(inStoreSequence);
    }
    inStoreSequence += 1;
    usedBarcodes.add(code);
    return code;
  };

  for (const line of PRODUCT_LINES) {
    const category = categoriesByCode.get(line.category);
    if (!category) throw new Error(`Unknown category ${line.category}`);
    if (subcategoryParent.get(line.subcategory) !== category.code) throw new Error(`Subcategory ${line.subcategory} not in ${category.code}`);
    const [artFolder, artShape] = line.art.split('/');
    const taxPercent = line.taxRate ?? category.taxRate;
    const popularity = Math.min(10, Math.max(1, line.popularity ?? 5));

    line.brands.forEach((brandCode, brandIndex) => {
      const brand = brandsByCode.get(brandCode);
      if (!brand) throw new Error(`Unknown brand ${brandCode}`);
      const supplierCode = line.supplier ?? brand.supplier;
      if (!suppliersByCode.has(supplierCode)) throw new Error(`Unknown supplier ${supplierCode}`);
      const isStoreBrand = brandCode === STORE_BRAND_CODE;
      const priceFactor = brandIndex === 0 ? 1 : 1 + (((hashString(`${brandCode}:${line.name.en}`) % 13) - 6) / 100);

      for (const size of line.sizes) {
        const loose = isLooseSize(size.en);
        const brandPrefixEn = isStoreBrand ? '' : `${brand.en} `;
        const brandPrefixBn = isStoreBrand ? '' : `${brand.bn} `;
        const sizeSuffixEn = loose ? '' : ` ${size.en}`;
        const sizeSuffixBn = loose ? '' : ` ${size.bn}`;
        let nameEn = `${brandPrefixEn}${line.name.en}${sizeSuffixEn}`.trim();
        const nameBn = `${brandPrefixBn}${line.name.bn}${sizeSuffixBn}`.trim();
        if (usedNames.has(nameEn.toLowerCase())) nameEn = `${nameEn} (${brand.en})`;
        usedNames.add(nameEn.toLowerCase());

        const idSeed = `product:${line.subcategory}:${brandCode}:${line.name.en}:${size.en}`;
        const sequence = (skuCounters.get(category.skuPrefix) ?? 0) + 1;
        skuCounters.set(category.skuPrefix, sequence);
        const sku = `${category.skuPrefix}-${String(sequence).padStart(4, '0')}`;

        const sellingTaka = roundPrice(size.price * priceFactor);
        const sellingPrice = toMinor(sellingTaka);
        const mrp = size.mrp ? toMinor(roundPrice(size.mrp * priceFactor)) : null;
        const ratio = (COST_RATIO[category.code] ?? 0.82) + ((hashString(`cost:${idSeed}`) % 7) - 3) / 100;
        const purchasePrice = roundHalfUp(sellingPrice * ratio);

        let discountType: ExpandedProduct['discountType'] = null;
        let discountValue = 0;
        if (line.promo) {
          if (line.promo.type === 'percent') {
            discountType = 'percent';
            discountValue = roundHalfUp(line.promo.value * 100);
          } else if (toMinor(line.promo.value) < sellingPrice) {
            discountType = 'fixed';
            discountValue = toMinor(line.promo.value);
          }
        }

        const weighted = Boolean(line.weighted);
        const minStock = weighted ? Math.round(5 + popularity * 1.5) : Math.round(4 + popularity * 2);
        const maxStock = weighted ? Math.round(40 + popularity * 14) : Math.round(30 + popularity * 18);
        const barcode = isStoreBrand || weighted ? nextInStoreBarcode() : nextManufacturerBarcode(brandCode, idSeed);
        const extraBarcodes = !isStoreBrand && hashString(`extra:${idSeed}`) % 20 === 0 ? [nextManufacturerBarcode(brandCode, `${idSeed}:old`)] : [];
        const subcategory = category.subcategories.find((entry) => entry.code === line.subcategory);

        const searchText = normalizeSearch(
          [
            nameEn,
            nameBn,
            sku,
            barcode,
            ...extraBarcodes,
            brand.en,
            brand.bn,
            category.en,
            category.bn,
            subcategory?.en ?? '',
            subcategory?.bn ?? '',
          ].join(' '),
        );

        products.push({
          id: stableId(idSeed),
          sku,
          barcode,
          extraBarcodes,
          nameEn,
          nameBn,
          descriptionEn: line.description?.en ?? '',
          descriptionBn: line.description?.bn ?? '',
          categoryId: categoryId(category.code),
          categoryCode: category.code,
          subcategoryId: categoryId(line.subcategory),
          brandId: brandId(brandCode),
          brandCode,
          unitId: size.unit ?? line.unit,
          supplierId: supplierId(supplierCode),
          purchasePrice,
          sellingPrice,
          mrp: mrp && mrp > sellingPrice ? mrp : null,
          discountType,
          discountValue,
          taxRate: roundHalfUp(taxPercent * 100),
          minStock,
          maxStock,
          image: `products/${artFolder}/${artShape}-${variantFor(idSeed, isStoreBrand ? undefined : brand.palette)}.svg`,
          featured: Boolean(line.featured) && brandIndex === 0,
          weighted,
          shelfLifeDays: line.shelfLifeDays ?? null,
          popularity,
          searchText,
        });
      }
    });
  }

  return {
    products,
    categories: CATEGORIES,
    brands: BRANDS.map((brand) => ({ ...brand, id: brandId(brand.code) })),
    suppliers: SUPPLIERS.map((supplier) => ({ ...supplier, id: supplierId(supplier.code) })),
  };
}
