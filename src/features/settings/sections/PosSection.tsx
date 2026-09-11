import { useNavigate } from 'react-router';
import { ChevronRight, LayoutGrid, PanelsTopLeft, ScanBarcode, ShieldCheck, ShoppingCart, Volume2 } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useT, type TranslationKey } from '@/i18n';
import { useCan } from '@/stores/authStore';
import type { PosLayout, SizeOption } from '@/types';
import { Button } from '@/components/ui/Button';
import { ChoiceCard, SegmentedControl } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Display';
import { PosLayoutPreview } from '../components/PosLayoutPreview';
import { QuickCashEditor } from '../components/QuickCashEditor';
import { LockedNote, Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, saveDevice, useBusinessGroup, useDeviceGroup } from '../saveStatus';

const SIZES: SizeOption[] = ['sm', 'md', 'lg'];
const LAYOUTS: Array<{ value: PosLayout; title: TranslationKey; hint: TranslationKey }> = [
  { value: 'grid', title: 'settings.pos.layoutGrid', hint: 'settings.pos.layoutGridHint' },
  { value: 'counter', title: 'settings.pos.layoutCounter', hint: 'settings.pos.layoutCounterHint' },
];

/** How the POS screen behaves on this terminal, plus the shop-wide counter rules. */
export default function PosSection() {
  const t = useT();
  const navigate = useNavigate();
  const pos = useDeviceGroup('pos');
  const appearance = useDeviceGroup('appearance');
  const sound = useDeviceGroup('sound');
  const security = useBusinessGroup('security');
  const payment = useBusinessGroup('payment');
  const canManage = useCan('settings.manage');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={PanelsTopLeft} title={t('settings.pos.layout')} description={t('settings.pos.layoutHint')}>
        <SettingBlock anchor="posLayout">
          <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t('settings.pos.layout')}>
            {LAYOUTS.map(({ value, title, hint }) => (
              <ChoiceCard key={value} selected={pos.layout === value} onClick={() => saveDevice({ pos: { layout: value } })} className="gap-2 p-4 pe-10">
                <PosLayoutPreview layout={value} className="aspect-[16/9] w-full" />
                <span className="text-base font-semibold text-fg">{t(title)}</span>
                <span className="type-caption text-fg-subtle">{t(hint)}</span>
              </ChoiceCard>
            ))}
          </div>
        </SettingBlock>
        {pos.layout === 'counter' && (
          <SettingBlock>
            <Note tone="neutral">{t('settings.pos.layoutCounterNote')}</Note>
          </SettingBlock>
        )}
      </SettingsCard>

      <SettingsCard icon={ScanBarcode} title={t('settings.pos.scanning')} description={t('settings.pos.scanningHint')}>
        <SwitchRow anchor="posAutoFocus" label={t('settings.pos.autoFocus')} description={t('settings.pos.autoFocusHint')} checked={pos.autoFocusSearch} onChange={(autoFocusSearch) => saveDevice({ pos: { autoFocusSearch } })} />
        <SwitchRow anchor="posAutoAdd" label={t('settings.pos.autoAdd')} checked={pos.autoAddScanned} onChange={(autoAddScanned) => saveDevice({ pos: { autoAddScanned } })} />
        <SwitchRow anchor="posDuplicateQty" label={t('settings.pos.duplicateQty')} checked={pos.duplicateScanIncreasesQty} onChange={(duplicateScanIncreasesQty) => saveDevice({ pos: { duplicateScanIncreasesQty } })} />
        <SwitchRow anchor="posQuickCheckout" label={t('settings.pos.quickCheckout')} checked={pos.quickCheckoutOnEnter} onChange={(quickCheckoutOnEnter) => saveDevice({ pos: { quickCheckoutOnEnter } })} />
      </SettingsCard>

      <SettingsCard icon={LayoutGrid} title={t('settings.pos.grid')} description={t('settings.pos.gridHint')}>
        <SwitchRow anchor="posImages" label={t('settings.pos.showImages')} description={t('settings.pos.showImagesHint')} checked={pos.showProductImages} onChange={(showProductImages) => saveDevice({ pos: { showProductImages } })} />
        <SettingRow anchor="posCardSize" label={t('settings.pos.cardSize')}>
          <SegmentedControl ariaLabel={t('settings.pos.cardSize')} value={appearance.cardSize} options={SIZES.map((value) => ({ value, label: t(`enums.size.${value}`) }))} onChange={(cardSize) => saveDevice({ appearance: { cardSize } })} />
        </SettingRow>
        <SwitchRow anchor="posBothNames" label={t('settings.language.bothNames')} description={t('settings.language.bothNamesHint')} checked={pos.showSecondaryName} onChange={(showSecondaryName) => saveDevice({ pos: { showSecondaryName } })} />
        <SettingRow label={t('settings.pos.moreDisplay')} description={t('settings.sections.products.description')}>
          <Button variant="ghost" iconRight={ChevronRight} onClick={() => navigate('/settings/products')}>
            {t('settings.sections.products.title')}
          </Button>
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={ShoppingCart} title={t('settings.pos.cart')} description={t('settings.pos.cartHint')}>
        <SwitchRow anchor="posConfirmClear" label={t('settings.pos.confirmClear')} checked={pos.confirmClearCart} onChange={(confirmClearCart) => saveDevice({ pos: { confirmClearCart } })} />
        <SwitchRow anchor="posClearAfterSale" label={t('settings.pos.clearAfterSale')} checked={pos.clearCartAfterSale} onChange={(clearCartAfterSale) => saveDevice({ pos: { clearCartAfterSale } })} />
        <SwitchRow anchor="posCustomerPanel" label={t('settings.pos.customerPanel')} checked={pos.showCustomerPanel} onChange={(showCustomerPanel) => saveDevice({ pos: { showCustomerPanel } })} />
        <SwitchRow anchor="posKeypad" label={t('settings.pos.keypad')} checked={pos.showNumericKeypad} onChange={(showNumericKeypad) => saveDevice({ pos: { showNumericKeypad } })} />
        <SwitchRow anchor="posRememberCategory" label={t('settings.pos.rememberCategory')} checked={pos.rememberLastCategory} onChange={(rememberLastCategory) => saveDevice({ pos: { rememberLastCategory } })} />
        <SwitchRow anchor="posRememberPayment" label={t('settings.pos.rememberPayment')} checked={pos.rememberLastPaymentMethod} onChange={(rememberLastPaymentMethod) => saveDevice({ pos: { rememberLastPaymentMethod } })} />
        <SettingRow anchor="posHoldLimit" label={t('settings.pos.holdLimit')} description={t('settings.pos.holdLimitHint')}>
          <Badge tone="neutral">{t('settings.pos.holdLimitValue', { count: APP_CONFIG.pos.maxHeldSales })}</Badge>
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={Volume2} title={t('settings.pos.sounds')} description={t('settings.pos.soundsHint')}>
        <SwitchRow anchor="posScanBeep" label={t('settings.pos.scanBeep')} checked={sound.scan} disabled={!sound.enabled} onChange={(scan) => saveDevice({ sound: { scan } })} />
        <SwitchRow anchor="posSuccessChime" label={t('settings.pos.successChime')} checked={sound.success} disabled={!sound.enabled} onChange={(success) => saveDevice({ sound: { success } })} />
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title={t('settings.pos.shopRules')} description={t('settings.pos.shopRulesHint')} badge={<Badge tone="neutral">{t('settings.businessScope')}</Badge>}>
        <SwitchRow
          anchor="posPriceOverride"
          label={t('settings.pos.priceOverride')}
          description={t('settings.pos.priceOverrideHint')}
          checked={security.requireManagerForPriceOverride}
          disabled={!canManage}
          onChange={(requireManagerForPriceOverride) => void saveBusiness('security', { requireManagerForPriceOverride })}
        />
        <SettingRow anchor="posQuickCash" label={t('settings.pos.quickCash')} description={t('settings.pos.quickCashHint')} stacked>
          <QuickCashEditor value={payment.quickCash} disabled={!canManage} onChange={(quickCash) => void saveBusiness('payment', { quickCash })} />
        </SettingRow>
        {!canManage && <LockedNote />}
      </SettingsCard>
    </div>
  );
}
