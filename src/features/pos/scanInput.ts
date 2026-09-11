import { toAsciiDigits } from '@/domain/text';

/* ==========================================================================
   What the cashier typed or scanned into the scan box. A quantity can be
   given in front of the code the way supermarket checkouts do it:
   "3*8941100001", "3x8941100001", "2.5 × mango" (weighed goods) — Bangla
   digits work too. Anything else is a plain code or search text.
   ========================================================================== */

export interface ScanInput {
  /** Quantity typed before the code, or null when none was given. */
  quantity: number | null;
  /** The barcode / SKU / search text without the quantity prefix. */
  code: string;
}

const QUANTITY_PREFIX = /^(\d{1,4}(?:[.,]\d{1,3})?)\s*[*xX×]\s*(\S.*)$/;

export function parseScanInput(raw: string): ScanInput {
  const text = raw.trim();
  const match = QUANTITY_PREFIX.exec(toAsciiDigits(text));
  if (!match) return { quantity: null, code: text };
  const quantity = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) return { quantity: null, code: text };
  // Keep the code exactly as typed (digits are normalised again where they are looked up).
  return { quantity, code: text.slice(text.length - match[2].length).trim() };
}
