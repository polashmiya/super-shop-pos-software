import { useState } from 'react';
import { ExternalLink, LockOpen, ShoppingCart, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router';
import { parseMoneyInput } from '@/domain/money';
import { getStockStatus } from '@/domain/stock';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import { useCan } from '@/stores/authStore';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { DefinitionList, StatusBadge } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProductImage } from '@/components/product/ProductImage';
import { stockStatusBadge } from '@/components/product/stockStatus';
import { addProductToCart } from './posActions';
import { usePosUi } from './posUiStore';

/** Product quick view from a card's info button. */
export function ProductQuickView() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'quickView') return null;
  return <QuickView productId={dialog.productId} />;
}

function QuickView({ productId }: { productId: string }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const navigate = useNavigate();
  const close = usePosUi((state) => state.close);
  const canViewProducts = useCan('products.view');
  const product = useCatalogStore((state) => state.byId.get(productId));
  const category = useCatalogStore((state) => (product ? state.categoryById.get(product.categoryId) : undefined));
  const brand = useCatalogStore((state) => (product?.brandId ? state.brandById.get(product.brandId) : undefined));
  const unit = useCatalogStore((state) => (product ? state.unitById.get(product.unitId) : undefined));
  const expiringDays = useSettingsStore((state) => state.business.inventory.expiryAlertDays);
  if (!product) return null;
  const status = getStockStatus(product, expiringDays);
  const badge = stockStatusBadge(status);

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={localize(product.name)}
      description={localize(product.name) === product.name.en ? product.name.bn : product.name.en}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          {canViewProducts && (
            <Button
              icon={ExternalLink}
              onClick={() => {
                close();
                navigate(`/products/${product.id}`);
              }}
            >
              {t('pos.quickView.open')}
            </Button>
          )}
          <Button
            variant="primary"
            icon={ShoppingCart}
            onClick={() => {
              if (addProductToCart(product, 1, 'tap')) close();
            }}
          >
            {t('pos.quickView.add')}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[14rem_1fr]">
        <ProductImage product={product} className="aspect-square w-full" iconSize={64} />
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-fg tnum">{format.money(product.sellingPrice)}</span>
            {product.mrp && product.mrp > product.sellingPrice && <span className="text-fg-subtle line-through tnum">{format.money(product.mrp)}</span>}
          </div>
          <StatusBadge tone={badge.tone} icon={badge.icon} label={t(`enums.stockStatus.${status}`)} />
          <DefinitionList
            items={[
              { label: t('common.labels.stock'), value: `${format.quantity(product.stock)} ${unit ? localize(unit.short) : ''}` },
              { label: t('common.labels.sku'), value: <span className="font-mono">{product.sku}</span> },
              { label: t('common.labels.barcode'), value: <span className="font-mono">{product.barcode}</span> },
              { label: t('common.labels.category'), value: category ? localize(category.name) : '—' },
              { label: t('common.labels.brand'), value: brand ? localize(brand.name) : '—' },
              { label: t('common.labels.vat'), value: format.percent(product.taxRate) },
            ]}
          />
          {localize(product.description) && <p className="type-body-sm text-fg-muted">{localize(product.description)}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Shown over the POS when this counter has no open shift (opening cash entry). */
export function ShiftGate() {
  const t = useT();
  const format = useFormat();
  const counter = useShiftStore((state) => state.counter);
  const open = useShiftStore((state) => state.open);
  const canOperate = useCan('shift.operate');
  const defaultCash = useSettingsStore((state) => state.business.shift.defaultOpeningCash);
  const language = useSettingsStore((state) => state.device.locale.language);
  const [amount, setAmount] = useState(String(defaultCash / 100));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    const value = parseMoneyInput(amount);
    if (value === null) {
      toast.error('validation.invalidAmount');
      return;
    }
    setBusy(true);
    try {
      const shift = await open(value, note);
      toast.success({ key: 'pos.shiftGate.opened', params: { shift: shift.shiftNo } });
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  if (!counter || counter.status === 'maintenance') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-md">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-warning-text">
            <Wrench size={26} aria-hidden />
          </span>
          <p className="type-h2 mt-4 text-fg">{t('pos.shiftGate.title')}</p>
          <p className="type-body mt-2 text-fg-muted">{counter ? t('pos.shiftGate.maintenance') : t('pos.shiftGate.noCounter')}</p>
          <Button className="mt-5" onClick={() => navigate('/settings/counter')}>
            {t('settings.sections.counter.title')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-md"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg">
          <LockOpen size={26} aria-hidden />
        </span>
        <h2 className="type-h1 mt-4 text-fg">{t('pos.shiftGate.title')}</h2>
        <p className="type-body mt-1 text-fg-muted">{t('pos.shiftGate.description')}</p>
        <p className="type-label mt-3 text-fg-subtle">{t('pos.shiftGate.counter', { name: language === 'bn' ? counter.name.bn : counter.name.en })}</p>
        <div className="mt-5 flex flex-col gap-4">
          <FormField label={t('pos.shiftGate.openingCash')} hint={format.money(parseMoneyInput(amount) ?? 0)}>
            {(id) => <Input id={id} autoFocus inputMode="decimal" inputSize="xl" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.০-৯]/g, ''))} className="text-end text-2xl font-bold tnum" disabled={!canOperate} />}
          </FormField>
          <FormField label={t('pos.shiftGate.note')}>{(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} disabled={!canOperate} />}</FormField>
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canOperate} fullWidth>
            {t('pos.shiftGate.open')}
          </Button>
          {!canOperate && <p className="type-body-sm text-danger-text">{t('errors.permissionDenied')}</p>}
        </div>
      </form>
    </div>
  );
}
