import { stableId } from '@/domain/ids';
import { normalizeSearch } from '@/domain/text';
import type { CustomerType } from '@/types/people';
import { PEOPLE } from './catalog/people';

/* ==========================================================================
   Demo customer generator: realistic Bangladeshi names, valid mobile
   numbers (unique), Dhaka addresses and a sensible customer-type mix.
   ========================================================================== */

export interface SeedCustomer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customerType: CustomerType;
  discountRate: number;
  createdAt: Date;
  searchText: string;
  weight: number;
  // Running stats (filled by the history simulator)
  totalSpent: number;
  totalOrders: number;
  loyaltyPoints: number;
  lastPurchaseAt: string | null;
}

const OPERATOR_PREFIXES = ['013', '014', '015', '016', '017', '018', '019'];
const EMAIL_DOMAINS = ['gmail.com', 'gmail.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export function generateCustomers(
  count: number,
  random: () => number,
  historyStart: Date,
  typeRates: Record<Exclude<CustomerType, 'walk_in'>, number>,
): SeedCustomer[] {
  const phones = new Set<string>();
  const customers: SeedCustomer[] = [];

  for (let index = 0; index < count; index += 1) {
    const female = random() < 0.46;
    const first = pick(random, female ? PEOPLE.femaleFirstNames : PEOPLE.maleFirstNames);
    const last = pick(random, PEOPLE.lastNames);
    const inBangla = random() < 0.22;
    const name = inBangla ? `${first.bn} ${last.bn}` : `${first.en} ${last.en}`;

    let phone: string;
    do {
      phone = `${pick(random, OPERATOR_PREFIXES)}${String(Math.floor(random() * 100_000_000)).padStart(8, '0')}`;
    } while (phones.has(phone));
    phones.add(phone);

    const typeRoll = random();
    const customerType: CustomerType = typeRoll < 0.1 ? 'vip' : typeRoll < 0.16 ? 'wholesale' : typeRoll < 0.26 ? 'walk_in' : 'regular';
    const discountRate = customerType === 'walk_in' ? 0 : typeRates[customerType];

    const area = pick(random, PEOPLE.areas);
    const house = 1 + Math.floor(random() * 120);
    const road = 1 + Math.floor(random() * 30);
    const address = inBangla ? `বাড়ি ${house}, রোড ${road}, ${area.bn}, ঢাকা` : `House ${house}, Road ${road}, ${area.en}, Dhaka`;
    const email =
      random() < 0.38
        ? `${first.en.toLowerCase().replace(/[^a-z]/g, '')}.${last.en.toLowerCase().replace(/[^a-z]/g, '')}${Math.floor(random() * 90) + 10}@${pick(random, EMAIL_DOMAINS)}`
        : '';

    // Most customers joined before the history window; some during it.
    const joinedDaysBefore = random() < 0.88 ? Math.floor(random() * 420) : -Math.floor(random() * 40);
    const createdAt = new Date(historyStart.getTime() - joinedDaysBefore * 86_400_000 + Math.floor(random() * 36_000_000));
    const code = `CUS-${String(index + 1).padStart(5, '0')}`;

    customers.push({
      id: stableId(`customer:${code}`),
      code,
      name,
      phone,
      email,
      address,
      customerType,
      discountRate,
      createdAt,
      searchText: normalizeSearch(`${name} ${phone} ${email} ${code}`),
      weight: customerType === 'vip' ? 4 : customerType === 'wholesale' ? 3 : customerType === 'regular' ? 1.4 : 0.5,
      totalSpent: 0,
      totalOrders: 0,
      loyaltyPoints: 0,
      lastPurchaseAt: null,
    });
  }
  return customers;
}
