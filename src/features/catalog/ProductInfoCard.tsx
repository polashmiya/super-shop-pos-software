import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CircleX, Clock, Copy, Info } from 'lucide-react';
import { parseLocalDate } from '@/domain/dates';
import { calculateDiscountAmount } from '@/domain/pricing';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { supplierService } from '@/services/peopleService';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Product, ProductBarcode } from '@/types';
import { Badge, Card, DefinitionList, SectionHeader } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/States';
import { BarcodeImage } from './BarcodeImage';
import { expiryInfo } from './productDetail';
import { marginOf } from './productForm';

interface ProductInfoCardProps {
  product: Product;
  /** Short name of the product's unit ("kg", "pc"). */
  unitShort: string;
  /** All barcodes of the product (primary included), once loaded. */
  barcodes: readonly ProductBarcode[] | undefined;
}

/** Every product field as a definition list, with the scannable primary barcode beside it. */
export function ProductInfoCard({ product, unitShort, barcodes }: ProductInfoCardProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const canViewSuppliers = useCan('suppliers.view');
  const categoryById = useCatalogStore((state) => state.categoryById);
  const brandById = useCatalogStore((state) => state.brandById);
  const unitById = useCatalogStore((state) => state.unitById);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const supplier = useAsync(() => (product.supplierId ? supplierService.getById(product.supplierId) : Promise.resolve(null)), [product.supplierId]);

  const unit = unitShort || undefined;
  const category = categoryById.get(product.categoryId);
  const subcategory = product.subcategoryId ? categoryById.get(product.subcategoryId) : undefined;
  const brand = product.brandId ? brandById.get(product.brandId) : undefined;
  const unitInfo = unitById.get(product.unitId);
  const margin = marginOf(product.purchasePrice, product.sellingPrice);
  const expiry = expiryInfo(product.expiryDate, expiringDays);
  const extraCount = barcodes ? barcodes.filter((barcode) => !barcode.isPrimary).length : 0;
  const yesNo = (value: boolean) => t(value ? 'common.labels.yes' : 'common.labels.no');

  let supplierValue: ReactNode = t('catalog.detail.fields.noSupplier');
  if (product.supplierId && supplier.loading && supplier.data?.id !== product.supplierId) {
    supplierValue = <Skeleton className="h-5 w-32" />;
  } else if (supplier.data && supplier.data.id === product.supplierId) {
    supplierValue = canViewSuppliers ? (
      <Link to={`/suppliers/${supplier.data.id}`} className="text-primary-soft-fg hover:underline">
        {supplier.data.name}
      </Link>
    ) : (
      supplier.data.name
    );
  }

  const promotion = product.discount
    ? t('catalog.detail.fields.promotionValue', {
        discount: product.discount.type === 'percent' ? format.percent(product.discount.value) : format.money(product.discount.value),
        price: format.money(product.sellingPrice - calculateDiscountAmount(product.sellingPrice, product.discount)),
      })
    : t('catalog.detail.fields.noPromotion');

  const expiryValue =
    expiry && product.expiryDate ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        {format.date(parseLocalDate(product.expiryDate))}
        <Badge size="sm" tone={expiry.tone} icon={expiry.expired ? CircleX : expiry.tone === 'warning' ? Clock : CalendarClock}>
          {expiry.expired ? t('catalog.detail.fields.expired') : t('catalog.detail.fields.expiresIn', { count: expiry.days })}
        </Badge>
      </span>
    ) : (
      t('catalog.detail.fields.notTracked')
    );

  const items: Array<{ label: ReactNode; value: ReactNode }> = [
    { label: t('common.labels.sku'), value: <span className="font-mono">{product.sku}</span> },
    { label: t('common.labels.barcode'), value: <span className="font-mono">{product.barcode}</span> },
    { label: t('common.labels.category'), value: category ? (subcategory ? `${localize(category.name)} › ${localize(subcategory.name)}` : localize(category.name)) : '—' },
    { label: t('common.labels.brand'), value: brand ? localize(brand.name) : t('catalog.products.noBrand') },
    { label: t('common.labels.unit'), value: unitInfo ? `${localize(unitInfo.name)} (${localize(unitInfo.short)})` : product.unitId },
    { label: t('common.labels.supplier'), value: supplierValue },
    { label: t('catalog.form.fields.sellingPrice'), value: format.money(product.sellingPrice) },
    { label: t('catalog.form.fields.purchasePrice'), value: format.money(product.purchasePrice) },
    { label: t('catalog.form.fields.mrp'), value: product.mrp !== null ? format.money(product.mrp) : t('catalog.detail.prices.notSet') },
    { label: t('catalog.detail.fields.promotion'), value: promotion },
    { label: t('common.labels.vat'), value: format.percent(product.taxRate) },
    {
      label: t('catalog.detail.fields.margin'),
      value: margin ? <span className={margin.profit < 0 ? 'text-danger-text' : undefined}>{`${format.percentValue(margin.rate)} · ${format.money(margin.profit)}`}</span> : '—',
    },
    { label: t('catalog.detail.fields.minMaxStock'), value: `${format.quantity(product.minStock, unit)} / ${product.maxStock > 0 ? format.quantity(product.maxStock, unit) : t('catalog.detail.fields.noMax')}` },
    { label: t('catalog.detail.fields.expiry'), value: expiryValue },
    { label: t('catalog.detail.fields.weighted'), value: yesNo(product.weighted) },
    { label: t('catalog.detail.fields.featured'), value: yesNo(product.featured) },
    { label: t('common.labels.createdAt'), value: format.dateTime(product.createdAt) },
    { label: t('common.labels.updatedAt'), value: format.dateTime(product.updatedAt) },
  ];

  const copyBarcode = async () => {
    try {
      await navigator.clipboard.writeText(product.barcode);
      toast.success('catalog.detail.barcode.copied');
    } catch (error) {
      toast.fromError(error);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={Info} title={t('catalog.detail.sections.info')} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <DefinitionList items={items} columns={2} />
        <div className="flex flex-col gap-2 border-t border-border pt-4 lg:border-s lg:border-t-0 lg:ps-5 lg:pt-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="type-label text-fg-muted">{t('catalog.detail.sections.barcode')}</h3>
            <IconButton icon={Copy} size="sm" label={t('catalog.detail.barcode.copy')} onClick={() => void copyBarcode()} />
          </div>
          <BarcodeImage value={product.barcode} height={56} />
          {extraCount > 0 && <p className="type-caption text-fg-subtle">{t('catalog.detail.barcode.more', { count: extraCount })}</p>}
        </div>
      </div>
    </Card>
  );
}
