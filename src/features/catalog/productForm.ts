import { isAcceptableBarcode } from '@/domain/barcode';
import { parseMoneyInput, parsePercentInput, parseQuantityInput } from '@/domain/money';
import { toAsciiDigits } from '@/domain/text';
import type { TranslationKey } from '@/i18n';
import { validateProductInput } from '@/services/catalogService';
import type { Discount, Money, PriceField, Product, ProductInput } from '@/types';

/* ==========================================================================
   Product form: editable string state ⇄ ProductInput, with field errors
   stored as translation keys (so they follow a language switch).
   ========================================================================== */

export type PromotionKind = 'none' | 'percent' | 'fixed';

export interface ProductFormState {
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  unitId: string;
  supplierId: string;
  purchasePrice: string;
  sellingPrice: string;
  mrp: string;
  promotion: PromotionKind;
  promotionValue: string;
  taxRate: string;
  minStock: string;
  maxStock: string;
  openingStock: string;
  expiryDate: string;
  weighted: boolean;
  featured: boolean;
  active: boolean;
  sku: string;
  barcode: string;
  extraBarcodes: string[];
  image: string | null;
  priceReason: string;
}

/** Field → translation key of its error. Extra barcodes use "extra-<index>". */
export type ProductFormErrors = Partial<Record<string, TranslationKey>>;

/** Props shared by the product form sections. */
export interface ProductSectionProps {
  form: ProductFormState;
  errors: ProductFormErrors;
  update: (patch: Partial<ProductFormState>) => void;
}

