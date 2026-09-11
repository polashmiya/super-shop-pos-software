import type { ReactNode } from 'react';
import { tIn } from '@/i18n';
import type { CurrencySettings, Language, NumeralSystem, SaleDetail, StoreInfoSettings, TaxSettings } from '@/types';
import { createFormatters } from '@/utils/format';

/* A4 documents: sale invoice and generic report print-out. */

export interface InvoiceContext {
  sale: SaleDetail;
  store: StoreInfoSettings;
  tax: TaxSettings;
  currency: CurrencySettings;
  numerals: NumeralSystem;
  cashierName: string;
  counterName: string;
  logoSvg: string;
}

export function InvoiceDocument({ context }: { context: InvoiceContext }) {
  const { sale, store } = context;
  const language: Language = sale.language;
  const t = (key: Parameters<typeof tIn>[1], params?: Record<string, string | number>) => tIn(language, key, params, context.numerals);
  const format = createFormatters({ language, numerals: context.numerals, currency: context.currency, clock: '12h' });
  const money = (value: number) => format.money(value, { decimals: 'always' });
  const vatLabel = language === 'bn' ? context.tax.labelBn : context.tax.labelEn;
  return (
    <div className="page">
      <div className="header">
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48 }} dangerouslySetInnerHTML={{ __html: context.logoSvg }} />
          <div>
            <h1>{language === 'bn' ? store.nameBn : store.nameEn}</h1>
            <div className="muted">{language === 'bn' ? store.addressBn : store.addressEn}</div>
            <div className="muted">
              {store.phone} {store.email ? `· ${store.email}` : ''}
            </div>
            {store.taxId && <div className="muted">{t('receipt.bin', { id: store.taxId })}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{t('receipt.invoice')}</div>
          <div style={{ fontWeight: 700 }}>{sale.invoiceNo}</div>
          <div className="muted">{format.dateTime(sale.createdAt)}</div>
          <div className="muted">
            {t('receipt.cashier')}: {context.cashierName}
          </div>
          {context.counterName && (
            <div className="muted">
              {t('receipt.counter')}: {context.counterName}
            </div>
          )}
        </div>
      </div>
      {sale.customerId && (
        <p>
          <strong>{t('receipt.customer')}:</strong> {sale.customerName} {sale.customerPhone ? `· ${format.digits(sale.customerPhone)}` : ''}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{t('receipt.item')}</th>
            <th className="num">{t('receipt.qty')}</th>
            <th className="num">{t('receipt.rate')}</th>
            <th className="num">{t('receipt.discount')}</th>
            <th className="num">{vatLabel}</th>
            <th className="num">{t('receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={item.id}>
              <td>{format.integer(index + 1)}</td>
              <td>
                {language === 'bn' ? item.name.bn : item.name.en}
                <div className="muted" style={{ fontSize: 10 }}>
                  {item.sku}
                </div>
              </td>
              <td className="num">{format.quantity(item.quantity)}</td>
              <td className="num">{money(item.unitPrice)}</td>
              <td className="num">{item.discountAmount + item.orderDiscountAmount > 0 ? money(item.discountAmount + item.orderDiscountAmount) : '—'}</td>
              <td className="num">{item.taxAmount > 0 ? money(item.taxAmount) : '—'}</td>
              <td className="num">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totals">
        <div className="row">
          <span>{t('receipt.subtotal')}</span>
          <span className="num">{money(sale.subtotal)}</span>
        </div>
        {sale.discountTotal > 0 && (
          <div className="row">
            <span>{t('receipt.discount')}</span>
            <span className="num">−{money(sale.discountTotal)}</span>
          </div>
        )}
        {sale.taxTotal > 0 && (
          <div className="row">
            <span>{sale.taxMode === 'inclusive' ? `${vatLabel} (${t('receipt.vatIncluded')})` : vatLabel}</span>
            <span className="num">{money(sale.taxTotal)}</span>
          </div>
        )}
        {sale.roundingAdjustment !== 0 && (
          <div className="row">
            <span>{t('receipt.rounding')}</span>
            <span className="num">{money(sale.roundingAdjustment)}</span>
          </div>
        )}
        <div className="row grand">
          <span>{t('receipt.total')}</span>
          <span className="num">{money(sale.grandTotal)}</span>
        </div>
        {sale.payments.map((payment) => (
          <div key={payment.id} className="row muted">
            <span>{t(`enums.paymentMethod.${payment.method}`)}</span>
            <span className="num">{money(payment.tendered)}</span>
          </div>
        ))}
        {sale.changeDue > 0 && (
          <div className="row muted">
            <span>{t('receipt.change')}</span>
            <span className="num">{money(sale.changeDue)}</span>
          </div>
        )}
      </div>
      <div className="footer">{language === 'bn' ? store.receiptFooterBn : store.receiptFooterEn}</div>
    </div>
  );
}

export interface ReportDocumentProps {
  storeName: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  kpis?: Array<{ label: string; value: string }>;
  sections: Array<{ title?: string; headers: string[]; numeric: boolean[]; rows: Array<Array<ReactNode>>; totals?: Array<ReactNode> }>;
  footer: string;
}

/** Generic A4 report print-out (KPIs + tables). */
export function ReportDocument({ storeName, title, subtitle, generatedAt, kpis, sections, footer }: ReportDocumentProps) {
  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="muted">{storeName}</div>
          <h1>{title}</h1>
          <div className="muted">{subtitle}</div>
        </div>
        <div className="muted" style={{ textAlign: 'right' }}>
          {generatedAt}
        </div>
      </div>
      {kpis && kpis.length > 0 && (
        <div className="kpis">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="kpi">
              <div className="label">{kpi.label}</div>
              <div className="value">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {section.title && <h2>{section.title}</h2>}
          <table>
            <thead>
              <tr>
                {section.headers.map((header, index) => (
                  <th key={index} className={section.numeric[index] ? 'num' : undefined}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} className={section.numeric[index] ? 'num' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {section.totals && (
              <tfoot>
                <tr>
                  {section.totals.map((cell, index) => (
                    <td key={index} className={section.numeric[index] ? 'num' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ))}
      <div className="footer">{footer}</div>
    </div>
  );
}
