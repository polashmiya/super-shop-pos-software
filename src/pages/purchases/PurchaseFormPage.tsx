import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { FileLock2, FileQuestion, ShoppingCart } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { purchaseService } from '@/services/purchaseService';
import { useCatalogStore } from '@/stores/catalogStore';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { PurchaseEditor } from '@/features/purchases/PurchaseEditor';
import { canEditPurchase } from '@/features/purchases/purchaseHelpers';

/* ==========================================================================
   New purchase order (/purchases/new?supplier=&product=) and editing a
   draft/ordered purchase (/purchases/:purchaseId/edit).
   ========================================================================== */

export default function PurchaseFormPage() {
  const t = useT();
  const navigate = useNavigate();
  const { purchaseId } = useParams();
  const [searchParams] = useSearchParams();
  const catalogReady = useCatalogStore((state) => state.status === 'ready' || state.products.length > 0);

  const data = useAsync(async () => {
    const [purchase, suppliers] = await Promise.all([purchaseId ? purchaseService.getById(purchaseId) : Promise.resolve(null), supplierService.list(undefined, 'all')]);
    return { purchase, suppliers };
  }, [purchaseId]);

  const shell = (body: ReactNode) => (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={ShoppingCart}
        title={purchaseId ? t('inventory.purchaseForm.editHeading') : t('inventory.purchaseForm.newTitle')}
        breadcrumb={[{ label: t('nav.purchases'), to: '/purchases' }, { label: purchaseId ? t('common.actions.edit') : t('common.labels.new') }]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
    </div>
  );

  if (data.error && !data.data) {
    return shell(<ErrorState title={t('errors.loadFailed')} action={<Button onClick={data.reload}>{t('common.actions.retry')}</Button>} />);
  }

  if (!data.data || !catalogReady) {
    return shell(
      <div className="flex flex-col gap-5" aria-busy>
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>,
    );
  }

  const { purchase, suppliers } = data.data;

  if (purchaseId && !purchase) {
    return shell(
      <EmptyState
        icon={FileQuestion}
        title={t('inventory.purchaseDetail.notFound')}
        description={t('inventory.purchaseDetail.notFoundHint')}
        action={<Button onClick={() => navigate('/purchases')}>{t('inventory.purchaseDetail.back')}</Button>}
      />,
    );
  }

  if (purchase && !canEditPurchase(purchase)) {
    return shell(
      <EmptyState
        icon={FileLock2}
        title={t('inventory.purchaseForm.notEditable', { poNo: purchase.poNo })}
        description={t('errors.purchaseNotEditable')}
        action={
          <Button variant="primary" onClick={() => navigate(`/purchases/${purchase.id}`, { replace: true })}>
            {t('inventory.purchaseForm.openOrder')}
          </Button>
        }
      />,
    );
  }

  return <PurchaseEditor key={purchase?.id ?? 'new'} purchase={purchase} suppliers={suppliers} presetSupplierId={searchParams.get('supplier')} presetProductId={searchParams.get('product')} />;
}