/** Minor units → input text ("120", "120.50"). */
export function moneyToInput(minor: Money | null): string {
  if (minor === null) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

function quantityToInput(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

export interface NewProductDefaults {
  unitId: string;
  taxRate: number;
  minStock: number;
  maxStock: number;
}

export function emptyProductForm(defaults: NewProductDefaults): ProductFormState {
  return {
    nameBn: '',
    nameEn: '',
    descriptionBn: '',
    descriptionEn: '',
    categoryId: '',
    subcategoryId: '',
    brandId: '',
    unitId: defaults.unitId,
    supplierId: '',
    purchasePrice: '',
    sellingPrice: '',
    mrp: '',
    promotion: 'none',
    promotionValue: '',
    taxRate: String(defaults.taxRate),
    minStock: quantityToInput(defaults.minStock),
    maxStock: quantityToInput(defaults.maxStock),
    openingStock: '',
    expiryDate: '',
    weighted: false,
    featured: false,
    active: true,
    sku: '',
    barcode: '',
    extraBarcodes: [],
    image: null,
    priceReason: '',
  };
}

export function productToForm(product: Product, extraBarcodes: readonly string[]): ProductFormState {
  return {
    nameBn: product.name.bn,
    nameEn: product.name.en,
    descriptionBn: product.description.bn,
    descriptionEn: product.description.en,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId ?? '',
    brandId: product.brandId ?? '',
    unitId: product.unitId,
    supplierId: product.supplierId ?? '',
    purchasePrice: moneyToInput(product.purchasePrice),
    sellingPrice: moneyToInput(product.sellingPrice),
    mrp: moneyToInput(product.mrp),
    promotion: product.discount?.type ?? 'none',
    promotionValue: product.discount ? (product.discount.type === 'percent' ? String(product.discount.value / 100) : moneyToInput(product.discount.value)) : '',
    taxRate: String(product.taxRate),
    minStock: quantityToInput(product.minStock),
    maxStock: quantityToInput(product.maxStock),
    openingStock: '',
    expiryDate: product.expiryDate ?? '',
    weighted: product.weighted,
    featured: product.featured,
    active: product.status === 'active',
    sku: product.sku,
    barcode: product.barcode,
    extraBarcodes: [...extraBarcodes],
    image: product.image,
    priceReason: '',
  };
}

/** Parsed prices (null when empty or invalid) — used for live margin/promotion previews. */
export function parsedPrices(form: ProductFormState): { purchase: Money | null; selling: Money | null; mrp: Money | null; discount: Discount | null } {
  const purchase = parseMoneyInput(form.purchasePrice);
  const selling = parseMoneyInput(form.sellingPrice);
  const mrp = form.mrp.trim() ? parseMoneyInput(form.mrp) : null;
  let discount: Discount | null = null;
  if (form.promotion === 'percent') {
    const value = parsePercentInput(form.promotionValue);
    if (value !== null && value > 0 && value <= 10_000) discount = { type: 'percent', value };
  } else if (form.promotion === 'fixed') {
    const value = parseMoneyInput(form.promotionValue);
    if (value !== null && value > 0) discount = { type: 'fixed', value };
  }
  return { purchase, selling, mrp, discount };
}

function parseQuantityField(text: string, fallback: number): number | null {
  if (text.trim() === '') return fallback;
  return parseQuantityInput(text);
}

export function normalizeBarcode(code: string): string {
  return toAsciiDigits(code.trim());
}

/** Builds the service input and collects field errors (empty object = valid). */
export function formToInput(form: ProductFormState, editing: boolean): { input: ProductInput; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const { purchase, selling, mrp, discount } = parsedPrices(form);

  if (!form.purchasePrice.trim()) errors.purchasePrice = 'validation.required';
  else if (purchase === null) errors.purchasePrice = 'validation.invalidAmount';
  if (!form.sellingPrice.trim()) errors.sellingPrice = 'validation.required';
  else if (selling === null) errors.sellingPrice = 'validation.invalidAmount';
  if (form.mrp.trim() && mrp === null) errors.mrp = 'validation.invalidAmount';

  if (form.promotion !== 'none') {
    if (!discount) errors.promotionValue = form.promotion === 'percent' ? 'validation.invalidPercent' : 'validation.invalidAmount';
    else if (discount.type === 'fixed' && selling !== null && discount.value >= selling) errors.promotionValue = 'catalog.form.errors.discountTooHigh';
    else if (discount.type === 'percent' && discount.value >= 10_000) errors.promotionValue = 'validation.invalidPercent';
  }

  const minStock = parseQuantityField(form.minStock, 0);
  const maxStock = parseQuantityField(form.maxStock, 0);
  const openingStock = parseQuantityField(form.openingStock, 0);
  if (minStock === null) errors.minStock = 'validation.invalidQuantity';
  if (maxStock === null) errors.maxStock = 'validation.invalidQuantity';
  if (!editing && openingStock === null) errors.openingStock = 'validation.invalidQuantity';

  const primary = normalizeBarcode(form.barcode);
  const extras = form.extraBarcodes.map(normalizeBarcode);
  const seen = new Set<string>(primary ? [primary] : []);
  extras.forEach((code, index) => {
    if (!code) return;
    if (!isAcceptableBarcode(code)) errors[`extra-${index}`] = 'validation.invalidBarcode';
    else if (seen.has(code)) errors[`extra-${index}`] = 'catalog.form.errors.duplicateInForm';
    seen.add(code);
  });

  const input: ProductInput = {
    sku: form.sku.trim(),
    barcode: primary,
    name: { bn: form.nameBn.trim(), en: form.nameEn.trim() },
    description: { bn: form.descriptionBn.trim(), en: form.descriptionEn.trim() },
    categoryId: form.categoryId,
    subcategoryId: form.subcategoryId || null,
    brandId: form.brandId || null,
    unitId: form.unitId,
    supplierId: form.supplierId || null,
    purchasePrice: purchase ?? 0,
    sellingPrice: selling ?? 0,
    mrp,
    discount,
    taxRate: Number(form.taxRate) || 0,
    minStock: minStock ?? 0,
    maxStock: maxStock ?? 0,
    image: form.image,
    status: form.active ? 'active' : 'inactive',
    featured: form.featured,
    weighted: form.weighted,
    expiryDate: form.expiryDate || null,
    extraBarcodes: extras.filter(Boolean),
    ...(editing ? {} : { openingStock: openingStock ?? 0 }),
  };

  for (const [field, key] of Object.entries(validateProductInput(input))) {
    if (key && !errors[field]) errors[field] = key as TranslationKey;
  }
  return { input, errors };
}

export interface PriceChange {
  field: PriceField;
  from: Money | null;
  to: Money | null;
}

/** Valid prices in the form that differ from the saved product (recorded in the price history). */
export function priceChanges(form: ProductFormState, product: Product | null): PriceChange[] {
  if (!product) return [];
  const { purchase, selling, mrp } = parsedPrices(form);
  const changes: PriceChange[] = [];
  if (selling !== null && selling !== product.sellingPrice) changes.push({ field: 'selling_price', from: product.sellingPrice, to: selling });
  if (purchase !== null && purchase !== product.purchasePrice) changes.push({ field: 'purchase_price', from: product.purchasePrice, to: purchase });
  const mrpValid = !form.mrp.trim() || mrp !== null;
  if (mrpValid && mrp !== product.mrp) changes.push({ field: 'mrp', from: product.mrp, to: mrp });
  return changes;
}

/** True when any stored price differs from the product (asks for a price-change reason). */
export function pricesChanged(form: ProductFormState, product: Product | null): boolean {
  return priceChanges(form, product).length > 0;
}

/** Gross margin on the selling price. */
export function marginOf(purchase: Money | null, price: Money | null): { profit: Money; rate: number } | null {
  if (purchase === null || price === null || price <= 0) return null;
  return { profit: price - purchase, rate: ((price - purchase) / price) * 100 };
}
