import {
  Barcode,
  Bell,
  Calculator,
  CircleDollarSign,
  Database,
  Gift,
  Hash,
  Info,
  Keyboard,
  Languages,
  LayoutGrid,
  Monitor,
  Package,
  Palette,
  Percent,
  Printer,
  Receipt,
  ScanBarcode,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  SunMoon,
  Tag,
  Type,
  UserCog,
  Users,
  Volume2,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/config/permissions';

/* ==========================================================================
   Settings centre sections (spec §51). Device sections apply to this
   terminal only; business sections apply to the whole shop and need the
   settings.manage permission (security/users/data have their own).
   ========================================================================== */

export type SettingsSectionId =
  | 'general'
  | 'store'
  | 'pos'
  | 'appearance'
  | 'theme'
  | 'language'
  | 'fonts'
  | 'numbers'
  | 'currency'
  | 'tax'
  | 'receipt'
  | 'printer'
  | 'barcode'
  | 'products'
  | 'inventory'
  | 'sales'
  | 'payment'
  | 'customer'
  | 'loyalty'
  | 'discount'
  | 'counter'
  | 'shift'
  | 'notifications'
  | 'sounds'
  | 'shortcuts'
  | 'data'
  | 'security'
  | 'users'
  | 'about';

export interface SettingsSection {
  id: SettingsSectionId;
  icon: LucideIcon;
  scope: 'device' | 'business' | 'info';
  /** Permission needed to open the section (null = everyone). */
  permission: Permission | null;
  group: 'shop' | 'selling' | 'look' | 'hardware' | 'system';
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', icon: SlidersHorizontal, scope: 'device', permission: null, group: 'shop' },
  { id: 'store', icon: Store, scope: 'business', permission: 'settings.manage', group: 'shop' },
  { id: 'counter', icon: Monitor, scope: 'device', permission: null, group: 'shop' },
  { id: 'pos', icon: ScanBarcode, scope: 'device', permission: null, group: 'selling' },
  { id: 'sales', icon: ShoppingBag, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'payment', icon: Wallet, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'tax', icon: Percent, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'discount', icon: Tag, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'customer', icon: Users, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'loyalty', icon: Gift, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'receipt', icon: Receipt, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'products', icon: Package, scope: 'device', permission: null, group: 'selling' },
  { id: 'inventory', icon: Warehouse, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'shift', icon: Calculator, scope: 'business', permission: 'settings.manage', group: 'selling' },
  { id: 'appearance', icon: LayoutGrid, scope: 'device', permission: null, group: 'look' },
  { id: 'theme', icon: SunMoon, scope: 'device', permission: null, group: 'look' },
  { id: 'fonts', icon: Type, scope: 'device', permission: null, group: 'look' },
  { id: 'language', icon: Languages, scope: 'device', permission: null, group: 'look' },
  { id: 'numbers', icon: Hash, scope: 'device', permission: null, group: 'look' },
  { id: 'currency', icon: CircleDollarSign, scope: 'business', permission: 'settings.manage', group: 'look' },
  { id: 'printer', icon: Printer, scope: 'device', permission: null, group: 'hardware' },
  { id: 'barcode', icon: Barcode, scope: 'device', permission: null, group: 'hardware' },
  { id: 'sounds', icon: Volume2, scope: 'device', permission: null, group: 'hardware' },
  { id: 'shortcuts', icon: Keyboard, scope: 'device', permission: null, group: 'hardware' },
  { id: 'notifications', icon: Bell, scope: 'device', permission: null, group: 'system' },
  { id: 'security', icon: ShieldCheck, scope: 'business', permission: 'users.manage', group: 'system' },
  { id: 'users', icon: UserCog, scope: 'business', permission: 'users.manage', group: 'system' },
  { id: 'data', icon: Database, scope: 'business', permission: 'data.manage', group: 'system' },
  { id: 'about', icon: Info, scope: 'info', permission: null, group: 'system' },
];

export const SETTINGS_GROUPS: SettingsSection['group'][] = ['shop', 'selling', 'look', 'hardware', 'system'];

export function findSection(id: string | undefined): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) => section.id === id);
}

/** Palette icon for the whole settings centre. */
export const SETTINGS_ICON: LucideIcon = Palette;
