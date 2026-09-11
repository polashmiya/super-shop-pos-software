import { Undo2 } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useLocalize, useT } from '@/i18n';
import type { SaleReturn } from '@/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { SectionHeader } from '@/components/ui/Display';
import { RefundMethodBadge } from './SaleBadges';

/** Returns made against one sale (partial returns can happen several times). */
export function SaleReturnsHistory({ returns }: { returns: readonly SaleReturn[] }) {
  const t = useT();
  const localize = useLocalize();
  const format = useFormat();
  if (returns.length === 0) return null;
  const total = returns.reduce((sum, entry) => sum + entry.refundTotal, 0);

  const columns: Array<Column<SaleReturn>> = [
    { key: 'no', header: t('sales.returnsPage.columns.returnNo'), cell: (entry) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{entry.returnNo}</span> },
    {
      key: 'date',
      header: t('common.labels.dateTime'),
      cell: (entry) => <span className="whitespace-nowrap tnum">{format.dateTime(entry.createdAt)}</span>,
    },
    { key: 'cashier', header: t('common.labels.cashier'), cell: (entry) => <span className="block max-w-36 truncate">{entry.cashierName}</span> },
    {
      key: 'reason',
      header: t('common.labels.reason'),
      cell: (entry) => (
        <div className="min-w-0 max-w-56 leading-tight">
          <p className="truncate" title={entry.reason}>
            {entry.reason}
          </p>
          {entry.approvedBy && <p className="type-caption truncate text-fg-subtle">{t('auth.approvedBy', { name: entry.approvedBy })}</p>}
        </div>
      ),
    },
    { key: 'method', header: t('sales.returnsPage.columns.refundMethod'), cell: (entry) => <RefundMethodBadge size="sm" method={entry.refundMethod} /> },
    {
      key: 'items',
      header: t('common.labels.items'),
      cell: (entry) => {
        const text = entry.items.map((item) => `${localize(item.name)} × ${format.quantity(item.quantity)}`).join(', ');
        return (
          <p className="max-w-64 truncate text-fg-muted" title={text}>
            {text}
          </p>
        );
      },
    },
    { key: 'refund', header: t('sales.returnsPage.columns.refund'), align: 'end', cell: (entry) => <span className="font-semibold whitespace-nowrap text-fg">{format.money(entry.refundTotal)}</span> },
  ];

  return (
    <section id="sale-returns" className="flex flex-col gap-3" aria-labelledby="sale-returns-title">
      <div id="sale-returns-title">
        <SectionHeader icon={Undo2} title={t('sales.detail.returns.title')} description={t('sales.detail.returns.summary', { count: returns.length, amount: format.money(total) })} />
      </div>
      <DataTable ariaLabel={t('sales.detail.returns.title')} columns={columns} rows={returns} rowKey={(entry) => entry.id} dense />
    </section>
  );
}
