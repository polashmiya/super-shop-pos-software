import { Trash2 } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { PurchaseTotals } from '@/services/purchaseService';
import { useCatalogStore } from '@/stores/catalogStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Id } from '@/types';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/Controls';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { ProductCell } from '@/features/inventory/InventoryBits';
import type { DraftLine, LineCheck, LineErrorKey } from './purchaseForm';

interface PurchaseLinesTableProps {
  lines: DraftLine[];
  checks: LineCheck[];
  totals: PurchaseTotals;
  showErrors: boolean;
  onChange: (productId: Id, patch: Partial<DraftLine>) => void;
  onRemove: (productId: Id) => void;
}

const cleanNumber = (value: string) => value.replace(/[^\d.০-৯]/g, '');

/** Editable purchase order lines: quantity, unit cost, discount, VAT and the line total. */
export function PurchaseLinesTable({ lines, checks, totals, showErrors, onChange, onRemove }: PurchaseLinesTableProps) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  const byId = useCatalogStore((state) => state.byId);
  const unitById = useCatalogStore((state) => state.unitById);
  const taxRates = useSettingsStore((state) => state.business.tax.rates);
  const currency = useSettingsStore((state) => state.business.currency.symbol);

  const errorText = (key: LineErrorKey | undefined): string | null => {
    if (!key) return null;
    if (key === 'wholeOnly') return t('inventory.purchaseForm.wholeOnly');
    if (key === 'discountTooHigh') return t('inventory.purchaseForm.discountTooHigh');
    return t(`validation.${key}`);
  };

  const headerClass = 'h-11 border-b border-border bg-surface-2 px-3 type-label whitespace-nowrap text-fg-muted';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-[0.9rem]" aria-label={t('inventory.purchaseForm.items')}>
        <thead>
          <tr>
            <th scope="col" className={cn(headerClass, 'w-10 text-center')}>
              #
            </th>
            <th scope="col" className={cn(headerClass, 'text-start')}>
              {t('inventory.columns.product')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-32 text-end')}>
              {t('common.labels.quantity')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-36 text-end')}>
              {t('inventory.shared.unitCost')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-32 text-end')}>
              {t('common.labels.discount')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-28 text-start')}>
              {t('inventory.shared.vatRate')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-36 text-end')}>
              {t('inventory.shared.lineTotal')}
            </th>
            <th scope="col" className={cn(headerClass, 'w-14')}>
              <span className="sr-only">{t('common.labels.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const product = byId.get(line.productId);
            const unit = product ? unitById.get(product.unitId) : undefined;
            const unitShort = unit ? localize(unit.short) : '';
            const check = checks[index];
            const lineTotals = totals.items[index];
            const errors = showErrors ? check.errors : {};
            const name = localize(line.name);
            const rateOptions = (taxRates.includes(line.taxRate) ? taxRates : [...taxRates, line.taxRate].sort((a, b) => a - b)).map((rate) => ({ value: String(rate), label: format.percent(rate) }));
            const stockMeta = product
              ? t('inventory.purchaseForm.stockHint', { qty: format.quantity(product.stock, unitShort), min: format.quantity(product.minStock) })
              : line.sku;
            return (
              <tr key={line.productId} className="align-top">
                <td className="border-b border-border px-3 pt-4 text-center text-fg-subtle tnum">{format.integer(index + 1)}</td>
                <td className="border-b border-border px-3 py-2.5">
                  <ProductCell
                    product={{ name: line.name, image: product?.image ?? null, categoryId: product?.categoryId ?? '' }}
                    meta={
                      <>
                        <span className="font-mono">{line.sku}</span>
                        {product ? ` · ${stockMeta}` : ''}
                      </>
                    }
                  />
                </td>
                <td className="border-b border-border px-2 py-2.5">
                  <Input
                    data-line-qty={line.productId}
                    aria-label={t('inventory.purchaseForm.quantityFor', { name })}
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.quantity}
                    invalid={Boolean(errors.quantity)}
                    onChange={(event) => onChange(line.productId, { quantity: cleanNumber(event.target.value) })}
                    onFocus={(event) => event.currentTarget.select()}
                    trailing={unitShort ? <span className="pe-2 text-xs text-fg-subtle">{unitShort}</span> : undefined}
                    className="text-end font-semibold tnum"
                  />
                  {errors.quantity && <p className="type-caption mt-1 text-end text-danger-text">{errorText(errors.quantity)}</p>}
                </td>
                <td className="border-b border-border px-2 py-2.5">
                  <Input
                    aria-label={t('inventory.purchaseForm.unitCostFor', { name })}
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.unitCost}
                    invalid={Boolean(errors.unitCost)}
                    onChange={(event) => onChange(line.productId, { unitCost: cleanNumber(event.target.value) })}
                    onFocus={(event) => event.currentTarget.select()}
                    trailing={<span className="pe-2 text-xs text-fg-subtle">{currency}</span>}
                    className="text-end tnum"
                  />
                  {errors.unitCost ? (
                    <p className="type-caption mt-1 text-end text-danger-text">{errorText(errors.unitCost)}</p>
                  ) : product && product.purchasePrice !== check.item.unitCost ? (
                    <p className="type-caption mt-1 text-end text-fg-subtle">{t('inventory.purchaseForm.lastCost', { amount: format.money(product.purchasePrice) })}</p>
                  ) : null}
                </td>
                <td className="border-b border-border px-2 py-2.5">
                  <Input
                    aria-label={t('inventory.purchaseForm.discountFor', { name })}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={line.discount}
                    invalid={Boolean(errors.discount)}
                    onChange={(event) => onChange(line.productId, { discount: cleanNumber(event.target.value) })}
                    onFocus={(event) => event.currentTarget.select()}
                    trailing={<span className="pe-2 text-xs text-fg-subtle">{currency}</span>}
                    className="text-end tnum"
                  />
                  {errors.discount && <p className="type-caption mt-1 text-end text-danger-text">{errorText(errors.discount)}</p>}
                </td>
                <td className="border-b border-border px-2 py-2.5">
                  <Select aria-label={t('inventory.purchaseForm.vatFor', { name })} value={String(line.taxRate)} options={rateOptions} onChange={(value) => onChange(line.productId, { taxRate: Number(value) })} />
                </td>
                <td className="border-b border-border px-3 py-2.5 text-end">
                  <p className="pt-2 font-semibold text-fg tnum">{format.money(lineTotals?.total ?? 0)}</p>
                  {lineTotals && lineTotals.tax > 0 && <p className="type-caption text-fg-subtle tnum">{t('inventory.purchaseForm.vatAmount', { amount: format.money(lineTotals.tax) })}</p>}
                </td>
                <td className="border-b border-border px-2 py-2.5 text-center">
                  <IconButton icon={Trash2} variant="danger" label={t('inventory.purchaseForm.remove', { name })} tooltipSide="left" onClick={() => onRemove(line.productId)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
