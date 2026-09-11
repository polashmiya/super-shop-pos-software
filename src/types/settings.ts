import type { BasisPoints, Id, IsoDateTime, Language, Money, NumeralSystem } from './common';
import type { CustomerType } from './people';
import type { MobileProvider, PaymentMethod, TaxMode } from './sales';

/* ==========================================================================
   Settings are split by scope:

   - DeviceSettings   → this terminal only (electron-store): look & feel,
                        language, printer, POS behaviour, shortcuts, counter.
   - BusinessSettings → the whole shop (SQLite `settings` table, would sync
                        to a backend later): store info, currency, VAT,
                        receipt, loyalty, discount rules, inventory, sales…
   ========================================================================== */

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type FontSizePreset = 'sm' | 'md' | 'lg' | 'xl';
export type CornerStyle = 'rounded' | 'standard' | 'minimal';
export type SidebarMode = 'full' | 'compact' | 'hidden';
export type SizeOption = 'sm' | 'md' | 'lg';
export type AccentId = 'emerald' | 'blue' | 'indigo' | 'violet' | 'rose' | 'orange' | 'teal' | 'slate';
export type UiFontId = 'inter' | 'noto-bengali' | 'hind-siliguri' | 'anek-bangla' | 'system';
export type BanglaFontId = 'noto-bengali' | 'hind-siliguri' | 'anek-bangla' | 'system';
export type ReceiptFontId = 'noto-bengali' | 'hind-siliguri' | 'mono' | 'system';
export type PaperWidth = '80mm' | '58mm';

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: AccentId;
  density: Density;
  fontSize: FontSizePreset;
  /** Root font size in px (slider). The preset sets it; the slider fine-tunes. */
  baseFontPx: number;
  uiFont: UiFontId;
  banglaFont: BanglaFontId;
  receiptFont: ReceiptFontId;
  corners: CornerStyle;
  sidebar: SidebarMode;
  animations: boolean;
  hoverEffects: boolean;
  highContrast: boolean;
  /** Cashier focus mode: bigger search/cart/pay, fewer distractions. */
  focusMode: boolean;
  cardSize: SizeOption;
}

export interface LocaleSettings {
  language: Language;
  numerals: NumeralSystem;
  /** 12-hour or 24-hour clock. */
  clock: '12h' | '24h';
}

/** 'grid' = product cards + cart; 'counter' = scan box + wide item list only (supermarket checkout). */
export type PosLayout = 'grid' | 'counter';

export interface PosSettings {
  layout: PosLayout;
  autoFocusSearch: boolean;
  autoAddScanned: boolean;
  duplicateScanIncreasesQty: boolean;
  /** Enter on an empty scan box opens the payment dialog. */
  quickCheckoutOnEnter: boolean;
  confirmClearCart: boolean;
  clearCartAfterSale: boolean;
  showStock: boolean;
  showSku: boolean;
  showBarcode: boolean;
  showDiscount: boolean;
  showMrp: boolean;
  showProductImages: boolean;
  productImageSize: SizeOption;
  showCustomerPanel: boolean;
  showNumericKeypad: boolean;
  rememberLastCategory: boolean;
  rememberLastPaymentMethod: boolean;
  lastCategoryId: Id | null;
  lastPaymentMethod: PaymentMethod | null;
  /** Show the Bangla + English names on product cards. */
  showSecondaryName: boolean;
}

export interface BarcodeSettings {
  /** Max milliseconds between keystrokes for input to count as a scan. */
  scanSpeedMs: number;
  minLength: number;
  terminator: 'enter' | 'tab';
  unknownAction: 'toast' | 'search';
  /** Characters some scanners send before each code; stripped from scans. */
  prefix: string;
}

export interface PrinterSettings {
  receiptPrinter: string;
  reportPrinter: string;
  paperWidth: PaperWidth;
  /** Print without showing the preview dialog. */
  autoPrint: boolean;
  /** Show the in-app preview before printing. */
  showPreview: boolean;
  copies: number;
  printAfterSale: boolean;
  a4Printer: string;
}

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  scan: boolean;
  success: boolean;
  error: boolean;
}

export interface NotificationPreferences {
  lowStock: boolean;
  outOfStock: boolean;
  expiring: boolean;
  shiftReminder: boolean;
  backupReminder: boolean;
  largeDiscount: boolean;
  pendingPurchase: boolean;
  /** Also show new alerts as Windows/desktop notifications. */
  desktop: boolean;
}

export type ShortcutAction =
  | 'goPos'
  | 'goProducts'
  | 'goSales'
  | 'goCustomers'
  | 'refresh'
  | 'goReports'
  | 'holdSale'
  | 'recallSale'
  | 'payment'
  | 'discount'
  | 'fullscreen'
  | 'globalSearch'
  | 'completePayment'
  | 'removeItem'
  | 'increaseQty'
  | 'decreaseQty'
  | 'focusSearch'
  | 'selectCustomer'
  | 'clearCart'
  | 'showShortcuts';

export type ShortcutMap = Record<ShortcutAction, string>;

export interface TerminalSettings {
  branchId: Id;
  counterId: Id;
  /** Friendly name of this computer (e.g. "Front desk PC"). */
  name: string;
}

/** First screen after sign-in ('auto' = POS for cashiers, otherwise the first allowed page). */
export type LandingPage = 'auto' | 'pos' | 'dashboard' | 'sales' | 'products' | 'reports';

