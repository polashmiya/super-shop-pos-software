import { selectCustomer } from '@/features/pos/posActions';
import { t } from '@/i18n';
import { customerService } from '@/services/peopleService';
import { confirmAction, toast } from '@/stores/uiStore';
import type { Customer } from '@/types';

/* Customer actions shared by the list and the detail screen. */

/** Asks for confirmation, then deletes (archives) the customer. Resolves true when deleted. */
export async function deleteCustomerWithConfirm(customer: Customer): Promise<boolean> {
  const ok = await confirmAction({
    title: t('customers.delete.title', { name: customer.name }),
    message: t('customers.delete.message'),
    confirmLabel: t('common.actions.delete'),
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await customerService.delete(customer.id);
    toast.success({ key: 'customers.delete.done', params: { name: customer.name } });
    return true;
  } catch (error) {
    toast.fromError(error);
    return false;
  }
}

/** Puts the customer on the current POS sale (member discount applies automatically when enabled). */
export function startSaleForCustomer(customer: Customer): void {
  selectCustomer(customer);
  toast.success({ key: 'customers.actions.newSaleReady', params: { name: customer.name } });
}
