/** "Nice" axis ticks: 0 / 1,000 / 2,000 … covering [0, max]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return ticks;
}

/** Series colours in the validated fixed order (never cycled past 8). */
export const SERIES_COLORS = ['var(--c-chart-1)', 'var(--c-chart-2)', 'var(--c-chart-3)', 'var(--c-chart-4)', 'var(--c-chart-5)', 'var(--c-chart-6)', 'var(--c-chart-7)', 'var(--c-chart-8)'] as const;

/** Muted colour for "Other" / de-emphasised series. */
export const OTHER_COLOR = 'var(--c-fg-subtle)';

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? OTHER_COLOR;
}
