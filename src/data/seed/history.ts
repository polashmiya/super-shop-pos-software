import { APP_CONFIG } from '@/config/app.config';
import { DEFAULT_BUSINESS_SETTINGS } from '@/config/defaults';
import { addDays, startOfDay, toLocalDate } from '@/domain/dates';
import { stableId } from '@/domain/ids';
import { calculatePointsEarned, maxRedeemableAmount } from '@/domain/loyalty';
import { roundQuantity, sumMoney } from '@/domain/money';
import { formatDocumentNumber, sequenceKey, SHIFT_SEQUENCE_DIGITS } from '@/domain/numbering';
import { applyPayments } from '@/domain/payment';
import { calculateCartTotals, type PricingLine } from '@/domain/pricing';
import { calculateRefund } from '@/domain/refund';
import { calculateExpectedCash, calculateShiftTotals } from '@/domain/shift';
import { movingAverageCost } from '@/domain/stock';
import type { CartDraft, CartLine, OrderDiscount, PaymentEntry, PaymentMethod } from '@/types/sales';
import type { SeedCustomer } from './customers';
import { DEMO_COUNTERS, DEMO_USERS, EXPENSE_CATEGORIES, type DemoCounter, type DemoUser } from './demoUsers';
import { insertRow, meta, type SeedExecutor } from './executor';

/* ==========================================================================
   Chronological business simulator for demo data.

   Walks the calendar minute by minute (event-driven) through shifts on each
   counter and produces a consistent history:
     sales + items + payments → stock ledger → replenishment purchase orders
     (GRN) → returns and cancellations → loyalty → cash drawer movements →
     expenses → shift closing with realistic cash differences.

   Every figure in the dashboard and reports is later calculated from these
   records; nothing is hard-coded.
   ========================================================================== */

export interface SimProduct {
  id: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameBn: string;
  unitId: string;
  weighted: boolean;
  categoryCode: string;
  supplierId: string;
  supplierName: string;
  image: string | null;
  price: number;
  mrp: number | null;
  cost: number;
  discountType: 'percent' | 'fixed' | null;
  discountValue: number;
  taxRate: number;
  minStock: number;
  maxStock: number;
  weight: number;
  balance: number;
  lastMovementAt: string | null;
  policy: 'normal' | 'low' | 'oos';
  pendingPo: boolean;
  shelfLifeDays: number | null;
  /** Price before a scheduled price change (sales before `until` use it). */
  oldPrice: { until: number; price: number } | null;
}

interface Accumulator {
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  pointsRedeemed: number;
  salesCount: number;
  returnsTotal: number;
  cashRefunds: number;
  cashExpenses: number;
  expensesTotal: number;
  cashIn: number;
  cashOut: number;
  discountTotal: number;
  taxTotal: number;
}

interface SimShift {
  id: string;
  shiftNo: string;
  counter: DemoCounter;
  user: DemoUser;
  openAt: number;
  closeAt: number;
  openingCash: number;
  keepOpen: boolean;
  closed: boolean;
  acc: Accumulator;
}

interface SimSaleLine {
  saleItemId: string;
  product: SimProduct;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxAmount: number;
  returnedQuantity: number;
  refundedAmount: number;
  refundedTax: number;
}

interface SimSale {
  id: string;
  invoiceNo: string;
  time: number;
  customer: SeedCustomer | null;
  lines: SimSaleLine[];
  primaryMethod: PaymentMethod | 'split';
  refundMethod: 'cash' | 'card' | 'mobile';
  grandTotal: number;
  returnedTotal: number;
  pointsEarned: number;
}

interface PendingPoItem {
  id: string;
  product: SimProduct;
  quantity: number;
  unitCost: number;
}

interface PendingPo {
  id: string;
  poNo: string;
  supplierId: string;
  supplierName: string;
  orderTime: number;
  arrivalTime: number;
  partial: boolean;
  items: PendingPoItem[];
  received: boolean;
  createdBy: DemoUser;
}

type SimEvent =
  | { time: number; kind: 'arrival'; po: PendingPo }
  | { time: number; kind: 'return'; sale: SimSale }
  | { time: number; kind: 'cancel'; sale: SimSale; shift: SimShift; cashApplied: number };

export interface HistoryInput {
  db: SeedExecutor;
  random: () => number;
  now: Date;
  /** First day to simulate (local midnight). */
  fromDay: Date;
  products: SimProduct[];
  customers: SeedCustomer[];
  /** Existing sequence values (continue mode) — mutated. */
  sequences: Map<string, number>;
  /** Earliest time a new sale may be recorded (continue mode). */
  notBefore?: number;
  /** Counters that already have a shift open (continue mode) are skipped. */
  busyCounterIds?: Set<string>;
  /** Terminal counter whose shift stays open today (fresh mode). */
  terminalCounterCode?: string;
}

export interface HistoryResult {
  sales: number;
  openShifts: Array<{ id: string; counterId: string; userId: string; shiftNo: string }>;
}

const HOUR_WEIGHTS: Array<[number, number]> = [
  [8, 0.35],
  [9, 0.6],
  [10, 0.9],
  [11, 1.15],
  [12, 1.3],
  [13, 1.0],
  [14, 0.8],
  [15, 0.8],
  [16, 0.95],
  [17, 1.15],
  [18, 1.45],
  [19, 1.6],
  [20, 1.45],
  [21, 1.05],
  [22, 0.35],
];

