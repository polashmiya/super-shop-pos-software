import { accentPalette, BANGLA_FONTS, RECEIPT_FONTS, UI_FONTS } from '@/config/theme.config';
import type { AppearanceSettings, ResolvedTheme, ThemeMode } from '@/types/settings';

/* ==========================================================================
   Applies appearance settings to <html>: theme class, accent colours,
   density, corners, motion, hover, contrast, focus mode, fonts and size.
   Everything else in the UI reacts through CSS variables (tokens.css).
   ========================================================================== */

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyAppearance(appearance: AppearanceSettings): ResolvedTheme {
  const root = document.documentElement;
  const theme = resolveTheme(appearance.theme);
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');

  const accent = accentPalette(appearance.accent, theme);
  root.style.setProperty('--c-primary', accent.primary);
  root.style.setProperty('--c-primary-hover', accent.primaryHover);
  root.style.setProperty('--c-primary-fg', accent.primaryFg);
  root.style.setProperty('--c-primary-soft', accent.primarySoft);
  root.style.setProperty('--c-primary-soft-fg', accent.primarySoftFg);

  root.dataset.density = appearance.density;
  root.dataset.corners = appearance.corners;
  root.dataset.motion = appearance.animations ? 'on' : 'off';
  root.dataset.hover = appearance.hoverEffects ? 'on' : 'off';
  root.dataset.contrast = appearance.highContrast ? 'high' : 'normal';
  root.dataset.focusMode = appearance.focusMode ? 'on' : 'off';

  const ui = UI_FONTS[appearance.uiFont] ?? UI_FONTS.inter;
  const bangla = BANGLA_FONTS[appearance.banglaFont] ?? BANGLA_FONTS['noto-bengali'];
  const receipt = RECEIPT_FONTS[appearance.receiptFont] ?? RECEIPT_FONTS['noto-bengali'];
  root.style.setProperty('--font-ui', `${ui.stack}, ${bangla.stack}, system-ui, sans-serif`);
  root.style.setProperty('--font-bangla', `${bangla.stack}, sans-serif`);
  root.style.setProperty('--font-receipt', `${receipt.stack}, ${bangla.stack}, sans-serif`);
  root.style.setProperty('--font-size-root', `${appearance.baseFontPx}px`);
  return theme;
}
