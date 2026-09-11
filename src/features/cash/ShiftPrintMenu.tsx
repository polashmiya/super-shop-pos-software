import { useState } from 'react';
import { ChevronDown, FileText, Printer, ReceiptText } from 'lucide-react';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Shift } from '@/types';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/Menu';
import { printShiftReport, type ShiftReportKind } from './shiftReport';

interface ShiftPrintMenuProps {
  shift: Shift;
  variant?: ButtonVariant;
  /** Button text (defaults to "Print X report" / "Print shift report"). */
  label?: string;
}

/** Print the X (open) or Z (closed) shift report as an A4 page or a receipt slip. */
export function ShiftPrintMenu({ shift, variant = 'secondary', label }: ShiftPrintMenuProps) {
  const t = useT();
  const paperWidth = useSettingsStore((state) => state.device.printer.paperWidth);
  const [busy, setBusy] = useState(false);

  const run = async (kind: ShiftReportKind) => {
    setBusy(true);
    await printShiftReport(shift, kind);
    setBusy(false);
  };

  return (
    <DropdownMenu
      width={260}
      trigger={(props) => (
        <Button {...props} variant={variant} icon={Printer} iconRight={ChevronDown} loading={busy}>
          {label ?? (shift.status === 'open' ? t('cash.shift.printX') : t('cash.common.printMenu'))}
        </Button>
      )}
      items={[
        { key: 'a4', label: t('cash.common.printA4'), icon: FileText, onSelect: () => void run('a4') },
        { key: 'slip', label: t('cash.common.printSlip', { paper: t(`enums.paperWidth.${paperWidth}`) }), icon: ReceiptText, onSelect: () => void run('slip') },
      ]}
    />
  );
}
