import { useEffect, useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useLanguage, useT } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { Skeleton } from '@/components/ui/States';
import { buildReceiptPreview, pickSampleProducts } from '../receiptPreview';

const MM_TO_PX = 96 / 25.4;
const REBUILD_DELAY_MS = 180;

/** Live, exact receipt preview (iframe srcDoc) that follows every receipt/store/tax/currency setting. */
export function ReceiptPreview() {
  const t = useT();
  const uiLanguage = useLanguage();
  const business = useSettingsStore((state) => state.business);
  const device = useSettingsStore((state) => state.device);
  const products = useCatalogStore((state) => state.products);
  const unitById = useCatalogStore((state) => state.unitById);
  const user = useAuthStore((state) => state.user);
  const counter = useShiftStore((state) => state.counter);
  const [html, setHtml] = useState<string | null>(null);
  const [height, setHeight] = useState(560);

  const sample = useMemo(() => pickSampleProducts(products), [products]);
  const language = business.receipt.language === 'sale' ? uiLanguage : business.receipt.language;
  const cashierName = user ? (language === 'bn' ? user.name.bn || user.name.en : user.name.en || user.name.bn) : '';
  const counterName = counter ? (language === 'bn' ? counter.name.bn || counter.name.en : counter.name.en || counter.name.bn) : '';
  const widthPx = Math.round(APP_CONFIG.print.paper[device.printer.paperWidth].paperMm * MM_TO_PX);

  useEffect(() => {
    if (sample.length === 0) return;
    let active = true;
    const timer = setTimeout(() => {
      buildReceiptPreview({ business, device, language, products: sample, unitById, cashierName, counterName })
        .then((result) => {
          if (active) setHtml(result);
        })
        .catch((error: unknown) => console.error('Building the receipt preview failed', error));
    }, REBUILD_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [business, device, language, sample, unitById, cashierName, counterName]);

  if (sample.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong p-6 text-center">
        <ReceiptText size={24} aria-hidden className="text-fg-subtle" />
        <p className="type-body-sm text-fg-muted">{t('settings.receipt.previewEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center rounded-lg bg-surface-3 p-4">
      {html ? (
        <iframe
          title={t('settings.receipt.preview')}
          srcDoc={html}
          sandbox="allow-same-origin"
          tabIndex={-1}
          onLoad={(event) => {
            const documentHeight = event.currentTarget.contentDocument?.documentElement.scrollHeight;
            if (documentHeight) setHeight(documentHeight + 8);
          }}
          className="shrink-0 rounded-sm bg-white shadow-lg"
          style={{ width: widthPx, height, border: 0 }}
        />
      ) : (
        <div style={{ width: widthPx }} className="shrink-0">
          <Skeleton className="h-[34rem] w-full" />
        </div>
      )}
    </div>
  );
}