const DISCOUNT_REASONS = ['নিয়মিত গ্রাহক', 'ম্যানেজার অনুমোদিত', 'প্রচারমূলক অফার', 'বাল্ক ক্রয়', 'প্যাকেট সামান্য ক্ষতিগ্রস্ত'];
const RETURN_REASONS = ['মেয়াদোত্তীর্ণ পণ্য', 'প্যাকেট ছেঁড়া', 'ভুল পণ্য দেওয়া হয়েছে', 'গ্রাহক মত পরিবর্তন করেছেন', 'মান ভালো নয়'];
const CANCEL_REASONS = ['ভুল পণ্য স্ক্যান হয়েছে', 'গ্রাহক কেনাকাটা বাতিল করেছেন', 'ভুল দাম প্রবেশ করা হয়েছে'];
const EXPENSE_NOTES: Record<string, string[]> = {
  transport: ['পণ্য পরিবহন ভ্যান ভাড়া', 'ব্যাংকে যাতায়াত (রিকশা)', 'কারওয়ান বাজার থেকে সবজি আনা'],
  electricity: ['বিদ্যুৎ বিল (ডেসকো)'],
  cleaning: ['ফ্লোর ক্লিনার ও মপ', 'পরিচ্ছন্নতা কর্মীর মজুরি', 'ডাস্টবিন ব্যাগ'],
  office: ['থার্মাল রসিদ রোল', 'প্রিন্টার কালি', 'খাতা, কলম ও স্ট্যাপলার'],
  'staff-food': ['স্টাফ দুপুরের খাবার', 'চা-নাস্তা', 'ইফতার আয়োজন'],
  maintenance: ['এসি সার্ভিসিং', 'ডিপ ফ্রিজ মেরামত', 'লাইট ও সুইচ পরিবর্তন'],
  packaging: ['শপিং ব্যাগ (৫০০ পিস)', 'প্যাকেজিং টেপ ও পলি', 'কাগজের ঠোঙা'],
  utilities: ['ইন্টারনেট বিল', 'অফিস মোবাইল রিচার্জ'],
  rent: ['দোকান ভাড়া'],
  misc: ['বিবিধ খরচ', 'মসজিদে দান', 'ফটোকপি'],
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const iso = (time: number): string => new Date(time).toISOString();

function emptyAcc(): Accumulator {
  return {
    cashSales: 0,
    cardSales: 0,
    mobileSales: 0,
    pointsRedeemed: 0,
    salesCount: 0,
    returnsTotal: 0,
    cashRefunds: 0,
    cashExpenses: 0,
    expensesTotal: 0,
    cashIn: 0,
    cashOut: 0,
    discountTotal: 0,
    taxTotal: 0,
  };
}

function buildCumulative(weights: readonly number[]): number[] {
  const cumulative: number[] = [];
  let total = 0;
  for (const weight of weights) {
    total += weight;
    cumulative.push(total);
  }
  return cumulative;
}

function pickIndex(cumulative: readonly number[], random: () => number): number {
  const target = random() * cumulative[cumulative.length - 1];
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function userById(id: string): DemoUser {
  const user = DEMO_USERS.find((entry) => entry.id === id);
  if (!user) throw new Error(`Unknown demo user ${id}`);
  return user;
}

const USERS = {
  rahim: DEMO_USERS[0],
  nusrat: DEMO_USERS[1],
  karim: DEMO_USERS[2],
  sadia: DEMO_USERS[3],
  hasan: DEMO_USERS[4],
};

const COUNTER = {
  C01: DEMO_COUNTERS[0],
  C02: DEMO_COUNTERS[1],
  C03: DEMO_COUNTERS[2],
  C04: DEMO_COUNTERS[3],
};

export function runHistory(input: HistoryInput): HistoryResult {
  const { db, random, now } = input;
  const nowTime = now.getTime();
  const loyalty = DEFAULT_BUSINESS_SETTINGS.loyalty;
  const today = startOfDay(now);
  const events: SimEvent[] = [];
  const openPoByKey = new Map<string, PendingPo>();
  const allPos: PendingPo[] = [];
  const shifts: SimShift[] = [];
  let salesCreated = 0;

  const products = input.products;
  const productById = new Map(products.map((product) => [product.id, product]));
  const productCumulative = buildCumulative(products.map((product) => product.weight));
  const customers = input.customers;
  const customerCumulative = buildCumulative(customers.map((customer) => customer.weight));

  const between = (min: number, max: number): number => min + random() * (max - min);
  const intBetween = (min: number, max: number): number => Math.floor(between(min, max + 1));
  const chance = (probability: number): boolean => random() < probability;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

  const nextNumber = (prefix: string, time: number, digits: number = APP_CONFIG.numbering.sequenceDigits): string => {
    const date = new Date(time);
    const key = sequenceKey(prefix, date);
    const value = (input.sequences.get(key) ?? 0) + 1;
    input.sequences.set(key, value);
    return formatDocumentNumber(prefix, date, value, digits);
  };

  const schedule = (event: SimEvent): void => {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (events[mid].time <= event.time) low = mid + 1;
      else high = mid;
    }
    events.splice(low, 0, event);
  };

  const audit = (time: number, user: DemoUser | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown>): void => {
    insertRow(db, 'audit_logs', {
      id: stableId(`audit:${action}:${entityId ?? ''}:${time}:${random()}`),
      user_id: user?.id ?? null,
      user_name: user?.name.en ?? null,
      action,
      entity,
      entity_id: entityId,
      details: JSON.stringify(details),
      created_at: iso(time),
    });
  };

  const moveStock = (
    product: SimProduct,
    time: number,
    type: string,
    quantity: number,
    reference: { type: string; id: string; no: string } | null,
    extra: { reason?: string | null; note?: string; user?: DemoUser | null; unitCost?: number } = {},
  ): void => {
    product.balance = roundQuantity(product.balance + quantity);
    product.lastMovementAt = iso(time);
    insertRow(db, 'stock_movements', {
      id: stableId(`movement:${product.id}:${type}:${time}:${random()}`),
      product_id: product.id,
      type,
      quantity: roundQuantity(quantity),
      balance_after: product.balance,
      unit_cost: extra.unitCost ?? product.cost,
      reference_type: reference?.type ?? null,
      reference_id: reference?.id ?? null,
      reference_no: reference?.no ?? null,
      reason: extra.reason ?? null,
      note: extra.note ?? '',
      user_id: extra.user?.id ?? null,
      user_name: extra.user?.name.en ?? null,
      created_at: iso(time),
    });
  };

  const cashMove = (shift: SimShift, time: number, type: string, amount: number, reference: { type: string; id: string; no: string } | null, note = '', user: DemoUser = shift.user): void => {
    insertRow(db, 'cash_movements', {
      id: stableId(`cash:${shift.id}:${type}:${time}:${random()}`),
      shift_id: shift.id,
      counter_id: shift.counter.id,
      type,
      amount,
      reference_type: reference?.type ?? null,
      reference_id: reference?.id ?? null,
      reference_no: reference?.no ?? null,
      note,
      user_id: user.id,
      user_name: user.name.en,
      created_at: iso(time),
    });
  };

  const loyaltyTxn = (customer: SeedCustomer, time: number, type: string, points: number, saleId: string | null, invoiceNo: string | null, note: string, user: DemoUser | null): void => {
    customer.loyaltyPoints += points;
    insertRow(db, 'customer_loyalty_transactions', {
      id: stableId(`loyalty:${customer.id}:${type}:${time}:${random()}`),
      customer_id: customer.id,
      sale_id: saleId,
      invoice_no: invoiceNo,
      type,
      points,
      balance_after: customer.loyaltyPoints,
      note,
      user_id: user?.id ?? null,
      user_name: user?.name.en ?? null,
      created_at: iso(time),
    });
  };

  const activeShiftAt = (time: number): SimShift | null => {
    const candidates = shifts.filter((shift) => !shift.closed && shift.openAt <= time && time < shift.closeAt);
    return candidates.length > 0 ? pick(candidates) : null;
  };

  /* ----------------------------------------------------------------------
     Purchasing
     ---------------------------------------------------------------------- */

  const replenishmentBlocked = (product: SimProduct, time: number): boolean => {
    if (product.policy === 'oos') return time > nowTime - 12 * 24 * HOUR;
    if (product.policy === 'low') return time > nowTime - 6 * 24 * HOUR;
    return false;
  };

  const FRESH_CATEGORIES = new Set(['vegetables', 'fruits', 'meat', 'fish', 'bakery']);

  /** Suppliers deliver twice a week on fixed days (fresh goods: every morning). */
  const deliveryDays = (supplierId: string): number[] => {
    let first = stableId(`delivery:${supplierId}`).charCodeAt(0) % 7;
    if (first === 5) first = 6;
    let second = (first + 3) % 7;
    if (second === 5) second = 6;
    return [first, second];
  };

  const maybeReorder = (product: SimProduct, time: number): void => {
    if (product.pendingPo || product.balance > product.minStock || replenishmentBlocked(product, time)) return;
    const orderDay = startOfDay(new Date(time));
    let arrivalDay = addDays(orderDay, 1);
    let arrivalTime: number;
    if (FRESH_CATEGORIES.has(product.categoryCode)) {
      arrivalTime = arrivalDay.getTime() + 7 * HOUR + intBetween(30, 90) * MINUTE;
    } else {
      const days = deliveryDays(product.supplierId);
      for (let guard = 0; guard < 7 && !days.includes(arrivalDay.getDay()); guard += 1) arrivalDay = addDays(arrivalDay, 1);
      arrivalTime = arrivalDay.getTime() + 10 * HOUR + intBetween(0, 180) * MINUTE;
    }
    const key = `${product.supplierId}:${toLocalDate(arrivalDay)}`;
    let po = openPoByKey.get(key);
    if (!po || po.received) {
      po = {
        id: stableId(`po:${key}:${time}`),
        poNo: nextNumber(APP_CONFIG.numbering.purchasePrefix, time),
        supplierId: product.supplierId,
        supplierName: product.supplierName,
        orderTime: time,
        arrivalTime,
        partial: chance(0.05),
        items: [],
        received: false,
        createdBy: chance(0.7) ? USERS.nusrat : USERS.rahim,
      };
      openPoByKey.set(key, po);
      allPos.push(po);
      schedule({ time: arrivalTime, kind: 'arrival', po });
    }
    let quantity = product.maxStock - Math.max(0, product.balance);
    if (product.policy === 'low') quantity = Math.max(product.minStock * 0.5, quantity * 0.3);
    quantity = product.weighted ? Math.ceil(quantity / 5) * 5 : quantity >= 24 ? Math.ceil(quantity / 12) * 12 : Math.ceil(quantity);
    po.items.push({ id: stableId(`po-item:${po.id}:${product.id}`), product, quantity, unitCost: product.cost });
    product.pendingPo = true;
  };

  const writePurchase = (po: PendingPo, status: 'received' | 'partially_received' | 'ordered' | 'draft' | 'cancelled', receiveTime: number | null): void => {
    let subtotal = 0;
    const taxTotal = 0;
    const itemRows = po.items.map((item) => {
      const lineSubtotal = Math.round(item.unitCost * item.quantity);
      const received = receiveTime === null ? 0 : po.partial ? roundQuantity(Math.floor(item.quantity * 0.6)) : item.quantity;
      subtotal += lineSubtotal;
      return { item, lineSubtotal, received };
    });
    const discountTotal = subtotal > 5_000_000 ? Math.round(subtotal * 0.01) : 0;
    const grandTotal = subtotal - discountTotal + taxTotal;
    const paid = status === 'received' ? (chance(0.75) ? grandTotal : chance(0.5) ? Math.round(grandTotal * 0.5) : 0) : status === 'partially_received' ? Math.round(grandTotal * 0.3) : 0;

    insertRow(db, 'purchases', {
      id: po.id,
      po_no: po.poNo,
      supplier_id: po.supplierId,
      supplier_name: po.supplierName,
      status,
      order_date: toLocalDate(new Date(po.orderTime)),
      expected_date: toLocalDate(new Date(po.arrivalTime)),
      subtotal,
      discount_total: discountTotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
      paid_amount: paid,
      note: '',
      created_by: po.createdBy.id,
      created_by_name: po.createdBy.name.en,
      received_at: receiveTime === null ? null : iso(receiveTime),
      item_count: po.items.length,
      ...meta(iso(po.orderTime), iso(receiveTime ?? po.orderTime)),
    });
    for (const { item, lineSubtotal, received } of itemRows) {
      insertRow(db, 'purchase_items', {
        id: item.id,
        purchase_id: po.id,
        product_id: item.product.id,
        name_bn: item.product.nameBn,
        name_en: item.product.nameEn,
        sku: item.product.sku,
        quantity: item.quantity,
        received_quantity: received,
        unit_cost: item.unitCost,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_total: lineSubtotal,
      });
    }
    audit(po.orderTime, po.createdBy, 'purchase.created', 'purchase', po.id, { poNo: po.poNo, total: grandTotal });

    if (receiveTime !== null) {
      const receiptId = stableId(`grn:${po.id}`);
      const grnNo = nextNumber(APP_CONFIG.numbering.receiptPrefix, receiveTime);
      insertRow(db, 'goods_receipts', {
        id: receiptId,
        grn_no: grnNo,
        purchase_id: po.id,
        received_by: USERS.nusrat.id,
        received_by_name: USERS.nusrat.name.en,
        received_at: iso(receiveTime),
        note: '',
      });
      for (const { item, received } of itemRows) {
        if (received <= 0) continue;
        insertRow(db, 'goods_receipt_items', {
          id: stableId(`grn-item:${receiptId}:${item.id}`),
          receipt_id: receiptId,
          purchase_item_id: item.id,
          product_id: item.product.id,
          quantity: received,
          unit_cost: item.unitCost,
        });
        item.product.cost = movingAverageCost(item.product.balance, item.product.cost, received, item.unitCost);
        moveStock(item.product, receiveTime, 'purchase', received, { type: 'purchase', id: po.id, no: grnNo }, { user: USERS.nusrat, unitCost: item.unitCost });
      }
      audit(receiveTime, USERS.nusrat, 'purchase.received', 'purchase', po.id, { poNo: po.poNo, grnNo });
      if (paid > 0) {
        const paidAt = Math.min(nowTime - MINUTE, receiveTime + intBetween(0, 4) * 24 * HOUR);
        insertRow(db, 'supplier_payments', {
          id: stableId(`supplier-payment:${po.id}`),
          supplier_id: po.supplierId,
          purchase_id: po.id,
          amount: paid,
          method: chance(0.6) ? 'bank' : 'cash',
          reference: `CHQ-${intBetween(100000, 999999)}`,
          note: '',
          user_id: USERS.rahim.id,
          paid_at: iso(paidAt),
        });
      }
    }
  };

  const receivePo = (po: PendingPo, time: number): void => {
    po.received = true;
    writePurchase(po, po.partial ? 'partially_received' : 'received', time);
    for (const item of po.items) item.product.pendingPo = false;
  };

  /* ----------------------------------------------------------------------
     Sales
     ---------------------------------------------------------------------- */

  const sampleItemCount = (): number => {
    const roll = random();
    if (roll < 0.14) return 1;
    if (roll < 0.3) return 2;
    if (roll < 0.46) return 3;
    if (roll < 0.6) return 4;
    if (roll < 0.72) return 5;
    if (roll < 0.82) return 6;
    if (roll < 0.9) return intBetween(7, 8);
    return intBetween(9, 14);
  };

  const sampleQuantity = (product: SimProduct): number => {
    if (product.weighted) {
      if (product.categoryCode === 'rice-dal') return pick([1, 1, 2, 2, 3, 5]);
      if (product.categoryCode === 'meat' || product.categoryCode === 'fish') return pick([0.5, 0.75, 1, 1, 1.5, 2]);
      return pick([0.25, 0.5, 0.5, 0.75, 1, 1, 1, 1.5, 2, 2.5]);
    }
    const roll = random();
    if (roll < 0.72) return 1;
    if (roll < 0.9) return 2;
    return intBetween(3, product.categoryCode === 'beverages' ? 12 : 5);
  };

  const priceAt = (product: SimProduct, time: number): number => (product.oldPrice && time < product.oldPrice.until ? product.oldPrice.price : product.price);

  const pickCustomer = (time: number): SeedCustomer | null => {
    if (customers.length === 0 || !chance(0.52)) return null;
    const customer = customers[pickIndex(customerCumulative, random)];
    return customer.createdAt.getTime() <= time ? customer : null;
  };

  const buildPayments = (due: number, customer: SeedCustomer | null): { entries: PaymentEntry[]; pointsUsed: number } => {
    const entries: PaymentEntry[] = [];
    let remaining = due;
    let pointsUsed = 0;
    if (customer && customer.loyaltyPoints >= 50 && chance(0.18)) {
      const amount = maxRedeemableAmount(customer.loyaltyPoints, due, loyalty);
      if (amount > 0) {
        pointsUsed = Math.floor(amount / loyalty.pointValue);
        entries.push({ id: 'points', method: 'points', provider: null, amount, reference: '', points: pointsUsed });
        remaining -= amount;
      }
    }
    if (remaining <= 0) return { entries, pointsUsed };

    const roll = random();
    const cashTender = (amount: number): number => {
      if (chance(0.32)) return amount;
      const taka = amount / 100;
      const step = taka <= 100 ? 50 : taka <= 500 ? 100 : taka <= 2000 ? 500 : 1000;
      return Math.ceil(taka / step) * step * 100;
    };
    const mobile = (): PaymentEntry['provider'] => pick(['bkash', 'bkash', 'bkash', 'nagad', 'nagad', 'rocket', 'upay'] as const);
    const trx = (): string => Array.from({ length: 10 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[intBetween(0, 31)]).join('');

    if (roll < 0.52) {
      entries.push({ id: 'cash', method: 'cash', provider: null, amount: cashTender(remaining), reference: '' });
    } else if (roll < 0.66) {
      entries.push({ id: 'card', method: 'card', provider: pick(['visa', 'visa', 'mastercard', 'amex'] as const), amount: remaining, reference: String(intBetween(1000, 9999)) });
    } else if (roll < 0.94) {
      entries.push({ id: 'mobile', method: 'mobile', provider: mobile(), amount: remaining, reference: trx() });
    } else {
      const cashPart = Math.max(100, Math.floor((remaining * between(0.35, 0.7)) / 10_000) * 10_000);
      if (cashPart >= remaining) {
        entries.push({ id: 'cash', method: 'cash', provider: null, amount: cashTender(remaining), reference: '' });
      } else {
        entries.push({ id: 'cash', method: 'cash', provider: null, amount: cashPart, reference: '' });
        if (chance(0.5)) entries.push({ id: 'mobile', method: 'mobile', provider: mobile(), amount: remaining - cashPart, reference: trx() });
        else entries.push({ id: 'card', method: 'card', provider: 'visa', amount: remaining - cashPart, reference: String(intBetween(1000, 9999)) });
      }
    }
    return { entries, pointsUsed };
  };

  const simulateSale = (time: number, shift: SimShift): void => {
    const wanted = sampleItemCount();
    const chosen = new Map<string, number>();
    for (let attempt = 0; attempt < wanted * 4 && chosen.size < wanted; attempt += 1) {
      const product = products[pickIndex(productCumulative, random)];
      if (chosen.has(product.id)) continue;
      const minimum = product.weighted ? 0.25 : 1;
      if (product.balance < minimum) continue;
      let quantity = sampleQuantity(product);
      if (quantity > product.balance) quantity = product.weighted ? Math.floor(product.balance * 4) / 4 : Math.floor(product.balance);
      if (quantity < minimum) continue;
      chosen.set(product.id, quantity);
    }
    if (chosen.size === 0) return;

    const saleId = stableId(`sale:${time}:${shift.id}:${random()}`);
    const customer = pickCustomer(time);
    const lines = [...chosen.entries()].map(([productId, quantity], index) => {
      const product = productById.get(productId) as SimProduct;
      return { product, quantity, index };
    });

    const pricingLines: PricingLine[] = lines.map(({ product, quantity, index }) => ({
      lineId: String(index),
      quantity,
      unitPrice: priceAt(product, time),
      taxRate: product.taxRate,
      mrp: product.mrp,
      discount: product.discountType ? { type: product.discountType, value: product.discountValue } : null,
    }));

    let orderDiscount: OrderDiscount | null = null;
    let discountApprovedBy: string | null = null;
    if (customer && customer.discountRate > 0) {
      orderDiscount = { type: 'percent', value: customer.discountRate, source: 'customer', reason: customer.customerType === 'vip' ? 'ভিআইপি গ্রাহক ছাড়' : 'পাইকারি গ্রাহক ছাড়', approvedBy: null };
    } else if (chance(0.06)) {
      const fixed = chance(0.45);
      const reason = pick(DISCOUNT_REASONS);
      orderDiscount = fixed
        ? { type: 'fixed', value: pick([2_000, 3_000, 5_000, 10_000]), source: 'manual', reason, approvedBy: null }
        : { type: 'percent', value: pick([300, 500, 500, 1_000]), source: 'manual', reason, approvedBy: null };
      if (orderDiscount.type === 'percent' && orderDiscount.value > 500) discountApprovedBy = USERS.nusrat.name.en;
    }

    const totals = calculateCartTotals(pricingLines, orderDiscount, { taxEnabled: true, taxMode: 'exclusive', rounding: 'none' });
    if (totals.grandTotal <= 0) return;
    const cancelled = chance(0.004);
    const { entries, pointsUsed } = cancelled ? { entries: buildPayments(totals.grandTotal, null).entries, pointsUsed: 0 } : buildPayments(totals.grandTotal, customer);
    const applied = applyPayments(totals.grandTotal, entries);
    const methods = new Set(applied.map((payment) => payment.method));
    const primaryMethod: SimSale['primaryMethod'] = methods.size > 1 ? 'split' : (applied[0]?.method ?? 'cash');
    const paidTotal = sumMoney(applied.map((payment) => payment.tendered));
    const changeDue = sumMoney(applied.map((payment) => payment.change));
    const invoiceNo = nextNumber(APP_CONFIG.numbering.invoicePrefix, time);
    const pointsAmount = sumMoney(applied.filter((payment) => payment.method === 'points').map((payment) => payment.amount));
    const pointsEarned = customer && !cancelled ? calculatePointsEarned(totals.grandTotal - pointsAmount, loyalty) : 0;
    const createdAt = iso(time);

    insertRow(db, 'sales', {
      id: saleId,
      invoice_no: invoiceNo,
      branch_id: APP_CONFIG.organization.branchId,
      counter_id: shift.counter.id,
      counter_name: shift.counter.name.en,
      shift_id: shift.id,
      cashier_id: shift.user.id,
      cashier_name: shift.user.name.en,
      customer_id: customer?.id ?? null,
      customer_name: customer?.name ?? '',
      customer_phone: customer?.phone ?? '',
      customer_type: customer?.customerType ?? null,
      status: 'completed',
      language: chance(0.86) ? 'bn' : 'en',
      currency_code: 'BDT',
      item_count: totals.itemCount,
      total_quantity: roundQuantity(totals.totalQuantity),
      subtotal: totals.subtotal,
      item_discount_total: totals.itemDiscountTotal,
      order_discount_total: totals.orderDiscountTotal,
      discount_total: totals.discountTotal,
      discount_reason: orderDiscount?.reason ?? '',
      discount_approved_by: discountApprovedBy,
      tax_total: totals.taxTotal,
      tax_mode: 'exclusive',
      rounding_adjustment: totals.roundingAdjustment,
      grand_total: totals.grandTotal,
      paid_total: paidTotal,
      change_due: changeDue,
      returned_total: 0,
      points_earned: pointsEarned,
      points_redeemed: pointsUsed,
      payment_summary: primaryMethod,
      note: '',
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: '',
      ...meta(createdAt),
    });

    const saleLines: SimSaleLine[] = lines.map(({ product, quantity, index }) => {
      const lineTotals = totals.lines[index];
      const saleItemId = stableId(`sale-item:${saleId}:${index}`);
      insertRow(db, 'sale_items', {
        id: saleItemId,
        sale_id: saleId,
        line_no: index + 1,
        product_id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name_bn: product.nameBn,
        name_en: product.nameEn,
        unit_id: product.unitId,
        quantity,
        unit_price: pricingLines[index].unitPrice,
        original_price: pricingLines[index].unitPrice,
        mrp: product.mrp,
        cost_price: product.cost,
        discount_type: product.discountType,
        discount_value: product.discountValue,
        discount_amount: lineTotals.itemDiscount,
        order_discount_amount: lineTotals.orderDiscount,
        tax_rate: product.taxRate,
        tax_amount: lineTotals.tax,
        line_subtotal: lineTotals.subtotal,
        line_total: lineTotals.total,
        returned_quantity: 0,
        note: '',
        price_overridden: 0,
        override_by: null,
        override_reason: '',
      });
      moveStock(product, time, 'sale', -quantity, { type: 'sale', id: saleId, no: invoiceNo }, { user: shift.user });
      return {
        saleItemId,
        product,
        quantity,
        unitPrice: pricingLines[index].unitPrice,
        lineTotal: lineTotals.total,
        taxAmount: lineTotals.tax,
        returnedQuantity: 0,
        refundedAmount: 0,
        refundedTax: 0,
      };
    });

    let cashApplied = 0;
    applied.forEach((payment, index) => {
      insertRow(db, 'payments', {
        id: stableId(`payment:${saleId}:${index}`),
        sale_id: saleId,
        shift_id: shift.id,
        counter_id: shift.counter.id,
        method: payment.method,
        provider: payment.provider,
        amount: payment.amount,
        tendered: payment.tendered,
        change_amount: payment.change,
        reference: payment.reference,
        points: payment.points,
        created_at: createdAt,
      });
      if (payment.method === 'cash') cashApplied += payment.amount;
      if (!cancelled) {
        if (payment.method === 'cash') shift.acc.cashSales += payment.amount;
        else if (payment.method === 'card') shift.acc.cardSales += payment.amount;
        else if (payment.method === 'mobile') shift.acc.mobileSales += payment.amount;
        else shift.acc.pointsRedeemed += payment.amount;
      }
    });
    if (cashApplied > 0) cashMove(shift, time, 'sale', cashApplied, { type: 'sale', id: saleId, no: invoiceNo });

    const sale: SimSale = {
      id: saleId,
      invoiceNo,
      time,
      customer,
      lines: saleLines,
      primaryMethod,
      refundMethod: primaryMethod === 'card' ? 'card' : primaryMethod === 'mobile' ? 'mobile' : 'cash',
      grandTotal: totals.grandTotal,
      returnedTotal: 0,
      pointsEarned,
    };

    audit(time, shift.user, 'sale.completed', 'sale', saleId, { invoiceNo, total: totals.grandTotal });
    salesCreated += 1;

    if (cancelled) {
      schedule({ time: time + intBetween(2, 9) * MINUTE, kind: 'cancel', sale, shift, cashApplied });
    } else {
      shift.acc.salesCount += 1;
      shift.acc.discountTotal += totals.discountTotal;
      shift.acc.taxTotal += totals.taxTotal;
      if (customer) {
        customer.totalOrders += 1;
        customer.totalSpent += totals.grandTotal;
        customer.lastPurchaseAt = createdAt;
        if (pointsUsed > 0) loyaltyTxn(customer, time, 'redeem', -pointsUsed, saleId, invoiceNo, '', shift.user);
        if (pointsEarned > 0) loyaltyTxn(customer, time, 'earn', pointsEarned, saleId, invoiceNo, '', shift.user);
      }
      if (chance(0.025)) {
        const returnTime = time + intBetween(60, 72 * 60) * MINUTE;
        if (returnTime < nowTime - 5 * MINUTE) schedule({ time: returnTime, kind: 'return', sale });
      }
    }
    for (const line of saleLines) maybeReorder(line.product, time);
  };

  const processCancel = (event: Extract<SimEvent, { kind: 'cancel' }>): void => {
    const { sale, shift, cashApplied, time } = event;
    const approver = USERS.nusrat;
    db.run('UPDATE sales SET status = ?, cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ?, version = version + 1 WHERE id = ?', [
      'cancelled',
      iso(time),
      approver.name.en,
      pick(CANCEL_REASONS),
      iso(time),
      sale.id,
    ]);
    for (const line of sale.lines) {
      moveStock(line.product, time, 'cancel', line.quantity, { type: 'sale', id: sale.id, no: sale.invoiceNo }, { user: approver, note: 'Sale cancelled' });
    }
    if (cashApplied > 0) cashMove(shift, time, 'refund', -cashApplied, { type: 'sale', id: sale.id, no: sale.invoiceNo }, 'Sale cancelled', approver);
    audit(time, approver, 'sale.cancelled', 'sale', sale.id, { invoiceNo: sale.invoiceNo });
  };

  const processReturn = (event: Extract<SimEvent, { kind: 'return' }>): void => {
    const time = event.time;
    const shift = activeShiftAt(time);
    if (!shift) {
      const nextMorning = addDays(startOfDay(new Date(time)), new Date(time).getHours() >= 8 ? 1 : 0).getTime() + 10 * HOUR + intBetween(0, 120) * MINUTE;
      if (nextMorning < nowTime - 5 * MINUTE) schedule({ time: nextMorning, kind: 'return', sale: event.sale });
      return;
    }
    const { sale } = event;
    const candidates = sale.lines.filter((line) => line.quantity - line.returnedQuantity > 0);
    if (candidates.length === 0) return;
    const chosen = [pick(candidates)];
    if (candidates.length > 2 && chance(0.25)) {
      const second = pick(candidates);
      if (second !== chosen[0]) chosen.push(second);
    }
    const returnId = stableId(`return:${sale.id}:${time}`);
    const returnNo = nextNumber(APP_CONFIG.numbering.returnPrefix, time);
    const items = chosen.map((line) => {
      const remaining = roundQuantity(line.quantity - line.returnedQuantity);
      const wanted = line.product.weighted ? Math.max(0.25, Math.floor((remaining / 2) * 4) / 4) : Math.min(remaining, chance(0.7) ? 1 : 2);
      const result = calculateRefund(
        {
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          taxAmount: line.taxAmount,
          returnedQuantity: line.returnedQuantity,
          refundedAmount: line.refundedAmount,
          refundedTax: line.refundedTax,
        },
        wanted,
      );
      return { line, ...result, restock: chance(0.85) };
    }).filter((item) => item.quantity > 0);
    if (items.length === 0) return;

    const refundTotal = sumMoney(items.map((item) => item.refund));
    const taxTotal = sumMoney(items.map((item) => item.tax));
    const cashier = shift.user;
    insertRow(db, 'returns', {
      id: returnId,
      return_no: returnNo,
      sale_id: sale.id,
      invoice_no: sale.invoiceNo,
      shift_id: shift.id,
      counter_id: shift.counter.id,
      cashier_id: cashier.id,
      cashier_name: cashier.name.en,
      customer_id: sale.customer?.id ?? null,
      reason: pick(RETURN_REASONS),
      refund_method: sale.refundMethod,
      refund_total: refundTotal,
      tax_total: taxTotal,
      approved_by: time - sale.time > 24 * HOUR ? USERS.nusrat.name.en : null,
      note: '',
      created_at: iso(time),
      updated_at: iso(time),
      version: 1,
      sync_status: 'local',
    });
    for (const item of items) {
      insertRow(db, 'return_items', {
        id: stableId(`return-item:${returnId}:${item.line.saleItemId}`),
        return_id: returnId,
        sale_item_id: item.line.saleItemId,
        product_id: item.line.product.id,
        name_bn: item.line.product.nameBn,
        name_en: item.line.product.nameEn,
        quantity: item.quantity,
        unit_price: item.line.unitPrice,
        refund_amount: item.refund,
        tax_amount: item.tax,
        restock: item.restock,
        condition: item.restock ? 'good' : 'damaged',
      });
      item.line.returnedQuantity = roundQuantity(item.line.returnedQuantity + item.quantity);
      item.line.refundedAmount += item.refund;
      item.line.refundedTax += item.tax;
      db.run('UPDATE sale_items SET returned_quantity = ? WHERE id = ?', [item.line.returnedQuantity, item.line.saleItemId]);
      if (item.restock) {
        moveStock(item.line.product, time, 'return', item.quantity, { type: 'return', id: returnId, no: returnNo }, { user: cashier });
      }
    }
    sale.returnedTotal += refundTotal;
    const fullyReturned = sale.lines.every((line) => line.returnedQuantity >= line.quantity);
    db.run('UPDATE sales SET returned_total = ?, status = ?, updated_at = ?, version = version + 1 WHERE id = ?', [
      sale.returnedTotal,
      fullyReturned ? 'returned' : 'partially_returned',
      iso(time),
      sale.id,
    ]);
    shift.acc.returnsTotal += refundTotal;
    if (sale.refundMethod === 'cash') {
      shift.acc.cashRefunds += refundTotal;
      cashMove(shift, time, 'refund', -refundTotal, { type: 'return', id: returnId, no: returnNo }, '', cashier);
    }
    if (sale.customer) {
      sale.customer.totalSpent = Math.max(0, sale.customer.totalSpent - refundTotal);
      const reverse = Math.min(sale.customer.loyaltyPoints, calculatePointsEarned(refundTotal, loyalty));
      if (reverse > 0) loyaltyTxn(sale.customer, time, 'reverse', -reverse, sale.id, sale.invoiceNo, returnNo, cashier);
    }
    audit(time, cashier, 'sale.returned', 'sale', sale.id, { invoiceNo: sale.invoiceNo, returnNo, refund: refundTotal });
  };

  const processEventsUntil = (time: number): void => {
    while (events.length > 0 && events[0].time <= time) {
      const event = events.shift() as SimEvent;
      if (event.kind === 'arrival') receivePo(event.po, event.time);
      else if (event.kind === 'return') processReturn(event);
      else processCancel(event);
    }
  };

  /* ----------------------------------------------------------------------
     Shifts, expenses and cash
     ---------------------------------------------------------------------- */

  const openShift = (counter: DemoCounter, user: DemoUser, openAt: number, closeAt: number, keepOpen: boolean): SimShift => {
    const shiftNo = nextNumber(APP_CONFIG.numbering.shiftPrefix, openAt, SHIFT_SEQUENCE_DIGITS);
    const openingCash = pick([300_000, 500_000, 500_000, 1_000_000]);
    const shift: SimShift = {
      id: stableId(`shift:${shiftNo}`),
      shiftNo,
      counter,
      user,
      openAt,
      closeAt,
      openingCash,
      keepOpen,
      closed: false,
      acc: emptyAcc(),
    };
    insertRow(db, 'cash_sessions', {
      id: shift.id,
      shift_no: shiftNo,
      counter_id: counter.id,
      branch_id: APP_CONFIG.organization.branchId,
      opened_by: user.id,
      opened_by_name: user.name.en,
      closed_by: null,
      closed_by_name: null,
      status: 'open',
      opening_cash: openingCash,
      closing_totals: null,
      actual_cash: null,
      difference: null,
      note: '',
      opened_at: iso(openAt),
      closed_at: null,
      ...meta(iso(openAt)),
    });
    cashMove(shift, openAt, 'opening', openingCash, { type: 'shift', id: shift.id, no: shiftNo });
    audit(openAt - MINUTE, user, 'user.login', 'user', user.id, { counter: counter.code });
    audit(openAt, user, 'shift.opened', 'shift', shift.id, { shiftNo, openingCash });
    shifts.push(shift);
    return shift;
  };

  const closeShift = (shift: SimShift): void => {
    const time = shift.closeAt;
    // Evening cash drop to the office safe before closing.
    if (shift.acc.cashSales > 3_000_000 && chance(0.45)) {
      const drop = Math.floor((shift.acc.cashSales * 0.6) / 1_000_000) * 1_000_000;
      if (drop > 0) {
        shift.acc.cashOut += drop;
        cashMove(shift, time - 45 * MINUTE, 'cash_out', -drop, null, 'অফিস সেফে জমা', USERS.nusrat);
        audit(time - 45 * MINUTE, USERS.nusrat, 'cash.out', 'shift', shift.id, { amount: drop });
      }
    }
    const expected = calculateExpectedCash({
      openingCash: shift.openingCash,
      cashSales: shift.acc.cashSales,
      cashRefunds: shift.acc.cashRefunds,
      cashExpenses: shift.acc.cashExpenses,
      cashIn: shift.acc.cashIn,
      cashOut: shift.acc.cashOut,
    });
    const roll = random();
    const difference = roll < 0.72 ? 0 : roll < 0.92 ? -intBetween(1, 10) * 1_000 : intBetween(1, 5) * 1_000;
    const actual = Math.max(0, expected + difference);
    const totals = calculateShiftTotals({ openingCash: shift.openingCash, ...shift.acc });
    db.run(
      'UPDATE cash_sessions SET status = ?, closed_by = ?, closed_by_name = ?, closing_totals = ?, actual_cash = ?, difference = ?, closed_at = ?, updated_at = ?, version = version + 1 WHERE id = ?',
      ['closed', shift.user.id, shift.user.name.en, JSON.stringify(totals), actual, actual - expected, iso(time), iso(time), shift.id],
    );
    cashMove(shift, time, 'closing', -actual, { type: 'shift', id: shift.id, no: shift.shiftNo }, 'দিনশেষে নগদ গণনা');
    audit(time, shift.user, 'shift.closed', 'shift', shift.id, { shiftNo: shift.shiftNo, expected, actual, difference: actual - expected });
    shift.closed = true;
  };

  const recordExpense = (time: number, categoryCode: string, forceOffice = false): void => {
    const category = EXPENSE_CATEGORIES.find((entry) => entry.code === categoryCode) ?? EXPENSE_CATEGORIES[0];
    const shift = forceOffice ? null : activeShiftAt(time);
    const paidFrom = shift && chance(0.8) ? 'cash_drawer' : 'office';
    const amount = Math.round(between(category.range[0], category.range[1]) / 10) * 1_000;
    const user = paidFrom === 'cash_drawer' && shift ? shift.user : USERS.nusrat;
    const expenseId = stableId(`expense:${time}:${categoryCode}`);
    const expenseNo = nextNumber(APP_CONFIG.numbering.expensePrefix, time);
    const pending = nowTime - time < 5 * HOUR && user.roleId === 'cashier' && chance(0.5);
    insertRow(db, 'expenses', {
      id: expenseId,
      expense_no: expenseNo,
      category_id: category.id,
      amount,
      description: pick(EXPENSE_NOTES[category.code] ?? ['বিবিধ খরচ']),
      expense_date: toLocalDate(new Date(time)),
      paid_from: paidFrom,
      shift_id: paidFrom === 'cash_drawer' && shift ? shift.id : null,
      counter_id: paidFrom === 'cash_drawer' && shift ? shift.counter.id : null,
      user_id: user.id,
      user_name: user.name.en,
      approved_by: pending ? null : USERS.nusrat.id,
      approved_by_name: pending ? null : USERS.nusrat.name.en,
      status: pending ? 'pending' : 'approved',
      ...meta(iso(time)),
    });
    if (paidFrom === 'cash_drawer' && shift) {
      shift.acc.cashExpenses += amount;
      shift.acc.expensesTotal += amount;
      cashMove(shift, time, 'expense', -amount, { type: 'expense', id: expenseId, no: expenseNo }, category.name.bn, user);
    }
    audit(time, user, 'expense.created', 'expense', expenseId, { expenseNo, amount });
  };

  const recordAdjustment = (time: number): void => {
    const perishable = products.filter((product) => product.shelfLifeDays !== null && product.shelfLifeDays <= 14 && product.balance >= 2);
    if (perishable.length === 0) return;
    const product = pick(perishable);
    const damage = chance(0.75);
    const quantity = product.weighted ? pick([0.5, 1, 1.5]) : intBetween(1, 2);
    const adjustmentNo = nextNumber(APP_CONFIG.numbering.adjustmentPrefix, time);
    const reason = damage ? pick(['damage', 'expired']) : 'counting_error';
    const signed = damage ? -quantity : chance(0.5) ? -quantity : quantity;
    moveStock(product, time, damage ? 'damage' : 'adjustment', signed, { type: 'adjustment', id: stableId(`adj:${adjustmentNo}`), no: adjustmentNo }, { reason, user: USERS.nusrat, note: damage ? 'শেলফ পরিদর্শনে পাওয়া গেছে' : 'মাসিক স্টক গণনা' });
    audit(time, USERS.nusrat, 'stock.adjusted', 'product', product.id, { adjustmentNo, quantity: signed, reason });
  };

  /* ----------------------------------------------------------------------
     Day loop
     ---------------------------------------------------------------------- */

  const dayCount = Math.max(0, Math.round((today.getTime() - startOfDay(input.fromDay).getTime()) / (24 * HOUR)));
  const notBefore = input.notBefore ?? 0;
  const busy = input.busyCounterIds ?? new Set<string>();

  for (let dayIndex = 0; dayIndex <= dayCount; dayIndex += 1) {
    const day = addDays(startOfDay(input.fromDay), dayIndex);
    const dayStart = day.getTime();
    const isToday = dayStart === today.getTime();
    const weekday = day.getDay();
    const isWeekend = weekday === 5 || weekday === 6;
    const daysAgo = Math.round((today.getTime() - dayStart) / (24 * HOUR));
    const at = (hours: number, minutes = 0): number => dayStart + hours * HOUR + minutes * MINUTE;

    // Shift plan: counter, cashier, open, close.
    type Plan = { counter: DemoCounter; user: DemoUser; open: number; close: number };
    const plans: Plan[] = [];
    const jitter = (): number => intBetween(-8, 8);
    if (isToday && input.terminalCounterCode === 'C03') {
      plans.push({ counter: COUNTER.C03, user: USERS.karim, open: at(8, 2), close: at(22, 30) });
    } else {
      plans.push({ counter: COUNTER.C03, user: USERS.karim, open: at(8, jitter() + 10), close: at(15, jitter() + 10) });
      plans.push({ counter: COUNTER.C03, user: dayIndex % 2 === 0 ? USERS.sadia : USERS.hasan, open: at(15, jitter() + 15), close: at(22, 30 + jitter()) });
    }
    plans.push({ counter: COUNTER.C01, user: dayIndex % 3 === 0 ? USERS.sadia : USERS.hasan, open: at(8, 12 + jitter()), close: at(15, jitter() + 10) });
    plans.push({ counter: COUNTER.C01, user: dayIndex % 2 === 0 ? USERS.nusrat : USERS.rahim, open: at(15, 20 + jitter()), close: at(22, 25 + jitter()) });
    if (isWeekend || dayIndex % 4 === 1) {
      plans.push({ counter: COUNTER.C02, user: isWeekend ? USERS.hasan : USERS.sadia, open: at(16, jitter() + 10), close: at(22, 20 + jitter()) });
    }
    if (isWeekend && daysAgo > 4) {
      plans.push({ counter: COUNTER.C04, user: USERS.karim, open: at(17, jitter() + 10), close: at(22, 15 + jitter()) });
    }

    // One shift at a time per counter: the next one opens after the previous one closed.
    plans.sort((a, b) => a.open - b.open);
    const lastClose = new Map<string, number>();
    for (const plan of plans) {
      const previous = lastClose.get(plan.counter.id);
      if (previous !== undefined && plan.open <= previous) plan.open = previous + 2 * MINUTE;
      if (plan.close <= plan.open) plan.close = plan.open + HOUR;
      lastClose.set(plan.counter.id, plan.close);
    }

    // Timeline of the day: shift openings/closings, sales, expenses, adjustments.
    type Tick = { time: number; kind: 'close' | 'open' | 'sale' | 'expense' | 'adjust' | 'stockCount'; data?: string; plan?: Plan & { shift?: SimShift } };
    const ORDER: Record<Tick['kind'], number> = { close: 0, open: 1, sale: 2, expense: 2, adjust: 2, stockCount: 2 };
    const ticks: Tick[] = [];
    for (const plan of plans as Array<Plan & { shift?: SimShift }>) {
      if (busy.has(plan.counter.id)) continue;
      if (plan.open >= nowTime || plan.close <= notBefore) continue;
      ticks.push({ time: Math.max(plan.open, notBefore), kind: 'open', plan });
      if (plan.close <= nowTime) ticks.push({ time: plan.close, kind: 'close', plan });
    }
    if (ticks.length === 0) continue;
    const base = weekday === 5 ? APP_CONFIG.demo.salesPerDay.friday : weekday === 6 ? APP_CONFIG.demo.salesPerDay.saturday : APP_CONFIG.demo.salesPerDay.weekday;
    const salesCount = Math.round(base * between(0.85, 1.15));
    const hourCumulative = buildCumulative(HOUR_WEIGHTS.map(([, weight]) => weight));
    for (let index = 0; index < salesCount; index += 1) {
      const hour = HOUR_WEIGHTS[pickIndex(hourCumulative, random)][0];
      ticks.push({ time: at(hour, intBetween(0, 59)) + intBetween(0, 59) * 1_000, kind: 'sale' });
    }
    const expenseCount = chance(0.55) ? 2 : 1;
    for (let index = 0; index < expenseCount; index += 1) {
      const category = pick(['transport', 'cleaning', 'office', 'staff-food', 'staff-food', 'maintenance', 'packaging', 'utilities', 'misc']);
      ticks.push({ time: at(intBetween(10, 20), intBetween(0, 59)), kind: 'expense', data: category });
    }
    if (day.getDate() === 1) ticks.push({ time: at(11, 5), kind: 'expense', data: 'rent' });
    if (day.getDate() === 12) ticks.push({ time: at(12, 40), kind: 'expense', data: 'electricity' });
    if (chance(0.3)) ticks.push({ time: at(intBetween(9, 11), intBetween(0, 59)), kind: 'adjust' });
    // A stock count a few days ago found some shelves empty (these stay out of stock).
    if (daysAgo === 4) ticks.push({ time: at(9, 30), kind: 'stockCount' });
    ticks.sort((a, b) => a.time - b.time || ORDER[a.kind] - ORDER[b.kind]);

    for (const tick of ticks) {
      if (tick.kind === 'open' && tick.plan) {
        processEventsUntil(tick.time);
        const plan = tick.plan;
        const keepOpen = plan.close > nowTime;
        const shift = openShift(plan.counter, plan.user, tick.time, plan.close, keepOpen);
        plan.shift = shift;
        // Occasional cash top-up (change fund) during the first hour.
        const topUpAt = shift.openAt + 50 * MINUTE;
        if (chance(0.06) && topUpAt < Math.min(plan.close, nowTime - MINUTE)) {
          const amount = pick([100_000, 150_000, 200_000]);
          shift.acc.cashIn += amount;
          cashMove(shift, topUpAt, 'cash_in', amount, null, 'খুচরা টাকা (ভাংতি) যোগ', USERS.nusrat);
          audit(topUpAt, USERS.nusrat, 'cash.in', 'shift', shift.id, { amount });
        }
        continue;
      }
      if (tick.time >= nowTime - MINUTE || tick.time < notBefore) continue;
      processEventsUntil(tick.time);
      if (tick.kind === 'sale') {
        const shift = activeShiftAt(tick.time);
        if (shift) simulateSale(tick.time, shift);
      } else if (tick.kind === 'expense') {
        recordExpense(tick.time, tick.data ?? 'misc', tick.data === 'rent' || tick.data === 'electricity');
      } else if (tick.kind === 'adjust') {
        recordAdjustment(tick.time);
      } else if (tick.kind === 'stockCount') {
        for (const product of products) {
          if (product.policy !== 'oos' || product.balance <= 0) continue;
          const adjustmentNo = nextNumber(APP_CONFIG.numbering.adjustmentPrefix, tick.time);
          const perishable = product.shelfLifeDays !== null && product.shelfLifeDays <= 30;
          moveStock(product, tick.time, perishable ? 'damage' : 'adjustment', -product.balance, { type: 'adjustment', id: stableId(`adj:${adjustmentNo}`), no: adjustmentNo }, {
            reason: perishable ? 'expired' : 'counting_error',
            user: USERS.nusrat,
            note: perishable ? 'মেয়াদোত্তীর্ণ — বাতিল' : 'স্টক গণনায় ঘাটতি',
          });
        }
      } else if (tick.kind === 'close' && tick.plan?.shift && !tick.plan.shift.closed) {
        closeShift(tick.plan.shift);
      }
    }
  }

  processEventsUntil(nowTime - MINUTE);
  for (const shift of shifts) {
    if (!shift.closed && !shift.keepOpen) closeShift(shift);
  }

  // Purchase orders that have not arrived yet stay "ordered".
  for (const po of allPos) {
    if (!po.received) writePurchase(po, 'ordered', null);
  }

  const openShifts = shifts.filter((shift) => !shift.closed);
  for (const shift of openShifts) {
    db.run('UPDATE counters SET status = ?, assigned_user_id = ?, updated_at = ? WHERE id = ?', ['open', shift.user.id, iso(shift.openAt), shift.counter.id]);
  }

  return {
    sales: salesCreated,
    openShifts: openShifts.map((shift) => ({ id: shift.id, counterId: shift.counter.id, userId: shift.user.id, shiftNo: shift.shiftNo })),
  };
}

/** Creates two parked (held) carts on the terminal counter's open shift. */
export function seedHeldSales(db: SeedExecutor, products: SimProduct[], counterId: string, userId: string, random: () => number, now: Date): void {
  const user = userById(userId);
  const available = products.filter((product) => product.balance >= 2 && !product.weighted);
  if (available.length < 6) return;
  const labels = ['গ্রাহক ফিরে আসবেন', 'টাকা আনতে গেছেন'];
  for (let holdNo = 1; holdNo <= 2; holdNo += 1) {
    const lines: CartLine[] = [];
    const count = 2 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const product = available[Math.floor(random() * available.length)];
      if (lines.some((line) => line.productId === product.id)) continue;
      lines.push({
        lineId: stableId(`held-line:${holdNo}:${product.id}`),
        productId: product.id,
        sku: product.sku,
        barcode: product.barcode,
        name: { bn: product.nameBn, en: product.nameEn },
        image: product.image,
        unitId: product.unitId,
        weighted: product.weighted,
        quantity: 1 + Math.floor(random() * 2),
        unitPrice: product.price,
        originalPrice: product.price,
        mrp: product.mrp,
        costPrice: product.cost,
        taxRate: product.taxRate,
        discount: product.discountType ? { type: product.discountType, value: product.discountValue } : null,
        discountSource: product.discountType ? 'promo' : null,
        discountReason: '',
        note: '',
        priceOverride: null,
      });
    }
    const draft: CartDraft = { lines, customerId: null, orderDiscount: null, note: '' };
    const totals = calculateCartTotals(lines, null, { taxEnabled: true, taxMode: 'exclusive', rounding: 'none' });
    const createdAt = new Date(now.getTime() - (40 - holdNo * 15) * MINUTE).toISOString();
    insertRow(db, 'held_sales', {
      id: stableId(`held:${counterId}:${holdNo}:${now.toDateString()}`),
      hold_no: holdNo,
      counter_id: counterId,
      user_id: user.id,
      user_name: user.name.en,
      customer_id: null,
      customer_name: '',
      label: labels[holdNo - 1],
      payload: JSON.stringify(draft),
      item_count: lines.length,
      total: totals.grandTotal,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
}
