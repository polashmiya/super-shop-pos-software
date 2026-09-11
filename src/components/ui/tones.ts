import type { Tone } from './Display';

/** Solid dot/bar colour for each tone (status dots, meters, timeline markers). */
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};
