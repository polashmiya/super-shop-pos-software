/* ==========================================================================
   Text helpers shared by search, validation and formatting.
   ========================================================================== */

const BANGLA_ZERO = 0x09e6;

export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO));
}

export function toBanglaDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => String.fromCharCode(BANGLA_ZERO + Number(digit)));
}

export function containsBengali(value: string): boolean {
  return /[ঀ-৿]/.test(value);
}

/**
 * Normalises text for searching: NFC, lower-case, Bangla digits → ASCII,
 * punctuation → spaces, collapsed whitespace. Bengali letters are kept.
 */
export function normalizeSearch(value: string): string {
  return toAsciiDigits(value.normalize('NFC'))
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** All query tokens must appear in the haystack (order independent). */
export function matchesTokens(haystack: string, tokens: readonly string[]): boolean {
  for (const token of tokens) {
    if (!haystack.includes(token)) return false;
  }
  return true;
}

export function tokenize(query: string): string[] {
  const normalized = normalizeSearch(query);
  return normalized ? normalized.split(' ') : [];
}

/** Escapes LIKE wildcards for SQL (use with ESCAPE '\'). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}
