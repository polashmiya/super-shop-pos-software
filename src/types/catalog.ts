import type { BasisPoints, BilingualText, EntityMeta, Id, IsoDate, IsoDateTime, Money } from './common';

export type ProductStatus = 'active' | 'inactive';

export type DiscountType = 'percent' | 'fixed';

/**
 * A discount rule. `value` is basis points for 'percent' (1000 = 10%) and
 * minor units for 'fixed' (5000 = ৳50).
 */
export interface Discount {
  type: DiscountType;
  value: number;
}

export interface Category extends EntityMeta {
  parentId: Id | null;
  code: string;
  name: BilingualText;
  /** lucide-react icon name. */
  icon: string;
  color: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Brand extends EntityMeta {
  code: string;
  name: BilingualText;
  logo: string | null;
  color: string;
  isActive: boolean;
}

export interface Unit {
  /** Stable code, e.g. "kg", "pcs". */
  id: string;
  name: BilingualText;
  short: BilingualText;
  allowDecimal: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface Product extends EntityMeta {
  sku: string;
  /** Primary barcode (additional barcodes live in product_barcodes). */
  barcode: string;
  name: BilingualText;
  description: BilingualText;
  categoryId: Id;
  subcategoryId: Id | null;
  brandId: Id | null;
  unitId: string;
  supplierId: Id | null;
  purchasePrice: Money;
  sellingPrice: Money;
  mrp: Money | null;
  /** Running promotional discount applied automatically at the POS. */
  discount: Discount | null;
  taxRate: BasisPoints;
  minStock: number;
  maxStock: number;
  /** Bundled path ("products/oil/bottle-3.svg"), data URL (uploaded) or null. */
  image: string | null;
  status: ProductStatus;
  featured: boolean;
  /** Sold by weight/volume: fractional quantities are allowed. */
  weighted: boolean;
  /** Nearest expiry date of the stock on hand, when tracked. */
  expiryDate: IsoDate | null;
  /** Current stock on hand (from stock_balances). */
  stock: number;
}

/** Fields accepted when creating or editing a product. */
export type ProductInput = Omit<Product, keyof EntityMeta | 'stock'> & {
  id?: Id;
  /** Opening stock for new products. */
  openingStock?: number;
  /** Extra barcodes besides the primary one. */
  extraBarcodes?: string[];
};

export interface ProductBarcode {
  id: Id;
  productId: Id;
  barcode: string;
  isPrimary: boolean;
  createdAt: IsoDateTime;
}

export type PriceField = 'selling_price' | 'purchase_price' | 'mrp';

export interface PriceHistoryEntry {
  id: Id;
  productId: Id;
  field: PriceField;
  oldValue: Money | null;
  newValue: Money | null;
  changedBy: Id | null;
  changedByName: string | null;
  changedAt: IsoDateTime;
  reason: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive' | 'expiring';

export interface ProductFilter {
  search?: string;
  categoryId?: Id | null;
  brandId?: Id | null;
  supplierId?: Id | null;
  status?: ProductStatus | 'all';
  stockStatus?: StockStatus | 'all';
  featured?: boolean;
}
