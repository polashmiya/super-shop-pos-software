// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { containsBengali, escapeLike, initials, matchesTokens, normalizeSearch, tokenize, toAsciiDigits, toBanglaDigits, truncate } from '@/domain/text';

describe('digit conversion', () => {
  it('converts Bangla digits to ASCII and back', () => {
    expect(toAsciiDigits('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
    expect(toBanglaDigits('0123456789')).toBe('০১২৩৪৫৬৭৮৯');
    expect(toAsciiDigits('৳১,২৫০.৫০')).toBe('৳1,250.50');
    expect(toBanglaDigits('INV-20260910-0001')).toBe('INV-২০২৬০৯১০-০০০১');
    expect(toAsciiDigits(toBanglaDigits('2026'))).toBe('2026');
    expect(toAsciiDigits('no digits')).toBe('no digits');
  });

  it('detects Bengali script', () => {
    expect(containsBengali('মিনিকেট চাল')).toBe(true);
    expect(containsBengali('Rice ৫')).toBe(true);
    expect(containsBengali('Miniket rice')).toBe(false);
  });
});

describe('normalizeSearch / tokenize', () => {
  it('lower-cases, converts digits, strips punctuation and collapses spaces', () => {
    expect(normalizeSearch('  Miniket  চাল — ৫ কেজি!! ')).toBe('miniket চাল 5 কেজি');
    expect(normalizeSearch('FRESH-Milk (1L)')).toBe('fresh milk 1l');
    expect(normalizeSearch('...')).toBe('');
  });

  it('keeps Bengali vowel signs and matches decomposed / composed forms', () => {
    expect(normalizeSearch('কেজি')).toBe('কেজি');
    // YYA (U+09DF) vs YA + NUKTA (U+09AF U+09BC); RRA (U+09DC) vs DDA + NUKTA (U+09A1 U+09BC).
    expect(normalizeSearch('য়')).toBe(normalizeSearch('য়'));
    expect(normalizeSearch('ড়')).toBe(normalizeSearch('ড়'));
    // O-kar written as E-kar + AA-kar (U+09C7 U+09BE) equals the precomposed U+09CB.
    expect(normalizeSearch('কো')).toBe(normalizeSearch('কো'));
  });

  it('splits a query into normalised tokens', () => {
    expect(tokenize('Fresh   Milk 1L')).toEqual(['fresh', 'milk', '1l']);
    expect(tokenize('৫ kg চাল')).toEqual(['5', 'kg', 'চাল']);
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' !!! ')).toEqual([]);
  });

  it('matches all tokens in any order (Bangla + English)', () => {
    const haystack = normalizeSearch('Miniket Rice মিনিকেট চাল 5 kg ACI 8410000000017');
    expect(matchesTokens(haystack, tokenize('rice mini'))).toBe(true);
    expect(matchesTokens(haystack, tokenize('৫ kg চাল'))).toBe(true);
    expect(matchesTokens(haystack, tokenize('মিনিকেট'))).toBe(true);
    expect(matchesTokens(haystack, tokenize('84100'))).toBe(true);
    expect(matchesTokens(haystack, tokenize('rice oil'))).toBe(false);
    expect(matchesTokens(haystack, [])).toBe(true);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('initials / truncate', () => {
  it('builds initials from the first and last word', () => {
    expect(initials('Rahim Uddin')).toBe('RU');
    expect(initials('nusrat')).toBe('N');
    expect(initials('  Karim  Hossain  Khan ')).toBe('KK');
    expect(initials('করিম হোসেন')).toBe('কহ');
    expect(initials('   ')).toBe('?');
  });

  it('truncates with an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
    expect(truncate('abcd', 4)).toBe('abcd');
  });
});
