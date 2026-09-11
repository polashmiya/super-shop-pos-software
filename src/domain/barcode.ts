/* ==========================================================================
   Barcode helpers: EAN-13 check digits, validation and generation.
   ========================================================================== */

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    const digit = Number(first12[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Builds a valid EAN-13 from a 12-digit body. */
export function makeEan13(body12: string): string {
  if (!/^\d{12}$/.test(body12)) throw new Error('EAN-13 body must be 12 digits');
  return `${body12}${ean13CheckDigit(body12)}`;
}

/** Accepted barcode/SKU characters: letters, digits and - . / (4–32 chars). */
export function isAcceptableBarcode(code: string): boolean {
  return /^[A-Za-z0-9\-./]{4,32}$/.test(code);
}

/** In-store barcode for items without a manufacturer code (prefix 2, GS1 restricted range). */
export function makeInStoreBarcode(sequence: number): string {
  return makeEan13(`20${String(sequence).padStart(10, '0')}`);
}
