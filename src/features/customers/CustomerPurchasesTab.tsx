import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ExternalLink, ReceiptText } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useAsync } from '@/hooks/useAsync';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService } from '@/services/peopleService';
import type { Customer, Sale } from '@/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, LoadingBar } from '@/components/ui/States';
import { PaymentSummaryBadge, SaleStatusBadge } from '@/features/sales/SaleBadges';
import { customerSalesLink } from './customerLinks';

/** The customer's sales, newest first (server paginated). */
export function CustomerPurchasesTab({ customer, canSeeSales }: { customer: Customer; canSeeSales: boolean }) {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(APP_CONFIG.tables.defaultPageSize);
  const history = useAsync(() => customerService.purchaseHistory(customer.id, { page, pageSize }), [customer.id, page, pageSize]);

  const columns: Array<Column<Sale>> = [
    { key: 'invoice', header: t('common.labels.invoice'), cell: (sale) => <span className="font-mono text-[0.86rem] font-semibold whitespace-nowrap text-fg">{sale.invoiceNo}</span> },
    {
      key: 'date',
      header: t('common.labels.dateTime'),
      cell: (sale) => (
        <span className="whitespace-nowrap tnum">
          {format.date(sale.createdAt)} <span className="text-fg-subtle">{format.time(sale.createdAt)}</span>
        </span>
      ),
    },
    { key: 'items', header: t('common.labels.items'), align: 'end', cell: (sale) => format.integer(sale.itemCount) },
    { key: 'payment', header: t('customers.purchases.payment'), cell: (sale) => <PaymentSummaryBadge size="sm" summary={sale.paymentSummary} /> },
    {
      key: 'total',
      header: t('common.labels.total'),
      align: 'end',
      cell: (sale) => <span className={sale.status === 'cancelled' ? 'font-semibold text-fg-subtle line-through' : 'font-semibold text-fg'}>{format.money(sale.grandTotal)}</span>,
    },
    { key: 'points', header: t('customers.purchases.points'), align: 'end', hideable: true, cell: (sale) => (sale.pointsEarned > 0 ? `+${format.integer(sale.pointsEarned)}` : '—') },
    { key: 'status', header: t('common.labels.status'), cell: (sale) => <SaleStatusBadge size="sm" status={sale.status} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {canSeeSales && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => navigate(customerSalesLink(customer))}>
            {t('customers.purchases.openInSales')}
          </Button>
        </div>
      )}
      <div className="relative">
        <LoadingBar active={history.loading && Boolean(history.data)} />
        <DataTable
          ariaLabel={t('customers.tabs.purchases')}
          columns={columns}
          rows={history.data?.rows ?? []}
          rowKey={(sale) => sale.id}
          loading={!history.data && !history.error}
          onRowClick={canSeeSales ? (sale) => navigate(`/sales/${sale.id}`) : undefined}
          pagination={
            history.data && history.data.total > 0
              ? {
                  page,
                  pageSize,
                  total: history.data.total,
                  onPageChange: setPage,
                  onPageSizeChange: (size) => {
                    setPageSize(size);
                    setPage(1);
                  },
                }
              : undefined
          }
          empty={
            history.error ? (
              <EmptyState compact icon={ReceiptText} title={t('errors.loadFailed')} action={<Button onClick={history.reload}>{t('common.actions.retry')}</Button>} />
            ) : (
              <EmptyState compact icon={ReceiptText} title={t('customers.purchases.empty')} description={t('customers.purchases.emptyHint')} />
            )
          }
        />
      </div>
    </div>
  );
}
