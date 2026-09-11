import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Package, PackagePlus, PackageSearch, Pencil, RotateCcw } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n';
import { productService } from '@/services/catalogService';
import { supplierService } from '@/services/peopleService';
import { useCatalogStore } from '@/stores/catalogStore';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ProductEditor } from '@/features/catalog/ProductEditor';

/* ==========================================================================
   New product (/products/new) and editing one (/products/:productId/edit).
   Loads the product, its extra barcodes and the suppliers, then hands over
   to ProductEditor (keyed by product so switching products resets it).
   ========================================================================== */

export default function ProductFormPage() {
  const t = useT();
  const navigate = useNavigate();
  const { productId } = useParams();
  const catalogReady = useCatalogStore((state) => state.status === 'ready' || state.products.length > 0);

  const data = useAsync(async () => {
    const [product, barcodes, suppliers] = await Promise.all([
      productId ? productService.getById(productId) : Promise.resolve(null),
      productId ? productService.barcodes(productId) : Promise.resolve([]),
      supplierService.list(undefined, 'all'),
    ]);
    return { product: product && !product.deletedAt ? product : null, barcodes, suppliers };
  }, [productId]);

  const shell = (body: ReactNode) => (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={productId ? Pencil : PackagePlus}
        title={productId ? t('catalog.form.editTitle') : t('catalog.form.newTitle')}
        breadcrumb={[{ label: t('catalog.products.title'), to: '/products' }, { label: productId ? t('common.actions.edit') : t('common.labels.new') }]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
    </div>
  );

  if (data.error && !data.data) {
    return shell(
      <ErrorState
        title={t('errors.loadFailed')}
        action={
          <Button icon={RotateCcw} onClick={data.reload}>
            {t('common.actions.retry')}
          </Button>
        }
      />,
    );
  }

  if (!data.data || !catalogReady) {
    return shell(
      <div aria-busy className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>,
    );
  }

  const { product, barcodes, suppliers } = data.data;

  if (productId && !product) {
    return shell(
      <EmptyState
        icon={PackageSearch}
        title={t('catalog.form.notFoundTitle')}
        description={t('catalog.form.notFoundDescription')}
        action={
          <Button icon={Package} onClick={() => navigate('/products')}>
            {t('catalog.form.backToList')}
          </Button>
        }
      />,
    );
  }

  return (
    <ProductEditor
      key={product?.id ?? 'new'}
      product={product}
      extraBarcodes={barcodes.filter((barcode) => !barcode.isPrimary).map((barcode) => barcode.barcode)}
      suppliers={suppliers}
    />
  );
}
