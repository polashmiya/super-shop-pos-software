import { useId, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { useElementSize } from '@/hooks/useCommon';
import { cn } from '@/components/ui/cn';
import { niceTicks, OTHER_COLOR, seriesColor } from './scale';

/* ==========================================================================
   Charts (plain SVG, no library). Mark specs: columns ≤ 24 px with a 4 px
   rounded data end and square baseline, 2 px lines, ≥ 8 px markers with a
   surface ring, hairline recessive grid, one axis only, text in text
   tokens (never the series colour), hover/focus tooltips, table view.
   ========================================================================== */

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: Array<{ label: string; value: string; color?: string }>;
}

function ChartTooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg"
      style={{ left: state.x, top: state.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
    >
      <p className="type-caption mb-1 text-fg-muted">{state.title}</p>
      {state.rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 whitespace-nowrap">
          {row.color && <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />}
          <span className="text-sm font-bold text-fg tnum">{row.value}</span>
          <span className="type-caption text-fg-muted">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

const PAD = { top: 12, right: 8, bottom: 26, left: 56 };

/* ------------------------------ ColumnChart ------------------------------- */

interface ColumnChartProps {
  data: ChartDatum[];
  height?: number;
  seriesLabel: string;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  /** Show every n-th x label (dense day charts). */
  labelEvery?: number;
  highlightKey?: string;
  color?: string;
  ariaLabel: string;
}

export function ColumnChart({ data, height = 220, seriesLabel, formatValue, formatTick, labelEvery = 1, highlightKey, color = seriesColor(0), ariaLabel }: ColumnChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = Math.max(size.width, 200);
  const max = Math.max(0, ...data.map((datum) => datum.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(24, Math.max(4, band * 0.62));
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;

  const tooltip: TooltipState | null =
    hover !== null && data[hover]
      ? { x: PAD.left + band * hover + band / 2, y: y(data[hover].value), title: data[hover].label, rows: [{ label: seriesLabel, value: formatValue(data[hover].value), color }] }
      : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="overflow-visible">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--c-chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[11px] tnum">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {data.map((datum, index) => {
          const x = PAD.left + band * index + (band - barW) / 2;
          const barH = Math.max(0, PAD.top + plotH - y(datum.value));
          const r = Math.min(4, barH / 2, barW / 2);
          const yTop = PAD.top + plotH - barH;
          const path =
            barH <= 0
              ? ''
              : `M${x},${PAD.top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${PAD.top + plotH} Z`;
          const active = hover === index;
          const dimmed = hover !== null && !active;
          return (
            <g key={datum.key}>
              {path && <path d={path} fill={color} opacity={dimmed ? 0.45 : highlightKey && highlightKey !== datum.key ? 0.7 : 1} />}
              <rect
                x={PAD.left + band * index}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${datum.label}: ${formatValue(datum.value)}`}
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                className="outline-none"
              />
              {index % labelEvery === 0 && (
                <text x={PAD.left + band * index + band / 2} y={height - 8} textAnchor="middle" className={cn('text-[11px] tnum', active ? 'fill-fg' : 'fill-fg-subtle')}>
                  {datum.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--c-border-strong)" strokeWidth={1} />
      </svg>
      <ChartTooltip state={tooltip} />
    </div>
  );
}

/* ------------------------------- LineChart -------------------------------- */

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Muted comparison series (e.g. previous period). */
  muted?: boolean;
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  labelEvery?: number;
  area?: boolean;
  ariaLabel: string;
}

export function LineChart({ labels, series, height = 240, formatValue, formatTick, labelEvery = 1, area = true, ariaLabel }: LineChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const width = Math.max(size.width, 200);
  const max = Math.max(0, ...series.flatMap((entry) => entry.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const step = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const x = (index: number) => PAD.left + step * index;
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;
  const colored = series.map((entry, index) => ({ ...entry, color: entry.muted ? OTHER_COLOR : seriesColor(index) }));

  const onMove = (clientX: number, rectLeft: number) => {
    const relative = clientX - rectLeft - PAD.left;
    const index = Math.round(relative / step);
    setHover(Math.min(Math.max(index, 0), labels.length - 1));
  };

  const tooltip: TooltipState | null =
    hover !== null
      ? {
          x: x(hover),
          y: Math.min(...colored.map((entry) => y(entry.values[hover] ?? 0))),
          title: labels[hover],
          rows: colored.map((entry) => ({ label: entry.label, value: formatValue(entry.values[hover] ?? 0), color: entry.color })),
        }
      : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-md"
        onPointerMove={(event) => onMove(event.clientX, event.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') setHover((value) => Math.min((value ?? -1) + 1, labels.length - 1));
          if (event.key === 'ArrowLeft') setHover((value) => Math.max((value ?? labels.length) - 1, 0));
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          {colored.map((entry, index) => (
            <linearGradient key={entry.key} id={`${gradientId}-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.01} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--c-chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[11px] tnum">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {labels.map((label, index) =>
          index % labelEvery === 0 || index === labels.length - 1 ? (
            <text key={`${label}-${index}`} x={x(index)} y={height - 8} textAnchor="middle" className="fill-fg-subtle text-[11px] tnum">
              {label}
            </text>
          ) : null,
        )}
        {[...colored].reverse().map((entry, reversedIndex) => {
          const index = colored.length - 1 - reversedIndex;
          const points = entry.values.map((value, i) => `${x(i)},${y(value)}`);
          if (points.length === 0) return null;
          return (
            <g key={entry.key}>
              {area && !entry.muted && <path d={`M${x(0)},${PAD.top + plotH} L${points.join(' L')} L${x(entry.values.length - 1)},${PAD.top + plotH} Z`} fill={`url(#${gradientId}-${index})`} />}
              <polyline points={points.join(' ')} fill="none" stroke={entry.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={entry.muted ? '4 4' : undefined} />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--c-border-strong)" strokeWidth={1} />
            {colored.map((entry) => (
              <circle key={entry.key} cx={x(hover)} cy={y(entry.values[hover] ?? 0)} r={4.5} fill={entry.color} stroke="var(--c-surface)" strokeWidth={2} />
            ))}
          </g>
        )}
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--c-border-strong)" strokeWidth={1} />
      </svg>
      <ChartTooltip state={tooltip} />
      {colored.length > 1 && <Legend items={colored.map((entry) => ({ label: entry.label, color: entry.color, kind: 'line' }))} className="absolute end-0 -top-1" />}
    </div>
  );
}

/* --------------------------------- Legend --------------------------------- */

export function Legend({ items, className }: { items: Array<{ label: string; color: string; kind?: 'line' | 'rect'; value?: string }>; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span aria-hidden className={item.kind === 'line' ? 'h-0.5 w-4 rounded-full' : 'h-2.5 w-2.5 rounded-[3px]'} style={{ backgroundColor: item.color }} />
          {item.label}
          {item.value && <span className="font-semibold text-fg tnum">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- BarList --------------------------------- */

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel: string;
  secondary?: ReactNode;
  leading?: ReactNode;
}

/** Ranked horizontal bars with direct value labels (top products, categories, cashiers). */
export function BarList({ items, color = seriesColor(0), emptyText }: { items: BarListItem[]; color?: string; emptyText?: ReactNode }) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="type-body-sm py-6 text-center text-fg-muted">{emptyText}</p>;
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          {item.leading}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-body-sm truncate text-fg">{item.label}</span>
              <span className="text-sm font-semibold text-fg tnum">{item.valueLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`, backgroundColor: color }} />
              </div>
              {item.secondary && <span className="type-caption shrink-0 text-fg-subtle tnum">{item.secondary}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------- DonutChart ------------------------------- */

interface DonutProps {
  items: Array<{ key: string; label: string; value: number; valueLabel: string; share: number }>;
  centerLabel: string;
  centerValue: string;
  size?: number;
  ariaLabel: string;
  formatShare: (share: number) => string;
}

/** Part-to-whole at a glance (≤ 6 segments) with a legend carrying values. */
export function DonutChart({ items, centerLabel, centerValue, size = 168, ariaLabel, formatShare }: DonutProps) {
  const [hover, setHover] = useState<string | null>(null);
  const radius = size / 2;
  const thickness = 22;
  const inner = radius - thickness;
  const visible = items.slice(0, 6);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  const segments = useMemo(() => {
    const gap = visible.length > 1 ? 0.02 : 0;
    const sweeps = visible.map((item) => (total > 0 ? (item.value / total) * Math.PI * 2 : 0));
    return visible.map((item, index) => {
      const sweep = sweeps[index];
      const offset = sweeps.slice(0, index).reduce((sum, value) => sum + value, -Math.PI / 2);
      const start = offset + gap / 2;
      const end = offset + sweep - gap / 2;
      const large = end - start > Math.PI ? 1 : 0;
      const point = (r: number, a: number) => `${radius + r * Math.cos(a)},${radius + r * Math.sin(a)}`;
      const d =
        sweep >= Math.PI * 2 - 0.001
          ? `M${point(radius, 0)} A${radius},${radius} 0 1 1 ${point(radius, Math.PI)} A${radius},${radius} 0 1 1 ${point(radius, 0)} M${point(inner, 0)} A${inner},${inner} 0 1 0 ${point(inner, Math.PI)} A${inner},${inner} 0 1 0 ${point(inner, 0)} Z`
          : `M${point(radius, start)} A${radius},${radius} 0 ${large} 1 ${point(radius, end)} L${point(inner, end)} A${inner},${inner} 0 ${large} 0 ${point(inner, start)} Z`;
      return { ...item, d, color: seriesColor(index), sweep };
    });
  }, [visible, total, radius, inner]);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={ariaLabel}>
          {total === 0 && <circle cx={radius} cy={radius} r={radius - thickness / 2} fill="none" stroke="var(--c-surface-3)" strokeWidth={thickness} />}
          {segments.map((segment) =>
            segment.sweep > 0 ? (
              <path
                key={segment.key}
                d={segment.d}
                fill={segment.color}
                fillRule="evenodd"
                opacity={hover && hover !== segment.key ? 0.4 : 1}
                tabIndex={0}
                aria-label={`${segment.label}: ${segment.valueLabel}`}
                onPointerEnter={() => setHover(segment.key)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(segment.key)}
                onBlur={() => setHover(null)}
                className="outline-none transition-opacity"
              />
            ) : null,
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="type-caption text-fg-subtle">{centerLabel}</span>
          <span className="text-base font-bold text-fg">{centerValue}</span>
        </div>
      </div>
      <ul className="flex min-w-40 flex-1 flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.key} className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 transition-base', hover === segment.key && 'bg-surface-2')} onPointerEnter={() => setHover(segment.key)} onPointerLeave={() => setHover(null)}>
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: segment.color }} />
            <span className="type-body-sm flex-1 truncate text-fg-muted">{segment.label}</span>
            <span className="text-sm font-semibold text-fg tnum">{segment.valueLabel}</span>
            <span className="type-caption w-11 text-end text-fg-subtle tnum">{formatShare(segment.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------- ChartCard ------------------------------- */

interface ChartCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Table view of the same data (accessibility + exact values). */
  table?: ReactNode;
  tableLabel?: string;
  chartLabel?: string;
  className?: string;
  loading?: boolean;
}

export function ChartCard({ title, subtitle, actions, children, table, tableLabel = 'Table', chartLabel = 'Chart', className, loading }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-h3 truncate text-fg">{title}</h3>
          {subtitle && <p className="type-body-sm text-fg-subtle">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              aria-label={showTable ? chartLabel : tableLabel}
              title={showTable ? chartLabel : tableLabel}
              className="flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              {showTable ? <BarChart3 size={17} aria-hidden /> : <Table2 size={17} aria-hidden />}
            </button>
          )}
        </div>
      </header>
      <div className={cn('min-h-0 flex-1 transition-opacity', loading && 'opacity-50')}>{showTable && table ? table : children}</div>
    </section>
  );
}

/** Minimal table used inside ChartCard's table view. */
export function MiniTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={header} className={cn('sticky top-0 bg-surface pb-2 type-label text-fg-muted', index === 0 ? 'text-start' : 'text-end')}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, index) => (
                <td key={index} className={cn('py-1.5 text-fg', index === 0 ? 'text-start' : 'text-end tnum')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
