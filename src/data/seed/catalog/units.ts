import type { BilingualText, UnitCode } from './types';

export interface UnitDefinition {
  code: UnitCode;
  name: BilingualText;
  short: BilingualText;
  allowDecimal: boolean;
}

/** Selling units offered in product forms (order = display order). */
export const UNIT_DEFINITIONS: UnitDefinition[] = [
  { code: 'pcs', name: { en: 'Piece', bn: 'পিস' }, short: { en: 'pc', bn: 'পিস' }, allowDecimal: false },
  { code: 'kg', name: { en: 'Kilogram', bn: 'কেজি' }, short: { en: 'kg', bn: 'কেজি' }, allowDecimal: true },
  { code: 'g', name: { en: 'Gram', bn: 'গ্রাম' }, short: { en: 'g', bn: 'গ্রা' }, allowDecimal: true },
  { code: 'litre', name: { en: 'Litre', bn: 'লিটার' }, short: { en: 'L', bn: 'লি' }, allowDecimal: true },
  { code: 'ml', name: { en: 'Millilitre', bn: 'মিলিলিটার' }, short: { en: 'ml', bn: 'মিলি' }, allowDecimal: true },
  { code: 'pack', name: { en: 'Pack', bn: 'প্যাকেট' }, short: { en: 'pack', bn: 'প্যাক' }, allowDecimal: false },
  { code: 'box', name: { en: 'Box', bn: 'বক্স' }, short: { en: 'box', bn: 'বক্স' }, allowDecimal: false },
  { code: 'bottle', name: { en: 'Bottle', bn: 'বোতল' }, short: { en: 'btl', bn: 'বোতল' }, allowDecimal: false },
  { code: 'dozen', name: { en: 'Dozen', bn: 'ডজন' }, short: { en: 'dz', bn: 'ডজন' }, allowDecimal: false },
  { code: 'carton', name: { en: 'Carton', bn: 'কার্টন' }, short: { en: 'ctn', bn: 'কার্টন' }, allowDecimal: false },
  { code: 'bundle', name: { en: 'Bundle', bn: 'আঁটি' }, short: { en: 'bdl', bn: 'আঁটি' }, allowDecimal: false },
  { code: 'can', name: { en: 'Can', bn: 'ক্যান' }, short: { en: 'can', bn: 'ক্যান' }, allowDecimal: false },
  { code: 'jar', name: { en: 'Jar', bn: 'জার' }, short: { en: 'jar', bn: 'জার' }, allowDecimal: false },
  { code: 'pouch', name: { en: 'Pouch', bn: 'পাউচ' }, short: { en: 'pouch', bn: 'পাউচ' }, allowDecimal: false },
  { code: 'bar', name: { en: 'Bar', bn: 'বার' }, short: { en: 'bar', bn: 'বার' }, allowDecimal: false },
  { code: 'tube', name: { en: 'Tube', bn: 'টিউব' }, short: { en: 'tube', bn: 'টিউব' }, allowDecimal: false },
  { code: 'set', name: { en: 'Set', bn: 'সেট' }, short: { en: 'set', bn: 'সেট' }, allowDecimal: false },
  { code: 'roll', name: { en: 'Roll', bn: 'রোল' }, short: { en: 'roll', bn: 'রোল' }, allowDecimal: false },
  { code: 'ream', name: { en: 'Ream', bn: 'রিম' }, short: { en: 'ream', bn: 'রিম' }, allowDecimal: false },
  { code: 'tray', name: { en: 'Tray', bn: 'ট্রে' }, short: { en: 'tray', bn: 'ট্রে' }, allowDecimal: false },
];
