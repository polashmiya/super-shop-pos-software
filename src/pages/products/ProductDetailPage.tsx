import { useEffect, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Boxes, CircleCheck, CircleSlash, ClipboardList, Clock, Package, PackageSearch, Pencil, Power, PowerOff, ReceiptText, RotateCcw, SlidersHorizontal, Wallet } from 'lucide-react';
import { multiplyMoney } from '@/domain/money';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import { productSalesSummary, productService } from '@/services/catalogService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { PageHeader, StatCard, StatusBadge } from '@/components/ui/Display';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { ProductImage } from '@/components/product/ProductImage';
import { stockStatusBadge } from '@/components/product/stockStatus';
import { changeProductStatus } from '@/features/catalog/catalogActions';
import { ProductHistory } from '@/features/catalog/ProductHistory';
import { ProductInfoCard } from '@/features/catalog/ProductInfoCard';
import { ProductSummaryCard } from '@/features/catalog/ProductSummaryCard';
import { last30DaysStart } from '@/features/catalog/productDetail';
import { stockLevel } from '@/features/catalog/productQueries';

/* ==========================================================================
   Product detail: header with status and actions, stock / value / sales
   KPIs, every field (with the scannable barcode) and the history tabs
   (stock ledger, sales, price changes, barcodes, activity).
   ========================================================================== */

export default function ProductDetailPage() {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const navigate = useNavigate();
  const { productId = '' } = useParams();
  const canManage = useCan('products.manage');
  const canAdjust = useCan('inventory.adjust');
  const canViewStock = useCan('inventory.view');
  const stored = useCatalogStore((state) => state.byId.get(productId));
  const unitById = useCatalogStore((state) => state.unitById);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);

  // The catalogue normally has the product in memory; otherwise (e.g. right after start-up) load it directly.
  const fallback = useAsync(() => (stored ? Promise.resolve(null) : productService.getById(productId)), [productId, Boolean(stored)]);
  const product = stored ?? (fallback.data && !fallback.data.deletedAt ? fallback.data : null);
  const summary = useAsync(() => productSalesSummary(productId, last30DaysStart()), [productId, product?.stock]);
  const barcodes = useAsync(() => productService.barcodes(productId), [productId, product?.updatedAt]);

  // Stock may have changed since the catalogue was loaded (other counters, purchases, adjustments).
  useEffect(() => {
    void useCatalogStore
      .getState()
      .refreshStock([productId])
      .catch((error: unknown) => console.error(error));
  }, [productId]);

  const breadcrumb = [{ label: t('catalog.products.title'), to: '/products' }];
  const shell = (title: ReactNode, body: ReactNode) => (
    <div className="flex h-full flex-col">
      <PageHeader icon={Package} title={title} breadcrumb={breadcrumb} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
    </div>
  );

  if (!product) {
    if (fallback.error) {
      return shell(
        t('catalog.products.title'),
        <ErrorState
          title={t('catalog.detail.loadFailed')}
          action={
            <Button icon={RotateCcw} onClick={fallback.reload}>
              {t('common.actions.retry')}
            </Button>
          }
        />,
      );
    }
    if (fallback.loading || fallback.data === undefined) {
      return shell(
        t('common.states.loading'),
        <div aria-busy className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <Skeleton className="h-[34rem] rounded-xl" />
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </div>,
      );
    }
    return shell(
      t('catalog.form.notFoundTitle'),
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

  const unit = unitById.get(product.unitId);
  const unitShort = unit ? localize(unit.short) : '';
  const level = stockLevel(product, expiringDays);
  const levelBadge = stockStatusBadge(level);
  const onHand = Math.max(0, product.stock);
  const sales = summary.data;
  const pending = summary.loading && !sales ? <Skeleton className="h-8 w-24" /> : '—';
  const secondaryName = language === 'bn' ? product.name.en : product.name.bn;
  const active = product.status === 'active';
  const toggleStatus = () => void changeProductStatus([product], active ? 'inactive' : 'active');

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-3">
            <ProductImage product={product} className="h-10 w-10 shrink-0" iconSize={20} />
            <span className="truncate">{localize(product.name)}</span>
          </span>
        }
        description={
          <span className="flex min-w-0 items-center gap-2">
            {secondaryName && <span className="truncate">{secondaryName}</span>}
            <span className="font-mono text-fg-subtle">{product.sku}</span>
            {active ? (
              <StatusBadge size="sm" tone="success" icon={CircleCheck} label={t('enums.productStatus.active')} />
            ) : (
              <StatusBadge size="sm" tone="neutral" icon={CircleSlash} label={t('enums.productStatus.inactive')} />
            )}
          </span>
        }
        breadcrumb={[...breadcrumb, { label: localize(product.name) }]}
        actions={
          <>
            {canViewStock && (
              <Button icon={ClipboardList} onClick={() => navigate(`/inventory/ledger?product=${product.id}`)}>
                {t('catalog.products.actions.stockLedger')}
              </Button>
            )}
            {canAdjust && (
              <Button icon={SlidersHorizontal} onClick={() => navigate(`/inventory?adjust=${product.id}`)}>
                {t('catalog.products.actions.adjustStock')}
              </Button>
            )}
            {canManage && (
              <Button icon={active ? PowerOff : Power} onClick={toggleStatus}>
                {t(active ? 'common.actions.deactivate' : 'common.actions.activate')}
              </Button>
            )}
            {canManage && (
              <Button variant="primary" icon={Pencil} onClick={() => navigate(`/products/${product.id}/edit`)}>
                {t('catalog.detail.edit')}
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <ProductSummaryCard product={product} unitShort={unitShort} />

          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
              <StatCard
                label={t('catalog.detail.kpi.stock')}
                value={format.quantity(product.stock, unitShort || undefined)}
                icon={Boxes}
                tone={levelBadge.tone}
                hint={<StatusBadge size="sm" tone={levelBadge.tone} icon={levelBadge.icon} label={t(`enums.stockStatus.${level}`)} />}
              />
              <StatCard
                label={t('catalog.detail.kpi.stockValue')}
                value={format.money(multiplyMoney(product.purchasePrice, onHand))}
                icon={Wallet}
                tone="info"
                hint={t('catalog.detail.kpi.retailValue', { amount: format.money(multiplyMoney(product.sellingPrice, onHand)) })}
              />
              <StatCard
                label={t('catalog.detail.kpi.sold')}
                value={sales ? format.quantity(sales.quantity, unitShort || undefined) : pending}
                icon={ReceiptText}
                tone="primary"
                hint={sales ? t('catalog.detail.kpi.soldHint', { amount: format.money(sales.amount), orders: t('common.units.orders', { count: sales.orders }) }) : undefined}
              />
              <StatCard
                label={t('catalog.detail.kpi.lastSale')}
                value={sales ? (sales.lastSaleAt ? format.relative(sales.lastSaleAt) : t('catalog.detail.kpi.neverSold')) : pending}
                icon={Clock}
                tone="neutral"
                hint={sales?.lastSaleAt ? format.dateTime(sales.lastSaleAt) : undefined}
              />
            </div>

            <ProductInfoCard product={product} unitShort={unitShort} barcodes={barcodes.data} />
            <ProductHistory key={product.id} product={product} unitShort={unitShort} />
          </div>
        </div>
      </div>
    </div>
  );
}
