import { describe, expect, it } from 'vitest';
import { parseScanInput } from '@/features/pos/scanInput';

/* The scan box accepts "quantity × code" the way supermarket checkouts do. */

describe('parseScanInput', () => {
  it('returns plain codes and search text untouched', () => {
    expect(parseScanInput('8941100001234')).toEqual({ quantity: null, code: '8941100001234' });
    expect(parseScanInput('  Masoor dal ')).toEqual({ quantity: null, code: 'Masoor dal' });
    expect(parseScanInput('')).toEqual({ quantity: null, code: '' });
  });

  it('splits a quantity prefix written with *, x or ×', () => {
    expect(parseScanInput('3*8941100001234')).toEqual({ quantity: 3, code: '8941100001234' });
    expect(parseScanInput('3 x RCE-0001')).toEqual({ quantity: 3, code: 'RCE-0001' });
    expect(parseScanInput('12 × mango')).toEqual({ quantity: 12, code: 'mango' });
  });

  it('accepts decimal quantities for weighed goods and Bangla digits', () => {
    expect(parseScanInput('2.5*mango')).toEqual({ quantity: 2.5, code: 'mango' });
    expect(parseScanInput('1,5*mango')).toEqual({ quantity: 1.5, code: 'mango' });
    expect(parseScanInput('৩*৮৯৪১')).toEqual({ quantity: 3, code: '৮৯৪১' });
  });

  it('does not treat product names with x or * inside as quantities', () => {
    expect(parseScanInput('x-ray film')).toEqual({ quantity: null, code: 'x-ray film' });
    expect(parseScanInput('0*123')).toEqual({ quantity: null, code: '0*123' });
    expect(parseScanInput('3*')).toEqual({ quantity: null, code: '3*' });
  });
});
