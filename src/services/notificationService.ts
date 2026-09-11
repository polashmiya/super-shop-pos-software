import { APP_CONFIG } from '@/config/app.config';
import { addDays, daysBetween, startOfDay, toLocalDate } from '@/domain/dates';
import { getStockStatus } from '@/domain/stock';
import { repos } from '@/repositories';
import type { AppNotification, NotificationType, Product } from '@/types';
import { ctx } from './context';

/* ==========================================================================
   Notification centre. Stock, expiry, shift, backup and purchase alerts are
   derived from the current data (re-synced on start and periodically), so
   they disappear by themselves when the problem is solved.
   ========================================================================== */

type NewNotification = Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>;

const MANAGED_TYPES: NotificationType[] = ['low_stock', 'out_of_stock', 'expiring', 'shift_reminder', 'backup_reminder', 'pending_purchase'];

export interface NotificationInputs {
  products: Product[];
  lastBackupAt: string | null;
  openShift: { shiftNo: string; openedAt: string } | null;
  pendingPurchases: number;
  /** Product ids ordered by recent sales (best sellers first). */
  bestSellers?: string[];
}

export function buildNotifications(inputs: NotificationInputs): NewNotification[] {
  const context = ctx();
  const preferences = context.device().notifications;
  const expiringDays = context.business().inventory.expiryAlertDays;
  const now = context.now();
  const list: NewNotification[] = [];
  const active = inputs.products.filter((product) => product.status === 'active');

  const statuses = active.map((product) => ({ product, status: getStockStatus(product, expiringDays, now) }));
  const low = statuses.filter((entry) => entry.status === 'low_stock');
  const out = statuses.filter((entry) => entry.status === 'out_of_stock');
  const expiring = active.filter((product) => product.expiryDate && product.stock > 0 && product.expiryDate <= toLocalDate(addDays(startOfDay(now), expiringDays)));

  if (preferences.lowStock && low.length > 0) {
    list.push({ type: 'low_stock', severity: 'warning', titleKey: 'shell.notifications.lowStockTitle', messageKey: 'shell.notifications.lowStockMessage', params: { count: low.length }, entity: 'inventory', entityId: 'low_stock', dedupeKey: 'low_stock:summary' });
  }
  if (preferences.outOfStock && out.length > 0) {
    list.push({ type: 'out_of_stock', severity: 'danger', titleKey: 'shell.notifications.outOfStockTitle', messageKey: 'shell.notifications.outOfStockMessage', params: { count: out.length }, entity: 'inventory', entityId: 'out_of_stock', dedupeKey: 'out_of_stock:summary' });
    const ranking = new Map((inputs.bestSellers ?? []).map((id, index) => [id, index]));
    const top = out
      .filter((entry) => ranking.has(entry.product.id))
      .sort((a, b) => (ranking.get(a.product.id) ?? 0) - (ranking.get(b.product.id) ?? 0))
      .slice(0, 5);
    for (const { product } of top) {
      list.push({
        type: 'out_of_stock',
        severity: 'danger',
        titleKey: 'shell.notifications.outOfStockItemTitle',
        messageKey: 'shell.notifications.outOfStockItemMessage',
        params: { name: context.language() === 'bn' ? product.name.bn : product.name.en, nameBn: product.name.bn, nameEn: product.name.en },
        entity: 'product',
        entityId: product.id,
        dedupeKey: `out_of_stock:${product.id}`,
      });
    }
  }
  if (preferences.expiring && expiring.length > 0) {
    list.push({ type: 'expiring', severity: 'warning', titleKey: 'shell.notifications.expiringTitle', messageKey: 'shell.notifications.expiringMessage', params: { count: expiring.length, days: expiringDays }, entity: 'inventory', entityId: 'expiring', dedupeKey: 'expiring:summary' });
  }
  if (preferences.shiftReminder && inputs.openShift) {
    const hours = Math.floor((now.getTime() - new Date(inputs.openShift.openedAt).getTime()) / 3_600_000);
    if (hours >= context.business().shift.reminderHours) {
      list.push({ type: 'shift_reminder', severity: 'info', titleKey: 'shell.notifications.shiftReminderTitle', messageKey: 'shell.notifications.shiftReminderMessage', params: { shift: inputs.openShift.shiftNo, hours }, entity: 'shift', entityId: null, dedupeKey: `shift_reminder:${inputs.openShift.shiftNo}` });
    }
  }
  if (preferences.backupReminder) {
    const days = inputs.lastBackupAt ? daysBetween(new Date(inputs.lastBackupAt), now) : null;
    if (days === null || days >= APP_CONFIG.backup.reminderDays) {
      list.push({
        type: 'backup_reminder',
        severity: 'info',
        titleKey: 'shell.notifications.backupReminderTitle',
        messageKey: days === null ? 'shell.notifications.backupNeverMessage' : 'shell.notifications.backupReminderMessage',
        params: { days: days ?? 0 },
        entity: 'settings',
        entityId: 'data',
        dedupeKey: 'backup_reminder',
      });
    }
  }
  if (preferences.pendingPurchase && inputs.pendingPurchases > 0) {
    list.push({ type: 'pending_purchase', severity: 'info', titleKey: 'shell.notifications.pendingPurchaseTitle', messageKey: 'shell.notifications.pendingPurchaseMessage', params: { count: inputs.pendingPurchases }, entity: 'purchases', entityId: null, dedupeKey: 'pending_purchase:summary' });
  }
  return list;
}

export const notificationService = {
  async sync(inputs: NotificationInputs): Promise<void> {
    await repos().notifications.sync(buildNotifications(inputs), MANAGED_TYPES);
  },
  list(limit = 50): Promise<AppNotification[]> {
    return repos().notifications.list(limit);
  },
  unreadCount(): Promise<number> {
    return repos().notifications.unreadCount();
  },
  markRead(id: string): Promise<void> {
    return repos().notifications.markRead(id);
  },
  markAllRead(): Promise<void> {
    return repos().notifications.markAllRead();
  },
  async largeDiscount(invoiceNo: string, rate: number): Promise<void> {
    if (!ctx().device().notifications.largeDiscount) return;
    await repos().notifications.add({
      type: 'large_discount',
      severity: 'warning',
      titleKey: 'shell.notifications.largeDiscountTitle',
      messageKey: 'shell.notifications.largeDiscountMessage',
      params: { invoice: invoiceNo, rate: Math.round(rate) / 100 },
      entity: 'sale',
      entityId: invoiceNo,
      dedupeKey: `large_discount:${invoiceNo}`,
    });
  },
};
