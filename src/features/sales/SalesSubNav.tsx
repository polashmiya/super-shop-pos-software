import { ReceiptText, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useT } from '@/i18n';
import { Tabs } from '@/components/ui/Controls';

/** Sales | Returns sub-navigation, sitting on the page header's bottom edge. */
export function SalesSubNav({ active }: { active: 'sales' | 'returns' }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Tabs
      ariaLabel={t('sales.title')}
      value={active}
      onChange={(value) => {
        if (value !== active) navigate(value === 'returns' ? '/sales/returns' : '/sales');
      }}
      items={[
        { value: 'sales', label: t('sales.tabs.sales'), icon: ReceiptText },
        { value: 'returns', label: t('sales.tabs.returns'), icon: Undo2 },
      ]}
      className="-mb-[calc(var(--space-unit)*4_+_1px)]"
    />
  );
}
