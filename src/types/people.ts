import type { BasisPoints, EntityMeta, Id, IsoDateTime, Language, Money } from './common';

export type CustomerType = 'walk_in' | 'regular' | 'vip' | 'wholesale';

export interface Customer extends EntityMeta {
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customerType: CustomerType;
  loyaltyPoints: number;
  totalSpent: Money;
  totalOrders: number;
  /** Customer-specific discount (basis points), applied to the whole cart. */
  discountRate: BasisPoints;
  notes: string;
  isActive: boolean;
  lastPurchaseAt: IsoDateTime | null;
}

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'email' | 'address' | 'customerType' | 'discountRate' | 'notes'> & {
  id?: Id;
};

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'adjust' | 'reverse';

export interface LoyaltyTransaction {
  id: Id;
  customerId: Id;
  saleId: Id | null;
  invoiceNo: string | null;
  type: LoyaltyTransactionType;
  points: number;
  balanceAfter: number;
  note: string;
  userId: Id | null;
  userName: string | null;
  createdAt: IsoDateTime;
}

export type SupplierStatus = 'active' | 'inactive';

export interface Supplier extends EntityMeta {
  code: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  contactPerson: string;
  openingBalance: Money;
  status: SupplierStatus;
  notes: string;
}

export type SupplierInput = Pick<
  Supplier,
  'name' | 'company' | 'phone' | 'email' | 'address' | 'contactPerson' | 'openingBalance' | 'status' | 'notes'
> & { id?: Id };

export interface SupplierSummary {
  supplierId: Id;
  totalPurchases: Money;
  purchaseCount: number;
  totalPaid: Money;
  outstanding: Money;
  lastPurchaseAt: IsoDateTime | null;
}

export type PaymentMethodCode = 'cash' | 'card' | 'mobile';

export interface SupplierPayment {
  id: Id;
  supplierId: Id;
  purchaseId: Id | null;
  amount: Money;
  method: PaymentMethodCode | 'bank';
  reference: string;
  note: string;
  userId: Id | null;
  paidAt: IsoDateTime;
}

export type RoleId = 'admin' | 'manager' | 'cashier';

export interface Role {
  id: RoleId;
  name: { bn: string; en: string };
  isSystem: boolean;
}

export interface UserPreferences {
  language?: Language;
  theme?: 'dark' | 'light' | 'system';
  uiFont?: string;
  banglaFont?: string;
}

export interface User extends EntityMeta {
  username: string;
  name: { bn: string; en: string };
  roleId: RoleId;
  phone: string;
  email: string;
  defaultCounterId: Id | null;
  avatarColor: string;
  preferences: UserPreferences;
  isActive: boolean;
  lastLoginAt: IsoDateTime | null;
}

export type UserInput = Pick<User, 'username' | 'name' | 'roleId' | 'phone' | 'email' | 'defaultCounterId' | 'avatarColor' | 'isActive'> & {
  id?: Id;
  /** New PIN (4–6 digits). Required for new users. */
  pin?: string;
};
