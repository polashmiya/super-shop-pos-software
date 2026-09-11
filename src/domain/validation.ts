import { toAsciiDigits } from './text';

/* ==========================================================================
   Input validation used by services and forms. Returns i18n keys under
   `validation.*`, or null when valid.
   ========================================================================== */

export type ValidationKey =
  | 'required'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'invalidAmount'
  | 'invalidQuantity'
  | 'invalidPercent'
  | 'invalidBarcode'
  | 'invalidPin'
  | 'tooLong'
  | 'mustBePositive'
  | 'priceBelowCost'
  | 'mrpBelowPrice'
  | 'minAboveMax';

/** Bangladeshi mobile: 01[3-9] + 8 digits, optional +88 / 88 prefix. */
export function normalizePhone(value: string): string {
  const digits = toAsciiDigits(value).replace(/[^\d]/g, '');
  if (digits.startsWith('880') && digits.length === 13) return `0${digits.slice(3)}`;
  if (digits.startsWith('88') && digits.length === 13) return digits.slice(2);
  return digits;
}

export function isValidBdPhone(value: string): boolean {
  return /^01[3-9]\d{8}$/.test(normalizePhone(value));
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function required(value: string | null | undefined): ValidationKey | null {
  return value && value.trim() ? null : 'required';
}

export function validatePhone(value: string, isRequired: boolean): ValidationKey | null {
  if (!value.trim()) return isRequired ? 'required' : null;
  return isValidBdPhone(value) ? null : 'invalidPhone';
}

export function validateEmail(value: string): ValidationKey | null {
  if (!value.trim()) return null;
  return isValidEmail(value) ? null : 'invalidEmail';
}

export function validatePin(value: string, min: number, max: number): ValidationKey | null {
  return new RegExp(`^\\d{${min},${max}}$`).test(value) ? null : 'invalidPin';
}

export function maxLength(value: string, max: number): ValidationKey | null {
  return value.length > max ? 'tooLong' : null;
}
