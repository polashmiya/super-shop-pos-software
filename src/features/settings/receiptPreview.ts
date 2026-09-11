import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePointsEarned } from '@/domain/loyalty';
import { calculateCartTotals, type PricingLine } from '@/domain/pricing';
import { toCompactDate } from '@/domain/dates';
import { tIn } from '@/i18n';
import { printFontCss } from '@/features/printing/printFonts';
import { receiptLogoMarkup } from '@/features/printing/printService';
import { htmlDocument, receiptCss } from '@/features/printing/printStyles';
import { ReceiptDocument } from '@/features/printing/ReceiptDocument';
import type { BusinessSettings, DeviceSettings, Language, Product, SaleDetail, SaleItem, Unit } from '@/types';

/* ==========================================================================
   Live receipt preview for Settings → Receipt: a realistic sample sale made
   from real catalogue products, priced with the real pricing engine and
   rendered with the same ReceiptDocument that prints — so the preview shows
   exactly what the current settings will print.
   ========================================================================== */

const QUANTITIES = [2, 1, 1];
const SAMPLE_POINTS_BALANCE = 250;

/** Up to three active products spread across the catalogue (stable between renders). */
export function pickSampleProducts(products: readonly Product[]): Product[] {
  const active = products.filter((product) => product.status === 'active' && product.sellingPrice > 0);
  if (active.length <= QUANTITIES.length) return active.slice();
  const step = Math.floor(active.length / QUANTITIES.length);
  return QUANTITIES.map((_, index) => active[index * step]);
}

export interface ReceiptPreviewInput {
  business: BusinessSettings;
  device: DeviceSettings;
  language: Language;
  products: readonly Product[];
  unitById: ReadonlyMap<string, Unit>;
  cashierName: string;
  counterName: string;
}

function sampleSale(input: ReceiptPreviewInput): SaleDetail {
  const { business, language, products } = input;
  const now = new Date().toISOString();
  const lines: PricingLine[] = products.map((product, index) => ({
    lineId: `line-${index}`,
    quantity: QUANTITIES[index] ?? 1,
    unitPrice: product.sellingPrice,
    taxRate: product.taxRate,
    discount: product.discount,
    mrp: product.mrp,
  }));
  const totals = calculateCartTotals(lines, null, { taxEnabled: business.tax.enabled, taxMode: business.tax.mode, rounding: business.sales.rounding });
  const tendered = Math.ceil(totals.grandTotal / 10_000) * 10_000;
  const items: SaleItem[] = products.map((product, index) => {
    const line = totals.lines[index];
    return {
      id: `item-${index}`,
      saleId: 'preview',
      lineNo: index + 1,
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      unitId: product.unitId,
      quantity: lines[index].quantity,
      unitPrice: product.sellingPrice,
      originalPrice: product.sellingPrice,
      mrp: product.mrp,
      costPrice: product.purchasePrice,
      discountType: product.discount?.type ?? null,
      discountValue: product.discount?.value ?? 0,
      discountAmount: line.itemDiscount,
      orderDiscountAmount: line.orderDiscount,
      taxRate: product.taxRate,
      taxAmount: line.tax,
      lineSubtotal: line.subtotal,
      lineTotal: line.total,
      returnedQuantity: 0,
      note: '',
      priceOverridden: false,
    };
  });
  return {
    id: 'preview',
    invoiceNo: `${business.sales.invoicePrefix}-${toCompactDate(new Date())}-0042`,
    branchId: '',
    counterId: '',
    counterName: input.counterName,
    shiftId: null,
    cashierId: '',
    cashierName: input.cashierName,
    customerId: 'preview-customer',
    customerName: tIn(language, 'settings.receipt.sampleCustomer'),
    customerPhone: '01712345678',
    customerType: 'regular',
    status: 'completed',
    language,
    currencyCode: business.currency.code,
    itemCount: totals.itemCount,
    totalQuantity: totals.totalQuantity,
    subtotal: totals.subtotal,
    itemDiscountTotal: totals.itemDiscountTotal,
    orderDiscountTotal: totals.orderDiscountTotal,
    discountTotal: totals.discountTotal,
    discountReason: '',
    taxTotal: totals.taxTotal,
    taxMode: totals.taxMode,
    roundingAdjustment: totals.roundingAdjustment,
    grandTotal: totals.grandTotal,
    paidTotal: totals.grandTotal,
    changeDue: tendered - totals.grandTotal,
    returnedTotal: 0,
    pointsEarned: calculatePointsEarned(totals.grandTotal, business.loyalty),
    pointsRedeemed: 0,
    note: '',
    paymentSummary: 'cash',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: '',
    createdAt: now,
    updatedAt: now,
    items,
    payments: [{ id: 'payment-1', saleId: 'preview', method: 'cash', provider: null, amount: totals.grandTotal, tendered, change: tendered - totals.grandTotal, reference: '', points: 0, createdAt: now }],
    returns: [],
  };
}

/** Self-contained receipt HTML (same CSS + embedded font as printing) for an iframe srcDoc. */
export async function buildReceiptPreview(input: ReceiptPreviewInput): Promise<string> {
  const { business, device, language } = input;
  const sale = sampleSale(input);
  const paperWidth = device.printer.paperWidth;
  const body = renderToStaticMarkup(
    createElement(ReceiptDocument, {
      context: {
        sale,
        store: business.store,
        receipt: business.receipt,
        tax: business.tax,
        currency: business.currency,
        paperWidth,
        numerals: device.locale.numerals,
        clock: device.locale.clock,
        cashierName: input.cashierName,
        counterName: input.counterName,
        unitShort: (unitId: string, lang: Language) => {
          const unit = input.unitById.get(unitId);
          return unit ? (lang === 'bn' ? unit.short.bn : unit.short.en) : '';
        },
        customerPoints: business.loyalty.enabled ? SAMPLE_POINTS_BALANCE + sale.pointsEarned : null,
        membership: tIn(language, 'enums.customerType.regular'),
        reprint: false,
        logoSvg: receiptLogoMarkup(),
      },
    }),
  );
  return htmlDocument(sale.invoiceNo, receiptCss(paperWidth), body, await printFontCss());
}
