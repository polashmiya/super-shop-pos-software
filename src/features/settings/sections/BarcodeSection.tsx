import { useRef, useState } from 'react';
import { CircleCheck, PackageCheck, PackageX, ScanBarcode, ScanLine, ShoppingCart, TriangleAlert } from 'lucide-react';
import { useLocalize, useT } from '@/i18n';
import { findByCode } from '@/stores/catalogStore';
import type { BarcodeSettings, Product } from '@/types';
import { SegmentedControl } from '@/components/ui/Controls';
import { StatusBadge } from '@/components/ui/Display';
import { Input } from '@/components/ui/Input';
import { NumberInput, TextField } from '../components/Inputs';
import { SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

/** Scanner timing, code rules, what happens after a scan, and a live scan test. */
export default function BarcodeSection() {
  const t = useT();
  const barcode = useDeviceGroup('barcode');
  const pos = useDeviceGroup('pos');
  const sound = useDeviceGroup('sound');

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={ScanBarcode} title={t('settings.barcode.scanner')} description={t('settings.barcode.scannerHint')}>
        <SettingRow anchor="scanSpeed" label={t('settings.barcode.speed')} description={t('settings.barcode.speedHint')}>
          {(id) => <NumberInput id={id} value={barcode.scanSpeedMs} min={10} max={500} suffix={t('settings.units.ms')} className="w-36" onCommit={(scanSpeedMs) => saveDevice({ barcode: { scanSpeedMs } })} />}
        </SettingRow>
        <SettingRow anchor="scanMinLength" label={t('settings.barcode.minLength')} description={t('settings.barcode.minLengthHint')}>
          {(id) => <NumberInput id={id} value={barcode.minLength} min={1} max={32} className="w-28" onCommit={(minLength) => saveDevice({ barcode: { minLength } })} />}
        </SettingRow>
        <SettingRow anchor="scanTerminator" label={t('settings.barcode.terminator')}>
          <SegmentedControl<BarcodeSettings['terminator']>
            ariaLabel={t('settings.barcode.terminator')}
            value={barcode.terminator}
            options={[
              { value: 'enter', label: t('settings.barcode.terminators.enter') },
              { value: 'tab', label: t('settings.barcode.terminators.tab') },
            ]}
            onChange={(terminator) => saveDevice({ barcode: { terminator } })}
          />
        </SettingRow>
        <SettingRow anchor="scanPrefix" label={t('settings.barcode.prefix')} description={t('settings.barcode.prefixHint')}>
          {(id) => (
            <div className="w-36">
              <TextField id={id} mono value={barcode.prefix} maxLength={8} placeholder={t('settings.ui.notSet')} onCommit={(prefix) => saveDevice({ barcode: { prefix } })} />
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="unknownBarcode" label={t('settings.barcode.unknown')}>
          <SegmentedControl<BarcodeSettings['unknownAction']>
            ariaLabel={t('settings.barcode.unknown')}
            value={barcode.unknownAction}
            options={[
              { value: 'toast', label: t('settings.barcode.unknownOptions.toast') },
              { value: 'search', label: t('settings.barcode.unknownOptions.search') },
            ]}
            onChange={(unknownAction) => saveDevice({ barcode: { unknownAction } })}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={ShoppingCart} title={t('settings.barcode.cart')}>
        <SwitchRow anchor="barcodeAutoAdd" label={t('settings.pos.autoAdd')} checked={pos.autoAddScanned} onChange={(autoAddScanned) => saveDevice({ pos: { autoAddScanned } })} />
        <SwitchRow anchor="barcodeDuplicate" label={t('settings.pos.duplicateQty')} checked={pos.duplicateScanIncreasesQty} onChange={(duplicateScanIncreasesQty) => saveDevice({ pos: { duplicateScanIncreasesQty } })} />
        <SwitchRow anchor="barcodeBeep" label={t('settings.pos.scanBeep')} checked={sound.scan} disabled={!sound.enabled} onChange={(scan) => saveDevice({ sound: { scan } })} />
      </SettingsCard>

      <SettingsCard icon={ScanLine} title={t('settings.barcode.test')} description={t('settings.barcode.testHint')}>
        <SettingBlock anchor="scanTest">
          <ScanTest settings={barcode} />
        </SettingBlock>
      </SettingsCard>
    </div>
  );
}

interface ScanResult {
  code: string;
  averageMs: number | null;
  product: Product | null;
}

function ScanTest({ settings }: { settings: BarcodeSettings }) {
  const t = useT();
  const localize = useLocalize();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const stamps = useRef<number[]>([]);

  const finish = () => {
    const times = stamps.current;
    stamps.current = [];
    let code = value.trim();
    setValue('');
    if (settings.prefix && code.startsWith(settings.prefix)) code = code.slice(settings.prefix.length);
    if (!code) return;
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    const averageMs = gaps.length > 0 ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : null;
    setResult({ code, averageMs, product: findByCode(code) });
  };

  const fast = result?.averageMs !== null && result?.averageMs !== undefined && result.averageMs <= settings.scanSpeedMs;
  const tooShort = result ? result.code.length < settings.minLength : false;

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={value}
        icon={ScanBarcode}
        inputSize="lg"
        autoComplete="off"
        placeholder={t('settings.barcode.testPlaceholder')}
        aria-label={t('settings.barcode.test')}
        className="font-mono"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || (event.key === 'Tab' && settings.terminator === 'tab')) {
            event.preventDefault();
            finish();
          } else if (event.key.length === 1) {
            stamps.current.push(event.timeStamp);
          }
        }}
      />
      <div role="status" aria-live="polite" className="min-h-12 rounded-lg border border-border bg-surface-2 px-4 py-3">
        {!result ? (
          <p className="type-body-sm text-fg-subtle">{t('settings.barcode.testWaiting')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="type-body font-medium text-fg">
              {t('settings.barcode.testRead', { code: result.code, count: result.code.length })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {result.averageMs !== null && (
                <StatusBadge
                  tone={fast ? 'success' : 'warning'}
                  icon={fast ? CircleCheck : TriangleAlert}
                  label={fast ? `${t('settings.barcode.testScanner')} · ${t('settings.barcode.testSpeed', { ms: result.averageMs })}` : t('settings.barcode.testTyping', { limit: settings.scanSpeedMs })}
                />
              )}
              {tooShort && <StatusBadge tone="warning" icon={TriangleAlert} label={t('settings.barcode.testTooShort')} />}
              {result.product ? (
                <StatusBadge tone="success" icon={PackageCheck} label={t('settings.barcode.testFound', { name: localize(result.product.name) })} />
              ) : (
                <StatusBadge tone="neutral" icon={PackageX} label={t('settings.barcode.testNotFound')} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
