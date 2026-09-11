import { Eye, FileText, ListChecks, Printer } from 'lucide-react';
import { useT, type TranslationKey } from '@/i18n';
import type { PaperWidth, ReceiptLanguage, ReceiptSettings, StoreInfoSettings } from '@/types';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { FormField } from '@/components/ui/Input';
import { NumberInput, TextField } from '../components/Inputs';
import { ReceiptPreview } from '../components/ReceiptPreview';
import { SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveBusiness, saveDevice, useBusinessGroup, useDeviceGroup } from '../saveStatus';

type ReceiptToggle = { [K in keyof ReceiptSettings]: ReceiptSettings[K] extends boolean ? K : never }[keyof ReceiptSettings];
type StoreText = 'thankYouBn' | 'thankYouEn' | 'receiptFooterBn' | 'receiptFooterEn';

const TOGGLES: Array<{ key: ReceiptToggle; label: TranslationKey }> = [
  { key: 'showLogo', label: 'settings.receipt.showLogo' },
  { key: 'showBin', label: 'settings.receipt.showBin' },
  { key: 'showCashier', label: 'settings.receipt.showCashier' },
  { key: 'showCounter', label: 'settings.receipt.showCounter' },
  { key: 'showCustomerName', label: 'settings.receipt.showCustomerName' },
  { key: 'showCustomerPhone', label: 'settings.receipt.showCustomerPhone' },
  { key: 'showMembership', label: 'settings.receipt.showMembership' },
  { key: 'showLoyaltyPoints', label: 'settings.receipt.showLoyaltyPoints' },
  { key: 'showSku', label: 'settings.receipt.showSku' },
  { key: 'showTaxBreakdown', label: 'settings.receipt.showTaxBreakdown' },
  { key: 'showSavings', label: 'settings.receipt.showSavings' },
  { key: 'showBarcode', label: 'settings.receipt.showBarcode' },
];
const PAPERS: PaperWidth[] = ['80mm', '58mm'];
const LANGUAGES: ReceiptLanguage[] = ['sale', 'bn', 'en'];

/** Everything printed on a receipt, with a live preview of a sample sale. */
export default function ReceiptSection() {
  const t = useT();
  const receipt = useBusinessGroup('receipt');
  const store = useBusinessGroup('store');
  const printer = useDeviceGroup('printer');
  const saveStore = (key: StoreText) => (value: string) => void saveBusiness('store', { [key]: value } as Partial<StoreInfoSettings>);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-5">
        <SettingsCard icon={FileText} title={t('settings.receipt.content')} description={t('settings.receipt.contentHint')}>
          <SettingBlock anchor="receiptHeader">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('settings.receipt.headerBn')}>
                {(id) => <TextField id={id} lang="bn" value={receipt.headerNoteBn} placeholder={t('settings.receipt.headerPlaceholder')} maxLength={120} onCommit={(headerNoteBn) => void saveBusiness('receipt', { headerNoteBn })} />}
              </FormField>
              <FormField label={t('settings.receipt.headerEn')}>
                {(id) => <TextField id={id} lang="en" value={receipt.headerNoteEn} placeholder={t('settings.receipt.headerPlaceholder')} maxLength={120} onCommit={(headerNoteEn) => void saveBusiness('receipt', { headerNoteEn })} />}
              </FormField>
            </div>
          </SettingBlock>
          <SettingBlock anchor="receiptThanks">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('settings.receipt.thankYouBn')}>{(id) => <TextField id={id} lang="bn" value={store.thankYouBn} maxLength={80} onCommit={saveStore('thankYouBn')} />}</FormField>
              <FormField label={t('settings.receipt.thankYouEn')}>{(id) => <TextField id={id} lang="en" value={store.thankYouEn} maxLength={80} onCommit={saveStore('thankYouEn')} />}</FormField>
            </div>
          </SettingBlock>
          <SettingBlock anchor="receiptFooter">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('settings.receipt.footerBn')}>{(id) => <TextField id={id} lang="bn" multiline value={store.receiptFooterBn} maxLength={200} onCommit={saveStore('receiptFooterBn')} />}</FormField>
              <FormField label={t('settings.receipt.footerEn')}>{(id) => <TextField id={id} lang="en" multiline value={store.receiptFooterEn} maxLength={200} onCommit={saveStore('receiptFooterEn')} />}</FormField>
            </div>
          </SettingBlock>
        </SettingsCard>

        <SettingsCard icon={ListChecks} title={t('settings.receipt.show')} description={t('settings.receipt.showHint')}>
          {TOGGLES.map(({ key, label }) => (
            <SwitchRow key={key} anchor={`receipt-${key}`} label={t(label)} checked={receipt[key]} onChange={(checked) => void saveBusiness('receipt', { [key]: checked } as Partial<ReceiptSettings>)} />
          ))}
        </SettingsCard>

        <SettingsCard icon={Printer} title={t('settings.receipt.printing')} description={t('settings.receipt.printingHint')}>
          <SettingRow anchor="receiptPaper" label={t('settings.receipt.paperWidth')}>
            <SegmentedControl ariaLabel={t('settings.receipt.paperWidth')} value={printer.paperWidth} options={PAPERS.map((value) => ({ value, label: t(`enums.paperWidth.${value}`) }))} onChange={(paperWidth) => saveDevice({ printer: { paperWidth } })} />
          </SettingRow>
          <SettingRow anchor="receiptCopies" label={t('settings.receipt.copies')}>
            {(id) => <NumberInput id={id} value={printer.copies} min={1} max={5} suffix={t('settings.units.copies')} className="w-36" onCommit={(copies) => saveDevice({ printer: { copies } })} />}
          </SettingRow>
          <SettingRow anchor="receiptLanguage" label={t('settings.receipt.language')}>
            {(id) => (
              <div className="w-56">
                <Select id={id} value={receipt.language} options={LANGUAGES.map((value) => ({ value, label: t(`settings.receipt.languageOptions.${value}`) }))} onChange={(language) => void saveBusiness('receipt', { language })} />
              </div>
            )}
          </SettingRow>
        </SettingsCard>
      </div>

      <aside className="lg:sticky lg:top-0">
        <SettingsCard icon={Eye} title={t('settings.receipt.preview')} description={t('settings.receipt.previewHint')} bodyClassName="py-4">
          <ReceiptPreview />
        </SettingsCard>
      </aside>
    </div>
  );
}
