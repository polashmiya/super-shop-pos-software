import { useMemo } from 'react';
import { parseQuantityInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Product } from '@/types';
import { ProductCard } from '@/components/product/ProductCard';
import type { ProductCardDisplay } from '@/components/product/layout';
import { parsedPrices, type ProductFormState } from './productForm';

const noop = () => undefined;

/** Live preview of the product card exactly as the POS will show it. */
export function ProductPosPreview({ form, product }: { form: ProductFormState; product: Product | null }) {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const pos = useSettingsStore((state) => state.device.pos);
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const unit = useCatalogStore((state) => state.unitById.get(form.unitId));

  const display: ProductCardDisplay = useMemo(
    () => ({
      showImage: pos.showProductImages,
      imageSize: pos.productImageSize,
      showSku: pos.showSku,
      showBarcode: pos.showBarcode,
      showStock: pos.showStock,
      showMrp: pos.showMrp,
      showDiscount: pos.showDiscount,
      showSecondaryName: pos.showSecondaryName,
      expiringDays,
    }),
    [pos, expiringDays],
  );

  const preview: Product = useMemo(() => {
    const { purchase, selling, mrp, discount } = parsedPrices(form);
    const placeholder = t('catalog.form.newTitle');
    return {
      id: product?.id ?? 'preview',
      createdAt: product?.createdAt ?? '',
      updatedAt: product?.updatedAt ?? '',
      version: product?.version ?? 1,
      syncStatus: product?.syncStatus ?? 'local',
      deletedAt: null,
      sku: form.sku || '—',
      barcode: form.barcode,
      name: { bn: form.nameBn.trim() || form.nameEn.trim() || placeholder, en: form.nameEn.trim() || form.nameBn.trim() || placeholder },
      description: { bn: form.descriptionBn, en: form.descriptionEn },
      categoryId: form.categoryId,
      subcategoryId: form.subcategoryId || null,
      brandId: form.brandId || null,
      unitId: form.unitId,
      supplierId: form.supplierId || null,
      purchasePrice: purchase ?? 0,
      sellingPrice: selling ?? 0,
      mrp,
      discount,
      taxRate: Number(form.taxRate) || 0,
      minStock: parseQuantityInput(form.minStock) ?? 0,
      maxStock: parseQuantityInput(form.maxStock) ?? 0,
      image: form.image,
      status: form.active ? 'active' : 'inactive',
      featured: form.featured,
      weighted: form.weighted,
      expiryDate: form.expiryDate || null,
      stock: product ? product.stock : (parseQuantityInput(form.openingStock) ?? 0),
    };
  }, [form, product, t]);

  return (
    <div inert className="mx-auto w-full max-w-[12rem]">
      <ProductCard product={preview} unit={unit} display={display} language={language} t={t} format={format} flashing={false} inCart={0} onAdd={noop} onInfo={noop} />
    </div>
  );
}
