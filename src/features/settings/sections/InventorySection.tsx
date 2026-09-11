import { Boxes, CalendarClock, PackagePlus } from 'lucide-react';
import { useT } from '@/i18n';
import { NumberInput } from '../components/Inputs';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, useBusinessGroup } from '../saveStatus';

const MAX_STOCK_LIMIT = 1_000_000;

/** Negative stock, default min/max levels for new products and expiry alerts. */
export default function InventorySection() {
  const t = useT();
  const inventory = useBusinessGroup('inventory');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Boxes} title={t('settings.inventory.stock')} description={t('settings.inventory.stockHint')}>
        <SwitchRow
          anchor="allowNegativeStock"
          label={t('settings.inventory.allowNegative')}
          description={t('settings.inventory.allowNegativeHint')}
          checked={inventory.allowNegativeStock}
          onChange={(allowNegativeStock) => void saveBusiness('inventory', { allowNegativeStock })}
        />
      </SettingsCard>

      <SettingsCard icon={PackagePlus} title={t('settings.inventory.defaults')} description={t('settings.inventory.defaultsHint')}>
        <SettingRow anchor="defaultMinStock" label={t('settings.inventory.minStock')} description={t('settings.inventory.minStockHint')}>
          {(id) => <NumberInput id={id} value={inventory.defaultMinStock} min={0} max={inventory.defaultMaxStock} className="w-36" onCommit={(defaultMinStock) => void saveBusiness('inventory', { defaultMinStock })} />}
        </SettingRow>
        <SettingRow anchor="defaultMaxStock" label={t('settings.inventory.maxStock')} description={t('settings.inventory.maxStockHint')}>
          {(id) => <NumberInput id={id} value={inventory.defaultMaxStock} min={inventory.defaultMinStock} max={MAX_STOCK_LIMIT} className="w-36" onCommit={(defaultMaxStock) => void saveBusiness('inventory', { defaultMaxStock })} />}
        </SettingRow>
        <p className="py-3 type-caption text-fg-subtle">{t('settings.inventory.minAboveMax')}</p>
      </SettingsCard>

      <SettingsCard icon={CalendarClock} title={t('settings.inventory.expiry')} description={t('settings.inventory.expiryHint')}>
        <SwitchRow anchor="trackExpiry" label={t('settings.inventory.trackExpiry')} checked={inventory.trackExpiry} onChange={(trackExpiry) => void saveBusiness('inventory', { trackExpiry })} />
        <SettingRow anchor="expiryAlertDays" label={t('settings.inventory.alertDays')} description={t('settings.inventory.alertDaysHint')}>
          {(id) => (
            <NumberInput id={id} value={inventory.expiryAlertDays} min={1} max={365} suffix={t('settings.units.days')} disabled={!inventory.trackExpiry} className="w-40" onCommit={(expiryAlertDays) => void saveBusiness('inventory', { expiryAlertDays })} />
          )}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
