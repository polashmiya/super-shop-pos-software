import type { ReactNode } from 'react';
import { Banknote, CircleSlash, History, Percent, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { calculateDiscountAmount } from '@/domain/pricing';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Money, Product } from '@/types';
import { SegmentedControl, Select, type SelectOption } from '@/components/ui/Controls';
import { Badge, Card, SectionHeader } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { marginOf, parsedPrices, priceChanges, type ProductSectionProps, type PromotionKind } from './productForm';

interface PricingSectionProps extends ProductSectionProps {
  /** The saved product when editing — changed prices then ask for an optional reason. */
  product: Product | null;
}

/** Purchase / selling price, MRP, promotion, VAT rate, live margin and the price-change reason. */
export function PricingSection({ form, errors, update, product }: PricingSectionProps) {
  const t = useT();
  const format = useFormat();
  const tax = useSettingsStore((state) => state.business.tax);
  const symbol = useSettingsStore((state) => state.business.currency.symbol);
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);

  const { purchase, selling, discount } = parsedPrices(form);
  const saving = selling !== null ? calculateDiscountAmount(selling, discount) : 0;
  const promoPrice = selling !== null ? selling - saving : null;
  const margin = marginOf(purchase, selling);
  const promoMargin = saving > 0 ? marginOf(purchase, promoPrice) : null;
  const loss = (margin !== null && margin.profit < 0) || (promoMargin !== null && promoMargin.profit < 0);
  const changes = priceChanges(form, product);

  const currentRate = Number(form.taxRate) || 0;
  const rateOptions: SelectOption[] = [...new Set([...tax.rates, currentRate])].sort((a, b) => a - b).map((rate) => ({ value: String(rate), label: format.percent(rate) }));
  const promotionOptions: Array<{ value: PromotionKind; label: string; icon: LucideIcon }> = [
    { value: 'none', label: t('catalog.form.fields.promotionNone'), icon: CircleSlash },
    { value: 'percent', label: t('catalog.form.fields.promotionPercent'), icon: Percent },
    { value: 'fixed', label: t('catalog.form.fields.promotionFixed'), icon: Banknote },
  ];

  const suffix = (text: string) => <span className="px-2 text-sm font-medium text-fg-subtle">{text}</span>;
  const money = (value: Money | null) => (value === null ? t('catalog.detail.prices.notSet') : format.money(value));
  const metric = (label: string, value: ReactNode, danger = false) => (
    <div className="min-w-0">
      <dt className="type-caption text-fg-subtle">{label}</dt>
      <dd className={cn('text-lg font-bold tnum', danger ? 'text-danger-text' : 'text-fg')}>{value}</dd>
    </div>
  );
  const priceField = (field: 'purchasePrice' | 'sellingPrice' | 'mrp', id: string) => (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      className="tnum"
      value={form[field]}
      placeholder={t('catalog.form.placeholders.amount')}
      invalid={Boolean(errors[field])}
      trailing={suffix(symbol)}
      onChange={(event) => {
        const value = event.target.value;
        update(field === 'purchasePrice' ? { purchasePrice: value } : field === 'sellingPrice' ? { sellingPrice: value } : { mrp: value });
      }}
    />
  );

  return (
    <Card className="flex flex-col gap-4">
      <SectionHeader icon={Banknote} title={t('catalog.form.sections.pricing')} description={t('catalog.form.sections.pricingHint')} />
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label={t('catalog.form.fields.purchasePrice')} required error={err('purchasePrice')} hint={t('catalog.form.fields.purchasePriceHint')}>
          {(id) => priceField('purchasePrice', id)}
        </FormField>
        <FormField label={t('catalog.form.fields.sellingPrice')} required error={err('sellingPrice')} hint={t('catalog.form.fields.sellingPriceHint')}>
          {(id) => priceField('sellingPrice', id)}
        </FormField>
        <FormField label={t('catalog.form.fields.mrp')} error={err('mrp')} hint={t('catalog.form.fields.mrpHint')}>
          {(id) => priceField('mrp', id)}
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="type-label text-fg-muted">{t('catalog.form.fields.promotion')}</span>
            <SegmentedControl<PromotionKind> ariaLabel={t('catalog.form.fields.promotion')} value={form.promotion} options={promotionOptions} fullWidth onChange={(promotion) => update({ promotion, promotionValue: '' })} />
          </div>
          {form.promotion !== 'none' && (
            <FormField
              label={t(form.promotion === 'percent' ? 'catalog.form.fields.promotionPercentValue' : 'catalog.form.fields.promotionFixedValue')}
              required
              error={err('promotionValue')}
              hint={saving > 0 && promoPrice !== null ? t('catalog.form.fields.promotionPreview', { price: format.money(promoPrice), amount: format.money(saving) }) : t('catalog.form.fields.promotionHint')}
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  className="tnum"
                  value={form.promotionValue}
                  placeholder={form.promotion === 'percent' ? '0' : t('catalog.form.placeholders.amount')}
                  invalid={Boolean(errors.promotionValue)}
                  trailing={suffix(form.promotion === 'percent' ? '%' : symbol)}
                  onChange={(event) => update({ promotionValue: event.target.value })}
                />
              )}
            </FormField>
          )}
        </div>
        <FormField label={t('catalog.form.fields.vatRate')} error={err('taxRate')} hint={tax.enabled ? undefined : t('catalog.form.fields.vatDisabled')}>
          {(id) => <Select id={id} value={String(currentRate)} options={rateOptions} invalid={Boolean(errors.taxRate)} aria-invalid={errors.taxRate ? true : undefined} onChange={(taxRate) => update({ taxRate })} />}
        </FormField>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
        {margin ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            {metric(t('catalog.form.fields.margin'), format.percentValue(margin.rate), margin.profit < 0)}
            {metric(t('catalog.form.fields.profit'), format.money(margin.profit), margin.profit < 0)}
            {metric(t('catalog.form.fields.promoMargin'), promoMargin ? format.percentValue(promoMargin.rate) : '—', promoMargin !== null && promoMargin.profit < 0)}
          </dl>
        ) : (
          <p className="type-body-sm flex items-center gap-2 text-fg-subtle">
            <TrendingUp size={16} aria-hidden />
            {t('catalog.form.fields.marginEmpty')}
          </p>
        )}
        {loss && (
          <p role="alert" className="type-body-sm flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 font-medium text-danger-text">
            <TriangleAlert size={16} aria-hidden className="shrink-0" />
            {t('catalog.form.fields.belowCost')}
          </p>
        )}
      </div>

      {changes.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Badge tone="warning" icon={History}>
              {t('catalog.form.fields.priceChanged')}
            </Badge>
            {changes.map((change) => (
              <span key={change.field} className="type-body-sm text-fg-muted tnum">
                {t(`catalog.detail.prices.fields.${change.field}`)}: {money(change.from)} → <strong className="font-semibold text-fg">{money(change.to)}</strong>
              </span>
            ))}
          </div>
          <FormField label={t('catalog.form.fields.priceReason')} hint={t('catalog.form.fields.priceReasonHint')}>
            {(id) => <Input id={id} value={form.priceReason} maxLength={200} placeholder={t('catalog.form.placeholders.priceReason')} onChange={(event) => update({ priceReason: event.target.value })} />}
          </FormField>
        </div>
      )}
    </Card>
  );
}
