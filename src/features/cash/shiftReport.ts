import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getFormatters } from '@/hooks/useFormat';
import { getLanguage, pick, t } from '@/i18n';
import type { ShiftActivity } from '@/repositories/types';
import { counterService, shiftActivity, shiftService } from '@/services/shiftService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { CashMovement, Counter, Shift, ShiftTotals } from '@/types';
import { buildReportDocument, openPrintPreview, type PrintRequest } from '@/features/printing/printService';
import { printFontCss } from '@/features/printing/printFonts';
import { htmlDocument, receiptCss } from '@/features/printing/printStyles';
import { providerLabelKey } from '@/features/sales/saleMeta';
import { differenceKind, splitExpenseDescription } from './cashMeta';
import { ShiftSlipDocument, type SlipLine, type SlipSection } from './ShiftSlipDocument';

/* ==========================================================================
   Shift reports: X report (interim, open shift) and Z report (closing) as an
   A4 page or a receipt slip. Both open the in-app print preview.
   ========================================================================== */

export type ShiftReportKind = 'a4' | 'slip';

interface ReportData {
  shift: Shift;
  totals: ShiftTotals;
  movements: CashMovement[];
  activity: ShiftActivity;
  counterLabel: string;
}

async function loadReportData(shift: Shift): Promise<ReportData> {
  const [withTotals, movements, activity, counters] = await Promise.all([
    shiftService.withTotals(shift),
    shiftService.cashMovements(shift.id),
    shiftActivity(shift.id),
    counterService.list().catch(() => [] as Counter[]),
  ]);
  const counter = counters.find((entry) => entry.id === shift.counterId);
  return { shift: withTotals, totals: withTotals.totals, movements, activity, counterLabel: counter ? `${counter.code} · ${pick(counter.name, getLanguage())}` : shift.counterName };
}

interface ReportContent {
  title: string;
  subtitle: string;
  kpis: SlipLine[];
  reconciliation: SlipLine[];
  payments: Array<SlipLine & { count: number }>;
  paymentsTotal: number;
  activity: SlipLine[];
  movements: Array<{ time: string; type: string; reference: string; note: string; by: string; amount: string }>;
}

function buildContent({ shift, totals, movements, activity, counterLabel }: ReportData): ReportContent {
  const format = getFormatters();
  const money = (value: number) => format.money(value);
  const actual = shift.actualCash;
  const difference = actual !== null ? actual - totals.expectedCash : null;
  const kind = difference !== null ? differenceKind(difference) : null;
  const differenceText =
    difference === null ? '—' : kind === 'balanced' ? t('cash.common.balanced') : t(kind === 'over' ? 'cash.common.over' : 'cash.common.short', { amount: money(Math.abs(difference)) });
  const title = shift.status === 'open' ? t('cash.report.titleX', { shift: shift.shiftNo }) : t('cash.report.titleZ', { shift: shift.shiftNo });
  const range = t('cash.report.range', { from: format.dateTime(shift.openedAt), to: shift.closedAt ? format.dateTime(shift.closedAt) : t('cash.common.stillOpen') });
  const payments = [...activity.payments]
    .sort((a, b) => b.amount - a.amount)
    .map((row) => {
      const providerKey = providerLabelKey(row.method, row.provider);
      const label = `${t(`enums.paymentMethod.${row.method}`)}${providerKey ? ` · ${t(providerKey)}` : ''}`;
      return { label, value: money(row.amount), count: row.count };
    });
  return {
    title,
    subtitle: `${counterLabel} · ${shift.openedByName} · ${range}`,
    kpis: [
      { label: t('cash.common.expectedCash'), value: money(totals.expectedCash) },
      { label: t('cash.common.countedCash'), value: actual !== null ? money(actual) : '—' },
      { label: t('cash.common.difference'), value: differenceText },
      { label: t('cash.common.grossSales'), value: money(totals.grossSales) },
    ],
    reconciliation: [
      { label: t('cash.common.openingCash'), value: money(totals.openingCash) },
      { label: t('cash.common.cashSales'), value: format.money(totals.cashSales, { signed: true }) },
      { label: t('cash.common.cashRefunds'), value: money(-totals.cashRefunds) },
      { label: t('cash.common.cashIn'), value: format.money(totals.cashIn, { signed: true }) },
      { label: t('cash.common.cashOut'), value: money(-totals.cashOut) },
      { label: t('cash.common.drawerExpenses'), value: money(-totals.expensesTotal) },
      { label: t('cash.common.expectedCash'), value: money(totals.expectedCash), strong: true },
      ...(actual !== null
        ? [
            { label: t('cash.common.countedCash'), value: money(actual), strong: true },
            { label: t('cash.common.difference'), value: differenceText, strong: true },
          ]
        : []),
    ],
    payments,
    paymentsTotal: activity.payments.reduce((sum, row) => sum + row.amount, 0),
    activity: [
      { label: t('cash.common.sales'), value: format.integer(activity.salesCount) },
      { label: t('cash.common.itemsSold'), value: format.quantity(activity.itemsSold) },
      { label: t('cash.common.grossSales'), value: money(totals.grossSales) },
      { label: t('cash.common.discounts'), value: money(totals.discountTotal) },
      { label: t('common.labels.vat'), value: money(totals.taxTotal) },
      { label: t('cash.common.returns'), value: format.integer(activity.returnsCount) },
      { label: t('cash.common.refundsAll'), value: money(totals.returnsTotal) },
      { label: t('cash.common.cancelled'), value: format.integer(activity.cancelledCount) },
    ],
    movements: movements
      .filter((row) => row.type === 'cash_in' || row.type === 'cash_out' || row.type === 'refund' || row.type === 'expense')
      .map((row) => ({
        time: format.time(row.createdAt),
        type: t(`enums.cashMovement.${row.type}`),
        reference: row.referenceNo ?? '',
        note: row.type === 'expense' ? splitExpenseDescription(row.note).note : row.note,
        by: row.userName ?? '',
        amount: format.money(row.amount, { signed: true }),
      })),
  };
}

