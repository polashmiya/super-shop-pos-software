import { useCallback, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Ban, CalendarClock, EllipsisVertical, FileQuestion, HandCoins, NotebookPen, PackageCheck, Pencil, Printer, Send, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { toLocalDate } from '@/domain/dates';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { useCan } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Badge, Card, DefinitionList, Meter, PageHeader, SectionHeader } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { PaymentsCard, ReceiptsCard } from '@/features/purchases/PurchaseActivityCards';
import { PurchaseStatusBadge } from '@/features/purchases/PurchaseBits';
import {
  canCancelPurchase,
  canEditPurchase,
  canMarkOrdered,
  canPayPurchase,
  canReceivePurchase,
  cancelPurchaseWithConfirm,
  localDate,
  markPurchaseOrdered,
  printPurchaseOrder,
  purchaseDue,
} from '@/features/purchases/purchaseHelpers';
import { PurchaseItemsCard } from '@/features/purchases/PurchaseItemsCard';
import { ReceiveDialog } from '@/features/purchases/ReceiveDialog';
import { SupplierPaymentDialog } from '@/features/suppliers/SupplierPaymentDialog';

/* ==========================================================================
   Purchase order detail: items with receiving progress, totals, goods
   receipts (GRN), payments and every action allowed in the current status.
   ?receive=1 opens the receiving dialog (from the purchase list).
   ========================================================================== */

