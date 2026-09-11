// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toLocalDate, addDays } from '@/domain/dates';
import { applyMovements, findStockShortages, getStockStatus, isExpired, isExpiringSoon, movingAverageCost, signedQuantity, STOCK_IN_TYPES, STOCK_OUT_TYPES } from '@/domain/stock';

const TODAY = new Date(2026, 8, 10, 15, 30);
const inDays = (days: number) => toLocalDate(addDays(TODAY, days));

describe('signedQuantity', () => {
  it('removes stock for sales, damage and transfers out', () => {
    expect(signedQuantity('sale', 2)).toBe(-2);
    expect(signedQuantity('sale', -2)).toBe(-2);
    expect(signedQuantity('damage', 1)).toBe(-1);
    expect(signedQuantity('transfer_out', 0.5)).toBe(-0.5);
  });

  it('adds stock for purchases, returns, cancellations, opening and transfers in', () => {
    expect(signedQuantity('purchase', -3)).toBe(3);
    expect(signedQuantity('return', 1)).toBe(1);
    expect(signedQuantity('cancel', 2)).toBe(2);
    expect(signedQuantity('opening', 10)).toBe(10);
    expect(signedQuantity('transfer_in', 4)).toBe(4);
  });

  it('keeps the sign of adjustments and rounds to 3 decimals', () => {
    expect(signedQuantity('adjustment', -1.5)).toBe(-1.5);
    expect(signedQuantity('adjustment', 2)).toBe(2);
    expect(signedQuantity('purchase', 1.23456)).toBe(1.235);
  });

  it('classifies every movement type once', () => {
    const both = STOCK_IN_TYPES.filter((type) => STOCK_OUT_TYPES.includes(type));
    expect(both).toEqual([]);
  });
});

describe('applyMovements', () => {
  it('replays the ledger onto an opening balance', () => {
    expect(applyMovements(10, [{ quantity: -3 }, { quantity: 5.5 }, { quantity: -0.25 }])).toBe(12.25);
    expect(applyMovements(0, [])).toBe(0);
    expect(applyMovements(0.1, [{ quantity: 0.2 }])).toBe(0.3);
  });
});

describe('stock status', () => {
  const product = (overrides: Partial<Parameters<typeof getStockStatus>[0]> = {}) => ({ status: 'active' as const, stock: 50, minStock: 10, expiryDate: null, ...overrides });

  it('returns inactive before anything else', () => {
    expect(getStockStatus(product({ status: 'inactive', stock: 0 }), 7, TODAY)).toBe('inactive');
  });

  it('is out of stock at zero or below', () => {
    expect(getStockStatus(product({ stock: 0 }), 7, TODAY)).toBe('out_of_stock');
    expect(getStockStatus(product({ stock: -2 }), 7, TODAY)).toBe('out_of_stock');
  });

  it('is low at or below the minimum stock', () => {
    expect(getStockStatus(product({ stock: 10 }), 7, TODAY)).toBe('low_stock');
    expect(getStockStatus(product({ stock: 0.5 }), 7, TODAY)).toBe('low_stock');
    expect(getStockStatus(product({ stock: 11 }), 7, TODAY)).toBe('in_stock');
  });

  it('flags expiring stock (before the low-stock check)', () => {
    expect(getStockStatus(product({ stock: 5, expiryDate: inDays(3) }), 7, TODAY)).toBe('expiring');
    expect(getStockStatus(product({ expiryDate: inDays(7) }), 7, TODAY)).toBe('expiring');
    expect(getStockStatus(product({ expiryDate: inDays(8) }), 7, TODAY)).toBe('in_stock');
    expect(getStockStatus(product({ stock: 0, expiryDate: inDays(1) }), 7, TODAY)).toBe('out_of_stock');
  });

  it('uses calendar days for expiry', () => {
    expect(isExpiringSoon(inDays(0), 0, TODAY)).toBe(true);
    expect(isExpiringSoon(inDays(1), 0, TODAY)).toBe(false);
    expect(isExpiringSoon(inDays(-3), 7, TODAY)).toBe(true);
    expect(isExpiringSoon(null, 7, TODAY)).toBe(false);
    expect(isExpired(inDays(-1), TODAY)).toBe(true);
    expect(isExpired(inDays(0), TODAY)).toBe(false);
    expect(isExpired(null, TODAY)).toBe(false);
    // Late in the evening the expiry day still counts as today.
    expect(isExpired(inDays(0), new Date(2026, 8, 10, 23, 59))).toBe(false);
  });
});

describe('findStockShortages', () => {
  it('aggregates cart lines per product before comparing with stock', () => {
    const stock = new Map([
      ['p1', 4],
      ['p2', 10],
    ]);
    expect(findStockShortages([{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 10 }], stock)).toEqual([
      { productId: 'p1', requested: 5, available: 4 },
    ]);
  });

  it('treats unknown products as having no stock', () => {
    expect(findStockShortages([{ productId: 'ghost', quantity: 1 }], new Map())).toEqual([{ productId: 'ghost', requested: 1, available: 0 }]);
  });

  it('handles weighted quantities without float noise', () => {
    const stock = new Map([['rice', 0.3]]);
    expect(findStockShortages([{ productId: 'rice', quantity: 0.1 }, { productId: 'rice', quantity: 0.2 }], stock)).toEqual([]);
  });
});

describe('movingAverageCost', () => {
  it('weights the current stock and the received quantity', () => {
    expect(movingAverageCost(10, 1_000, 10, 2_000)).toBe(1_500);
    expect(movingAverageCost(3, 1_000, 1, 1_001)).toBe(1_000);
    expect(movingAverageCost(1, 1_000, 1, 1_001)).toBe(1_001); // 1000.5 → 1001
  });

  it('ignores negative stock and falls back to the new cost', () => {
    expect(movingAverageCost(-5, 900, 10, 1_200)).toBe(1_200);
    expect(movingAverageCost(0, 900, 0, 1_200)).toBe(1_200);
  });
});
