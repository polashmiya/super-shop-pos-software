import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Calculator, ClipboardList, History, ReceiptText, Scale, TrendingUp, Wallet } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useNow } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { listSales } from '@/services/saleService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import type { Sale } from '@/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Card, DefinitionList, PageHeader, SectionHeader, StatCard } from '@/components/ui/Display';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { DifferenceValue } from '@/features/cash/CashBadges';
import { CashLedger } from '@/features/cash/CashLedger';
import { ActivityCard, PaymentsCard, ReconciliationCard, ShiftFactsCard } from '@/features/cash/ShiftCards';
import { ShiftPrintMenu } from '@/features/cash/ShiftPrintMenu';
import { counterName, formatDuration } from '@/features/cash/cashMeta';
import { loadShiftDetail } from '@/features/cash/shiftData';
import { PaymentSummaryBadge, SaleStatusBadge } from '@/features/sales/SaleBadges';

/* ==========================================================================
   One shift (/shift/:shiftId): reconciliation (expected vs counted), payment
   breakdown, activity, the drawer ledger with running balance, the sales
   of the shift and the X / Z report print-out.
   ========================================================================== */

export default function ShiftDetailPage() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const { shiftId = '' } = useParams();
  const canSeeSales = useCan('sales.view');
  const canManageCash = useCan('cash.manage');
  const blindClose = useSettingsStore((state) => state.business.shift.blindClose);
  const terminalShiftId = useShiftStore((state) => state.shift?.id ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);

  const bundle = useAsync(() => loadShiftDetail(shiftId), [shiftId]);
  const sales = useAsync(() => listSales({ shiftId, status: 'all' }, { page, pageSize }), [shiftId, page, pageSize]);

  const historyCrumbs = [
    { label: t('cash.shift.title'), to: '/shift' },
    { label: t('cash.history.title'), to: '/shift/history' },
  ];

  if (bundle.loading && !bundle.data) return <LoadingState label={t('common.states.loading')} className="h-full" />;
  const data = bundle.data;
  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={History} title={t('cash.detail.notFound')} breadcrumb={historyCrumbs} />
        <EmptyState
          icon={History}
          title={bundle.error ? t('errors.loadFailed') : t('cash.detail.notFound')}
          description={bundle.error ? undefined : t('cash.detail.notFoundHint')}
          action={bundle.error ? <Button onClick={bundle.reload}>{t('common.actions.retry')}</Button> : <Button onClick={() => navigate('/shift/history')}>{t('cash.detail.back')}</Button>}
          className="flex-1"
        />
      </div>
    );
  }

  const { shift, movements, activity, counters } = data;
  const counter = counters.find((entry) => entry.id === shift.counterId);
  const counterLabel = counter ? `${counter.code} · ${counterName(counter, language)}` : shift.counterName;
  const hidden = shift.status === 'open' && blindClose && !canManageCash;
  const difference = shift.actualCash !== null ? shift.actualCash - shift.totals.expectedCash : null;

  const columns: Array<Column<Sale>> = [
    { key: 'invoice', header: t('cash.detail.columns.invoice'), cell: (sale) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{sale.invoiceNo}</span> },
    { key: 'time', header: t('cash.detail.columns.time'), cell: (sale) => <span className="whitespace-nowrap text-fg-muted tnum">{format.time(sale.createdAt)}</span> },
    {
      key: 'customer',
      header: t('cash.detail.columns.customer'),
      cell: (sale) => (sale.customerId ? <span className="block max-w-48 truncate">{sale.customerName}</span> : <span className="text-fg-subtle">{t('common.labels.walkIn')}</span>),
    },
    { key: 'items', header: t('cash.detail.columns.items'), align: 'end', cell: (sale) => format.integer(sale.itemCount) },
    { key: 'payment', header: t('cash.detail.columns.payment'), cell: (sale) => <PaymentSummaryBadge size="sm" summary={sale.paymentSummary} /> },
    {
      key: 'total',
      header: t('cash.detail.columns.total'),
      align: 'end',
      cell: (sale) => <span className={sale.status === 'cancelled' ? 'font-semibold text-fg-subtle line-through' : 'font-semibold text-fg'}>{format.money(sale.grandTotal)}</span>,
    },
    { key: 'status', header: t('common.labels.status'), cell: (sale) => <SaleStatusBadge size="sm" status={sale.status} /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={History}
        title={t('cash.shift.heading', { shift: shift.shiftNo })}
        description={`${counterLabel} · ${shift.openedByName}`}
        breadcrumb={[...historyCrumbs, { label: shift.shiftNo }]}
        actions={
          <>
            <ShiftPrintMenu shift={shift} />
            {shift.status === 'open' && shift.id === terminalShiftId && (
              <Button variant="primary" icon={Wallet} onClick={() => navigate('/shift')}>
                {t('cash.detail.goToCashScreen')}
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <ShiftFactsCard shift={shift} counterLabel={counterLabel} cashierLabel={shift.openedByName} now={now} />

          <section aria-label={t('cash.breakdown.reconciliationTitle')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label={t('cash.common.grossSales')} value={format.money(shift.totals.grossSales)} icon={TrendingUp} tone="primary" hint={t('cash.common.salesCount', { count: shift.totals.salesCount })} />
            <StatCard label={t('cash.common.expectedCash')} value={hidden ? '—' : format.money(shift.totals.expectedCash)} icon={Calculator} tone="info" />
            <StatCard label={t('cash.common.countedCash')} value={shift.actualCash !== null ? format.money(shift.actualCash) : t('cash.common.stillOpen')} icon={Wallet} tone="neutral" />
            <StatCard label={t('cash.common.difference')} value={difference !== null ? <DifferenceValue difference={difference} className="text-[1.3rem]" /> : '—'} icon={Scale} tone="neutral" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <ReconciliationCard totals={shift.totals} actualCash={shift.actualCash} hidden={hidden} />
              <CashLedger movements={movements} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <PaymentsCard title={t('cash.breakdown.paymentsTitle')} payments={activity.payments} emptyText={t('cash.breakdown.paymentsEmpty')} />
              <ActivityCard totals={shift.totals} activity={activity} />
              <Card className="flex flex-col gap-4">
                <SectionHeader icon={ClipboardList} title={t('cash.detail.detailsTitle')} />
                <DefinitionList
                  columns={1}
                  items={[
                    { label: t('cash.common.closedBy'), value: shift.closedByName ?? t('cash.common.stillOpen') },
                    { label: t('cash.common.duration'), value: formatDuration(t, shift.openedAt, shift.closedAt ? new Date(shift.closedAt) : now) },
                    { label: t('cash.common.openingCash'), value: format.money(shift.openingCash) },
                  ]}
                />
                <div>
                  <p className="type-caption text-fg-subtle">{t('cash.report.note')}</p>
                  <p className="type-body break-words whitespace-pre-line text-fg">{shift.note || <span className="text-fg-subtle">{t('cash.detail.noNote')}</span>}</p>
                </div>
              </Card>
            </div>
          </div>

          <section aria-label={t('cash.detail.salesAria')} className="flex flex-col gap-3">
            <SectionHeader icon={ReceiptText} title={t('cash.detail.salesTitle')} />
            <DataTable
              ariaLabel={t('cash.detail.salesAria')}
              columns={columns}
              rows={sales.data?.rows ?? []}
              rowKey={(sale) => sale.id}
              loading={!sales.data && !sales.error}
              onRowClick={canSeeSales ? (sale) => navigate(`/sales/${sale.id}`) : undefined}
              pagination={
                sales.data && sales.data.total > 0
                  ? {
                      page,
                      pageSize,
                      total: sales.data.total,
                      onPageChange: setPage,
                      onPageSizeChange: (size) => {
                        setPageSize(size);
                        setPage(1);
                      },
                    }
                  : undefined
              }
              empty={
                sales.error ? (
                  <EmptyState compact icon={ReceiptText} title={t('errors.loadFailed')} action={<Button onClick={sales.reload}>{t('common.actions.retry')}</Button>} />
                ) : (
                  <EmptyState compact icon={ReceiptText} title={t('cash.detail.salesEmpty')} />
                )
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}
