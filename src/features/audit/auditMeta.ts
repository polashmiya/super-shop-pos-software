import {
  Banknote,
  Boxes,
  Database,
  LogIn,
  Monitor,
  Package,
  ReceiptText,
  Settings2,
  Tag,
  Truck,
  Undo2,
  UserRound,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { hasTranslation, type Translate, type TranslationKey } from '@/i18n';
import type { Tone } from '@/components/ui/Display';
import type { AuditAction } from '@/types';
import type { Formatters } from '@/utils/format';

/* ==========================================================================
   Activity log presentation: colour + icon per action (never colour
   alone), links to the record an entry is about, and readable detail rows
   from the stored `details` object.
   ========================================================================== */

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'sale.completed',
  'sale.returned',
  'sale.cancelled',
  'sale.reprinted',
  'discount.applied',
  'price.overridden',
  'shift.opened',
  'shift.closed',
  'cash.in',
  'cash.out',
  'expense.created',
  'expense.approved',
  'expense.rejected',
  'stock.adjusted',
  'purchase.created',
  'purchase.updated',
  'purchase.received',
  'purchase.cancelled',
  'supplier.saved',
  'supplier.paid',
  'product.created',
  'product.updated',
  'product.price_changed',
  'product.activated',
  'product.deactivated',
  'category.saved',
  'brand.saved',
  'customer.saved',
  'customer.deleted',
  'loyalty.adjusted',
  'counter.updated',
  'user.login',
  'user.logout',
  'user.created',
  'user.updated',
  'settings.changed',
  'data.exported',
  'data.imported',
  'data.reset',
];

interface ActionLook {
  tone: Tone;
  icon: LucideIcon;
}

const SPECIFIC: Partial<Record<AuditAction, ActionLook>> = {
  'sale.cancelled': { tone: 'danger', icon: XCircle },
  'sale.returned': { tone: 'warning', icon: Undo2 },
  'discount.applied': { tone: 'warning', icon: Tag },
  'price.overridden': { tone: 'warning', icon: Tag },
  'product.price_changed': { tone: 'warning', icon: Tag },
  'customer.deleted': { tone: 'danger', icon: Users },
  'expense.rejected': { tone: 'danger', icon: Banknote },
  'purchase.cancelled': { tone: 'danger', icon: Truck },
  'user.login': { tone: 'neutral', icon: LogIn },
  'user.logout': { tone: 'neutral', icon: LogIn },
  'data.reset': { tone: 'danger', icon: Database },
  'data.imported': { tone: 'danger', icon: Database },
};

const BY_AREA: Record<string, ActionLook> = {
  sale: { tone: 'primary', icon: ReceiptText },
  shift: { tone: 'success', icon: Wallet },
  cash: { tone: 'success', icon: Wallet },
  expense: { tone: 'info', icon: Banknote },
  stock: { tone: 'warning', icon: Boxes },
  purchase: { tone: 'info', icon: Truck },
  supplier: { tone: 'info', icon: Truck },
  product: { tone: 'info', icon: Package },
  category: { tone: 'info', icon: Package },
  brand: { tone: 'info', icon: Package },
  customer: { tone: 'success', icon: Users },
  loyalty: { tone: 'success', icon: Users },
  counter: { tone: 'neutral', icon: Monitor },
  user: { tone: 'neutral', icon: UserRound },
  settings: { tone: 'neutral', icon: Settings2 },
  data: { tone: 'neutral', icon: Database },
};

export function actionLook(action: AuditAction): ActionLook {
  return SPECIFIC[action] ?? BY_AREA[action.split('.')[0]] ?? { tone: 'neutral', icon: Settings2 };
}

export function actionText(action: string, t: Translate): string {
  const key = `enums.auditAction.${action}`;
  return hasTranslation(key) ? t(key as TranslationKey) : action;
}

export function entityText(entity: string, t: Translate): string {
  const key = `settings.audit.entities.${entity}`;
  return hasTranslation(key) ? t(key as TranslationKey) : entity;
}

