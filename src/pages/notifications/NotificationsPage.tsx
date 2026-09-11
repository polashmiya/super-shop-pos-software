import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellOff, CheckCheck, RefreshCw } from 'lucide-react';
import { refreshNotifications } from '@/app/bootstrap';
import { useT } from '@/i18n';
import { useNotificationStore } from '@/stores/notificationStore';
import type { AppNotification } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { NotificationItem } from '@/components/app/Overlays';
import { notificationTarget } from '@/components/app/notificationTarget';

/** Full notification centre (stock, expiry, shift, backup, purchase alerts). */
export default function NotificationsPage() {
  const t = useT();
  const navigate = useNavigate();
  const items = useNotificationStore((state) => state.items);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);

  useEffect(() => {
    void refreshNotifications(true);
  }, []);

  const open = (notification: AppNotification) => {
    void markRead(notification.id);
    const target = notificationTarget(notification);
    if (target) navigate(target);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Bell}
        title={t('shell.notifications.title')}
        description={t('shell.notifications.emptyHint')}
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void refreshNotifications(true)}>
              {t('common.actions.refresh')}
            </Button>
            <Button icon={CheckCheck} onClick={() => void markAllRead()} disabled={!items.some((item) => !item.isRead)}>
              {t('shell.notifications.markAllRead')}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Card padded={false} className="mx-auto max-w-3xl p-2">
          {items.length === 0 ? (
            <EmptyState icon={BellOff} title={t('shell.notifications.empty')} description={t('shell.notifications.emptyHint')} />
          ) : (
            items.map((item) => <NotificationItem key={item.id} notification={item} onOpen={open} />)
          )}
        </Card>
      </div>
    </div>
  );
}
