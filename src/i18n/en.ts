import { cash } from './locales/en/cash';
import { catalog } from './locales/en/catalog';
import { common } from './locales/en/common';
import { customers } from './locales/en/customers';
import { dashboard } from './locales/en/dashboard';
import { enums } from './locales/en/enums';
import { errors, validation } from './locales/en/errors';
import { inventory } from './locales/en/inventory';
import { pos, print, receipt } from './locales/en/pos';
import { reports } from './locales/en/reports';
import { sales } from './locales/en/sales';
import { settings } from './locales/en/settings';
import { auth, nav, onboarding, shell } from './locales/en/shell';

/**
 * English dictionary. It defines the key structure; the Bangla dictionary
 * (bn.ts) must provide exactly the same keys (enforced by TypeScript).
 * Each namespace lives in its own file under ./locales/en.
 */
export const en = {
  common,
  enums,
  errors,
  validation,
  nav,
  shell,
  auth,
  onboarding,
  pos,
  receipt,
  print,
  sales,
  catalog,
  inventory,
  customers,
  cash,
  dashboard,
  reports,
  settings,
} as const;
