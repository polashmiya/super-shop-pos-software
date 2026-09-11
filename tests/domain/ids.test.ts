// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AppError, isAppError, toAppError } from '@/domain/errors';
import { createRandom, hashString, isUuid, newId, stableId } from '@/domain/ids';

describe('ids', () => {
  it('creates random v4 UUIDs', () => {
    const a = newId();
    const b = newId();
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a[14]).toBe('4');
  });

  it('derives stable, well-formed UUIDs from names', () => {
    expect(stableId('user:rahim')).toBe(stableId('user:rahim'));
    expect(stableId('user:rahim')).not.toBe(stableId('user:karim'));
    for (const name of ['a', 'counter:C03', 'product:ACI-0001', '']) {
      const id = stableId(name);
      expect(isUuid(id)).toBe(true);
      expect(id[14]).toBe('4');
      expect('89ab').toContain(id[19]);
    }
  });

  it('recognises UUID strings only', () => {
    expect(isUuid('0b6a1c2e-4f1d-4c3a-9a51-6f0e2d9c0001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('has a deterministic seeded PRNG in [0, 1)', () => {
    const first = createRandom(20260910);
    const second = createRandom(20260910);
    const values = Array.from({ length: 1_000 }, () => first());
    expect(values).toEqual(Array.from({ length: 1_000 }, () => second()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it('hashes strings to unsigned 32-bit integers (FNV-1a)', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toBeLessThan(2 ** 32);
  });
});

describe('errors', () => {
  it('carries a code and params', () => {
    const error = new AppError('stockInsufficient', { name: 'Rice', available: 2 });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('stockInsufficient');
    expect(error.params).toEqual({ name: 'Rice', available: 2 });
    expect(error.name).toBe('AppError');
    expect(isAppError(error)).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });

  it('wraps unknown errors with a fallback code', () => {
    const existing = new AppError('notFound');
    expect(toAppError(existing)).toBe(existing);
    const cause = new Error('boom');
    const wrapped = toAppError(cause, 'saveFailed');
    expect(wrapped.code).toBe('saveFailed');
    expect(wrapped.cause).toBe(cause);
    expect(toAppError('text').code).toBe('unknown');
  });
});
