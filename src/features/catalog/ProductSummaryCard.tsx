import { BadgePercent, CircleCheck, CircleSlash, CircleX, Info, Scale, Star, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useLocalize, useT } from '@/i18n';
import type { Product } from '@/types';
import { Badge, Card, Meter, StatusBadge } from '@/components/ui/Display';
import { cn } from '@/components/ui/cn';
import { ProductImage } from '@/components/product/ProductImage';
import { stockPlan } from './productDetail';

interface ProductSummaryCardProps {
  product: Product;
  /** Short name of the product's unit ("kg", "pc"). */
  unitShort: string;
}

interface StockMessage {
  icon: LucideIcon;
  className: string;
  text: string;
}

/** Left column of the product detail: image, flags, stock level with reorder hint and description. */
export function ProductSummaryCard({ product, unitShort }: ProductSummaryCardProps) {
  const t = useT();
  const format = useFormat();
  const localize = useLocalize();
  const language = useLanguage();
  const plan = stockPlan(product);
  const unit = unitShort || undefined;
  const description = localize(product.description).trim();
  const otherDescription = (language === 'bn' ? product.description.en : product.description.bn).trim();

  const messages: StockMessage[] = [];
  if (plan.out) messages.push({ icon: CircleX, className: 'text-danger-text', text: t('catalog.detail.stockLevel.out') });
  if (!plan.hasMax) messages.push({ icon: Info, className: 'text-fg-muted', text: t('catalog.detail.stockLevel.noMax') });
  else if (plan.low && plan.reorder > 0) messages.push({ icon: TriangleAlert, className: 'text-warning-text', text: t('catalog.detail.stockLevel.reorder', { qty: format.quantity(plan.reorder, unit) }) });
  else if (!plan.low) messages.push({ icon: CircleCheck, className: 'text-success-text', text: t('catalog.detail.stockLevel.healthy') });

  return (
    <Card className="flex flex-col gap-5 self-start">
      <ProductImage product={product} className="aspect-square w-full" iconSize={80} />

      <div className="flex flex-wrap gap-1.5">
        {product.status === 'active' ? (
          <StatusBadge tone="success" icon={CircleCheck} label={t('enums.productStatus.active')} />
        ) : (
          <StatusBadge tone="neutral" icon={CircleSlash} label={t('enums.productStatus.inactive')} />
        )}
        {product.featured && (
          <Badge tone="warning" icon={Star}>
            {t('catalog.products.featured')}
          </Badge>
        )}
        {product.weighted && (
          <Badge tone="info" icon={Scale}>
            {t('catalog.products.byWeight')}
          </Badge>
        )}
        {product.discount && (
          <Badge tone="danger" icon={BadgePercent}>
            {t('catalog.products.promo')}
          </Badge>
        )}
      </div>

      <section className="flex flex-col gap-2.5 border-t border-border pt-4">
        <h2 className="type-label text-fg-muted">{t('catalog.detail.sections.stockLevel')}</h2>
        <p className="text-2xl leading-tight font-bold text-fg tnum">{format.quantity(product.stock, unit)}</p>
        <Meter value={plan.fill} tone={plan.tone} label={t('catalog.detail.sections.stockLevel')} />
        <div className="type-caption flex justify-between gap-2 text-fg-subtle tnum">
          <span>{t('catalog.detail.stockLevel.min', { value: format.quantity(product.minStock, unit) })}</span>
          {plan.hasMax && <span>{t('catalog.detail.stockLevel.max', { value: format.quantity(product.maxStock, unit) })}</span>}
        </div>
        {messages.map(({ icon: Icon, className, text }) => (
          <p key={text} className={cn('type-body-sm flex items-start gap-2', className)}>
            <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
            {text}
          </p>
        ))}
      </section>

      <section className="flex flex-col gap-1.5 border-t border-border pt-4">
        <h2 className="type-label text-fg-muted">{t('catalog.detail.sections.description')}</h2>
        {description ? (
          <>
            <p className="type-body-sm break-words whitespace-pre-line text-fg">{description}</p>
            {otherDescription && otherDescription !== description && <p className="type-body-sm break-words whitespace-pre-line text-fg-subtle">{otherDescription}</p>}
          </>
        ) : (
          <p className="type-body-sm text-fg-subtle">{t('catalog.detail.fields.noDescription')}</p>
        )}
      </section>
    </Card>
  );
}
