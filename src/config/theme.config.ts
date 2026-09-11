import type {
  AccentId,
  BanglaFontId,
  CornerStyle,
  Density,
  FontSizePreset,
  ReceiptFontId,
  ResolvedTheme,
  UiFontId,
} from '@/types/settings';

/* ==========================================================================
   Theme configuration.

   Base colours (backgrounds, surfaces, text, status colours) are CSS tokens
   in src/styles/tokens.css. This file holds the parts users can switch at
   runtime: accent colour presets, fonts, sizes, density and corners. The
   runtime applies them as CSS variables on <html> (src/app/applyAppearance.ts).
   ========================================================================== */

export interface AccentPalette {
  /** Main brand/action colour (Pay button, active nav, focus ring). */
  primary: string;
  primaryHover: string;
  /** Text/icon colour on top of `primary`. */
  primaryFg: string;
  /** Tinted background for selected/active states. */
  primarySoft: string;
  /** Text colour on top of `primarySoft`. */
  primarySoftFg: string;
}

export interface AccentPreset {
  id: AccentId;
  label: { bn: string; en: string };
  /** Swatch shown in settings. */
  swatch: string;
  dark: AccentPalette;
  light: AccentPalette;
}

export const ACCENT_PRESETS: Record<AccentId, AccentPreset> = {
  emerald: {
    id: 'emerald',
    label: { bn: 'পান্না সবুজ', en: 'Emerald' },
    swatch: '#10b981',
    dark: { primary: '#1fbf7c', primaryHover: '#2fd18c', primaryFg: '#03140c', primarySoft: 'rgba(31, 191, 124, 0.15)', primarySoftFg: '#6ee7b2' },
    light: { primary: '#059669', primaryHover: '#047857', primaryFg: '#ffffff', primarySoft: '#e2f5ec', primarySoftFg: '#065f46' },
  },
  blue: {
    id: 'blue',
    label: { bn: 'নীল', en: 'Blue' },
    swatch: '#3b82f6',
    dark: { primary: '#4c8dff', primaryHover: '#6aa1ff', primaryFg: '#030b1d', primarySoft: 'rgba(76, 141, 255, 0.16)', primarySoftFg: '#a3c4ff' },
    light: { primary: '#2563eb', primaryHover: '#1d4ed8', primaryFg: '#ffffff', primarySoft: '#e6eefe', primarySoftFg: '#1e40af' },
  },
  indigo: {
    id: 'indigo',
    label: { bn: 'গাঢ় নীল', en: 'Indigo' },
    swatch: '#6366f1',
    dark: { primary: '#7c83ff', primaryHover: '#959bff', primaryFg: '#07081f', primarySoft: 'rgba(124, 131, 255, 0.16)', primarySoftFg: '#c0c3ff' },
    light: { primary: '#4f46e5', primaryHover: '#4338ca', primaryFg: '#ffffff', primarySoft: '#ecebfd', primarySoftFg: '#3730a3' },
  },
  violet: {
    id: 'violet',
    label: { bn: 'বেগুনি', en: 'Violet' },
    swatch: '#8b5cf6',
    dark: { primary: '#a283ff', primaryHover: '#b59cff', primaryFg: '#12072b', primarySoft: 'rgba(162, 131, 255, 0.16)', primarySoftFg: '#d4c5ff' },
    light: { primary: '#7c3aed', primaryHover: '#6d28d9', primaryFg: '#ffffff', primarySoft: '#f1eafd', primarySoftFg: '#5b21b6' },
  },
  rose: {
    id: 'rose',
    label: { bn: 'গোলাপি', en: 'Rose' },
    swatch: '#f43f5e',
    dark: { primary: '#fb5d7c', primaryHover: '#ff7a94', primaryFg: '#22030b', primarySoft: 'rgba(251, 93, 124, 0.16)', primarySoftFg: '#ffb1c1' },
    light: { primary: '#e11d48', primaryHover: '#be123c', primaryFg: '#ffffff', primarySoft: '#fde8ed', primarySoftFg: '#9f1239' },
  },
  orange: {
    id: 'orange',
    label: { bn: 'কমলা', en: 'Orange' },
    swatch: '#f97316',
    dark: { primary: '#fb8a3c', primaryHover: '#ff9f5a', primaryFg: '#1f0c02', primarySoft: 'rgba(251, 138, 60, 0.16)', primarySoftFg: '#ffc59b' },
    light: { primary: '#ea580c', primaryHover: '#c2410c', primaryFg: '#ffffff', primarySoft: '#fdede3', primarySoftFg: '#9a3412' },
  },
  teal: {
    id: 'teal',
    label: { bn: 'টিল', en: 'Teal' },
    swatch: '#14b8a6',
    dark: { primary: '#22c3b5', primaryHover: '#39d6c8', primaryFg: '#02130f', primarySoft: 'rgba(34, 195, 181, 0.15)', primarySoftFg: '#7fe7dd' },
    light: { primary: '#0d9488', primaryHover: '#0f766e', primaryFg: '#ffffff', primarySoft: '#e0f4f2', primarySoftFg: '#115e59' },
  },
  slate: {
    id: 'slate',
    label: { bn: 'স্লেট', en: 'Slate' },
    swatch: '#64748b',
    dark: { primary: '#c4cedb', primaryHover: '#dbe2ea', primaryFg: '#0b0f15', primarySoft: 'rgba(196, 206, 219, 0.14)', primarySoftFg: '#e2e8f0' },
    light: { primary: '#334155', primaryHover: '#1e293b', primaryFg: '#ffffff', primarySoft: '#e8ecf1', primarySoftFg: '#1e293b' },
  },
};