/** Screen of the record an entry is about (null when there is none to open). */
export function entityLink(entity: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entity) {
    case 'sale':
      return `/sales/${entityId}`;
    case 'product':
      return `/products/${entityId}`;
    case 'purchase':
      return `/purchases/${entityId}`;
    case 'shift':
      return `/shift/${entityId}`;
    case 'customer':
      return `/customers/${entityId}`;
    case 'supplier':
      return `/suppliers/${entityId}`;
    default:
      return null;
  }
}

/* ------------------------------ Detail rows ------------------------------- */

const MONEY_KEYS = new Set(['total', 'refund', 'amount', 'openingCash', 'expected', 'actual', 'difference', 'from', 'to']);
const COUNT_KEYS = new Set(['items', 'lines', 'count', 'permissions', 'points']);
const HIDDEN_KEYS = new Set(['saleId']);

export interface DetailRow {
  key: string;
  label: string;
  value: string;
}

function statusText(entity: string, value: string, t: Translate): string {
  for (const group of [`${entity}Status`, 'purchaseStatus', 'expenseStatus', 'counterStatus', 'saleStatus']) {
    const key = `enums.${group}.${value}`;
    if (hasTranslation(key)) return t(key as TranslationKey);
  }
  return value;
}

function enumOr(path: string, value: string, t: Translate): string {
  const key = `${path}.${value}`;
  return hasTranslation(key) ? t(key as TranslationKey) : value;
}

function priceChanges(value: unknown, t: Translate, format: Formatters): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((change: unknown) => {
      if (!change || typeof change !== 'object') return '';
      const { field, from, to } = change as { field?: string; from?: number | null; to?: number | null };
      const money = (amount: number | null | undefined) => (typeof amount === 'number' ? format.money(amount) : '—');
      return `${enumOr('settings.audit.priceFields', field ?? '', t)}: ${money(from)} → ${money(to)}`;
    })
    .filter(Boolean)
    .join('\n');
}

function valueText(entity: string, key: string, value: unknown, t: Translate, format: Formatters): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('common.labels.yes') : t('common.labels.no');
  if (key === 'changes') return priceChanges(value, t, format);
  if (typeof value === 'number') {
    if (MONEY_KEYS.has(key)) return format.money(value, { signed: key === 'difference' });
    if (key === 'quantity') return format.quantity(value);
    if (COUNT_KEYS.has(key)) return format.integer(value);
    return format.number(value);
  }
  if (typeof value === 'string') {
    switch (key) {
      case 'status':
        return statusText(entity, value, t);
      case 'role':
        return enumOr('enums.role', value, t);
      case 'paidFrom':
        return enumOr('enums.paidFrom', value, t);
      case 'method':
        return enumOr('enums.paymentMethod', value, t);
      case 'reason':
        return enumOr('enums.adjustmentReason', value, t);
      case 'section':
        return enumOr('settings.sections', `${value}.title`, t);
      default:
        return format.digits(value);
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const text = value as { bn?: unknown; en?: unknown };
    if (typeof text.en === 'string' || typeof text.bn === 'string') return [text.bn, text.en].filter((part) => typeof part === 'string' && part).join(' / ');
  }
  return JSON.stringify(value);
}

/** The stored details as label/value rows in the current language. */
export function detailRows(entity: string, details: Record<string, unknown>, t: Translate, format: Formatters): DetailRow[] {
  return Object.entries(details)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .map(([key, value]) => {
      const labelKey = `settings.audit.details.${key}`;
      return { key, label: hasTranslation(labelKey) ? t(labelKey as TranslationKey) : key, value: valueText(entity, key, value, t, format) };
    });
}

/** One-line summary for the table (first two meaningful details; the record's own reference is not repeated). */
export function detailSummary(entity: string, details: Record<string, unknown>, t: Translate, format: Formatters, reference: string | null = null): string {
  return detailRows(entity, details, t, format)
    .filter((row) => row.value !== '—' && row.value !== reference)
    .slice(0, 2)
    .map((row) => `${row.label}: ${row.value.split('\n')[0]}`)
    .join(' · ');
}