export default function PurchaseDetailPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const { purchaseId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = useCan('purchases.manage');
  const canReceive = useCan('purchases.receive');
  const canPay = useCan('suppliers.manage');
  const canViewSuppliers = useCan('suppliers.view');
  const [payOpen, setPayOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [today] = useState(() => toLocalDate(new Date()));

  const data = useAsync(async () => {
    const purchase = await purchaseService.getById(purchaseId);
    if (!purchase) return null;
    const [supplier, payments] = await Promise.all([supplierService.getById(purchase.supplierId), supplierService.payments(purchase.supplierId)]);
    return { purchase, supplier, payments: payments.filter((payment) => payment.purchaseId === purchase.id) };
  }, [purchaseId]);

  const setReceiveOpen = useCallback(
    (open: boolean) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (open) next.set('receive', '1');
          else next.delete('receive');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const shell = (title: ReactNode, body: ReactNode, actions?: ReactNode, description?: ReactNode) => (
    <div className="flex h-full flex-col">
      <PageHeader icon={ShoppingCart} title={title} description={description} actions={actions} breadcrumb={[{ label: t('nav.purchases'), to: '/purchases' }, { label: typeof title === 'string' ? title : t('inventory.purchaseDetail.title') }]} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
    </div>
  );

  if (data.error && !data.data) return shell(t('inventory.purchaseDetail.title'), <ErrorState title={t('errors.loadFailed')} action={<Button onClick={data.reload}>{t('common.actions.retry')}</Button>} />);
  if (data.data === undefined)
    return shell(
      t('inventory.purchaseDetail.title'),
      <div className="flex flex-col gap-5" aria-busy>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>,
    );
  if (data.data === null)
    return shell(
      t('inventory.purchaseDetail.title'),
      <EmptyState icon={FileQuestion} title={t('inventory.purchaseDetail.notFound')} description={t('inventory.purchaseDetail.notFoundHint')} action={<Button onClick={() => navigate('/purchases')}>{t('inventory.purchaseDetail.back')}</Button>} />,
    );

  const { purchase, supplier, payments } = data.data;
  const due = purchaseDue(purchase);
  const receivable = canReceive && canReceivePurchase(purchase);
  const payable = canPay && canPayPurchase(purchase);
  const overdue = Boolean(purchase.expectedDate && purchase.expectedDate < today && (purchase.status === 'ordered' || purchase.status === 'partially_received'));
  const paidShare = purchase.grandTotal > 0 ? purchase.paidAmount / purchase.grandTotal : 0;

  const run = async (action: () => Promise<boolean>) => {
    if (await action()) data.reload();
  };
  const print = async () => {
    setPrinting(true);
    await printPurchaseOrder(purchase, supplier);
    setPrinting(false);
  };

  const moreItems: Array<MenuItem | 'separator'> = [];
  if (canManage && canEditPurchase(purchase)) moreItems.push({ key: 'edit', label: t('common.actions.edit'), icon: Pencil, onSelect: () => navigate(`/purchases/${purchase.id}/edit`) });
  if (receivable && purchase.status === 'draft') moreItems.push({ key: 'receive', label: t('inventory.purchases.actions.receive'), icon: PackageCheck, onSelect: () => setReceiveOpen(true) });
  if (canManage && canCancelPurchase(purchase)) {
    if (moreItems.length > 0) moreItems.push('separator');
    moreItems.push({ key: 'cancel', label: t('inventory.purchases.actions.cancel'), icon: Ban, danger: true, onSelect: () => void run(() => cancelPurchaseWithConfirm(purchase)) });
  }

  const actions = (
    <>
      <Button icon={Printer} loading={printing} onClick={() => void print()}>
        {t('inventory.purchaseDetail.printPo')}
      </Button>
      {payable && (
        <Button icon={HandCoins} onClick={() => setPayOpen(true)}>
          {t('inventory.purchaseDetail.recordPayment')}
        </Button>
      )}
      {canManage && canMarkOrdered(purchase) ? (
        <Button variant="primary" icon={Send} onClick={() => void run(() => markPurchaseOrdered(purchase))}>
          {t('inventory.purchases.actions.markOrdered')}
        </Button>
      ) : receivable ? (
        <Button variant="primary" icon={PackageCheck} onClick={() => setReceiveOpen(true)}>
          {t('inventory.purchases.actions.receive')}
        </Button>
      ) : null}
      {moreItems.length > 0 && <DropdownMenu width={220} items={moreItems} trigger={(props) => <IconButton {...props} variant="secondary" icon={EllipsisVertical} label={t('common.actions.more')} />} />}
    </>
  );

  const title = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="truncate font-mono">{purchase.poNo}</span>
      <PurchaseStatusBadge status={purchase.status} size="md" />
    </span>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ShoppingCart}
        title={title}
        description={t('inventory.purchaseDetail.subtitle', { supplier: purchase.supplierName, date: format.date(localDate(purchase.orderDate)) })}
        breadcrumb={[{ label: t('nav.purchases'), to: '/purchases' }, { label: purchase.poNo }]}
        actions={actions}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <SectionHeader icon={Truck} title={t('common.labels.supplier')} />
              <div className="mt-3 flex flex-col gap-1">
                {canViewSuppliers ? (
                  <Link to={`/suppliers/${purchase.supplierId}`} className="type-h3 w-fit rounded-sm text-fg hover:text-primary hover:underline">
                    {purchase.supplierName}
                  </Link>
                ) : (
                  <p className="type-h3 text-fg">{purchase.supplierName}</p>
                )}
                {supplier?.company && <p className="type-body-sm text-fg-muted">{supplier.company}</p>}
                {supplier && (supplier.contactPerson || supplier.phone) && (
                  <p className="type-body-sm text-fg-muted">{[supplier.contactPerson, supplier.phone ? format.digits(supplier.phone) : ''].filter(Boolean).join(' · ')}</p>
                )}
                {supplier?.address && <p className="type-caption text-fg-subtle">{supplier.address}</p>}
              </div>
            </Card>
            <Card>
              <SectionHeader
                icon={CalendarClock}
                title={t('inventory.purchaseDetail.dates')}
                action={overdue ? <Badge tone="warning" icon={CalendarClock} size="sm">{t('inventory.purchaseDetail.overdue')}</Badge> : undefined}
              />
              <div className="mt-3">
                <DefinitionList
                  items={[
                    { label: t('inventory.purchaseDetail.orderDate'), value: format.date(localDate(purchase.orderDate)) },
                    { label: t('inventory.purchaseDetail.expectedDate'), value: purchase.expectedDate ? format.date(localDate(purchase.expectedDate)) : '—' },
                    { label: t('inventory.purchaseDetail.lastReceived'), value: purchase.receivedAt ? format.dateTime(purchase.receivedAt) : '—' },
                    { label: t('common.labels.createdBy'), value: purchase.createdByName ?? '—' },
                  ]}
                />
              </div>
            </Card>
            <Card>
              <SectionHeader icon={Wallet} title={t('inventory.purchaseDetail.payment')} />
              <div className="mt-3 flex flex-col gap-3">
                <div>
                  <p className="type-caption text-fg-subtle">{t('inventory.purchaseDetail.grandTotal')}</p>
                  <p className="text-2xl font-bold text-fg tnum">{format.money(purchase.grandTotal)}</p>
                </div>
                <Meter value={paidShare} tone={paidShare >= 1 ? 'success' : 'primary'} label={t('inventory.shared.paid')} className="h-2" />
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-fg-muted">
                    {t('inventory.shared.paid')} <span className="font-semibold text-success-text tnum">{format.money(purchase.paidAmount)}</span>
                  </span>
                  {purchase.status !== 'cancelled' &&
                    (due > 0 ? (
                      <span className="text-fg-muted">
                        {t('inventory.shared.due')} <span className="font-semibold text-danger-text tnum">{format.money(due)}</span>
                      </span>
                    ) : (
                      <span className="font-semibold text-success-text">{t('inventory.purchaseDetail.fullyPaid')}</span>
                    ))}
                </div>
              </div>
            </Card>
          </div>

          <PurchaseItemsCard purchase={purchase} />

          <div className="grid gap-5 lg:grid-cols-2">
            <ReceiptsCard purchase={purchase} />
            <PaymentsCard
              payments={payments}
              action={
                payable ? (
                  <Button size="sm" icon={HandCoins} onClick={() => setPayOpen(true)}>
                    {t('inventory.purchaseDetail.recordPayment')}
                  </Button>
                ) : undefined
              }
            />
          </div>

          {purchase.note && (
            <Card>
              <SectionHeader icon={NotebookPen} title={t('common.labels.note')} />
              <p className="type-body mt-3 whitespace-pre-line text-fg-muted selectable">{purchase.note}</p>
            </Card>
          )}
        </div>
      </div>

      <ReceiveDialog purchase={purchase} open={searchParams.get('receive') === '1' && receivable} onClose={() => setReceiveOpen(false)} onReceived={data.reload} />
      <SupplierPaymentDialog open={payOpen && payable} supplier={{ id: purchase.supplierId, name: purchase.supplierName }} purchase={purchase} onClose={() => setPayOpen(false)} onPaid={data.reload} />
    </div>
  );
}
