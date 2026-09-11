import { cash } from './locales/bn/cash';
import { catalog } from './locales/bn/catalog';
import { common } from './locales/bn/common';
import { customers } from './locales/bn/customers';
import { dashboard } from './locales/bn/dashboard';
import { enums } from './locales/bn/enums';
import { errors, validation } from './locales/bn/errors';
import { inventory } from './locales/bn/inventory';
import { pos, print, receipt } from './locales/bn/pos';
import { reports } from './locales/bn/reports';
import { sales } from './locales/bn/sales';
import { settings } from './locales/bn/settings';
import { auth, nav, onboarding, shell } from './locales/bn/shell';
import type { DeepStringify } from './types';
import type { en } from './en';

/** বাংলা অভিধান — ইংরেজি অভিধানের হুবহু একই কী থাকতে হবে। */
export const bn: DeepStringify<typeof en> = {
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
};
