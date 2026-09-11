// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isValidBdPhone, isValidEmail, maxLength, normalizePhone, required, validateEmail, validatePhone, validatePin } from '@/domain/validation';

describe('Bangladeshi phone numbers', () => {
  it('normalises +880 / 880 / 88 prefixes, separators and Bangla digits', () => {
    expect(normalizePhone('01711234567')).toBe('01711234567');
    expect(normalizePhone('+8801711234567')).toBe('01711234567');
    expect(normalizePhone('8801711234567')).toBe('01711234567');
    expect(normalizePhone('+88 017 1123 4567')).toBe('01711234567');
    expect(normalizePhone('01711-234567')).toBe('01711234567');
    expect(normalizePhone('০১৭১১২৩৪৫৬৭')).toBe('01711234567');
    expect(normalizePhone('+৮৮০১৯১২৪৫৬৭৮৯')).toBe('01912456789');
  });

  it('accepts 01[3-9] + 8 digits in every accepted format', () => {
    for (const phone of ['01311234567', '01411234567', '01511234567', '01611234567', '01711234567', '01811234567', '01911234567', '+8801711234567', '8801711234567', '০১৭১১২৩৪৫৬৭']) {
      expect(isValidBdPhone(phone)).toBe(true);
    }
  });

  it('rejects invalid operators and lengths', () => {
    for (const phone of ['01211234567', '01011234567', '0171123456', '017112345678', '1711234567', '+441711234567', '', 'phone']) {
      expect(isValidBdPhone(phone)).toBe(false);
    }
  });

  it('validates optional and required phone fields', () => {
    expect(validatePhone('', false)).toBeNull();
    expect(validatePhone('   ', true)).toBe('required');
    expect(validatePhone('0171', false)).toBe('invalidPhone');
    expect(validatePhone('+8801711234567', true)).toBeNull();
  });
});

describe('email', () => {
  it('accepts simple addresses and trims', () => {
    expect(isValidEmail('hello@nogorsupershop.com.bd')).toBe(true);
    expect(isValidEmail('  a@b.co ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('a@b.c')).toBe(false);
    expect(isValidEmail('no-at-sign.com')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail('a@@b.com')).toBe(false);
  });

  it('treats an empty email as optional', () => {
    expect(validateEmail('')).toBeNull();
    expect(validateEmail('x@y')).toBe('invalidEmail');
    expect(validateEmail('x@y.com')).toBeNull();
  });
});

describe('PIN and generic rules', () => {
  it('accepts 4–6 ASCII digits', () => {
    expect(validatePin('1234', 4, 6)).toBeNull();
    expect(validatePin('123456', 4, 6)).toBeNull();
    expect(validatePin('123', 4, 6)).toBe('invalidPin');
    expect(validatePin('1234567', 4, 6)).toBe('invalidPin');
    expect(validatePin('12a4', 4, 6)).toBe('invalidPin');
    expect(validatePin('12 34', 4, 6)).toBe('invalidPin');
    expect(validatePin('১২৩৪', 4, 6)).toBe('invalidPin');
  });

  it('checks required and maximum length', () => {
    expect(required('x')).toBeNull();
    expect(required('  ')).toBe('required');
    expect(required(null)).toBe('required');
    expect(required(undefined)).toBe('required');
    expect(maxLength('abcd', 4)).toBeNull();
    expect(maxLength('abcde', 4)).toBe('tooLong');
  });
});
