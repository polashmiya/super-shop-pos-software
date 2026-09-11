import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScanBarcode,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Receipt,
  History,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/config/permissions';
import type { TranslationKey } from '@/i18n';
import type { ShortcutAction } from '@/types/settings';

/* ==========================================================================
   Sidebar navigation (order, icons, permissions, shortcuts) — one place to
   add, remove or reorder menu items.
   ========================================================================== */

export interface NavItem {
  key: string;
  path: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  permission: Permission | null;
  shortcut?: ShortcutAction;
  group: 'selling' | 'stock' | 'people' | 'money' | 'insights' | 'system';
  /** Extra keywords for the command palette. */
  keywords?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard.view', group: 'insights' },
  { key: 'pos', path: '/pos', labelKey: 'nav.pos', icon: ScanBarcode, permission: 'pos.sell', shortcut: 'goPos', group: 'selling', keywords: 'sell checkout cart বিক্রি' },
  { key: 'sales', path: '/sales', labelKey: 'nav.sales', icon: ReceiptText, permission: 'sales.view', shortcut: 'goSales', group: 'selling', keywords: 'invoice return ইনভয়েস' },
  { key: 'products', path: '/products', labelKey: 'nav.products', icon: Package, permission: 'products.view', shortcut: 'goProducts', group: 'stock', keywords: 'item catalog পণ্য' },
  { key: 'inventory', path: '/inventory', labelKey: 'nav.inventory', icon: Boxes, permission: 'inventory.view', group: 'stock', keywords: 'stock ledger adjustment স্টক' },
  { key: 'purchases', path: '/purchases', labelKey: 'nav.purchases', icon: ShoppingCart, permission: 'purchases.view', group: 'stock', keywords: 'po grn ক্রয়' },
  { key: 'customers', path: '/customers', labelKey: 'nav.customers', icon: Users, permission: 'customers.view', shortcut: 'goCustomers', group: 'people', keywords: 'loyalty member গ্রাহক' },
  { key: 'suppliers', path: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, permission: 'suppliers.view', group: 'people', keywords: 'vendor distributor সরবরাহকারী' },
  { key: 'shift', path: '/shift', labelKey: 'nav.shift', icon: Wallet, permission: 'shift.operate', group: 'money', keywords: 'cash drawer counter শিফট' },
  { key: 'expenses', path: '/expenses', labelKey: 'nav.expenses', icon: Receipt, permission: 'expenses.create', group: 'money', keywords: 'cost bill খরচ' },
  { key: 'reports', path: '/reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'reports.view', shortcut: 'goReports', group: 'insights', keywords: 'analytics রিপোর্ট' },
  { key: 'audit', path: '/audit', labelKey: 'nav.audit', icon: History, permission: 'audit.view', group: 'system', keywords: 'activity log history' },
  { key: 'settings', path: '/settings', labelKey: 'nav.settings', icon: Settings, permission: null, group: 'system', keywords: 'preferences theme language সেটিংস' },
];

/** Secondary pages reachable from search (not in the sidebar). */
export const EXTRA_DESTINATIONS: Array<Omit<NavItem, 'group'>> = [
  { key: 'returns', path: '/sales/returns', labelKey: 'nav.returns', icon: ReceiptText, permission: 'sales.view' },
  { key: 'stock-ledger', path: '/inventory/ledger', labelKey: 'nav.stockLedger', icon: ClipboardList, permission: 'inventory.view' },
  { key: 'categories', path: '/products/categories', labelKey: 'nav.categories', icon: Package, permission: 'products.view' },
  { key: 'brands', path: '/products/brands', labelKey: 'nav.brands', icon: Package, permission: 'products.view' },
  { key: 'units', path: '/products/units', labelKey: 'nav.units', icon: Package, permission: 'products.view' },
  { key: 'shift-history', path: '/shift/history', labelKey: 'nav.shiftHistory', icon: Wallet, permission: 'shift.operate' },
  { key: 'counters', path: '/counters', labelKey: 'nav.counters', icon: Wallet, permission: 'counters.manage' },
  { key: 'notifications', path: '/notifications', labelKey: 'nav.notifications', icon: History, permission: null },
  { key: 'profile', path: '/profile', labelKey: 'nav.profile', icon: Users, permission: null },
];

/** The first page a user may open after signing in. */
export function landingPath(can: (permission: Permission) => boolean): string {
  if (can('pos.sell')) return '/pos';
  if (can('dashboard.view')) return '/dashboard';
  const first = NAV_ITEMS.find((item) => item.permission === null || can(item.permission));
  return first?.path ?? '/settings';
}
