import { useMemo, useState } from 'react';
import { Eye, Image, ListChecks, Shuffle } from 'lucide-react';
import { CARD_MIN_WIDTH } from '@/config/theme.config';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SizeOption } from '@/types';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { ProductCard } from '@/components/product/ProductCard';
import { productCardHeight, type ProductCardDisplay } from '@/components/product/layout';
import { SettingRow, SettingsCard, SwitchRow } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const SIZES: SizeOption[] = ['sm', 'md', 'lg'];
const noop = () => undefined;

/** Product images (on by default), card size and details, with a live POS card preview. */
export default function ProductsSection() {
  const t = useT();
  const pos = useDeviceGroup('pos');
  const appearance = useDeviceGroup('appearance');
  const imageOptions = SIZES.map((value) => ({ value, label: t(`enums.size.${value}`) }));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-5">
        <SettingsCard icon={Image} title={t('settings.products.images')} description={t('settings.products.imagesHint')}>
          <SwitchRow anchor="productImages" label={t('settings.products.showImages')} description={t('settings.products.showImagesHint')} checked={pos.showProductImages} onChange={(showProductImages) => saveDevice({ pos: { showProductImages } })} />
          <SettingRow anchor="productImageSize" label={t('settings.products.imageSize')}>
            <div className={pos.showProductImages ? undefined : 'pointer-events-none opacity-50'} aria-disabled={!pos.showProductImages}>
              <SegmentedControl ariaLabel={t('settings.products.imageSize')} value={pos.productImageSize} options={imageOptions} onChange={(productImageSize) => saveDevice({ pos: { productImageSize } })} />
            </div>
          </SettingRow>
          <SettingRow anchor="productCardSize" label={t('settings.products.cardSize')}>
            <SegmentedControl ariaLabel={t('settings.products.cardSize')} value={appearance.cardSize} options={imageOptions} onChange={(cardSize) => saveDevice({ appearance: { cardSize } })} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard icon={ListChecks} title={t('settings.products.details')} description={t('settings.products.detailsHint')}>
          <SwitchRow anchor="productSku" label={t('settings.products.showSku')} checked={pos.showSku} onChange={(showSku) => saveDevice({ pos: { showSku } })} />
          <SwitchRow anchor="productBarcode" label={t('settings.products.showBarcode')} checked={pos.showBarcode} onChange={(showBarcode) => saveDevice({ pos: { showBarcode } })} />
          <SwitchRow anchor="productStock" label={t('settings.products.showStock')} checked={pos.showStock} onChange={(showStock) => saveDevice({ pos: { showStock } })} />
          <SwitchRow anchor="productMrp" label={t('settings.products.showMrp')} checked={pos.showMrp} onChange={(showMrp) => saveDevice({ pos: { showMrp } })} />
          <SwitchRow anchor="productDiscount" label={t('settings.products.showDiscount')} checked={pos.showDiscount} onChange={(showDiscount) => saveDevice({ pos: { showDiscount } })} />
          <SwitchRow anchor="productBothNames" label={t('settings.language.bothNames')} checked={pos.showSecondaryName} onChange={(showSecondaryName) => saveDevice({ pos: { showSecondaryName } })} />
        </SettingsCard>
      </div>

      <aside className="lg:sticky lg:top-0">
        <SettingsCard icon={Eye} title={t('settings.products.preview')} description={t('settings.products.previewHint')} bodyClassName="py-4">
          <CardPreview />
        </SettingsCard>
      </aside>
    </div>
  );
}

function CardPreview() {
  const t = useT();
  const format = useFormat();
  const language = useLanguage();
  const pos = useDeviceGroup('pos');
  const appearance = useDeviceGroup('appearance');
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  const products = useCatalogStore((state) => state.products);
  const unitById = useCatalogStore((state) => state.unitById);
  const [index, setIndex] = useState(0);

  // Prefer products with a picture and a discount or MRP so every option is visible.
  const candidates = useMemo(() => {
    const active = products.filter((product) => product.status === 'active');
    const rich = active.filter((product) => product.image && (product.discount || (product.mrp && product.mrp > product.sellingPrice)));
    return rich.length > 0 ? [...rich.slice(0, 12), ...active.filter((product) => product.image).slice(0, 12)] : active.slice(0, 24);
  }, [products]);

  const display: ProductCardDisplay = {
    showImage: pos.showProductImages,
    imageSize: pos.productImageSize,
    showSku: pos.showSku,
    showBarcode: pos.showBarcode,
    showStock: pos.showStock,
    showMrp: pos.showMrp,
    showDiscount: pos.showDiscount,
    showSecondaryName: pos.showSecondaryName,
    expiringDays,
  };

  if (candidates.length === 0) return <p className="w-56 py-6 text-center type-body-sm text-fg-muted">{t('settings.products.noProduct')}</p>;
  const product = candidates[index % candidates.length];
  const scale = appearance.baseFontPx / 15;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full justify-center rounded-lg bg-bg p-4">
        <div inert style={{ width: Math.round(CARD_MIN_WIDTH[appearance.cardSize] * scale), height: productCardHeight(display, appearance.baseFontPx) }}>
          <ProductCard product={product} unit={unitById.get(product.unitId)} display={display} language={language} t={t} format={format} flashing={false} inCart={0} onAdd={noop} onInfo={noop} />
        </div>
      </div>
      {candidates.length > 1 && (
        <Button size="sm" variant="ghost" icon={Shuffle} onClick={() => setIndex((value) => value + 1)}>
          {t('settings.products.another')}
        </Button>
      )}
    </div>
  );
}
