import { DEFAULT_BUSINESS_SETTINGS as B, DEFAULT_DEVICE_SETTINGS as D } from '@/config/defaults';
import type { DeepPartial } from '@/domain/settings';
import type { BusinessSettings, DeviceSettings } from '@/types';
import { saveBusiness, saveDevice } from './saveStatus';
import type { SettingsSectionId } from './sections';

/* ==========================================================================
   "Reset this section to defaults": exactly the controls a section shows.
   Sections without a plan (store details, counter, users, data, about)
   hold shop data rather than preferences and are never reset.
   ========================================================================== */

type BusinessPatch = { [K in keyof BusinessSettings]?: Partial<BusinessSettings[K]> };

export interface ResetPlan {
  device?: DeepPartial<DeviceSettings>;
  business?: BusinessPatch;
}

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = source[key];
  return result;
}

const PLANS: Partial<Record<SettingsSectionId, ResetPlan>> = {
  general: { device: { general: D.general, appearance: pick(D.appearance, ['sidebar', 'focusMode']) } },
  pos: {
    device: {
      pos: pick(D.pos, [
        'layout',
        'autoFocusSearch',
        'autoAddScanned',
        'duplicateScanIncreasesQty',
        'quickCheckoutOnEnter',
        'confirmClearCart',
        'clearCartAfterSale',
        'showCustomerPanel',
        'showNumericKeypad',
        'rememberLastCategory',
        'rememberLastPaymentMethod',
        'showProductImages',
        'showSecondaryName',
      ]),
      appearance: pick(D.appearance, ['cardSize']),
      sound: pick(D.sound, ['scan']),
      barcode: pick(D.barcode, ['unknownAction']),
    },
  },
  appearance: {
    device: {
      appearance: pick(D.appearance, ['theme', 'density', 'corners', 'sidebar', 'animations', 'hoverEffects', 'highContrast', 'focusMode', 'fontSize', 'baseFontPx']),
    },
  },
  theme: { device: { appearance: pick(D.appearance, ['accent', 'theme']) } },
  fonts: { device: { appearance: pick(D.appearance, ['uiFont', 'banglaFont', 'receiptFont', 'fontSize', 'baseFontPx']) } },
  language: { device: { locale: pick(D.locale, ['language']), pos: pick(D.pos, ['showSecondaryName']) } },
  numbers: { device: { locale: pick(D.locale, ['numerals', 'clock']) } },
  currency: { business: { currency: B.currency, sales: pick(B.sales, ['rounding']) } },
  tax: { business: { tax: B.tax, receipt: pick(B.receipt, ['showTaxBreakdown', 'showBin']) } },
  receipt: {
    business: { receipt: B.receipt, store: pick(B.store, ['receiptFooterBn', 'receiptFooterEn', 'thankYouBn', 'thankYouEn']) },
    device: { printer: pick(D.printer, ['paperWidth', 'copies']) },
  },
  printer: { device: { printer: D.printer } },
  barcode: {
    device: {
      barcode: D.barcode,
      pos: pick(D.pos, ['autoAddScanned', 'duplicateScanIncreasesQty']),
      sound: pick(D.sound, ['scan']),
    },
  },
  products: {
    device: {
      pos: pick(D.pos, ['showProductImages', 'productImageSize', 'showSku', 'showBarcode', 'showStock', 'showMrp', 'showDiscount', 'showSecondaryName']),
      appearance: pick(D.appearance, ['cardSize']),
    },
  },
  inventory: { business: { inventory: B.inventory } },
  sales: { business: { sales: B.sales } },
  payment: { business: { payment: B.payment } },
  customer: { business: { customer: B.customer, discount: pick(B.discount, ['customerTypeRates', 'applyCustomerDiscountAutomatically']) } },
  loyalty: { business: { loyalty: B.loyalty } },
  discount: {
    business: { discount: pick(B.discount, ['cashierMaxRate', 'managerMaxRate', 'largeDiscountRate', 'allowItemDiscount', 'allowOrderDiscount', 'requireReason']) },
  },
  shift: { business: { shift: B.shift } },
  notifications: { device: { notifications: D.notifications } },
  sounds: { device: { sound: D.sound } },
  shortcuts: { device: { shortcuts: D.shortcuts } },
  security: { business: { security: B.security } },
};

export function resetPlanFor(section: SettingsSectionId): ResetPlan | null {
  return PLANS[section] ?? null;
}

/** Applies a reset plan. Resolves false when a business section could not be saved. */
export async function applyResetPlan(plan: ResetPlan): Promise<boolean> {
  if (plan.device) saveDevice(plan.device);
  let ok = true;
  const business = plan.business ?? {};
  for (const key of Object.keys(business) as Array<keyof BusinessSettings>) {
    const patch = business[key];
    if (patch) ok = (await saveBusiness(key, patch as Partial<BusinessSettings[typeof key]>)) && ok;
  }
  return ok;
}