export interface GeneralSettings {
  landingPage: LandingPage;
  /** Ask for confirmation before the app window closes. */
  confirmExit: boolean;
}

export interface DeviceSettings {
  appearance: AppearanceSettings;
  locale: LocaleSettings;
  pos: PosSettings;
  barcode: BarcodeSettings;
  printer: PrinterSettings;
  sound: SoundSettings;
  notifications: NotificationPreferences;
  shortcuts: ShortcutMap;
  terminal: TerminalSettings;
  general: GeneralSettings;
}

/* -------------------------------------------------------------------------- */

export interface StoreInfoSettings {
  nameBn: string;
  nameEn: string;
  addressBn: string;
  addressEn: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  tradeLicense: string;
  /** data:image/... URL or null for the built-in logo mark. */
  logo: string | null;
  receiptFooterBn: string;
  receiptFooterEn: string;
  thankYouBn: string;
  thankYouEn: string;
}

export type CurrencyCode = 'BDT' | 'USD' | 'EUR' | 'GBP';

export interface CurrencySettings {
  code: CurrencyCode;
  symbol: string;
  position: 'before' | 'after';
  /** auto = show poisha only when not zero. */
  decimals: 'auto' | 'always' | 'never';
}

export interface TaxSettings {
  enabled: boolean;
  mode: TaxMode;
  defaultRate: BasisPoints;
  /** Rates offered in product forms. */
  rates: BasisPoints[];
  labelBn: string;
  labelEn: string;
}

export type RoundingMode = 'none' | 'nearest_1' | 'nearest_0_5' | 'down_1';

export interface ReceiptSettings {
  showLogo: boolean;
  showCustomerName: boolean;
  showCustomerPhone: boolean;
  showLoyaltyPoints: boolean;
  showMembership: boolean;
  showBarcode: boolean;
  showSku: boolean;
  showTaxBreakdown: boolean;
  showSavings: boolean;
  showCashier: boolean;
  showCounter: boolean;
  headerNoteBn: string;
  headerNoteEn: string;
  /** Print the BIN / VAT registration number under the address. */
  showBin: boolean;
  /** 'sale' = the language the sale was made in; otherwise always this language. */
  language: ReceiptLanguage;
}

export type ReceiptLanguage = 'sale' | 'bn' | 'en';

export interface LoyaltySettings {
  enabled: boolean;
  /** Points earned for every `earnStep` spent. */
  pointsPerStep: number;
  earnStep: Money;
  /** Value of one point when redeemed. */
  pointValue: Money;
  minRedeemPoints: number;
  /** Max share of a bill payable with points (basis points). */
  maxRedeemRate: BasisPoints;
}

export interface DiscountSettings {
  allowItemDiscount: boolean;
  allowOrderDiscount: boolean;
  requireReason: boolean;
  /** Max manual discount without approval, per role (basis points). */
  cashierMaxRate: BasisPoints;
  managerMaxRate: BasisPoints;
  /** Discounts at or above this rate raise a notification. */
  largeDiscountRate: BasisPoints;
  customerTypeRates: Record<Exclude<CustomerType, 'walk_in'>, BasisPoints>;
  applyCustomerDiscountAutomatically: boolean;
}

export interface InventorySettings {
  allowNegativeStock: boolean;
  trackExpiry: boolean;
  expiryAlertDays: number;
  defaultMinStock: number;
  defaultMaxStock: number;
}

export interface SalesSettings {
  invoicePrefix: string;
  rounding: RoundingMode;
  returnWindowDays: number;
  /** Cashiers may return without approval only within this many days. */
  cashierReturnWindowDays: number;
  allowCancel: boolean;
  cancelWindowHours: number;
}

export interface PaymentSettings {
  methods: Record<Exclude<PaymentMethod, 'points'>, boolean>;
  mobileProviders: Record<MobileProvider, boolean>;
  quickCash: Money[];
  requireCardReference: boolean;
  requireMobileReference: boolean;
  /** Allow paying one bill with more than one method. */
  allowSplit: boolean;
}

export interface CustomerSettings {
  requirePhone: boolean;
  defaultType: CustomerType;
}

export interface ShiftSettings {
  requireOpenShift: boolean;
  defaultOpeningCash: Money;
  /** Differences above this need a manager to close the shift. */
  maxDifference: Money;
  reminderHours: number;
  /** Cashiers count the drawer without seeing the expected amount. */
  blindClose: boolean;
}

export interface SecuritySettings {
  requireManagerForPriceOverride: boolean;
  requireManagerForLargeDiscount: boolean;
  requireManagerForCancel: boolean;
  autoLockMinutes: number;
  /** Minimum number of digits for new or changed PINs (4–6). */
  pinLength: number;
}

export interface BusinessSettings {
  store: StoreInfoSettings;
  currency: CurrencySettings;
  tax: TaxSettings;
  receipt: ReceiptSettings;
  loyalty: LoyaltySettings;
  discount: DiscountSettings;
  inventory: InventorySettings;
  sales: SalesSettings;
  payment: PaymentSettings;
  customer: CustomerSettings;
  shift: ShiftSettings;
  security: SecuritySettings;
}

/* -------------------------------------------------------------------------- */

/** Local session state kept by the device (electron-store). */
export interface SessionState {
  firstRunCompleted: boolean;
  lastUserId: Id | null;
  lastBackupAt: IsoDateTime | null;
  demoMode: boolean;
}
