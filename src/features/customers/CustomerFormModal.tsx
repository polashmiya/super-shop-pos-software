import { useState } from 'react';
import { UserPlus, UserRoundPen } from 'lucide-react';
import { isAppError } from '@/domain/errors';
import { parsePercentInput } from '@/domain/money';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { customerService, validateCustomerInput, type CustomerFieldErrors } from '@/services/peopleService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Customer, CustomerInput, CustomerType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Controls';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CUSTOMER_TYPES } from './customerMeta';

type FieldKey = keyof CustomerFieldErrors;

interface CustomerFormModalProps {
  /** null = new customer. */
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

function initialInput(customer: Customer | null, defaultType: CustomerType): CustomerInput {
  if (!customer) return { name: '', phone: '', email: '', address: '', customerType: defaultType, discountRate: 0, notes: '' };
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    customerType: customer.customerType,
    discountRate: customer.discountRate,
    notes: customer.notes,
  };
}

/** Add or edit a customer (validated like the service; duplicate phones are shown on the field). */
export function CustomerFormModal({ customer, onClose, onSaved }: CustomerFormModalProps) {
  const t = useT();
  const format = useFormat();
  const defaultType = useSettingsStore((state) => state.business.customer.defaultType);
  const requirePhone = useSettingsStore((state) => state.business.customer.requirePhone);
  const typeRates = useSettingsStore((state) => state.business.discount.customerTypeRates);
  const [form, setForm] = useState<CustomerInput>(() => initialInput(customer, defaultType));
  const [discountText, setDiscountText] = useState(() => (customer && customer.discountRate > 0 ? String(customer.discountRate / 100) : ''));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const typeRate = form.customerType === 'walk_in' ? 0 : typeRates[form.customerType];

  const save = async () => {
    const parsed = discountText.trim() === '' ? 0 : parsePercentInput(discountText);
    const input: CustomerInput = { ...form, discountRate: parsed ?? -1 };
    const fieldErrors = validateCustomerInput(input);
    setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key, t(`validation.${value}`)])));
    if (Object.keys(fieldErrors).length > 0) return;
    setSaving(true);
    try {
      const saved = customer ? await customerService.update(customer.id, input) : await customerService.create(input);
      toast.success({ key: customer ? 'customers.form.updated' : 'customers.form.created', params: { name: saved.name } });
      onSaved(saved);
    } catch (error) {
      if (isAppError(error) && error.code === 'duplicatePhone') setErrors((current) => ({ ...current, phone: t('errors.duplicatePhone') }));
      toast.fromError(error);
    } finally {
      setSaving(false);
    }
  };

  const Icon = customer ? UserRoundPen : UserPlus;

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title={customer ? t('customers.form.editTitle') : t('customers.form.newTitle')}
      description={customer ? `${customer.code} · ${customer.name}` : t('customers.form.newHint')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <Icon size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {customer ? t('common.actions.saveChanges') : t('customers.form.create')}
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
        <FormField label={t('common.labels.phone')} required={requirePhone} error={errors.phone} hint={t('customers.form.phoneHint')}>
          {(id) => <Input id={id} data-autofocus inputMode="tel" autoComplete="off" value={form.phone} onChange={(event) => set('phone', event.target.value)} invalid={Boolean(errors.phone)} />}
        </FormField>
        <FormField label={t('common.labels.name')} required error={errors.name}>
          {(id) => <Input id={id} autoComplete="off" maxLength={120} value={form.name} onChange={(event) => set('name', event.target.value)} invalid={Boolean(errors.name)} />}
        </FormField>
        <FormField label={t('customers.fields.type')}>
          {(id) => (
            <Select<CustomerType>
              id={id}
              value={form.customerType}
              onChange={(value) => set('customerType', value)}
              options={CUSTOMER_TYPES.map((type) => ({ value: type, label: t(`enums.customerType.${type}`) }))}
            />
          )}
        </FormField>
        <FormField
          label={t('customers.fields.discount')}
          error={errors.discountRate}
          hint={typeRate > 0 ? t('customers.form.discountHintType', { rate: format.percent(typeRate) }) : t('customers.form.discountHint')}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={discountText}
              placeholder="0"
              invalid={Boolean(errors.discountRate)}
              onChange={(event) => {
                setDiscountText(event.target.value.replace(/[^\d.০-৯]/g, ''));
                if (errors.discountRate) setErrors((current) => ({ ...current, discountRate: undefined }));
              }}
              trailing={<span className="pe-3 font-semibold text-fg-muted">%</span>}
            />
          )}
        </FormField>
        <FormField label={t('common.labels.email')} error={errors.email}>
          {(id) => <Input id={id} type="email" autoComplete="off" value={form.email} onChange={(event) => set('email', event.target.value)} invalid={Boolean(errors.email)} />}
        </FormField>
        <FormField label={t('common.labels.address')}>
          {(id) => <Input id={id} autoComplete="off" maxLength={240} value={form.address} onChange={(event) => set('address', event.target.value)} />}
        </FormField>
        <FormField label={t('common.labels.notes')} className="sm:col-span-2" hint={t('customers.form.notesHint')}>
          {(id) => <Textarea id={id} rows={2} maxLength={500} value={form.notes} onChange={(event) => set('notes', event.target.value)} />}
        </FormField>
      </form>
    </Modal>
  );
}
