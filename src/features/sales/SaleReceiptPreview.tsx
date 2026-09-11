import { ReceiptText } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { buildSaleReceipt } from '@/features/printing/printService';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SaleDetail } from '@/types';
import { Card, SectionHeader } from '@/components/ui/Display';
import { Skeleton } from '@/components/ui/States';

const MM_TO_PX = 96 / 25.4;

/** The receipt exactly as it prints (sandboxed, no scripts), for wide screens. */
export function SaleReceiptPreview({ sale, version }: { sale: SaleDetail; version: string }) {
  const t = useT();
  const paperWidth = useSettingsStore((state) => state.device.printer.paperWidth);
  const receipt = useAsync(() => buildSaleReceipt(sale).then((request) => request.html), [sale.id, version, paperWidth]);
  const widthPx = Math.round(APP_CONFIG.print.paper[paperWidth].paperMm * MM_TO_PX);

  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <SectionHeader icon={ReceiptText} title={t('sales.detail.receipt.title')} description={t(`enums.paperWidth.${paperWidth}`)} />
      </div>
      <div className="flex justify-center bg-surface-3 p-4">
        {receipt.data ? (
          <iframe
            title={t('sales.detail.receipt.frameTitle', { invoice: sale.invoiceNo })}
            srcDoc={receipt.data}
            sandbox=""
            className="h-[34rem] max-w-full shrink-0 rounded-sm bg-white shadow-md"
            style={{ width: widthPx, border: 0 }}
          />
        ) : receipt.error ? (
          <p className="py-10 text-center type-body-sm text-fg-muted">{t('errors.loadFailed')}</p>
        ) : (
          <Skeleton className="h-[34rem] w-72 max-w-full rounded-sm" />
        )}
      </div>
    </Card>
  );
}