export const ACCENT_ORDER: AccentId[] = ['emerald', 'blue', 'indigo', 'violet', 'teal', 'orange', 'rose', 'slate'];

export function accentPalette(accent: AccentId, theme: ResolvedTheme): AccentPalette {
  const preset = ACCENT_PRESETS[accent] ?? ACCENT_PRESETS.emerald;
  return theme === 'dark' ? preset.dark : preset.light;
}

/* --------------------------------------------------------------------------
   Fonts — all bundled locally (@fontsource packages, see src/styles/fonts.css).
   -------------------------------------------------------------------------- */

export interface FontOption<T extends string> {
  id: T;
  label: string;
  /** CSS font-family list for this option (without generic fallback). */
  stack: string;
  /** Sample text for the settings preview. */
  sample: string;
}

const SYSTEM_BANGLA = '"Nirmala UI", "SolaimanLipi", "Vrinda", "Bangla Sangam MN"';

export const UI_FONTS: Record<UiFontId, FontOption<UiFontId>> = {
  inter: { id: 'inter', label: 'Inter', stack: '"Inter Variable"', sample: 'Aa 1,234.50' },
  'noto-bengali': { id: 'noto-bengali', label: 'Noto Sans Bengali', stack: '"Noto Sans Bengali Variable"', sample: 'Aa অআ ১২৩' },
  'hind-siliguri': { id: 'hind-siliguri', label: 'Hind Siliguri', stack: '"Hind Siliguri"', sample: 'Aa অআ ১২৩' },
  'anek-bangla': { id: 'anek-bangla', label: 'Anek Bangla', stack: '"Anek Bangla Variable"', sample: 'Aa অআ ১২৩' },
  system: { id: 'system', label: 'System', stack: 'system-ui, "Segoe UI", Roboto', sample: 'Aa 1,234.50' },
};

export const BANGLA_FONTS: Record<BanglaFontId, FontOption<BanglaFontId>> = {
  'noto-bengali': { id: 'noto-bengali', label: 'Noto Sans Bengali', stack: '"Noto Sans Bengali Variable"', sample: 'নগর সুপার শপ ১২৩' },
  'hind-siliguri': { id: 'hind-siliguri', label: 'Hind Siliguri', stack: '"Hind Siliguri"', sample: 'নগর সুপার শপ ১২৩' },
  'anek-bangla': { id: 'anek-bangla', label: 'Anek Bangla', stack: '"Anek Bangla Variable"', sample: 'নগর সুপার শপ ১২৩' },
  system: { id: 'system', label: 'System (SolaimanLipi / Nirmala UI)', stack: SYSTEM_BANGLA, sample: 'নগর সুপার শপ ১২৩' },
};

export const RECEIPT_FONTS: Record<ReceiptFontId, FontOption<ReceiptFontId>> = {
  'noto-bengali': { id: 'noto-bengali', label: 'Noto Sans Bengali', stack: '"Noto Sans Bengali Variable"', sample: 'মোট ৳১,২৩৪' },
  'hind-siliguri': { id: 'hind-siliguri', label: 'Hind Siliguri', stack: '"Hind Siliguri"', sample: 'মোট ৳১,২৩৪' },
  mono: { id: 'mono', label: 'JetBrains Mono', stack: '"JetBrains Mono Variable"', sample: 'TOTAL 1,234.00' },
  system: { id: 'system', label: 'System', stack: `"Segoe UI", ${SYSTEM_BANGLA}`, sample: 'মোট ৳১,২৩৪' },
};

export const MONO_STACK = '"JetBrains Mono Variable", ui-monospace, "Cascadia Mono", Consolas, monospace';

/** Root font size (px) for each preset; the slider can fine-tune within the range. */
export const FONT_SIZE_PRESETS: Record<FontSizePreset, number> = {
  sm: 14,
  md: 15,
  lg: 16.5,
  xl: 18,
};

export const BASE_FONT_RANGE = { min: 12, max: 21, step: 0.5 } as const;

/** Tailwind spacing unit + minimum touch target for each density. */
export const DENSITY_SCALE: Record<Density, { spacing: string; touch: string; row: string }> = {
  compact: { spacing: '0.22rem', touch: '44px', row: '40px' },
  comfortable: { spacing: '0.25rem', touch: '48px', row: '46px' },
  spacious: { spacing: '0.285rem', touch: '54px', row: '54px' },
};

/** Corner radius scale (sm / md / lg / xl). */
export const CORNER_SCALE: Record<CornerStyle, [string, string, string, string]> = {
  rounded: ['6px', '10px', '14px', '20px'],
  standard: ['4px', '6px', '9px', '12px'],
  minimal: ['2px', '3px', '4px', '6px'],
};

/** Product card sizes: minimum card width in the POS grid (px, before font scaling). */
export const CARD_MIN_WIDTH = { sm: 138, md: 162, lg: 196 } as const;

/** Product image heights in the POS grid (px). */
export const PRODUCT_IMAGE_HEIGHT = { sm: 72, md: 104, lg: 140 } as const;

/** Avatar colours for users (hex). */
export const AVATAR_COLORS = ['#1fbf7c', '#4c8dff', '#a283ff', '#fb8a3c', '#fb5d7c', '#22c3b5', '#e0b21b', '#8b9bb4'] as const;
