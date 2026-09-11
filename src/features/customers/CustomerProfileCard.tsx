import type { ReactNode } from 'react';
import { CalendarDays, Mail, MapPin, NotebookPen, Percent, Phone } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Customer } from '@/types';
import { Avatar, Card } from '@/components/ui/Display';
import { CustomerTypeBadge } from './CustomerBadges';
import { customerAvatarColor, memberDiscount } from './customerMeta';

function Line({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="type-caption text-fg-subtle">{label}</p>
        <div className="text-sm break-words text-fg">{children}</div>
      </div>
    </div>
  );
}

/** Contact details, type, member discount and notes of a customer. */
export function CustomerProfileCard({ customer }: { customer: Customer }) {
  const t = useT();
  const format = useFormat();
  const discountSettings = useSettingsStore((state) => state.business.discount);
  const discount = memberDiscount(customer, discountSettings);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar name={customer.name} color={customerAvatarColor(customer.id)} size={64} />
        <div className="min-w-0">
          <h2 className="type-h2 truncate text-fg">{customer.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-fg-subtle">{customer.code}</span>
            <CustomerTypeBadge size="sm" type={customer.customerType} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Line icon={<Phone size={16} />} label={t('common.labels.phone')}>
          <span className="tnum">{customer.phone ? format.digits(customer.phone) : t('customers.detail.notGiven')}</span>
        </Line>
        <Line icon={<Mail size={16} />} label={t('common.labels.email')}>
          {customer.email || <span className="text-fg-subtle">{t('customers.detail.notGiven')}</span>}
        </Line>
        <Line icon={<MapPin size={16} />} label={t('common.labels.address')}>
          {customer.address || <span className="text-fg-subtle">{t('customers.detail.notGiven')}</span>}
        </Line>
        <Line icon={<Percent size={16} />} label={t('customers.fields.discount')}>
          {discount.rate > 0 ? (
            <span>
              {format.percent(discount.rate)}
              <span className="text-fg-subtle"> · {discount.fromType ? t('customers.detail.discountFromType') : t('customers.detail.discountOwn')}</span>
            </span>
          ) : (
            <span className="text-fg-subtle">{t('customers.detail.noDiscount')}</span>
          )}
        </Line>
        <Line icon={<CalendarDays size={16} />} label={t('customers.detail.memberSince')}>
          {format.date(customer.createdAt, 'long')}
        </Line>
        <Line icon={<NotebookPen size={16} />} label={t('common.labels.notes')}>
          {customer.notes || <span className="text-fg-subtle">{t('customers.detail.noNotes')}</span>}
        </Line>
      </div>
    </Card>
  );
}
