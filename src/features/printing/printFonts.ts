/* ==========================================================================
   Fonts embedded into print documents as data: URIs, so Bangla prints
   correctly on any printer/PC without installed fonts. Loaded lazily the
   first time something is printed or previewed.
   ========================================================================== */

let cached: Promise<string> | null = null;

async function load(): Promise<string> {
  const [bengali, latin] = await Promise.all([
    import('@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2?inline'),
    import('@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-latin-wght-normal.woff2?inline'),
  ]);
  return `
@font-face { font-family: 'Receipt Bangla'; font-weight: 100 900; src: url(${bengali.default}) format('woff2'); unicode-range: U+0951-0952, U+0964-0965, U+0980-09FE, U+200C-200D, U+25CC; }
@font-face { font-family: 'Receipt Bangla'; font-weight: 100 900; src: url(${latin.default}) format('woff2'); unicode-range: U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2212; }`;
}

/** @font-face CSS for print documents (family "Receipt Bangla"). */
export function printFontCss(): Promise<string> {
  cached ??= load().catch(() => '');
  return cached;
}

export const PRINT_FONT_STACK = "'Receipt Bangla', 'Noto Sans Bengali', 'Nirmala UI', 'Segoe UI', Arial, sans-serif";
export const PRINT_MONO_STACK = "'Consolas', 'Courier New', monospace";
