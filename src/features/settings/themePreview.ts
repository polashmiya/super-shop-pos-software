import { APP_CONFIG } from '@/config/app.config';
import type { ResolvedTheme } from '@/types';

/**
 * Surface colours of each theme, mirrored from src/styles/tokens.css. The
 * mini previews must show the OTHER theme too, which CSS variables (bound to
 * the current theme on <html>) cannot do — keep these in sync with tokens.css.
 */
export interface PreviewPalette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  fg: string;
  muted: string;
}

export const PREVIEW_PALETTES: Record<ResolvedTheme, PreviewPalette> = {
  dark: { bg: APP_CONFIG.window.backgroundDark, surface: '#141920', surface2: '#1a2029', border: '#232b36', fg: '#e9edf3', muted: '#717d8f' },
  light: { bg: APP_CONFIG.window.backgroundLight, surface: '#ffffff', surface2: '#f6f7f9', border: '#e2e6ec', fg: '#101828', muted: '#697586' },
};
