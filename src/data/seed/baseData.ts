import { APP_CONFIG } from '@/config/app.config';
import { DEFAULT_BUSINESS_SETTINGS } from '@/config/defaults';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, ROLE_ORDER } from '@/config/permissions';
import { stableId } from '@/domain/ids';
import { CATEGORIES } from './catalog/categories';
import { UNIT_DEFINITIONS } from './catalog/units';
import { DEMO_COUNTERS, DEMO_USERS, EXPENSE_CATEGORIES } from './demoUsers';
import { insertRow, meta, type SeedExecutor } from './executor';

/* ==========================================================================
   Base data every installation needs (also after "Clear local data"):
   organisation, branch, roles & permissions, counters, staff, units,
   categories, expense categories and the business settings.
   ========================================================================== */

export type PinHasher = (pin: string, salt: string) => string;

const ROLE_NAMES = {
  admin: { bn: 'অ্যাডমিন', en: 'Admin' },
  manager: { bn: 'ম্যানেজার', en: 'Manager' },
  cashier: { bn: 'ক্যাশিয়ার', en: 'Cashier' },
} as const;

export function categoryId(code: string): string {
  return stableId(`category:${code}`);
}

export function saltFor(username: string): string {
  return stableId(`salt:${username}`).replace(/-/g, '').slice(0, 16);
}

export function seedBaseData(db: SeedExecutor, hashPin: PinHasher, createdAt: string): void {
  const { organizationId, branchId } = APP_CONFIG.organization;
  const store = DEFAULT_BUSINESS_SETTINGS.store;

  insertRow(db, 'organizations', { id: organizationId, name_bn: store.nameBn, name_en: store.nameEn, ...meta(createdAt) });
  insertRow(db, 'branches', {
    id: branchId,
    organization_id: organizationId,
    code: 'MAIN',
    name_bn: 'প্রধান শাখা',
    name_en: 'Main Branch',
    address_bn: store.addressBn,
    address_en: store.addressEn,
    phone: store.phone,
    is_active: 1,
    ...meta(createdAt),
  });

  for (const roleId of ROLE_ORDER) {
    insertRow(db, 'roles', {
      id: roleId,
      name_bn: ROLE_NAMES[roleId].bn,
      name_en: ROLE_NAMES[roleId].en,
      is_system: 1,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  for (const [group, permissions] of Object.entries(PERMISSION_GROUPS)) {
    for (const permission of permissions) insertRow(db, 'permissions', { id: permission, group_key: group });
  }
  for (const roleId of ROLE_ORDER) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[roleId]) {
      insertRow(db, 'role_permissions', { role_id: roleId, permission_id: permission });
    }
  }

  for (const counter of DEMO_COUNTERS) {
    insertRow(db, 'counters', {
      id: counter.id,
      branch_id: branchId,
      code: counter.code,
      name_bn: counter.name.bn,
      name_en: counter.name.en,
      status: 'closed',
      assigned_user_id: null,
      ...meta(createdAt),
    });
  }

  for (const user of DEMO_USERS) {
    const salt = saltFor(user.username);
    insertRow(db, 'users', {
      id: user.id,
      username: user.username,
      name_bn: user.name.bn,
      name_en: user.name.en,
      role_id: user.roleId,
      pin_hash: hashPin(user.pin, salt),
      pin_salt: salt,
      phone: user.phone,
      email: `${user.username}@nogorsupershop.com.bd`,
      default_counter_id: DEMO_COUNTERS.find((counter) => counter.code === user.counterCode)?.id ?? null,
      avatar_color: user.avatarColor,
      preferences: '{}',
      is_active: 1,
      last_login_at: null,
      ...meta(createdAt),
    });
  }

  UNIT_DEFINITIONS.forEach((unit, index) => {
    insertRow(db, 'units', {
      id: unit.code,
      name_bn: unit.name.bn,
      name_en: unit.name.en,
      short_bn: unit.short.bn,
      short_en: unit.short.en,
      allow_decimal: unit.allowDecimal,
      sort_order: index,
      is_active: 1,
      created_at: createdAt,
      updated_at: createdAt,
    });
  });

  CATEGORIES.forEach((category, index) => {
    const id = categoryId(category.code);
    insertRow(db, 'categories', {
      id,
      parent_id: null,
      code: category.code,
      name_bn: category.bn,
      name_en: category.en,
      icon: category.icon,
      color: '#64748b',
      image: null,
      sort_order: index,
      is_active: 1,
      ...meta(createdAt),
    });
    category.subcategories.forEach((subcategory, subIndex) => {
      insertRow(db, 'categories', {
        id: categoryId(subcategory.code),
        parent_id: id,
        code: subcategory.code,
        name_bn: subcategory.bn,
        name_en: subcategory.en,
        icon: category.icon,
        color: '#64748b',
        image: null,
        sort_order: subIndex,
        is_active: 1,
        ...meta(createdAt),
      });
    });
  });

  EXPENSE_CATEGORIES.forEach((category, index) => {
    insertRow(db, 'expense_categories', {
      id: category.id,
      code: category.code,
      name_bn: category.name.bn,
      name_en: category.name.en,
      icon: category.icon,
      sort_order: index,
      is_active: 1,
    });
  });

  for (const [key, value] of Object.entries(DEFAULT_BUSINESS_SETTINGS)) {
    insertRow(db, 'settings', { key, value: JSON.stringify(value), updated_at: createdAt, updated_by: null });
  }
}
