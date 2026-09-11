import { useNavigate } from 'react-router';
import { Keyboard, Settings2 } from 'lucide-react';
import { displayCombo } from '@/app/shortcuts';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { ShortcutAction } from '@/types';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Display';
import { SettingBlock, SettingsCard } from '@/features/settings/components/SettingsCard';

/** The keys a cashier uses most (scan → add → pay). */
const MAIN: ShortcutAction[] = ['goPos', 'focusSearch', 'payment', 'completePayment', 'holdSale', 'recallSale', 'discount', 'globalSearch'];

export function ProfileShortcutsCard() {
  const t = useT();
  const navigate = useNavigate();
  const shortcuts = useSettingsStore((state) => state.device.shortcuts);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);

  return (
    <SettingsCard
      icon={Keyboard}
      title={t('shell.shortcuts.title')}
      description={t('settings.profile.shortcutsHint')}
      action={
        <Button size="sm" variant="ghost" icon={Settings2} onClick={() => navigate('/settings/shortcuts')}>
          {t('settings.profile.changeShortcuts')}
        </Button>
      }
    >
      <SettingBlock>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {MAIN.filter((action) => shortcuts[action]).map((action) => (
            <div key={action} className="flex min-h-9 items-center justify-between gap-3">
              <dt className="truncate type-body-sm text-fg">{t(`shell.shortcuts.actions.${action}`)}</dt>
              <dd>
                <Kbd>{displayCombo(shortcuts[action])}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
        <Button className="mt-4" icon={Keyboard} onClick={() => setShortcutsOpen(true)}>
          {t('settings.profile.allShortcuts')}
        </Button>
      </SettingBlock>
    </SettingsCard>
  );
}
