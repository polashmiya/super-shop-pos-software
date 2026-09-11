import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellOff, CheckCheck, CircleAlert, Info, Lock, TriangleAlert } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { displayCombo } from '@/app/shortcuts';
import { useFormat } from '@/hooks/useFormat';
import { hasTranslation, useLanguage, useT, type TranslationKey } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { AppNotification, ShortcutAction } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Avatar, Kbd } from '@/components/ui/Display';
import { Input } from '@/components/ui/Input';
import { Drawer, Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { EmptyState } from '@/components/ui/States';
import { notificationTarget } from './notificationTarget';

const SEVERITY_ICON = { info: Info, success: CheckCheck, warning: TriangleAlert, danger: CircleAlert } as const;
const SEVERITY_TONE = { info: 'bg-info-soft text-info-text', success: 'bg-success-soft text-success-text', warning: 'bg-warning-soft text-warning-text', danger: 'bg-danger-soft text-danger-text' } as const;

export function NotificationItem({ notification, onOpen }: { notification: AppNotification; onOpen: (notification: AppNotification) => void }) {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const Icon = SEVERITY_ICON[notification.severity];
  const params = { ...notification.params };
  if (typeof params.nameBn === 'string' && typeof params.nameEn === 'string') params.name = language === 'bn' ? params.nameBn : params.nameEn;
  const title = hasTranslation(notification.titleKey) ? t(notification.titleKey as TranslationKey, params) : notification.titleKey;
  const message = hasTranslation(notification.messageKey) ? t(notification.messageKey as TranslationKey, params) : notification.messageKey;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn('flex w-full items-start gap-3 rounded-lg p-3 text-start transition-base hover:bg-surface-2', !notification.isRead && 'bg-primary-soft/25')}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', SEVERITY_TONE[notification.severity])}>
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-fg">{title}</span>
          {!notification.isRead && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
        </span>
        <span className="type-body-sm block text-fg-muted">{message}</span>
        <span className="type-caption mt-0.5 block text-fg-subtle">
          {t(`enums.notificationType.${notification.type}`)} · {format.relative(notification.createdAt)}
        </span>
      </span>
    </button>
  );
}

export function NotificationsPanel() {
  const t = useT();
  const navigate = useNavigate();
  const open = useUiStore((state) => state.notificationsOpen);
  const setOpen = useUiStore((state) => state.setNotificationsOpen);
  const items = useNotificationStore((state) => state.items);
  const markRead = useNotificationStore((state) => state.markRead);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  if (!open) return null;

  const openItem = (notification: AppNotification) => {
    void markRead(notification.id);
    const target = notificationTarget(notification);
    setOpen(false);
    if (target) navigate(target);
  };

  return (
    <Drawer
      open
      onClose={() => setOpen(false)}
      width="md"
      title={t('shell.notifications.title')}
      closeLabel={t('common.actions.close')}
      headerExtra={
        items.some((item) => !item.isRead) ? (
          <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => void markAllRead()}>
            {t('shell.notifications.markAllRead')}
          </Button>
        ) : undefined
      }
      footer={
        <Button
          variant="ghost"
          icon={Bell}
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
        >
          {t('nav.notifications')}
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title={t('shell.notifications.empty')} description={t('shell.notifications.emptyHint')} />
      ) : (
        <div className="flex flex-col gap-1 p-2">
          {items.map((item) => (
            <NotificationItem key={item.id} notification={item} onOpen={openItem} />
          ))}
        </div>
      )}
    </Drawer>
  );
}

const SHORTCUT_ORDER: ShortcutAction[] = [
  'goPos',
  'goProducts',
  'goSales',
  'goCustomers',
  'refresh',
  'goReports',
  'holdSale',
  'recallSale',
  'payment',
  'discount',
  'fullscreen',
  'globalSearch',
  'completePayment',
  'removeItem',
  'increaseQty',
  'decreaseQty',
  'focusSearch',
  'selectCustomer',
  'clearCart',
  'showShortcuts',
];

export function ShortcutsDialog() {
  const t = useT();
  const open = useUiStore((state) => state.shortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  if (!open) return null;
  return (
    <Modal open onClose={() => setOpen(false)} size="lg" title={t('shell.shortcuts.title')} description={t('shell.shortcuts.subtitle')} closeLabel={t('common.actions.close')}>
      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        {SHORTCUT_ORDER.map((action) => (
          <div key={action} className="flex min-h-10 items-center justify-between gap-3 border-b border-border py-1.5">
            <span className="type-body-sm text-fg">{t(`shell.shortcuts.actions.${action}`)}</span>
            <Kbd>{displayCombo(shortcuts[action])}</Kbd>
          </div>
        ))}
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border py-1.5">
          <span className="type-body-sm text-fg">{t('shell.shortcuts.escape')}</span>
          <Kbd>Esc</Kbd>
        </div>
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border py-1.5">
          <span className="type-body-sm text-fg">{t('shell.shortcuts.arrows')}</span>
          <span className="flex gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** Lock screen: the signed-in user (or anyone switching) must enter a PIN. */
export function LockScreen() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const locked = useAuthStore((state) => state.locked);
  const unlock = useAuthStore((state) => state.unlock);
  const logout = useAuthStore((state) => state.logout);
  const lock = useAuthStore((state) => state.lock);
  const autoLockMinutes = useSettingsStore((state) => state.business.security.autoLockMinutes);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // Auto-lock after inactivity (when configured).
  useEffect(() => {
    if (!user || autoLockMinutes <= 0) return;
    let timer = setTimeout(lock, autoLockMinutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, autoLockMinutes * 60_000);
    };
    const events = ['pointerdown', 'keydown'] as const;
    for (const name of events) window.addEventListener(name, reset, true);
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, reset, true);
    };
  }, [user, autoLockMinutes, lock]);

  if (!user || !locked) return null;
  const submit = async () => {
    if (await unlock(pin)) {
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  };
  const name = language === 'bn' ? user.name.bn : user.name.en;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/95 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 shadow-lg"
      >
        <Avatar name={user.name.en} color={user.avatarColor} size={64} />
        <div className="text-center">
          <p className="flex items-center justify-center gap-2 type-h2 text-fg">
            <Lock size={18} aria-hidden />
            {t('auth.locked')}
          </p>
          <p className="type-body-sm mt-1 text-fg-muted">{t('auth.lockedHint', { name })}</p>
        </div>
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          aria-label={t('auth.pinLabel')}
          value={pin}
          invalid={error}
          maxLength={APP_CONFIG.auth.pinMaxLength}
          onChange={(event) => {
            setError(false);
            setPin(event.target.value.replace(/\D/g, ''));
          }}
          inputSize="lg"
          className="text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="type-body-sm text-danger-text">{t('errors.loginFailed')}</p>}
        <NumericKeypad className="w-full" allowDecimal={false} backLabel={t('common.actions.remove')} onKey={(key) => setPin((value) => applyKeypadKey(value, key, 0, APP_CONFIG.auth.pinMaxLength))} />
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={pin.length < APP_CONFIG.auth.pinMinLength}>
          {t('auth.unlock')}
        </Button>
        <Button variant="ghost" onClick={() => void logout().then(() => navigate('/login'))}>
          {t('auth.switchUser')}
        </Button>
      </form>
    </div>
  );
}
