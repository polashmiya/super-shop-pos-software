// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, isAcceptableBarcode, isValidEan13, makeEan13, makeInStoreBarcode } from '@/domain/barcode';
import { createRandom } from '@/domain/ids';

describe('EAN-13', () => {
  it('computes check digits of known codes', () => {
    expect(ean13CheckDigit('400638133393')).toBe(1);
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('000000000000')).toBe(0);
  });

  it('validates complete codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false); // wrong check digit
    expect(isValidEan13('400638133393')).toBe(false); // 12 digits
    expect(isValidEan13('40063813339310')).toBe(false); // 14 digits
    expect(isValidEan13('400638133393A')).toBe(false);
    expect(isValidEan13('')).toBe(false);
  });

  it('detects any single-digit error (seeded fuzz)', () => {
    const random = createRandom(13);
    for (let run = 0; run < 200; run += 1) {
      const body = Array.from({ length: 12 }, () => Math.floor(random() * 10)).join('');
      const code = makeEan13(body);
      expect(isValidEan13(code)).toBe(true);
      const position = Math.floor(random() * 13);
      const original = Number(code[position]);
      const replacement = (original + 1 + Math.floor(random() * 9)) % 10;
      const broken = `${code.slice(0, position)}${replacement}${code.slice(position + 1)}`;
      expect(isValidEan13(broken)).toBe(false);
    }
  });

  it('builds codes from a 12-digit body only', () => {
    expect(makeEan13('590123412345')).toBe('5901234123457');
    expect(() => makeEan13('123')).toThrow();
    expect(() => makeEan13('59012341234A')).toThrow();
  });

  it('creates in-store codes in the GS1 restricted range', () => {
    const code = makeInStoreBarcode(1);
    expect(code).toMatch(/^20\d{11}$/);
    expect(code.slice(0, 12)).toBe('200000000001');
    expect(isValidEan13(code)).toBe(true);
    expect(makeInStoreBarcode(1)).not.toBe(makeInStoreBarcode(2));
  });
});

describe('isAcceptableBarcode', () => {
  it('accepts 4–32 letters, digits and - . /', () => {
    expect(isAcceptableBarcode('4006381333931')).toBe(true);
    expect(isAcceptableBarcode('ABC-12.3/4')).toBe(true);
    expect(isAcceptableBarcode('abcd')).toBe(true);
    expect(isAcceptableBarcode('abc')).toBe(false);
    expect(isAcceptableBarcode('A'.repeat(33))).toBe(false);
    expect(isAcceptableBarcode('12 34')).toBe(false);
    expect(isAcceptableBarcode('১২৩৪')).toBe(false); // convert Bangla digits first
  });
});
