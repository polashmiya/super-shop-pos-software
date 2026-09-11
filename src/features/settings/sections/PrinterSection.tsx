import { useState } from 'react';
import { Printer, RefreshCw, ScrollText, Settings2 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { hasElectronAPI } from '@/platform/electron';
import { toast } from '@/stores/uiStore';
import type { PaperWidth, PrinterInfo } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl, Select } from '@/components/ui/Controls';
import { buildTestReceipt, listPrinters, printResultMessage, sendToPrinter } from '@/features/printing/printService';
import { NumberInput } from '../components/Inputs';
import { Note, SettingBlock, SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const PAPERS: PaperWidth[] = ['80mm', '58mm'];

/** Receipt and A4 printers of this terminal, silent/auto printing, paper, copies and a test print. */
export default function PrinterSection() {
  const t = useT();
  const printer = useDeviceGroup('printer');
  const desktop = hasElectronAPI();
  const printers = useAsync(() => listPrinters(), []);
  const [testing, setTesting] = useState(false);
  // autoPrint is the older combined flag (silent + after every sale); it is folded into the two switches below.
  const silent = !printer.showPreview || printer.autoPrint;
  const afterSale = printer.printAfterSale || printer.autoPrint;

  const options = (selected: string) => {
    const list: PrinterInfo[] = printers.data ?? [];
    const entries = [{ value: '', label: t('print.defaultPrinter') }, ...list.map((entry) => ({ value: entry.name, label: entry.isDefault ? `${entry.displayName} · ${t('settings.printer.defaultBadge')}` : entry.displayName }))];
    if (selected && !list.some((entry) => entry.name === selected)) entries.push({ value: selected, label: selected });
    return entries;
  };

  const testPrint = async () => {
    setTesting(true);
    try {
      const request = await buildTestReceipt(printer.receiptPrinter);
      const result = await sendToPrinter(request, { printerName: printer.receiptPrinter, copies: 1 });
      const message = printResultMessage(result);
      if (result.outcome === 'printed' || result.outcome === 'saved-pdf') toast.success({ text: message });
      else toast.error({ text: message });
    } catch (error) {
      toast.fromError(error);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        icon={Printer}
        title={t('settings.printer.printers')}
        description={t('settings.printer.printersHint')}
        action={
          desktop && (
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={printers.loading} onClick={printers.reload}>
              {t('settings.printer.refresh')}
            </Button>
          )
        }
      >
        <SettingRow anchor="receiptPrinter" label={t('settings.printer.receiptPrinter')} description={t('settings.printer.receiptPrinterHint')}>
          {(id) => (
            <div className="w-72">
              <Select id={id} value={printer.receiptPrinter} options={options(printer.receiptPrinter)} onChange={(receiptPrinter) => saveDevice({ printer: { receiptPrinter } })} />
            </div>
          )}
        </SettingRow>
        <SettingRow anchor="a4Printer" label={t('settings.printer.a4Printer')} description={t('settings.printer.a4PrinterHint')}>
          {(id) => (
            <div className="w-72">
              <Select id={id} value={printer.a4Printer} options={options(printer.a4Printer)} onChange={(a4Printer) => saveDevice({ printer: { a4Printer, reportPrinter: a4Printer } })} />
            </div>
          )}
        </SettingRow>
        {(!desktop || (printers.data && printers.data.length === 0)) && (
          <SettingBlock>
            <Note tone="warning">{desktop ? t('settings.printer.noPrinters') : t('settings.printer.desktopOnly')}</Note>
          </SettingBlock>
        )}
      </SettingsCard>

      <SettingsCard icon={Settings2} title={t('settings.printer.printing')} description={t('settings.printer.printingHint')}>
        <SwitchRow
          anchor="silentPrint"
          label={t('settings.printer.silent')}
          description={t('settings.printer.silentHint')}
          checked={silent}
          onChange={(value) => saveDevice({ printer: { showPreview: !value, printAfterSale: afterSale, autoPrint: false } })}
        />
        <SwitchRow
          anchor="autoPrint"
          label={t('settings.printer.autoPrint')}
          description={t('settings.printer.autoPrintHint')}
          checked={afterSale}
          onChange={(value) => saveDevice({ printer: { printAfterSale: value, showPreview: !silent, autoPrint: false } })}
        />
        <SettingRow anchor="printerPaper" label={t('settings.printer.paperWidth')}>
          <SegmentedControl ariaLabel={t('settings.printer.paperWidth')} value={printer.paperWidth} options={PAPERS.map((value) => ({ value, label: t(`enums.paperWidth.${value}`) }))} onChange={(paperWidth) => saveDevice({ printer: { paperWidth } })} />
        </SettingRow>
        <SettingRow anchor="printerCopies" label={t('settings.printer.copies')}>
          {(id) => <NumberInput id={id} value={printer.copies} min={1} max={5} suffix={t('settings.units.copies')} className="w-36" onCommit={(copies) => saveDevice({ printer: { copies } })} />}
        </SettingRow>
      </SettingsCard>

      <SettingsCard icon={ScrollText} title={t('settings.printer.test')}>
        <SettingRow anchor="testPrint" label={t('settings.printer.testButton')} description={t('settings.printer.testHint')}>
          <Button variant="primary" icon={Printer} loading={testing} onClick={() => void testPrint()}>
            {t('settings.printer.test')}
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
