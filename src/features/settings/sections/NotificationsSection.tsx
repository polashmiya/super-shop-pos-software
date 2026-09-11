import { Bell, MonitorUp } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useT, type TranslationKey } from '@/i18n';
import type { NotificationPreferences } from '@/types';
import { SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

type AlertKey = Exclude<keyof NotificationPreferences, 'desktop'>;

const ALERTS: Array<{ key: AlertKey; label: TranslationKey; hint: TranslationKey }> = [
  { key: 'lowStock', label: 'settings.notifications.lowStock', hint: 'settings.notifications.lowStockHint' },
  { key: 'outOfStock', label: 'settings.notifications.outOfStock', hint: 'settings.notifications.outOfStockHint' },
  { key: 'expiring', label: 'settings.notifications.expiring', hint: 'settings.notifications.expiringHint' },
  { key: 'shiftReminder', label: 'settings.notifications.shiftReminder', hint: 'settings.notifications.shiftReminderHint' },
  { key: 'backupReminder', label: 'settings.notifications.backupReminder', hint: 'settings.notifications.backupReminderHint' },
  { key: 'largeDiscount', label: 'settings.notifications.largeDiscount', hint: 'settings.notifications.largeDiscountHint' },
  { key: 'pendingPurchase', label: 'settings.notifications.pendingPurchase', hint: 'settings.notifications.pendingPurchaseHint' },
];

/** Which alerts this terminal shows, and whether they also appear as Windows notifications. */
export default function NotificationsSection() {
  const t = useT();
  const notifications = useDeviceGroup('notifications');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Bell} title={t('settings.notifications.alerts')} description={t('settings.notifications.alertsHint')}>
        {ALERTS.map(({ key, label, hint }) => (
          <SwitchRow
            key={key}
            anchor={`notify-${key}`}
            label={t(label)}
            description={t(hint, { days: APP_CONFIG.backup.reminderDays })}
            checked={notifications[key]}
            onChange={(checked) => saveDevice({ notifications: { [key]: checked } as Partial<NotificationPreferences> })}
          />
        ))}
      </SettingsCard>

      <SettingsCard icon={MonitorUp} title={t('settings.notifications.delivery')}>
        <SwitchRow anchor="desktopNotifications" label={t('settings.notifications.desktop')} description={t('settings.notifications.desktopHint')} checked={notifications.desktop} onChange={(desktop) => saveDevice({ notifications: { desktop } })} />
      </SettingsCard>
    </div>
  );
}
