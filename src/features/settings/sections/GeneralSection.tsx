import { LayoutPanelLeft, Power, RotateCcw } from 'lucide-react';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { confirmAction, toast } from '@/stores/uiStore';
import type { LandingPage, SidebarMode } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup, useSaveStatus } from '../saveStatus';

const LANDING_PAGES: LandingPage[] = ['auto', 'pos', 'dashboard', 'sales', 'products', 'reports'];
const SIDEBAR_MODES: SidebarMode[] = ['full', 'compact', 'hidden'];

/** Start-up and window behaviour of this terminal, plus "reset this terminal". */
export default function GeneralSection() {
  const t = useT();
  const general = useDeviceGroup('general');
  const appearance = useDeviceGroup('appearance');

  const resetTerminal = async () => {
    const ok = await confirmAction({
      title: t('settings.general.resetTerminalConfirm'),
      message: t('settings.general.resetTerminalMessage'),
      confirmLabel: t('settings.general.resetTerminalAction'),
    });
    if (!ok) return;
    useSettingsStore.getState().resetDevice();
    useSaveStatus.getState().markSaved();
    toast.success('settings.resetDone');
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Power} title={t('settings.general.startup')} description={t('settings.general.startupHint')}>
        <SettingRow anchor="landingPage" label={t('settings.general.landingPage')} description={t('settings.general.landingPageHint')}>
          {(id) => (
            <div className="w-64">
              <Select
                id={id}
                value={general.landingPage}
                options={LANDING_PAGES.map((value) => ({ value, label: t(`settings.general.landing.${value}`) }))}
                onChange={(landingPage) => saveDevice({ general: { landingPage } })}
              />
            </div>
          )}
        </SettingRow>
        <SwitchRow
          anchor="confirmExit"
          label={t('settings.general.confirmExit')}
          description={t('settings.general.confirmExitHint')}
          checked={general.confirmExit}
          onChange={(confirmExit) => saveDevice({ general: { confirmExit } })}
        />
      </SettingsCard>

      <SettingsCard icon={LayoutPanelLeft} title={t('settings.general.screen')} description={t('settings.general.screenHint')}>
        <SettingRow anchor="sidebar" label={t('settings.general.sidebar')} description={t('settings.general.sidebarHint')}>
          <SegmentedControl
            ariaLabel={t('settings.general.sidebar')}
            value={appearance.sidebar}
            options={SIDEBAR_MODES.map((value) => ({ value, label: t(`enums.sidebar.${value}`) }))}
            onChange={(sidebar) => saveDevice({ appearance: { sidebar } })}
          />
        </SettingRow>
        <SwitchRow
          anchor="focusMode"
          label={t('settings.general.focusMode')}
          description={t('settings.general.focusModeHint')}
          checked={appearance.focusMode}
          onChange={(focusMode) => saveDevice({ appearance: { focusMode } })}
        />
      </SettingsCard>

      <SettingsCard icon={RotateCcw} title={t('settings.general.resetTerminal')}>
        <SettingRow anchor="resetTerminal" label={t('settings.general.resetTerminalAction')} description={t('settings.general.resetTerminalHint')}>
          <Button variant="outline" icon={RotateCcw} onClick={() => void resetTerminal()}>
            {t('common.actions.reset')}
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
