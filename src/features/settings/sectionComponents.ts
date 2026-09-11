import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SettingsSectionId } from './sections';

/* ==========================================================================
   One lazily loaded component per settings section (heavy sections such as
   the receipt preview or data tools only load when opened).
   ========================================================================== */

type SectionComponent = LazyExoticComponent<ComponentType>;

const section = (loader: () => Promise<{ default: ComponentType }>): SectionComponent => lazy(loader);

export const SECTION_COMPONENTS: Record<SettingsSectionId, SectionComponent> = {
  general: section(() => import('./sections/GeneralSection')),
  store: section(() => import('./sections/StoreSection')),
  counter: section(() => import('./sections/CounterSection')),
  pos: section(() => import('./sections/PosSection')),
  sales: section(() => import('./sections/SalesSection')),
  payment: section(() => import('./sections/PaymentSection')),
  tax: section(() => import('./sections/TaxSection')),
  discount: section(() => import('./sections/DiscountSection')),
  customer: section(() => import('./sections/CustomerSection')),
  loyalty: section(() => import('./sections/LoyaltySection')),
  receipt: section(() => import('./sections/ReceiptSection')),
  products: section(() => import('./sections/ProductsSection')),
  inventory: section(() => import('./sections/InventorySection')),
  shift: section(() => import('./sections/ShiftSection')),
  appearance: section(() => import('./sections/AppearanceSection')),
  theme: section(() => import('./sections/ThemeSection')),
  fonts: section(() => import('./sections/FontsSection')),
  language: section(() => import('./sections/LanguageSection')),
  numbers: section(() => import('./sections/NumbersSection')),
  currency: section(() => import('./sections/CurrencySection')),
  printer: section(() => import('./sections/PrinterSection')),
  barcode: section(() => import('./sections/BarcodeSection')),
  sounds: section(() => import('./sections/SoundsSection')),
  shortcuts: section(() => import('./sections/ShortcutsSection')),
  notifications: section(() => import('./sections/NotificationsSection')),
  security: section(() => import('./sections/SecuritySection')),
  users: section(() => import('./sections/UsersSection')),
  data: section(() => import('./sections/DataSection')),
  about: section(() => import('./sections/AboutSection')),
};