async function buildA4(data: ReportData, content: ReportContent): Promise<PrintRequest> {
  const format = getFormatters();
  const signatureSpace = createElement('div', { style: { height: 40 } });
  return buildReportDocument({
    title: content.title,
    subtitle: content.subtitle,
    kpis: content.kpis,
    sections: [
      { title: t('cash.report.reconciliation'), headers: [t('cash.common.item'), t('cash.common.value')], numeric: [false, true], rows: content.reconciliation.map((line) => [line.label, line.value]) },
      {
        title: t('cash.report.payments'),
        headers: [t('common.labels.method'), t('cash.common.count'), t('cash.common.value')],
        numeric: [false, true, true],
        rows: content.payments.map((line) => [line.label, format.integer(line.count), line.value]),
        totals: [t('common.labels.total'), '', format.money(content.paymentsTotal)],
      },
      { title: t('cash.report.activity'), headers: [t('cash.common.item'), t('cash.common.value')], numeric: [false, true], rows: content.activity.map((line) => [line.label, line.value]) },
      {
        title: t('cash.report.movements'),
        headers: [t('common.labels.time'), t('common.labels.type'), t('common.labels.reference'), t('common.labels.note'), t('cash.common.by'), t('common.labels.amount')],
        numeric: [false, false, false, false, false, true],
        rows: content.movements.length > 0 ? content.movements.map((row) => [row.time, row.type, row.reference, row.note, row.by, row.amount]) : [[t('cash.report.noMovements'), '', '', '', '', '']],
      },
      ...(data.shift.note ? [{ title: t('cash.report.note'), headers: [t('cash.report.note')], numeric: [false], rows: [[data.shift.note]] }] : []),
      { headers: [t('cash.report.signatureCashier'), t('cash.report.signatureManager')], numeric: [false, false], rows: [[signatureSpace, signatureSpace]] },
    ],
    fileName: `${data.shift.shiftNo}-${data.shift.status === 'open' ? 'x' : 'z'}-report.pdf`,
  });
}

async function buildSlip(data: ReportData, content: ReportContent): Promise<PrintRequest> {
  const { business, device } = useSettingsStore.getState();
  const format = getFormatters();
  const paperWidth = device.printer.paperWidth;
  const sections: SlipSection[] = [
    { title: t('cash.report.reconciliation'), lines: content.reconciliation },
    {
      title: t('cash.report.payments'),
      lines: content.payments.length > 0 ? [...content.payments, { label: t('common.labels.total'), value: format.money(content.paymentsTotal), strong: true }] : [{ label: t('cash.breakdown.paymentsEmpty'), value: '' }],
    },
    { title: t('cash.report.activity'), lines: content.activity },
    {
      title: t('cash.report.movements'),
      lines: content.movements.length > 0 ? content.movements.map((row) => ({ label: `${row.time} ${row.type}${row.reference ? ` ${row.reference}` : ''}`, value: row.amount })) : [{ label: t('cash.report.noMovements'), value: '' }],
    },
  ];
  const body = renderToStaticMarkup(
    createElement(ShiftSlipDocument, {
      storeName: getLanguage() === 'bn' ? business.store.nameBn : business.store.nameEn,
      title: content.title,
      meta: [
        { label: t('common.labels.counter'), value: data.counterLabel },
        { label: t('cash.common.openedBy'), value: data.shift.openedByName },
        { label: t('cash.common.openedAt'), value: format.dateTime(data.shift.openedAt) },
        { label: t('cash.common.closedAt'), value: data.shift.closedAt ? format.dateTime(data.shift.closedAt) : t('cash.common.stillOpen') },
        ...(data.shift.closedByName ? [{ label: t('cash.common.closedBy'), value: data.shift.closedByName }] : []),
      ],
      sections,
      note: data.shift.note || null,
      noteLabel: t('cash.report.note'),
      signatures: [t('cash.report.signatureCashier'), t('cash.report.signatureManager')],
      printedAt: t('cash.report.printedAt', { time: format.dateTime(new Date()) }),
    }),
  );
  const fontCss = await printFontCss();
  return { kind: 'receipt', title: content.title, html: htmlDocument(content.title, receiptCss(paperWidth), body, fontCss), page: 'receipt', paperWidth, fileName: `${data.shift.shiftNo}-slip.pdf` };
}

/** Builds the X / Z report of a shift and opens the print preview. Failures show a friendly toast. */
export async function printShiftReport(shift: Shift, kind: ShiftReportKind): Promise<void> {
  try {
    const data = await loadReportData(shift);
    const content = buildContent(data);
    const request = kind === 'a4' ? await buildA4(data, content) : await buildSlip(data, content);
    await openPrintPreview(request);
  } catch (error) {
    console.error('Shift report failed', error);
    toast.error('cash.common.printFailed');
  }
}
