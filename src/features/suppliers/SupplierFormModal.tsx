import { useState } from 'react';
import { Truck } from 'lucide-react';
import { parseMoneyInput } from '@/domain/money';
import { useT } from '@/i18n';
import { supplierService, validateSupplierInput, type SupplierFieldErrors } from '@/services/peopleService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';
import type { Supplier, SupplierInput } from '@/types';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Controls';
import { FormField, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { minorToInput } from '@/features/purchases/purchaseForm';

interface SupplierFormModalProps {
  open: boolean;
  /** Supplier to edit, or null to create a new one. */
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}

/** Add / edit a supplier (contact details, opening balance in taka, status). */
export function SupplierFormModal({ open, supplier, onClose, onSaved }: SupplierFormModalProps) {
  if (!open) return null;
  return <SupplierForm key={supplier?.id ?? 'new'} supplier={supplier} onClose={onClose} onSaved={onSaved} />;
}

function SupplierForm({ supplier, onClose, onSaved }: Omit<SupplierFormModalProps, 'open'>) {
  const t = useT();
  const currency = useSettingsStore((state) => state.business.currency.symbol);
  const [name, setName] = useState(supplier?.name ?? '');
  const [company, setCompany] = useState(supplier?.company ?? '');
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [opening, setOpening] = useState(supplier && supplier.openingBalance > 0 ? minorToInput(supplier.openingBalance) : '');
  const [active, setActive] = useState(supplier ? supplier.status === 'active' : true);
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const openingBalance = opening.trim() === '' ? 0 : parseMoneyInput(opening);
  const input: SupplierInput = {
    ...(supplier ? { id: supplier.id } : {}),
    name: name.trim(),
    company: company.trim(),
    contactPerson: contactPerson.trim(),
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim(),
    openingBalance: openingBalance ?? -1,
    status: active ? 'active' : 'inactive',
    notes: notes.trim(),
  };
  const errors: SupplierFieldErrors = submitted ? validateSupplierInput(input) : {};
  const message = (key: SupplierFieldErrors[keyof SupplierFieldErrors]) => (key ? t(`validation.${key}`) : undefined);

  const submit = async () => {
    setSubmitted(true);
    if (Object.keys(validateSupplierInput(input)).length > 0) return;
    setBusy(true);
    try {
      const saved = supplier ? await supplierService.update(supplier.id, input) : await supplierService.create(input);
      toast.success(supplier ? { key: 'inventory.supplierForm.updated', params: { name: saved.name } } : { key: 'inventory.supplierForm.created', params: { name: saved.name } });
      onSaved(saved);
      onClose();
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={supplier ? t('inventory.supplierForm.editTitle') : t('inventory.supplierForm.newTitle')}
      description={supplier ? `${supplier.code} · ${supplier.name}` : t('inventory.supplierForm.description')}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg">
          <Truck size={20} aria-hidden />
        </span>
      }
      closeLabel={t('common.actions.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {supplier ? t('common.actions.saveChanges') : t('inventory.supplierForm.create')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label={t('inventory.supplierForm.name')} required error={message(errors.name)} className="sm:col-span-2">
          {(id) => <Input id={id} data-autofocus value={name} maxLength={120} invalid={Boolean(errors.name)} placeholder={t('inventory.supplierForm.namePlaceholder')} onChange={(event) => setName(event.target.value)} />}
        </FormField>
        <FormField label={t('inventory.supplierForm.company')}>{(id) => <Input id={id} value={company} maxLength={120} onChange={(event) => setCompany(event.target.value)} />}</FormField>
        <FormField label={t('inventory.supplierForm.contactPerson')}>{(id) => <Input id={id} value={contactPerson} maxLength={80} onChange={(event) => setContactPerson(event.target.value)} />}</FormField>
        <FormField label={t('common.labels.phone')} error={message(errors.phone)} hint={t('inventory.supplierForm.phoneHint')}>
          {(id) => <Input id={id} type="tel" inputMode="tel" value={phone} maxLength={20} invalid={Boolean(errors.phone)} placeholder="01XXXXXXXXX" onChange={(event) => setPhone(event.target.value)} />}
        </FormField>
        <FormField label={t('common.labels.email')} error={message(errors.email)}>
          {(id) => <Input id={id} type="email" value={email} maxLength={120} invalid={Boolean(errors.email)} onChange={(event) => setEmail(event.target.value)} />}
        </FormField>
        <FormField label={t('common.labels.address')} className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={address} maxLength={240} onChange={(event) => setAddress(event.target.value)} />}
        </FormField>
        <FormField label={t('inventory.supplierForm.openingBalance')} error={message(errors.openingBalance)} hint={t('inventory.supplierForm.openingBalanceHint')}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={opening}
              placeholder="0"
              invalid={Boolean(errors.openingBalance)}
              onChange={(event) => setOpening(event.target.value.replace(/[^\d.,০-৯]/g, ''))}
              trailing={<span className="pe-2 text-sm text-fg-subtle">{currency}</span>}
              className="text-end tnum"
            />
          )}
        </FormField>
        <div className="flex items-end">
          <Switch className="w-full rounded-lg border border-border bg-surface-2 px-3" checked={active} onChange={setActive} label={t('inventory.supplierForm.active')} description={t('inventory.supplierForm.activeHint')} />
        </div>
        <FormField label={t('common.labels.notes')} className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} />}
        </FormField>
      </form>
    </Modal>
  );
}
