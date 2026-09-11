import { Wallet } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { Payment } from '@/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SectionHeader } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/States';
import { PAYMENT_ICONS, providerLabelKey } from './saleMeta';

/** How a sale was paid: method, provider, tendered, applied, change, reference and points. */
export function SalePaymentsTable({ payments }: { payments: readonly Payment[] }) {
  const t = useT();
  const format = useFormat();

  const columns: Array<Column<Payment>> = [
    {
      key: 'method',
      header: t('common.labels.method'),
      cell: (payment) => {
        const Icon = PAYMENT_ICONS[payment.method];
        const providerKey = providerLabelKey(payment.method, payment.provider);
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted">
              <Icon size={16} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="font-medium whitespace-nowrap text-fg">{t(`enums.paymentMethod.${payment.method}`)}</p>
              {(providerKey || payment.provider) && <p className="type-caption text-fg-subtle">{providerKey ? t(providerKey) : payment.provider}</p>}
            </div>
          </div>
        );
      },
    },
    { key: 'tendered', header: t('sales.detail.payments.tendered'), align: 'end', cell: (payment) => format.money(payment.tendered) },
    { key: 'applied', header: t('sales.detail.payments.applied'), align: 'end', cell: (payment) => <span className="font-semibold text-fg">{format.money(payment.amount)}</span> },
    {
      key: 'change',
      header: t('sales.detail.payments.change'),
      align: 'end',
      cell: (payment) => (payment.change > 0 ? format.money(payment.change) : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'reference',
      header: t('common.labels.reference'),
      cell: (payment) => (payment.reference ? <span className="selectable font-mono text-[0.84rem]">{payment.reference}</span> : <span className="text-fg-subtle">—</span>),
    },
    {
      key: 'points',
      header: t('sales.detail.payments.points'),
      align: 'end',
      cell: (payment) => (payment.points > 0 ? format.integer(payment.points) : <span className="text-fg-subtle">—</span>),
    },
  ];

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby="sale-payments-title">
      <div id="sale-payments-title">
        <SectionHeader icon={Wallet} title={t('sales.detail.payments.title')} />
      </div>
      <DataTable
        ariaLabel={t('sales.detail.payments.title')}
        columns={columns}
        rows={payments}
        rowKey={(payment) => payment.id}
        dense
        empty={<EmptyState compact icon={Wallet} title={t('sales.detail.payments.empty')} />}
      />
    </section>
  );
}
