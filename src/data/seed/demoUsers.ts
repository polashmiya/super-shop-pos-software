import type { RoleId } from '@/types/people';
import { stableId } from '@/domain/ids';

/* ==========================================================================
   Demo staff, counters and expense categories. Shared by the seed generator
   (main process) and the login screen (demo credentials hint).
   ========================================================================== */

export interface DemoUser {
  id: string;
  username: string;
  name: { bn: string; en: string };
  roleId: RoleId;
  pin: string;
  avatarColor: string;
  phone: string;
  counterCode: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: stableId('user:rahim'),
    username: 'rahim',
    name: { bn: 'রহিম উদ্দিন', en: 'Rahim Uddin' },
    roleId: 'admin',
    pin: '1111',
    avatarColor: '#4c8dff',
    phone: '01711234567',
    counterCode: 'C01',
  },
  {
    id: stableId('user:nusrat'),
    username: 'nusrat',
    name: { bn: 'নুসরাত জাহান', en: 'Nusrat Jahan' },
    roleId: 'manager',
    pin: '2222',
    avatarColor: '#a283ff',
    phone: '01819345678',
    counterCode: 'C02',
  },
  {
    id: stableId('user:karim'),
    username: 'karim',
    name: { bn: 'করিম হোসেন', en: 'Karim Hossain' },
    roleId: 'cashier',
    pin: '3333',
    avatarColor: '#1fbf7c',
    phone: '01912456789',
    counterCode: 'C03',
  },
  {
    id: stableId('user:sadia'),
    username: 'sadia',
    name: { bn: 'সাদিয়া আক্তার', en: 'Sadia Akter' },
    roleId: 'cashier',
    pin: '4444',
    avatarColor: '#fb5d7c',
    phone: '01615567890',
    counterCode: 'C04',
  },
  {
    id: stableId('user:hasan'),
    username: 'hasan',
    name: { bn: 'হাসান মাহমুদ', en: 'Hasan Mahmud' },
    roleId: 'cashier',
    pin: '5555',
    avatarColor: '#fb8a3c',
    phone: '01521678901',
    counterCode: 'C01',
  },
];

export interface DemoCounter {
  id: string;
  code: string;
  name: { bn: string; en: string };
}

export const DEMO_COUNTERS: DemoCounter[] = [
  { id: stableId('counter:C01'), code: 'C01', name: { bn: 'কাউন্টার ০১', en: 'Counter 01' } },
  { id: stableId('counter:C02'), code: 'C02', name: { bn: 'কাউন্টার ০২', en: 'Counter 02' } },
  { id: stableId('counter:C03'), code: 'C03', name: { bn: 'কাউন্টার ০৩', en: 'Counter 03' } },
  { id: stableId('counter:C04'), code: 'C04', name: { bn: 'কাউন্টার ০৪', en: 'Counter 04' } },
];

/** The counter this terminal represents in the demo (spec example: Counter 03). */
export const DEMO_TERMINAL_COUNTER_ID = DEMO_COUNTERS[2].id;

export interface DemoExpenseCategory {
  id: string;
  code: string;
  name: { bn: string; en: string };
  icon: string;
  /** Typical amount range in taka. */
  range: [number, number];
}

export const EXPENSE_CATEGORIES: DemoExpenseCategory[] = [
  { id: stableId('expense-category:transport'), code: 'transport', name: { bn: 'যাতায়াত ও পরিবহন', en: 'Transport' }, icon: 'Truck', range: [150, 1800] },
  { id: stableId('expense-category:electricity'), code: 'electricity', name: { bn: 'বিদ্যুৎ বিল', en: 'Electricity' }, icon: 'Zap', range: [4500, 18000] },
  { id: stableId('expense-category:cleaning'), code: 'cleaning', name: { bn: 'পরিষ্কার-পরিচ্ছন্নতা', en: 'Cleaning' }, icon: 'SprayCan', range: [200, 1500] },
  { id: stableId('expense-category:office'), code: 'office', name: { bn: 'অফিস সরঞ্জাম', en: 'Office supplies' }, icon: 'Paperclip', range: [120, 2500] },
  { id: stableId('expense-category:staff-food'), code: 'staff-food', name: { bn: 'স্টাফ খাবার', en: 'Staff food' }, icon: 'Utensils', range: [300, 1600] },
  { id: stableId('expense-category:maintenance'), code: 'maintenance', name: { bn: 'মেরামত ও রক্ষণাবেক্ষণ', en: 'Maintenance' }, icon: 'Wrench', range: [500, 6000] },
  { id: stableId('expense-category:packaging'), code: 'packaging', name: { bn: 'প্যাকেজিং ও ব্যাগ', en: 'Packaging & bags' }, icon: 'Package', range: [400, 3500] },
  { id: stableId('expense-category:utilities'), code: 'utilities', name: { bn: 'ইন্টারনেট ও ফোন', en: 'Internet & phone' }, icon: 'Wifi', range: [500, 2500] },
  { id: stableId('expense-category:rent'), code: 'rent', name: { bn: 'ভাড়া', en: 'Rent' }, icon: 'Building2', range: [45000, 85000] },
  { id: stableId('expense-category:misc'), code: 'misc', name: { bn: 'বিবিধ', en: 'Miscellaneous' }, icon: 'Receipt', range: [100, 1200] },
];
