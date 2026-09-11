import { useState } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { getElectronAPI, hasElectronAPI } from '@/platform/electron';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { Modal } from '@/components/ui/Modal';
import { APP_CONFIG } from '@/config/app.config';
import { printResultMessage, saveAsPdf, sendToPrinter } from './printService';
import { usePrintStore } from './printStore';

const MM_TO_PX = 96 / 25.4;

/** In-app print preview: the exact document, printer, copies, PDF, print. */
export function PrintDialog() {
  const request = usePrintStore((state) => state.request);
  if (!request) return null;
  return <PrintDialogContent key={request.html.length + request.title} />;
}

function PrintDialogContent() {
  const t = useT();
  const request = usePrintStore((state) => state.request);
  const printer = useSettingsStore((state) => state.device.printer);
  const printers = useAsync(() => (hasElectronAPI() ? getElectronAPI().printer.getPrinters() : Promise.resolve([])), []);
  const defaultName = request?.page === 'a4' ? printer.a4Printer || printer.reportPrinter : printer.receiptPrinter;
  const [printerName, setPrinterName] = useState(defaultName);
  const [copies, setCopies] = useState(request?.kind === 'receipt' ? printer.copies : 1);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);

  if (!request) return null;

  const finish = (result: Awaited<ReturnType<typeof sendToPrinter>> | null) => {
    request.resolve(result);
    usePrintStore.setState({ request: null });
  };

  const print = async () => {
    setBusy('print');
    const result = await sendToPrinter(request, { printerName, copies });
    setBusy(null);
    if (result.outcome === 'printed' || result.outcome === 'saved-pdf') {
      toast.success({ text: printResultMessage(result) });
      finish(result);
    } else {
      toast.error({ text: printResultMessage(result) });
    }
  };

  const pdf = async () => {
    setBusy('pdf');
    try {
      const result = await saveAsPdf(request);
      if (result.ok) toast.success('print.savedPdf');
    } finally {
      setBusy(null);
    }
  };

  const widthPx = request.page === 'a4' ? 794 : Math.round(APP_CONFIG.print.paper[request.paperWidth].paperMm * MM_TO_PX);
  const printerOptions = [{ value: '', label: t('print.defaultPrinter') }, ...(printers.data ?? []).map((entry) => ({ value: entry.name, label: entry.displayName }))];

  return (
    <Modal
      open
      onClose={() => finish(null)}
      size={request.page === 'a4' ? 'xl' : 'lg'}
      title={t('print.title')}
      description={request.title}
      closeLabel={t('common.actions.close')}
      bodyClassName="p-0"
      footer={
        <>
          <Button icon={FileDown} loading={busy === 'pdf'} onClick={() => void pdf()}>
            {t('common.actions.savePdf')}
          </Button>
          <Button onClick={() => finish(null)}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" icon={Printer} loading={busy === 'print'} onClick={() => void print()} data-autofocus>
            {t('print.print')}
          </Button>
        </>
      }
    >
      <div className="flex min-h-[60vh] flex-col md:flex-row">
        <div className="flex flex-1 justify-center overflow-auto bg-surface-3 p-6">
          <iframe
            title={request.title}
            srcDoc={request.html}
            sandbox=""
            className="shrink-0 rounded-sm bg-white shadow-lg"
            style={{ width: widthPx, height: request.page === 'a4' ? 1123 : '70vh', border: 0 }}
          />
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-border p-5 md:w-72 md:border-t-0 md:border-s">
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-fg-muted">{t('print.printer')}</span>
            <Select value={printerName} options={printerOptions} onChange={setPrinterName} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-fg-muted">{t('print.copies')}</span>
            <Select value={String(copies)} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => setCopies(Number(value))} />
          </label>
          <div className="type-body-sm text-fg-subtle">
            {t('print.paper')}: {request.page === 'a4' ? 'A4' : t(`enums.paperWidth.${request.paperWidth}`)}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
