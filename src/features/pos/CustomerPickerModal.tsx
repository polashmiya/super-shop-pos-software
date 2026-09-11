import { useEffect, useState } from 'react';
import { Crown, UserPlus, UserRound } from 'lucide-react';
import { APP_CONFIG } from '@/config/app.config';
import { useDebouncedValue } from '@/hooks/useCommon';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService, validateCustomerInput } from '@/services/peopleService';
import { useCan } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Customer, CustomerInput, CustomerType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Select } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Display';
import { FormField, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { selectCustomer } from './posActions';
import { usePosUi } from './posUiStore';

/** Find a customer by phone/name, or add one in a few seconds. */
export function CustomerPickerModal() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'customer') return null;
  return <CustomerPicker />;
}

function CustomerPicker() {
  const t = useT();
  const format = useFormat();
  const close = usePosUi((state) => state.close);
  const canCreate = useCan('customers.manage');
  const defaultType = useSettingsStore((state) => state.business.customer.defaultType);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(query, APP_CONFIG.tables.searchDebounceMs);
  const [form, setForm] = useState<CustomerInput>({ name: '', phone: '', email: '', address: '', customerType: defaultType, discountRate: 0, notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      await Promise.resolve();
      if (!alive) return;
      setLoading(true);
      try {
        const list = await customerService.search(debounced, 8);
        if (alive) setResults(list);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [debounced]);

  const choose = (customer: Customer | null) => {
    selectCustomer(customer);
    close();
  };

  const startCreate = () => {
    const digits = query.replace(/\D/g, '');
    setForm((current) => ({ ...current, phone: digits.length >= 6 ? digits : current.phone, name: digits.length >= 6 ? current.name : query }));
    setCreating(true);
  };

  const save = async () => {
    const fieldErrors = validateCustomerInput(form);
    setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key, t(`validation.${value}`)])));
    if (Object.keys(fieldErrors).length > 0) return;
    setSaving(true);
    try {
      const created = await customerService.create(form);
      toast.success({ key: 'pos.customerPicker.added', params: { name: created.name } });
      choose(created);
    } catch (error) {
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <Modal
        open
        onClose={() => setCreating(false)}
        size="md"
        title={t('pos.customerPicker.newTitle')}
        closeLabel={t('common.actions.close')}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>{t('common.actions.back')}</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {t('pos.customerPicker.create')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FormField label={t('common.labels.phone')} required error={errors.phone}>
            {(id) => <Input id={id} data-autofocus inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} invalid={Boolean(errors.phone)} />}
          </FormField>
          <FormField label={t('common.labels.name')} required error={errors.name}>
            {(id) => <Input id={id} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} invalid={Boolean(errors.name)} />}
          </FormField>
          <FormField label={t('common.labels.type')}>
            {(id) => (
              <Select<CustomerType>
                id={id}
                value={form.customerType}
                onChange={(customerType) => setForm({ ...form, customerType })}
                options={(['regular', 'vip', 'wholesale', 'walk_in'] as CustomerType[]).map((type) => ({ value: type, label: t(`enums.customerType.${type}`) }))}
              />
            )}
          </FormField>
          <FormField label={t('common.labels.email')} error={errors.email}>
            {(id) => <Input id={id} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}
          </FormField>
          <FormField label={t('common.labels.address')} className="sm:col-span-2">
            {(id) => <Input id={id} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />}
          </FormField>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title={t('pos.customerPicker.title')}
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button icon={UserRound} onClick={() => choose(null)}>
            {t('pos.customerPicker.walkIn')}
          </Button>
          {canCreate && (
            <Button variant="primary" icon={UserPlus} onClick={startCreate}>
              {t('pos.customerPicker.addNew')}
            </Button>
          )}
        </>
      }
    >
      <Combobox
        inline
        autoFocus
        ariaLabel={t('pos.customerPicker.title')}
        query={query}
        onQueryChange={setQuery}
        results={results}
        loading={loading}
        getKey={(customer) => customer.id}
        onSelect={choose}
        placeholder={t('pos.customerPicker.searchPlaceholder')}
        emptyText={
          <span className="flex flex-col items-center gap-2">
            {t('pos.customerPicker.noResults')}
            {canCreate && (
              <Button size="sm" variant="soft" icon={UserPlus} onClick={startCreate}>
                {t('pos.customerPicker.addNew')}
              </Button>
            )}
          </span>
        }
        renderItem={(customer) => (
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-muted">
              {customer.customerType === 'vip' ? <Crown size={16} aria-hidden /> : <UserRound size={16} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{customer.name}</p>
              <p className="truncate text-xs text-fg-subtle tnum">
                {format.digits(customer.phone)} · {t('common.units.orders', { count: customer.totalOrders })}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge size="sm" tone={customer.customerType === 'vip' ? 'warning' : customer.customerType === 'wholesale' ? 'info' : 'neutral'}>
                {t(`enums.customerType.${customer.customerType}`)}
              </Badge>
              <span className="text-xs text-fg-muted tnum">{t('common.units.points', { count: customer.loyaltyPoints })}</span>
            </div>
          </div>
        )}
      />
    </Modal>
  );
}
