import { AppError } from '@/domain/errors';
import { maxLength, normalizePhone, required, validateEmail, validatePhone, type ValidationKey } from '@/domain/validation';
import { repos } from '@/repositories';
import type { CustomerFilter } from '@/repositories/types';
import type { Customer, CustomerInput, CustomerType, Id, LoyaltyTransaction, PageRequest, PageResult, Sale, Supplier, SupplierInput, SupplierPayment, SupplierSummary } from '@/types';
import { actor, ctx, requirePermission } from './context';

/* ==========================================================================
   Customers (with loyalty) and suppliers.
   ========================================================================== */

export type CustomerFieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'discountRate', ValidationKey>>;

export function validateCustomerInput(input: CustomerInput): CustomerFieldErrors {
  const errors: CustomerFieldErrors = {};
  const name = required(input.name) ?? maxLength(input.name, 120);
  if (name) errors.name = name;
  const phone = validatePhone(input.phone, ctx().business().customer.requirePhone);
  if (phone) errors.phone = phone;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!Number.isInteger(input.discountRate) || input.discountRate < 0 || input.discountRate > 10_000) errors.discountRate = 'invalidPercent';
  return errors;
}

export const customerService = {
  list(filter: CustomerFilter, page: PageRequest): Promise<PageResult<Customer>> {
    return repos().customers.list(filter, page);
  },
  search(query: string, limit = 8): Promise<Customer[]> {
    return repos().customers.search(query, limit);
  },
  getById(id: Id): Promise<Customer | null> {
    return repos().customers.getById(id);
  },
  findByPhone(phone: string): Promise<Customer | null> {
    return repos().customers.findByPhone(phone);
  },
  async create(input: CustomerInput): Promise<Customer> {
    requirePermission('customers.manage');
    if (Object.keys(validateCustomerInput(input)).length > 0) throw new AppError('validation');
    if (input.phone.trim() && (await repos().customers.findByPhone(input.phone))) throw new AppError('duplicatePhone');
    return repos().customers.create({ ...input, phone: normalizePhone(input.phone) }, actor());
  },
  async update(id: Id, input: CustomerInput): Promise<Customer> {
    requirePermission('customers.manage');
    if (Object.keys(validateCustomerInput(input)).length > 0) throw new AppError('validation');
    const existing = input.phone.trim() ? await repos().customers.findByPhone(input.phone) : null;
    if (existing && existing.id !== id) throw new AppError('duplicatePhone');
    return repos().customers.update(id, { ...input, phone: normalizePhone(input.phone) }, actor());
  },
  async delete(id: Id): Promise<void> {
    requirePermission('customers.delete');
    await repos().customers.delete(id, actor());
  },
  purchaseHistory(customerId: Id, page: PageRequest): Promise<PageResult<Sale>> {
    return repos().customers.purchaseHistory(customerId, page);
  },
  loyaltyHistory(customerId: Id, limit = 100): Promise<LoyaltyTransaction[]> {
    return repos().customers.loyaltyHistory(customerId, limit);
  },
  async adjustPoints(customerId: Id, points: number, note: string): Promise<Customer> {
    requirePermission('loyalty.adjust');
    if (!Number.isInteger(points) || points === 0) throw new AppError('invalidQuantity');
    if (!note.trim()) throw new AppError('validation');
    return repos().customers.adjustPoints(customerId, points, note.trim(), actor());
  },
  countByType(): Promise<Record<CustomerType, number>> {
    return repos().customers.countByType();
  },
};

export type SupplierFieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'openingBalance', ValidationKey>>;

export function validateSupplierInput(input: SupplierInput): SupplierFieldErrors {
  const errors: SupplierFieldErrors = {};
  const name = required(input.name);
  if (name) errors.name = name;
  const phone = validatePhone(input.phone, false);
  if (phone) errors.phone = phone;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!Number.isSafeInteger(input.openingBalance) || input.openingBalance < 0) errors.openingBalance = 'invalidAmount';
  return errors;
}

export const supplierService = {
  list(search?: string, status: 'active' | 'inactive' | 'all' = 'all'): Promise<Supplier[]> {
    return repos().suppliers.list(search, status);
  },
  getById(id: Id): Promise<Supplier | null> {
    return repos().suppliers.getById(id);
  },
  async create(input: SupplierInput): Promise<Supplier> {
    requirePermission('suppliers.manage');
    if (Object.keys(validateSupplierInput(input)).length > 0) throw new AppError('validation');
    return repos().suppliers.create(input, actor());
  },
  async update(id: Id, input: SupplierInput): Promise<Supplier> {
    requirePermission('suppliers.manage');
    if (Object.keys(validateSupplierInput(input)).length > 0) throw new AppError('validation');
    return repos().suppliers.update(id, input, actor());
  },
  summaries(): Promise<Map<Id, SupplierSummary>> {
    return repos().suppliers.summaries();
  },
  payments(supplierId: Id): Promise<SupplierPayment[]> {
    return repos().suppliers.payments(supplierId);
  },
  async pay(payment: Omit<SupplierPayment, 'id' | 'userId' | 'paidAt'>): Promise<SupplierPayment> {
    requirePermission('suppliers.manage');
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) throw new AppError('invalidPrice');
    return repos().suppliers.addPayment({ ...payment, userId: null, paidAt: ctx().now().toISOString() }, actor());
  },
};
