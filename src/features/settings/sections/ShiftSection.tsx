import { DoorClosed, DoorOpen } from 'lucide-react';
import { useT } from '@/i18n';
import { MoneyInput, NumberInput } from '../components/Inputs';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

/** Opening cash, closing difference limit, blind closing and the close reminder. */
export default function ShiftSection() {
  const t = useT();
  const shift = useBusinessGroup('shift');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={DoorOpen} title={t('settings.shift.opening')} description={t('settings.shift.openingHint')}>
        <SwitchRow anchor="requireOpenShift" label={t('settings.shift.requireOpen')} description={t('settings.shift.requireOpenHint')} checked={shift.requireOpenShift} onChange={(requireOpenShift) => void saveBusiness('shift', { requireOpenShift })} />
        <SettingRow anchor="defaultOpeningCash" label={t('settings.shift.defaultOpening')} description={t('settings.shift.defaultOpeningHint')}>
          {(id) => <MoneyInput id={id} value={shift.defaultOpeningCash} onCommit={(defaultOpeningCash) => void saveBusiness('shift', { defaultOpeningCash })} />}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={DoorClosed} title={t('settings.shift.closing')} description={t('settings.shift.closingHint')}>
        <SettingRow anchor="maxCashDifference" label={t('settings.shift.maxDifference')} description={t('settings.shift.maxDifferenceHint')}>
          {(id) => <MoneyInput id={id} value={shift.maxDifference} onCommit={(maxDifference) => void saveBusiness('shift', { maxDifference })} />}
        </SettingRow>
        <SwitchRow anchor="blindClose" label={t('settings.shift.blindClose')} description={t('settings.shift.blindCloseHint')} checked={shift.blindClose} onChange={(blindClose) => void saveBusiness('shift', { blindClose })} />
        <SettingRow anchor="shiftReminder" label={t('settings.shift.reminder')} description={t('settings.shift.reminderHint')}>
          {(id) => <NumberInput id={id} value={shift.reminderHours} min={1} max={48} suffix={t('settings.units.hours')} className="w-40" onCommit={(reminderHours) => void saveBusiness('shift', { reminderHours })} />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
