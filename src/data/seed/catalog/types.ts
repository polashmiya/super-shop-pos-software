import type { ArtFolder, ArtRef, ArtVariant } from './artRegistry';

/**
 * Authoring types for the demo catalog. The catalog is compact, human-edited
 * data; `src/data/seed/catalogExpand.ts` expands it into concrete products
 * (brand × size), assigns ids, SKUs, barcodes, stock levels and images.
 *
 * Money in this file is in MAJOR units (taka) for readability. The expander
 * converts to minor units (poisha).
 */

export interface BilingualText {
  en: string;
  bn: string;
}

/** Selling units. Keep in sync with UNIT_DEFINITIONS in catalog/units.ts. */
export type UnitCode =
  | 'pcs'
  | 'kg'
  | 'g'
  | 'litre'
  | 'ml'
  | 'pack'
  | 'box'
  | 'bottle'
  | 'dozen'
  | 'carton'
  | 'bundle'
  | 'can'
  | 'jar'
  | 'pouch'
  | 'bar'
  | 'tube'
  | 'set'
  | 'roll'
  | 'ream'
  | 'tray';

export interface CatalogSubcategory extends BilingualText {
  /** Unique across the whole catalog, kebab-case, e.g. "soybean-oil". */
  code: string;
}

export interface CatalogCategory extends BilingualText {
  /** kebab-case, e.g. "rice-dal". */
  code: string;
  /** Short uppercase prefix used for SKUs, 3 letters, unique, e.g. "RCE". */
  skuPrefix: string;
  /** Artwork folder under public/products. */
  folder: ArtFolder;
  /** lucide-react icon name used for the category chip, e.g. "Wheat". */
  icon: string;
  /** Default VAT for the category, in percent (e.g. 5, 7.5, 0). */
  taxRate: number;
  subcategories: CatalogSubcategory[];
}

export interface CatalogBrand extends BilingualText {
  /** kebab-case, unique, e.g. "teer". */
  code: string;
  /** Brand colour (hex) used for logos/badges. */
  color: string;
  /** Artwork colour variant that best matches the brand packaging. */
  palette: ArtVariant;
  /** Default supplier code for products of this brand. */
  supplier: string;
}

export interface CatalogSupplier {
  /** kebab-case, unique. */
  code: string;
  /** Supplier / distributor display name (English). */
  name: string;
  /** Registered company name. */
  company: string;
  contactPerson: string;
  /** Bangladeshi mobile number, 11 digits starting with 01. */
  phone: string;
  email: string;
  address: string;
  /** Payable balance carried over from before the system (taka). */
  openingBalance: number;
}

export interface CatalogSize extends BilingualText {
  /** Selling price in taka for the reference brand (the first brand of the line). */
  price: number;
  /** Maximum retail price in taka, when printed on the pack and higher than price. */
  mrp?: number;
  /** Overrides the line unit for this size. */
  unit?: UnitCode;
}

export interface CatalogPromo {
  type: 'percent' | 'fixed';
  /** Percent (e.g. 5) or taka amount (e.g. 10). */
  value: number;
}

export interface CatalogLine {
  /** Category code. */
  category: string;
  /** Subcategory code (must belong to the category). */
  subcategory: string;
  /** Brand codes. Each brand × size becomes one product. */
  brands: string[];
  /** Item name WITHOUT brand and size, e.g. { en: 'Soybean Oil', bn: 'সয়াবিন তেল' }. */
  name: BilingualText;
  description?: BilingualText;
  sizes: CatalogSize[];
  /** Default selling unit. */
  unit: UnitCode;
  /** Artwork shape, e.g. "oil/bottle". */
  art: ArtRef;
  /** VAT percent override for this line. */
  taxRate?: number;
  /** Supplier code override (defaults to the brand's supplier). */
  supplier?: string;
  /** Typical shelf life; items with a short shelf life get expiry dates. */
  shelfLifeDays?: number;
  /** Relative sales popularity 1 (rare) … 10 (staple). Default 5. */
  popularity?: number;
  /** Sold by weight/volume: fractional quantities allowed (e.g. 0.5 kg). */
  weighted?: boolean;
  /** Optional running promotion. */
  promo?: CatalogPromo;
  /** Featured on the POS "featured" tab. */
  featured?: boolean;
}

export interface PersonName extends BilingualText {}

export interface PeopleData {
  maleFirstNames: PersonName[];
  femaleFirstNames: PersonName[];
  lastNames: PersonName[];
  /** Dhaka neighbourhoods / roads for addresses. */
  areas: BilingualText[];
}
