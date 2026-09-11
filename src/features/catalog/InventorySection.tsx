import { Boxes } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { Product } from '@/types';
import { Switch } from '@/components/ui/Controls';
import { Card, SectionHeader } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import type { ProductFormState, ProductSectionProps } from './productForm';

interface InventorySectionProps extends ProductSectionProps {
  /** The saved product when editing (stock is then changed from Inventory, not here). */
  product: Product | null;
  /** Short name of the selected unit, shown next to quantities. */
  unitShort: string;
}

type QuantityField = 'minStock' | 'maxStock' | 'openingStock';

/** Stock alerts (min/max), opening or current stock, expiry and the selling flags. */
export function InventorySection({ form, errors, update, product, unitShort }: InventorySectionProps) {
  const t = useT();
  const format = useFormat();
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const suffix = unitShort ? <span className="px-2 text-sm font-medium text-fg-subtle">{unitShort}</span> : undefined;

  const quantityField = (field: QuantityField, id: string) => (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      className="tnum"
      value={form[field]}
      placeholder="0"
      invalid={Boolean(errors[field])}
      trailing={suffix}
      onChange={(event) => {
        const patch: Partial<ProductFormState> = { [field]: event.target.value };
        update(patch);
      }}
    />
  );

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={Boxes} title={t('catalog.form.sections.inventory')} description={t('catalog.form.sections.inventoryHint')} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FormField label={t('catalog.form.fields.minStock')} error={err('minStock')} hint={t('catalog.form.fields.minStockHint')}>
          {(id) => quantityField('minStock', id)}
        </FormField>
        <FormField label={t('catalog.form.fields.maxStock')} error={err('maxStock')} hint={t('catalog.form.fields.maxStockHint')}>
          {(id) => quantityField('maxStock', id)}
        </FormField>
        {product ? (
          <div className="flex flex-col gap-1.5">
            <span className="type-label text-fg-muted">{t('catalog.form.fields.currentStock')}</span>
            <p className="flex min-h-touch items-center rounded-md border border-border bg-surface-2 px-3 font-semibold text-fg tnum">{format.quantity(product.stock, unitShort || undefined)}</p>
            <p className="type-caption text-fg-subtle">{t('catalog.form.fields.currentStockHint')}</p>
          </div>
        ) : (
          <FormField label={t('catalog.form.fields.openingStock')} error={err('openingStock')} hint={t('catalog.form.fields.openingStockHint')}>
            {(id) => quantityField('openingStock', id)}
          </FormField>
        )}
        <FormField label={t('catalog.form.fields.expiryDate')} hint={t('catalog.form.fields.expiryHint')}>
          {(id) => <Input id={id} type="date" value={form.expiryDate} className="tnum" onChange={(event) => update({ expiryDate: event.target.value })} />}
        </FormField>
      </div>
      <div className="grid gap-x-8 gap-y-1 border-t border-border pt-3 md:grid-cols-2">
        <Switch checked={form.weighted} onChange={(weighted) => update({ weighted })} label={t('catalog.form.fields.weighted')} description={t('catalog.form.fields.weightedHint')} />
        <Switch checked={form.featured} onChange={(featured) => update({ featured })} label={t('catalog.form.fields.featured')} description={t('catalog.form.fields.featuredHint')} />
        <Switch checked={form.active} onChange={(active) => update({ active })} label={t('catalog.form.fields.active')} description={t('catalog.form.fields.activeHint')} />
      </div>
    </Card>
  );
}
