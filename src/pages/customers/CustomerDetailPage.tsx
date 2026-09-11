import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Calculator, Coins, Pencil, ReceiptText, ScanBarcode, ShoppingBag, Trash2, UserX, Users, Wallet } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService } from '@/services/peopleService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Controls';
import { PageHeader, StatCard } from '@/components/ui/Display';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { AdjustPointsDialog } from '@/features/customers/AdjustPointsDialog';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import { CustomerLoyaltyTab } from '@/features/customers/CustomerLoyaltyTab';
import { CustomerProfileCard } from '@/features/customers/CustomerProfileCard';
import { CustomerPurchasesTab } from '@/features/customers/CustomerPurchasesTab';
import { deleteCustomerWithConfirm, startSaleForCustomer } from '@/features/customers/customerActions';

/* ==========================================================================
   Customer profile: contact card, KPIs (orders, spent, average, points),
   purchase history and the loyalty ledger with manual adjustments.
   ========================================================================== */

type Tab = 'purchases' | 'loyalty';

export default function CustomerDetailPage() {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const { customerId = '' } = useParams();
  const canManage = useCan('customers.manage');
  const canDelete = useCan('customers.delete');
  const canAdjust = useCan('loyalty.adjust');
  const canSell = useCan('pos.sell');
  const canSeeSales = useCan('sales.view');
  const pointValue = useSettingsStore((state) => state.business.loyalty.pointValue);
  const [tab, setTab] = useState<Tab>('purchases');
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const customer = useAsync(() => customerService.getById(customerId), [customerId]);
  const loyalty = useAsync(() => customerService.loyaltyHistory(customerId, 300), [customerId]);

  const breadcrumb = [{ label: t('customers.title'), to: '/customers' }, { label: customer.data?.name ?? '…' }];

  if (customer.loading && !customer.data) return <LoadingState label={t('common.states.loading')} className="h-full" />;
  const data = customer.data;
  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={Users} title={t('customers.detail.title')} breadcrumb={[{ label: t('customers.title'), to: '/customers' }]} />
        <EmptyState
          icon={UserX}
          title={customer.error ? t('errors.loadFailed') : t('customers.detail.notFound')}
          description={customer.error ? undefined : t('customers.detail.notFoundHint')}
          action={
            customer.error ? (
              <Button onClick={customer.reload}>{t('common.actions.retry')}</Button>
            ) : (
              <Button icon={Users} onClick={() => navigate('/customers')}>
                {t('customers.detail.backToList')}
              </Button>
            )
          }
          className="flex-1"
        />
      </div>
    );
  }

  const average = data.totalOrders > 0 ? Math.round(data.totalSpent / data.totalOrders) : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={Users}
        title={data.name}
        description={t('customers.detail.subtitle', { code: data.code })}
        breadcrumb={breadcrumb}
        actions={
          <>
            {canDelete && (
              <Button variant="ghost" icon={Trash2} onClick={() => void deleteCustomerWithConfirm(data).then((deleted) => deleted && navigate('/customers'))}>
                {t('common.actions.delete')}
              </Button>
            )}
            {canManage && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                {t('common.actions.edit')}
              </Button>
            )}
            {canSell && (
              <Button
                variant="primary"
                icon={ScanBarcode}
                onClick={() => {
                  startSaleForCustomer(data);
                  navigate('/pos');
                }}
              >
                {t('customers.actions.newSale')}
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <CustomerProfileCard customer={data} />

          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label={t('customers.kpi.title')} className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
              <StatCard label={t('customers.detail.kpi.orders')} value={format.integer(data.totalOrders)} icon={ShoppingBag} tone="info" hint={data.lastPurchaseAt ? t('customers.detail.kpi.lastPurchase', { time: format.relative(data.lastPurchaseAt) }) : t('customers.never')} />
              <StatCard label={t('customers.detail.kpi.spent')} value={format.money(data.totalSpent)} icon={Wallet} tone="primary" />
              <StatCard label={t('customers.detail.kpi.average')} value={format.money(average)} icon={Calculator} tone="neutral" />
              <StatCard label={t('customers.detail.kpi.points')} value={format.integer(data.loyaltyPoints)} icon={Coins} tone="warning" hint={t('customers.loyalty.worth', { amount: format.money(data.loyaltyPoints * pointValue) })} />
            </section>

            <div className="flex flex-col gap-4">
              <Tabs
                ariaLabel={t('customers.detail.title')}
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'purchases', label: t('customers.tabs.purchases'), icon: ReceiptText, count: data.totalOrders },
                  { value: 'loyalty', label: t('customers.tabs.loyalty'), icon: Coins, count: loyalty.data?.length },
                ]}
              />
              {tab === 'purchases' ? (
                <CustomerPurchasesTab customer={data} canSeeSales={canSeeSales} />
              ) : (
                <CustomerLoyaltyTab
                  entries={loyalty.data ?? null}
                  loading={loyalty.loading}
                  error={Boolean(loyalty.error)}
                  balance={data.loyaltyPoints}
                  worth={data.loyaltyPoints * pointValue}
                  onRetry={loyalty.reload}
                  onAdjust={canAdjust ? () => setAdjusting(true) : undefined}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <CustomerFormModal
          customer={data}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            customer.setData(saved);
          }}
        />
      )}
      {adjusting && (
        <AdjustPointsDialog
          customer={data}
          onClose={() => setAdjusting(false)}
          onSaved={(saved) => {
            setAdjusting(false);
            customer.setData(saved);
            loyalty.reload();
          }}
        />
      )}
    </div>
  );
}
