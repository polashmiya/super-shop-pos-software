import type { CSSProperties, ReactNode } from 'react';
import { tIn } from '@/i18n';
import type { CurrencySettings, Language, NumeralSystem, PaperWidth, ReceiptSettings, SaleDetail, StoreInfoSettings, TaxSettings } from '@/types';
import { code128Svg } from '@/utils/code128';
import { createFormatters } from '@/utils/format';

/* ==========================================================================
   Thermal receipt (80 mm / 58 mm). Rendered to static HTML for printing and
   shown in the preview iframe — the preview is exactly what prints.
   Text follows the SALE's language, so reprints never change language.
   ========================================================================== */

export interface ReceiptContext {
  sale: SaleDetail;
  store: StoreInfoSettings;
  receipt: ReceiptSettings;
  tax: TaxSettings;
  currency: CurrencySettings;
  paperWidth: PaperWidth;
  numerals: NumeralSystem;
  clock: '12h' | '24h';
  cashierName: string;
  counterName: string;
  unitShort: (unitId: string, language: Language) => string;
  customerPoints: number | null;
  membership: string | null;
  reprint: boolean;
  logoSvg: string;
}

const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 };

function Row({ label, value, strong, big }: { label: ReactNode; value: ReactNode; strong?: boolean; big?: boolean }) {
  return (
    <div style={{ ...rowStyle, fontWeight: strong ? 700 : 400, fontSize: big ? '1.35em' : undefined, margin: big ? '2px 0' : undefined }}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function Rule({ double }: { double?: boolean }) {
  return <div style={{ borderTop: double ? '2px solid #000' : '1px dashed #000', margin: '6px 0' }} />;
}

export function ReceiptDocument({ context }: { context: ReceiptContext }) {
  const { sale, store, receipt, currency } = context;
  const language = sale.language;
  const t = (key: Parameters<typeof tIn>[1], params?: Record<string, string | number>) => tIn(language, key, params, context.numerals);
  const format = createFormatters({ language, numerals: context.numerals, currency, clock: context.clock });
  const narrow = context.paperWidth === '58mm';
  const storeName = language === 'bn' ? store.nameBn : store.nameEn;
  const address = language === 'bn' ? store.addressBn : store.addressEn;
  const footer = language === 'bn' ? store.receiptFooterBn : store.receiptFooterEn;
  const thanks = language === 'bn' ? store.thankYouBn : store.thankYouEn;
  const headerNote = language === 'bn' ? receipt.headerNoteBn : receipt.headerNoteEn;
  const vatLabel = language === 'bn' ? context.tax.labelBn : context.tax.labelEn;
  const money = (value: number) => format.money(value, { symbol: false, decimals: 'always' });
  const methodLabel = (method: string, provider: string | null) => {
    const base = t(`enums.paymentMethod.${method as 'cash'}`);
    if (method === 'mobile' && provider) return `${base} (${t(`enums.mobileProvider.${provider as 'bkash'}`)})`;
    if (method === 'card' && provider) return `${base} (${t(`enums.cardNetwork.${provider as 'visa'}`)})`;
    return base;
  };

  return (
    <div className={`receipt ${narrow ? 'narrow' : ''}`}>
      <div className="c">
        {receipt.showLogo && <div className="logo" dangerouslySetInnerHTML={{ __html: context.logoSvg }} />}
        <div className="store">{storeName}</div>
        <div>{address}</div>
        {store.phone && <div className="num">{store.phone}</div>}
        {store.taxId && <div>{t('receipt.bin', { id: store.taxId })}</div>}
        {headerNote && <div style={{ marginTop: 4 }}>{headerNote}</div>}
        {context.reprint && <div className="strong" style={{ marginTop: 4 }}>{t('receipt.reprint')}</div>}
        {sale.status === 'cancelled' && <div className="strong" style={{ marginTop: 4 }}>{t('receipt.cancelled')}</div>}
      </div>
      <Rule />
      <Row label={t('receipt.invoice')} value={<span className="strong">{sale.invoiceNo}</span>} />
      <Row label={t('receipt.date')} value={`${format.date(sale.createdAt, 'short')} ${format.time(sale.createdAt)}`} />
      {receipt.showCashier && <Row label={t('receipt.cashier')} value={context.cashierName} />}
      {receipt.showCounter && context.counterName && <Row label={t('receipt.counter')} value={context.counterName} />}
      {sale.customerId && receipt.showCustomerName && <Row label={t('receipt.customer')} value={sale.customerName} />}
      {sale.customerId && receipt.showCustomerPhone && sale.customerPhone && <Row label={t('receipt.phone')} value={format.digits(sale.customerPhone)} />}
      {sale.customerId && receipt.showMembership && context.membership && <Row label={t('receipt.membership')} value={context.membership} />}
      <Rule />
      <div style={{ ...rowStyle, fontWeight: 700 }}>
        <span>{t('receipt.item')}</span>
        <span>{t('receipt.amount')}</span>
      </div>
      <div style={{ borderTop: '1px solid #000', margin: '3px 0 4px' }} />
      {sale.items.map((item) => {
        const unit = context.unitShort(item.unitId, language);
        const name = language === 'bn' ? item.name.bn : item.name.en;
        const discount = item.discountAmount + item.orderDiscountAmount;
        return (
          <div key={item.id} className="item">
            <div className="name">
              {name}
              {receipt.showSku && <span className="sub"> · {item.sku}</span>}
            </div>
            <div style={rowStyle}>
              <span className="num sub">
                {format.quantity(item.quantity)}
                {unit ? ` ${unit}` : ''} × {money(item.unitPrice)}
                {discount > 0 ? ` (−${money(discount)})` : ''}
              </span>
              <span className="num">{money(item.lineSubtotal - item.discountAmount)}</span>
            </div>
          </div>
        );
      })}
      <Rule />
      <div className="sub">{t('receipt.items', { count: sale.itemCount, qty: format.quantity(sale.totalQuantity) })}</div>
      <Row label={t('receipt.subtotal')} value={money(sale.subtotal)} />
      {sale.itemDiscountTotal > 0 && <Row label={t('receipt.discount')} value={`−${money(sale.itemDiscountTotal)}`} />}
      {sale.orderDiscountTotal > 0 && <Row label={`${t('receipt.discount')}${sale.discountReason ? ` (${sale.discountReason})` : ''}`} value={`−${money(sale.orderDiscountTotal)}`} />}
      {sale.taxTotal > 0 && receipt.showTaxBreakdown && <Row label={sale.taxMode === 'inclusive' ? `${vatLabel} (${t('receipt.vatIncluded')})` : vatLabel} value={money(sale.taxTotal)} />}
      {sale.roundingAdjustment !== 0 && <Row label={t('receipt.rounding')} value={money(sale.roundingAdjustment)} />}
      <Rule double />
      <Row label={t('receipt.total')} value={format.money(sale.grandTotal, { decimals: 'always' })} strong big />
      <Rule />
      {sale.payments.map((payment) => (
        <Row key={payment.id} label={methodLabel(payment.method, payment.provider)} value={money(payment.tendered)} />
      ))}
      {sale.changeDue > 0 && <Row label={t('receipt.change')} value={money(sale.changeDue)} strong />}
      {sale.returnedTotal > 0 && <Row label={t('receipt.refund')} value={`−${money(sale.returnedTotal)}`} />}
      {sale.customerId && receipt.showLoyaltyPoints && (sale.pointsEarned > 0 || context.customerPoints !== null) && (
        <>
          <Rule />
          {sale.pointsEarned > 0 && <Row label={t('receipt.pointsEarned')} value={`+${format.integer(sale.pointsEarned)}`} />}
          {context.customerPoints !== null && <Row label={t('receipt.pointsBalance')} value={format.integer(context.customerPoints)} />}
        </>
      )}
      {receipt.showSavings && sale.discountTotal > 0 && (
        <>
          <Rule />
          <div className="c strong">{t('receipt.savings', { amount: format.money(sale.discountTotal) })}</div>
        </>
      )}
      {sale.note && (
        <div className="sub" style={{ marginTop: 4 }}>
          {t('receipt.note')}: {sale.note}
        </div>
      )}
      {receipt.showBarcode && (
        <div className="c" style={{ marginTop: 8 }}>
          <div dangerouslySetInnerHTML={{ __html: code128Svg(sale.invoiceNo, narrow ? 34 : 40, narrow ? 1 : 1.25) }} />
          <div className="sub num">{sale.invoiceNo}</div>
        </div>
      )}
      <div className="c" style={{ marginTop: 8 }}>
        <div className="strong">{thanks || t('receipt.thankYou')}</div>
        {footer && <div className="sub" style={{ marginTop: 2 }}>{footer}</div>}
        <div className="sub" style={{ marginTop: 6, opacity: 0.7 }}>
          {t('receipt.poweredBy')}
        </div>
      </div>
    </div>
  );
}

/** Minimal receipt used by "Test print" in printer settings. */
export function TestReceiptDocument({ language, storeName, printerName, when }: { language: Language; storeName: string; printerName: string; when: string }) {
  return (
    <div className="receipt">
      <div className="c">
        <div className="store">{storeName}</div>
        <div className="strong" style={{ margin: '6px 0' }}>
          {tIn(language, 'receipt.testTitle')}
        </div>
        <Rule />
        <div>{tIn(language, 'receipt.testLine')}</div>
        <div className="sub" style={{ marginTop: 6 }}>
          {printerName}
        </div>
        <div className="sub num">{when}</div>
        <Rule />
        <div>অআইঈ ১২৩৪৫৬৭৮৯০ ৳ — ABC 1234567890</div>
      </div>
    </div>
  );
}
