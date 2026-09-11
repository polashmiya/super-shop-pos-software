/* ==========================================================================
   Identifiers. Records use UUID v4 strings. The demo generator derives
   deterministic UUIDs from a seed so "Reset demo data" is reproducible.
   ========================================================================== */

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Small, fast, seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 32-bit string hash (FNV-1a). */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const HEX = '0123456789abcdef';

/**
 * Deterministic UUID v4-formatted id derived from a name (stable across
 * runs). Four independent 32-bit hashes give ~122 bits, so collisions are
 * practically impossible even for hundreds of thousands of records.
 */
export function stableId(name: string): string {
  const nibbles = [0, 1, 2, 3].map((salt) => hashString(`${salt}${name}`).toString(16).padStart(8, '0')).join('').split('');
  nibbles[12] = '4';
  nibbles[16] = HEX[(parseInt(nibbles[16], 16) & 0x3) | 0x8];
  const hex = nibbles.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
