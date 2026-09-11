import { useNavigate } from 'react-router';
import { ChevronRight, KeyRound, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const LOCK_MINUTES = [0, 2, 5, 10, 15, 30, 60];

function pinLengths(): number[] {
  const lengths: number[] = [];
  for (let length = APP_CONFIG.auth.pinMinLength; length <= APP_CONFIG.auth.pinMaxLength; length += 1) lengths.push(length);
  return lengths;
}

/** Manager approvals, auto-lock, minimum PIN length and a link to the role permissions. */
export default function SecuritySection() {
  const t = useT();
  const navigate = useNavigate();
  const security = useBusinessGroup('security');
  const lockOptions = [...new Set([...LOCK_MINUTES, security.autoLockMinutes])].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={ShieldCheck} title={t('settings.security.approvals')} description={t('settings.security.approvalsHint')}>
        <SwitchRow anchor="approvePriceOverride" label={t('settings.security.priceOverride')} checked={security.requireManagerForPriceOverride} onChange={(requireManagerForPriceOverride) => void saveBusiness('security', { requireManagerForPriceOverride })} />
        <SwitchRow anchor="approveLargeDiscount" label={t('settings.security.largeDiscount')} checked={security.requireManagerForLargeDiscount} onChange={(requireManagerForLargeDiscount) => void saveBusiness('security', { requireManagerForLargeDiscount })} />
        <SwitchRow anchor="approveCancel" label={t('settings.security.cancel')} checked={security.requireManagerForCancel} onChange={(requireManagerForCancel) => void saveBusiness('security', { requireManagerForCancel })} />
      </SettingsCard>

      <SettingsCard icon={LockKeyhole} title={t('settings.security.lock')} description={t('settings.security.lockHint')}>
        <SettingRow anchor="autoLock" label={t('settings.security.autoLock')} description={t('settings.security.autoLockHint')}>
          {(id) => (
            <div className="w-56">
              <Select
                id={id}
                value={String(security.autoLockMinutes)}
                options={lockOptions.map((minutes) => ({ value: String(minutes), label: minutes === 0 ? t('settings.security.never') : t('settings.security.minutes', { count: minutes }) }))}
                onChange={(value) => void saveBusiness('security', { autoLockMinutes: Number(value) })}
              />
            </div>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={KeyRound} title={t('settings.security.pin')} description={t('settings.security.pinHint')}>
        <SettingRow anchor="pinLength" label={t('settings.security.pinLength')} description={t('settings.security.pinLengthHint')}>
          {(id) => (
            <div className="w-40">
              <Select id={id} value={String(security.pinLength)} options={pinLengths().map((length) => ({ value: String(length), label: t('settings.security.digits', { count: length }) }))} onChange={(value) => void saveBusiness('security', { pinLength: Number(value) })} />
            </div>
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={UsersRound} title={t('settings.security.permissions')} description={t('settings.security.permissionsHint')}>
        <SettingRow anchor="securityPermissions" label={t('settings.security.permissions')} description={t('settings.users.matrixHint')}>
          <Button iconRight={ChevronRight} onClick={() => navigate('/settings/users?focus=permissionMatrix')}>
            {t('settings.security.openUsers')}
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
