import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Ban, FileText, Printer, ReceiptText, RotateCcw, SearchX } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { returnPolicy } from '@/services/returnService';
import { canCancel } from '@/services/saleService';
import { useCan } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Tooltip } from '@/components/ui/Tooltip';
import { CancelSaleDialog } from '@/features/sales/CancelSaleDialog';
import { ReturnDialog } from '@/features/sales/ReturnDialog';
import { SaleActivity } from '@/features/sales/SaleActivity';
import { SaleStatusBadge } from '@/features/sales/SaleBadges';
import { SaleInfoTiles, SaleStatusBanner } from '@/features/sales/SaleInfoTiles';
import { SaleItemsTable } from '@/features/sales/SaleItemsTable';
import { SalePaymentsTable } from '@/features/sales/SalePaymentsTable';
import { SaleReceiptPreview } from '@/features/sales/SaleReceiptPreview';
import { SaleReturnsHistory } from '@/features/sales/SaleReturnsHistory';
import { SaleTotalsCard } from '@/features/sales/SaleTotalsCard';
import { printInvoice, reprintReceipt } from '@/features/sales/saleActions';
import { loadSaleDetail, loadStaffDirectory, type SaleDetailBundle, type StaffDirectory } from '@/features/sales/saleData';

/* ==========================================================================
   One sale: who/where/when, items, totals, payments, returns and the audit
   trail, with the receipt preview on wide screens. The sale itself is
   read-only; actions are reprint, A4 invoice, return and cancel.
   ========================================================================== */

const WIDE_QUERY = '(min-width: 96rem)';

function subscribeWide(callback: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/** Disabled buttons get no pointer events, so the explanation lives on a focusable wrapper. */
function WithReason({ reason, children }: { reason: string | null; children: ReactElement<Record<string, unknown>> }) {
  if (!reason) return children;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="rounded-md">
        {children}
      </span>
    </Tooltip>
  );
}

export default function SaleDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { saleId = '' } = useParams();
  const backTo = (location.state as { from?: string } | null)?.from ?? '/sales';
  const detail = useAsync(() => loadSaleDetail(saleId), [saleId]);
  const directory = useAsync(() => loadStaffDirectory(), []);
  const breadcrumb = [{ label: t('nav.sales'), to: backTo }];

  if (detail.data) return <SaleDetailView bundle={detail.data} directory={directory.data} backTo={backTo} onChanged={detail.reload} />;

  if (detail.data === null || detail.error) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={ReceiptText} title={t('sales.detail.title')} breadcrumb={breadcrumb} />
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {detail.error ? (
            <ErrorState title={t('errors.loadFailed')} action={<Button onClick={detail.reload}>{t('common.actions.retry')}</Button>} />
          ) : (
            <EmptyState
              icon={SearchX}
              title={t('sales.detail.notFound')}
              description={t('sales.detail.notFoundHint')}
              action={
                <Button icon={ArrowLeft} onClick={() => navigate(backTo)}>
                  {t('sales.detail.backToSales')}
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" aria-busy>
      <PageHeader icon={ReceiptText} title={<Skeleton className="h-7 w-64" />} breadcrumb={breadcrumb} />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

interface SaleDetailViewProps {
  bundle: SaleDetailBundle;
  directory: StaffDirectory | undefined;
  backTo: string;
  onChanged: () => void;
}

function SaleDetailView({ bundle, directory, backTo, onChanged }: SaleDetailViewProps) {
  const t = useT();
  const format = useFormat();
  const wide = useWideScreen();
  const canReprint = useCan('sales.reprint');
  const { sale, shift } = bundle;
  const [dialog, setDialog] = useState<'return' | 'cancel' | null>(null);
  const [printing, setPrinting] = useState<'receipt' | 'invoice' | null>(null);
  const [activityTick, setActivityTick] = useState(0);

  const policy = returnPolicy(sale);
  const cancelCheck = canCancel(sale);
  const version = `${sale.status}:${sale.updatedAt}:${sale.returns.length}`;
  const showReturn = policy.returnable || policy.reason === 'windowExpired';
  const showCancel = sale.status === 'completed' && cancelCheck.reason !== 'disabled';

  const reprint = async () => {
    setPrinting('receipt');
    const printed = await reprintReceipt(sale);
    setPrinting(null);
    if (printed) setActivityTick((value) => value + 1);
  };

  const invoice = async () => {
    setPrinting('invoice');
    await printInvoice(sale);
    setPrinting(null);
  };

  const completed = () => {
    setDialog(null);
    onChanged();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ReceiptText}
        breadcrumb={[{ label: t('nav.sales'), to: backTo }, { label: sale.invoiceNo }]}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span className="selectable truncate font-mono">{sale.invoiceNo}</span>
            <SaleStatusBadge status={sale.status} />
          </span>
        }
        description={`${format.date(sale.createdAt, 'long')} · ${format.time(sale.createdAt)}`}
        actions={
          <>
            {canReprint && (
              <>
                <Button icon={Printer} loading={printing === 'receipt'} disabled={printing !== null} onClick={() => void reprint()}>
                  {t('sales.actions.printReceipt')}
                </Button>
                <Button icon={FileText} loading={printing === 'invoice'} disabled={printing !== null} onClick={() => void invoice()}>
                  {t('sales.actions.printInvoice')}
                </Button>
              </>
            )}
            {showReturn && (
              <WithReason reason={policy.returnable ? null : t('sales.returnDialog.blocked.windowExpiredShort')}>
                <Button variant="soft" icon={RotateCcw} disabled={!policy.returnable} onClick={() => setDialog('return')}>
                  {t('sales.actions.return')}
                </Button>
              </WithReason>
            )}
            {showCancel && (
              <WithReason reason={cancelCheck.allowed ? null : t('sales.cancel.blocked.windowExpiredShort')}>
                <Button variant="outline" icon={Ban} disabled={!cancelCheck.allowed} onClick={() => setDialog('cancel')}>
                  {t('sales.actions.cancel')}
                </Button>
              </WithReason>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-5' : 'flex flex-col gap-5'}>
          <div className="flex min-w-0 flex-col gap-5">
            <SaleStatusBanner sale={sale} />
            <SaleInfoTiles sale={sale} shift={shift} directory={directory} />
            <SaleItemsTable sale={sale} />
            {wide ? (
              <SalePaymentsTable payments={sale.payments} />
            ) : (
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <SaleTotalsCard sale={sale} />
                <SalePaymentsTable payments={sale.payments} />
              </div>
            )}
            <SaleReturnsHistory returns={sale.returns} />
            <SaleActivity saleId={sale.id} version={`${version}:${activityTick}`} />
          </div>
          {wide && (
            <aside className="flex flex-col gap-5" aria-label={t('sales.detail.receipt.title')}>
              <SaleTotalsCard sale={sale} />
              <SaleReceiptPreview sale={sale} version={version} />
            </aside>
          )}
        </div>
      </div>

      {dialog === 'return' && <ReturnDialog sale={sale} onClose={() => setDialog(null)} onCompleted={completed} />}
      {dialog === 'cancel' && <CancelSaleDialog sale={sale} onClose={() => setDialog(null)} onCompleted={completed} />}
    </div>
  );
}
