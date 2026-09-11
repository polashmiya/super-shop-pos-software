import type { RoleId } from '@/types/people';

/* ==========================================================================
   Permission matrix. The defaults below seed the `role_permissions` table;
   an administrator can change the matrix in Settings → Security (the admin
   role always keeps every permission).
   ========================================================================== */

export const PERMISSIONS = [
  'dashboard.view',
  'pos.sell',
  'pos.hold',
  'pos.discount',
  'pos.priceOverride',
  'sales.view',
  'sales.viewAll',
  'sales.reprint',
  'sales.return',
  'sales.returnAny',
  'sales.cancel',
  'products.view',
  'products.manage',
  'inventory.view',
  'inventory.adjust',
  'purchases.view',
  'purchases.manage',
  'purchases.receive',
  'suppliers.view',
  'suppliers.manage',
  'customers.view',
  'customers.manage',
  'customers.delete',
  'loyalty.adjust',
  'reports.view',
  'reports.financial',
  'shift.operate',
  'shift.viewAll',
  'cash.manage',
  'expenses.create',
  'expenses.approve',
  'counters.manage',
  'settings.manage',
  'users.manage',
  'data.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionGroup =
  | 'pos'
  | 'sales'
  | 'catalog'
  | 'inventory'
  | 'purchases'
  | 'customers'
  | 'reports'
  | 'cash'
  | 'administration';

export const PERMISSION_GROUPS: Record<PermissionGroup, Permission[]> = {
  pos: ['pos.sell', 'pos.hold', 'pos.discount', 'pos.priceOverride'],
  sales: ['sales.view', 'sales.viewAll', 'sales.reprint', 'sales.return', 'sales.returnAny', 'sales.cancel'],
  catalog: ['products.view', 'products.manage'],
  inventory: ['inventory.view', 'inventory.adjust'],
  purchases: ['purchases.view', 'purchases.manage', 'purchases.receive', 'suppliers.view', 'suppliers.manage'],
  customers: ['customers.view', 'customers.manage', 'customers.delete', 'loyalty.adjust'],
  reports: ['dashboard.view', 'reports.view', 'reports.financial'],
  cash: ['shift.operate', 'shift.viewAll', 'cash.manage', 'expenses.create', 'expenses.approve'],
  administration: ['counters.manage', 'settings.manage', 'users.manage', 'data.manage', 'audit.view'],
};

const MANAGER: Permission[] = PERMISSIONS.filter(
  (permission) => !['settings.manage', 'users.manage', 'data.manage'].includes(permission),
);

const CASHIER: Permission[] = [
  'pos.sell',
  'pos.hold',
  'pos.discount',
  'sales.view',
  'sales.reprint',
  'sales.return',
  'products.view',
  'inventory.view',
  'customers.view',
  'customers.manage',
  'shift.operate',
  'expenses.create',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  admin: [...PERMISSIONS],
  manager: MANAGER,
  cashier: CASHIER,
};

export const ROLE_ORDER: RoleId[] = ['admin', 'manager', 'cashier'];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}
