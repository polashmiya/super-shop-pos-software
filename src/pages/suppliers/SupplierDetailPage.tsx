import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Building2, CircleCheck, HandCoins, Mail, MapPin, NotebookPen, Package, Pencil, Phone, ShoppingCart, Truck, UserRound, Wallet, TriangleAlert } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Controls';
import { Card, PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { canPayPurchase } from '@/features/purchases/purchaseHelpers';
import { SupplierFormModal } from '@/features/suppliers/SupplierFormModal';
import { SupplierPaymentDialog } from '@/features/suppliers/SupplierPaymentDialog';
import { SupplierPaymentsTable, SupplierProductsTable, SupplierPurchasesTable } from '@/features/suppliers/SupplierTabs';
import { supplierStatusBadge } from '@/features/suppliers/supplierHelpers';

/* ==========================================================================
   Supplier: contact card, purchase/payment KPIs and three tabs — purchase
   orders (server paginated), payments and the products they supply.
   ========================================================================== */

type Tab = 'purchases' | 'payments' | 'products';

export default function SupplierDetailPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const { supplierId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const canManage = useCan('suppliers.manage');
  const canPurchase = useCan('purchases.manage');
  const products = useCatalogStore((state) => state.products);
  const [tab, setTab] = useState<Tab>('purchases');
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const paying = params.get('pay') === '1' && canManage;

  const supplier = useAsync(() => supplierService.getById(supplierId), [supplierId]);
  const summaries = useAsync(() => supplierService.summaries(), [supplierId]);
  const purchases = useAsync(() => purchaseService.list({ supplierId, status: 'all' }, { page, pageSize }), [supplierId, page, pageSize]);
  const allPurchases = useAsync(() => purchaseService.list({ supplierId, status: 'all' }, { page: 1, pageSize: 500 }), [supplierId]);
  const payments = useAsync(() => supplierService.payments(supplierId), [supplierId]);

  const supplied = useMemo(() => products.filter((product) => product.supplierId === supplierId), [products, supplierId]);
  const needReorder = supplied.filter((product) => product.status === 'active' && product.stock <= product.minStock).length;
  const poNumbers = useMemo(() => new Map((allPurchases.data?.rows ?? []).map((purchase) => [purchase.id, purchase.poNo])), [allPurchases.data]);
  const openPurchases = useMemo(() => (allPurchases.data?.rows ?? []).filter(canPayPurchase), [allPurchases.data]);

  const setPaying = (open: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (open) next.set('pay', '1');
        else next.delete('pay');
        return next;
      },
      { replace: true },
    );

  const refresh = () => {
    supplier.reload();
    summaries.reload();
    purchases.reload();
    allPurchases.reload();
    payments.reload();
  };

  if (supplier.loading && !supplier.data) return <LoadingState label={t('common.states.loading')} className="h-full" />;
  const data = supplier.data;
  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={Truck} title={t('inventory.suppliers.detail.title')} breadcrumb={[{ label: t('inventory.suppliers.title'), to: '/suppliers' }]} />
        <EmptyState
          icon={Truck}
          title={supplier.error ? t('errors.loadFailed') : t('inventory.suppliers.detail.notFound')}
          description={supplier.error ? undefined : t('inventory.suppliers.detail.notFoundHint')}
          action={supplier.error ? <Button onClick={supplier.reload}>{t('common.actions.retry')}</Button> : <Button onClick={() => navigate('/suppliers')}>{t('inventory.suppliers.detail.back')}</Button>}
          className="flex-1"
        />
      </div>
    );
  }

  const summary = summaries.data?.get(data.id);
  const outstanding = summary?.outstanding ?? data.openingBalance;
  const badge = supplierStatusBadge(data.status);
  const contactRows = [
    { icon: UserRound, label: t('inventory.supplierForm.contactPerson'), value: data.contactPerson },
    { icon: Building2, label: t('inventory.supplierForm.company'), value: data.company },
    { icon: Phone, label: t('common.labels.phone'), value: data.phone ? format.digits(data.phone) : '' },
    { icon: Mail, label: t('common.labels.email'), value: data.email },
    { icon: MapPin, label: t('common.labels.address'), value: data.address },
    { icon: Wallet, label: t('inventory.suppliers.detail.openingBalance'), value: data.openingBalance > 0 ? format.money(data.openingBalance) : '' },
    { icon: NotebookPen, label: t('common.labels.notes'), value: data.notes },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Truck}
        title={data.name}
        description={t('inventory.suppliers.detail.subtitle', { code: data.code })}
        breadcrumb={[{ label: t('inventory.suppliers.title'), to: '/suppliers' }, { label: data.name }]}
        actions={
          <>
            {canManage && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                {t('common.actions.edit')}
              </Button>
            )}
            {canManage && (
              <Button icon={HandCoins} onClick={() => setPaying(true)}>
                {t('inventory.suppliers.actions.pay')}
              </Button>
            )}
            {canPurchase && data.status === 'active' && (
              <Button variant="primary" icon={ShoppingCart} onClick={() => navigate(`/purchases/new?supplier=${data.id}`)}>
                {t('inventory.suppliers.actions.newPurchase')}
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="type-h3 text-fg">{t('inventory.suppliers.columns.contact')}</h2>
              <StatusBadge size="sm" tone={badge.tone} icon={badge.icon} label={t(data.status === 'active' ? 'common.labels.active' : 'common.labels.inactive')} />
            </div>
            <dl className="flex flex-col gap-3.5">
              {contactRows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted" aria-hidden>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <dt className="type-caption text-fg-subtle">{label}</dt>
                    <dd className="text-sm break-words text-fg">{value || <span className="text-fg-subtle">{t('inventory.suppliers.detail.notGiven')}</span>}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label={t('inventory.suppliers.kpi.title')} className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
              <StatCard label={t('inventory.suppliers.detail.kpi.purchases')} value={format.money(summary?.totalPurchases ?? 0)} icon={ShoppingCart} tone="info" />
              <StatCard
                label={t('inventory.suppliers.detail.kpi.orders')}
                value={format.integer(summary?.purchaseCount ?? 0)}
                icon={Package}
                tone="neutral"
                hint={summary?.lastPurchaseAt ? t('inventory.suppliers.detail.kpi.lastOrder', { time: format.relative(summary.lastPurchaseAt) }) : t('inventory.suppliers.noPurchases')}
              />
              <StatCard label={t('inventory.suppliers.detail.kpi.paid')} value={format.money(summary?.totalPaid ?? 0)} icon={CircleCheck} tone="success" />
              <StatCard
                label={t('inventory.suppliers.detail.kpi.outstanding')}
                value={format.money(Math.max(0, outstanding))}
                icon={Wallet}
                tone={outstanding > 0 ? 'danger' : 'success'}
                hint={outstanding > 0 ? undefined : t('inventory.suppliers.detail.kpi.settled')}
                onClick={canManage && outstanding > 0 ? () => setPaying(true) : undefined}
              />
            </section>

            {needReorder > 0 && (
              <button
                type="button"
                onClick={() => setTab('products')}
                className="flex min-h-11 items-center gap-2 self-start rounded-lg bg-warning-soft px-3 text-sm font-medium text-warning-text transition-base hover:brightness-105"
              >
                <TriangleAlert size={16} aria-hidden />
                {t('inventory.suppliers.detail.needReorder', { count: needReorder })}
              </button>
            )}

            <div className="flex flex-col gap-4">
              <Tabs
                ariaLabel={t('inventory.suppliers.detail.title')}
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'purchases', label: t('inventory.suppliers.detail.tabs.purchases'), icon: ShoppingCart, count: purchases.data?.total },
                  { value: 'payments', label: t('inventory.suppliers.detail.tabs.payments'), icon: HandCoins, count: payments.data?.length },
                  { value: 'products', label: t('inventory.suppliers.detail.tabs.products'), icon: Package, count: supplied.length },
                ]}
              />
              {tab === 'purchases' && (
                <SupplierPurchasesTable
                  rows={purchases.data?.rows ?? []}
                  loading={!purchases.data && !purchases.error}
                  pagination={
                    purchases.data && purchases.data.total > 0
                      ? {
                          page,
                          pageSize,
                          total: purchases.data.total,
                          onPageChange: setPage,
                          onPageSizeChange: (size) => {
                            setPageSize(size);
                            setPage(1);
                          },
                        }
                      : undefined
                  }
                />
              )}
              {tab === 'payments' && <SupplierPaymentsTable rows={payments.data ?? []} loading={!payments.data && !payments.error} poNumbers={poNumbers} />}
              {tab === 'products' && <SupplierProductsTable supplierId={data.id} />}
            </div>
          </div>
        </div>
      </div>

      <SupplierFormModal
        open={editing}
        supplier={data}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setEditing(false);
          supplier.setData(saved);
        }}
      />
      <SupplierPaymentDialog open={paying} supplier={data} openPurchases={openPurchases} outstanding={outstanding} onClose={() => setPaying(false)} onPaid={refresh} />
    </div>
  );
}
