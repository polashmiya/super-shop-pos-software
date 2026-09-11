import type { AppNotification } from '@/types';

/** Where a notification leads when opened. */
export function notificationTarget(notification: AppNotification): string | null {
  switch (notification.type) {
    case 'low_stock':
      return '/inventory?status=low_stock';
    case 'out_of_stock':
      return notification.entity === 'product' && notification.entityId ? `/products/${notification.entityId}` : '/inventory?status=out_of_stock';
    case 'expiring':
      return '/inventory?status=expiring';
    case 'shift_reminder':
      return '/shift';
    case 'backup_reminder':
      return '/settings/data';
    case 'pending_purchase':
      return '/purchases?status=ordered';
    case 'large_discount':
      return '/sales';
    default:
      return null;
  }
}
