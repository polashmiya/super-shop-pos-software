// Generates the bundled product artwork used by the POS product grid:
//   public/products/<folder>/<shape>-<1..6>.svg   (every folder/shape in the registry)
//   public/products/manifest.json
//
// Pure Node.js (no dependencies). The list of required artworks comes from
// src/data/seed/catalog/artRegistry.ts, which Node 24 imports directly
// (type stripping). Run with `npm run art` or `node scripts/generate-product-art.mjs`.
//
// Art direction: flat, stroke-less fills on a transparent 256×256 canvas, one
// light source (soft highlight upper-left, darker shade on the right), a soft
// ground shadow, the object centred and about 70 % of the canvas tall.
// Variants 1–6 are packaging palettes (red, green, blue, amber, purple, teal).
// Natural goods keep natural colours; only a small detail (tag, tray, band…)
// takes the palette colour.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { ART_REGISTRY, ART_VARIANT_COUNT } = await import(
  new URL('../src/data/seed/catalog/artRegistry.ts', import.meta.url).href
);

// ---------------------------------------------------------------------------
// Palettes & neutral colours
// ---------------------------------------------------------------------------
const PALETTES = [
  { name: 'red', base: '#d64545', dark: '#a8353b', light: '#ef7d73', deep: '#6b2230', accent: '#ffc94a' },
  { name: 'green', base: '#2f9e5b', dark: '#237a48', light: '#62c58b', deep: '#154d33', accent: '#ffd24d' },
  { name: 'blue', base: '#2f6fd6', dark: '#2455a8', light: '#6f9ef0', deep: '#173a78', accent: '#ffb547' },
  { name: 'amber', base: '#e0a21b', dark: '#b87d12', light: '#f6c957', deep: '#6f4a0a', accent: '#c8412f' },
  { name: 'purple', base: '#7b52c7', dark: '#5d3c9e', light: '#a887e6', deep: '#382366', accent: '#ffc94a' },
  { name: 'teal', base: '#1f9e9a', dark: '#177773', light: '#58c9c3', deep: '#0e4e4d', accent: '#ff8a5b' },
].map((palette, i) => ({ ...palette, i }));

const WHITE = '#ffffff';
const CREAM = '#fbf7ee';
const INK = '#2c3344';
const SILVER = '#d3dae3';
const STEEL = '#a7b2c0';
const GLASS = '#dcedf5';
const SHADOW = '#0b1120';
const OIL = '#f2b63a';
const LEAF = '#4e9f45';
const LEAF_DARK = '#357a35';
const WOOD = '#b98553';
const TWINE = '#9c8466';

// ---------------------------------------------------------------------------
// Number, colour and markup helpers
// ---------------------------------------------------------------------------
/** Round to one decimal and print compactly (no trailing zeros, no leading "0."). */
const f = (v) => {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r).replace(/^(-?)0\./, '$1.');
};
/** Compact path data: a minus sign already separates numbers. */
const pd = (dd) => dd.replace(/ -/g, '-');
/** Tagged template for path data: interpolated numbers are rounded. */
const d = (strings, ...values) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? f(values[i]) : ''), '');

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) =>
  '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
};
/** Darker tone (mixed toward a deep indigo so shades stay rich, not muddy). */
const dk = (c, t = 0.16) => mix(c, '#1d1a36', t);
/** Lighter tone. */
const lt = (c, t = 0.2) => mix(c, '#ffffff', t);

const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? f(v) : v}"`)
    .join('');

const R = (x, y, w, h, fill, o = {}) =>
  `<rect${attrs({ x, y, width: w, height: h, rx: o.rx, fill, opacity: o.op, transform: o.t })}/>`;
const C = (cx, cy, r, fill, o = {}) => `<circle${attrs({ cx, cy, r, fill, opacity: o.op })}/>`;
const E = (cx, cy, rx, ry, fill, o = {}) =>
  `<ellipse${attrs({ cx, cy, rx, ry, fill, opacity: o.op, transform: o.t })}/>`;
const P = (dd, fill, o = {}) =>
  `<path${attrs({ d: pd(dd), fill, opacity: o.op, transform: o.t, 'fill-rule': o.evenodd ? 'evenodd' : undefined })}/>`;
/** Stroked path — only for thin details (strings, wires, bristles), never outlines. */
const S = (dd, stroke, w, o = {}) =>
  `<path${attrs({
    d: pd(dd),
    fill: 'none',
    stroke,
    'stroke-width': w,
    'stroke-linecap': 'round',
    // round joins only matter where straight segments meet at corners
    'stroke-linejoin': /[Ll]/.test(dd) ? 'round' : undefined,
    opacity: o.op,
    transform: o.t,
  })}/>`;
const PG = (pts, fill, o = {}) => `<polygon${attrs({ points: pts.map(f).join(' '), fill, opacity: o.op })}/>`;
const L = (x1, y1, x2, y2, stroke, w, o = {}) =>
  `<line${attrs({ x1, y1, x2, y2, stroke, 'stroke-width': w, 'stroke-linecap': 'round', opacity: o.op })}/>`;
const G = (transform, ...kids) => `<g transform="${transform}">${kids.flat(Infinity).join('')}</g>`;
/** transform string: translate, optional rotate (deg) and scale (number or [sx, sy]). */
const tf = (x, y, rot = 0, s = 1) => {
  const sc = Array.isArray(s) ? s.map((v) => Math.round(v * 100) / 100).join(' ') : Math.round(s * 100) / 100;
  return `translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}${s !== 1 ? ` scale(${sc})` : ''}`;
};

/** transform string that scales by s around (cx, cy). */
const about = (cx, cy, s) => `translate(${f(cx * (1 - s))} ${f(cy * (1 - s))}) scale(${s})`;

/** Points of a star / burst polygon. */
const starPts = (cx, cy, ro, ri, n, rot = -90) => {
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
};
/** Points of a regular polygon. */
const ngon = (cx, cy, r, n, rot = -90) => {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
};
/** Path data for a rotated ellipse (lets many small ellipses share one <path>). */
const ellD = (cx, cy, rx, ry, deg = 0) => {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a) * rx;
  const dy = Math.sin(a) * rx;
  return d`M${cx - dx} ${cy - dy}A${rx} ${ry} ${deg} 1 0 ${cx + dx} ${cy + dy}A${rx} ${ry} ${deg} 1 0 ${cx - dx} ${cy - dy}Z`;
};
/** Deterministic pseudo random generator (stable output between runs). */
const rng = (seed) => {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};
/** Upper half-ellipse outline built from little bumps (heaps of grains, foliage…). */
const bumpyDome = (cx, baseY, rx, ry, n, bump) => {
  let out = d`M${cx - rx} ${baseY}`;
  for (let i = 1; i <= n; i += 1) {
    const t = Math.PI - (i / n) * Math.PI;
    out += d`A${bump} ${bump} 0 0 1 ${cx + Math.cos(t) * rx} ${baseY - Math.sin(t) * ry}`;
  }
  return out + 'Z';
};
/** Closed bumpy outline around an ellipse (cauliflower, lychee, clouds). */
const bumpyEllipse = (cx, cy, rx, ry, n, bump, phase = 0) => {
  let out = '';
  for (let i = 0; i <= n; i += 1) {
    const t = phase + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    out += i === 0 ? d`M${x} ${y}` : d`A${bump} ${bump} 0 0 1 ${x} ${y}`;
  }
  return out + 'Z';
};

// ---------------------------------------------------------------------------
// Per-file gradient registry (ids get a unique per-file prefix)
// ---------------------------------------------------------------------------
function makeGradients(prefix) {
  const defs = [];
  const ids = new Map();
  const stop = (o, c) => `<stop offset="${o}" stop-color="${c}"/>`;
  const reg = (key, build) => {
    if (!ids.has(key)) {
      const id = prefix + ids.size.toString(36);
      ids.set(key, id);
      defs.push(build(id));
    }
    return `url(#${ids.get(key)})`;
  };
  return {
    defs,
    /** Cylinder / volume: soft highlight on the left, hard-edged shade band on the right. */
    cyl: (c, edge = 0.66) =>
      reg(`c${c}${edge}`, (id) =>
        `<linearGradient id="${id}">${stop(0, lt(c, 0.22))}${stop(0.3, c)}${stop(edge, c)}${stop(
          Math.round((edge + 0.01) * 100) / 100,
          dk(c, 0.15),
        )}</linearGradient>`,
      ),
    /** Horizontal cylinder (lying objects): light on top, shade band at the bottom. */
    cylV: (c, edge = 0.66) =>
      reg(`h${c}${edge}`, (id) =>
        `<linearGradient id="${id}" x2="0" y2="1">${stop(0, lt(c, 0.22))}${stop(0.3, c)}${stop(edge, c)}${stop(
          Math.round((edge + 0.01) * 100) / 100,
          dk(c, 0.15),
        )}</linearGradient>`,
      ),
    /** Round volume: soft glow upper-left, crescent shade lower-right. */
    orb: (c) =>
      reg(`o${c}`, (id) =>
        `<radialGradient id="${id}" cx=".36" cy=".32" r=".74">${stop(0, lt(c, 0.28))}${stop(0.42, c)}${stop(
          0.78,
          c,
        )}${stop(0.79, dk(c, 0.16))}</radialGradient>`,
      ),
    /** Plain vertical gradient (top → bottom). */
    vert: (a, b) =>
      reg(`v${a}${b}`, (id) => `<linearGradient id="${id}" x2="0" y2="1">${stop(0, a)}${stop(1, b)}</linearGradient>`),
  };
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
/** Soft ground shadow: two stacked low-opacity ellipses (no filters). */
const shadow = (rx = 60, cx = 128, cy = 221) =>
  E(cx, cy, rx + 14, 11, SHADOW, { op: 0.07 }) + E(cx, cy, rx, 6.5, SHADOW, { op: 0.13 });
/** Soft highlight strip (the light comes from the upper-left). */
const highlight = (x, y, w, h, op = 0.34) => R(x, y, w, h, WHITE, { rx: w / 2, op });
/** Rounded "text" bars centred on cx (abstract copy, never letters). */
const bars = (cx, y, widths, h, fill, op) =>
  widths.map((w, i) => R(cx - w / 2, y + i * h * 1.8, w, h, fill, { rx: h / 2, op })).join('');
/** Wave band path from x to x+w, crest line at y, filled down to y+h. */
const waveD = (x, y, w, h, amp) =>
  d`M${x} ${y}q${w / 4} ${-amp} ${w / 2} 0t${w / 2} 0V${y + h}H${x}Z`;

/** Small glyph library (drawn around 0,0 within ±10) used inside brand emblems. */
const GLYPHS = {
  drop: (c) => P('M0 -10C4 -4.5 7 -1 7 3A7 7 0 0 1 -7 3C-7 -1 -4 -4.5 0 -10Z', c),
  leaf: (c) => P('M-8 8C-9.5 -3 -3 -9.5 9 -9C9.5 3 3 9.5 -8 8Z', c),
  star: (c) => PG(starPts(0, 0, 10, 4.3, 5), c),
  sparkle: (c) => P('M0 -10Q1.6 -1.6 10 0Q1.6 1.6 0 10Q-1.6 1.6 -10 0Q-1.6 -1.6 0 -10Z', c),
  heart: (c) =>
    P('M0 8.5C-12 1 -9.5 -9 -3.5 -8.6C-1.6 -8.4 -.4 -7 0 -5.6C.4 -7 1.6 -8.4 3.5 -8.6C9.5 -9 12 1 0 8.5Z', c),
  grain: (c) => P(ellD(-5.4, 1.5, 7, 2.7, -62) + ellD(0, -1, 7.5, 2.8, -90) + ellD(5.4, 1.5, 7, 2.7, -118), c),
  wheat: (c) =>
    P(
      'M-.9 10V-4H.9V10Z' +
        ellD(0, -7.5, 3.6, 2, -90) +
        [-3, 1.5, 6].map((y) => ellD(-2.6, y - 2, 3.4, 1.8, -130) + ellD(2.6, y - 2, 3.4, 1.8, -50)).join(''),
      c,
    ),
  chili: (c) => P('M-9 7C-2 8 6 3 8.5 -5C9 -7 7.6 -8.2 6.4 -6.4C3.5 -1 -1.5 3 -9 4Z M6 -6.5L9 -10', c),
  flower: (c) =>
    [0, 72, 144, 216, 288].map((a) => C(Math.cos((a * Math.PI) / 180) * 5.4, Math.sin((a * Math.PI) / 180) * 5.4, 4.4, c)).join('') +
    C(0, 0, 3, c),
  flame: (c) => P('M0 -10C5 -4 8 0 6.5 4.5A6.8 6.8 0 0 1 -6.5 4.5C-7.5 .5 -4.5 -2 -3 -6C-2 -3 -1 -2 0 -2C1 -5 .5 -8 0 -10Z', c),
  snow: (c) =>
    [0, 60, 120].map((a) => R(-1.6, -10, 3.2, 20, c, { rx: 1.6, t: `rotate(${a})` })).join('') + C(0, 0, 3, c),
  bubbles: (c) => C(-3, 2, 6, c) + C(5, -4, 4, c) + C(6, 6, 2.6, c),
  cup: (c) => P('M-9 -4H6V1A7.5 7.5 0 0 1 -9 1Z M6 -2.5A3.2 3.2 0 0 1 6 4V2A1.4 1.4 0 0 0 6 -.8Z M-11 8H8Q7 10 5 10H-8Q-10 10 -11 8Z', c),
  bean: (c) => P(ellD(0, 0, 9, 6.5, -35) , c),
  swirl: (c) => P('M-9 2A9 9 0 0 1 9 -2A6 6 0 0 1 -3 -1A3.5 3.5 0 0 0 4 1A8 8 0 0 1 -9 2Z', c),
  crown: (c) => P('M-9 6L-10 -6L-4.5 -1L0 -9L4.5 -1L10 -6L9 6Z', c),
  fish: (c) => P('M-9 0C-5 -7 3 -7 6 -1L10 -5V5L6 1C3 7 -5 7 -9 0Z', c),
  moon: (c) => P('M3 -10A10 10 0 1 0 3 10A7.6 7.6 0 1 1 3 -10Z', c),
  bolt: (c) => P('M2.5 -11L-7 2H-.5L-2.5 11L7 -2H.5Z', c),
};
const glyph = (kind, cx, cy, s, c) => G(tf(cx, cy, 0, s), GLYPHS[kind](c));

/**
 * Brand emblem: a palette shape (its form varies by variant so the six
 * variants read as different brands) with a white glyph inside.
 */
function emblem(p, cx, cy, r, kind, fill = p.base, ink = WHITE) {
  const shape = [
    () => C(cx, cy, r, fill),
    () => PG(ngon(cx, cy, r * 1.1, 6, 0), fill),
    () => P(d`M${cx - r} ${cy - r * 0.8}Q${cx} ${cy - r * 1.25} ${cx + r} ${cy - r * 0.8}V${cy + r * 0.1}Q${cx + r} ${cy + r * 0.75} ${cx} ${cy + r * 1.15}Q${cx - r} ${cy + r * 0.75} ${cx - r} ${cy + r * 0.1}Z`, fill),
    () => PG(starPts(cx, cy, r * 1.14, r * 0.94, 12), fill),
    () => R(cx - r, cy - r, r * 2, r * 2, fill, { rx: r * 0.38 }),
    () => E(cx, cy, r * 1.22, r * 0.9, fill),
  ][p.i % 6];
  return shape() + glyph(kind, cx, cy, (r / 10) * 0.72, ink);
}
/** Emblem plus two abstract copy bars underneath. */
const brand = (p, cx, cy, r, kind, barFill = p.dark) =>
  emblem(p, cx, cy, r, kind) + bars(cx, cy + r + 5, [r * 2.4, r * 1.6], Math.max(2.4, r * 0.3), barFill, 0.75);

/** Cream label panel with the same volume shading as the pack it sits on. */
const labelPanel = (g, x, y, w, h, rx = 6, color = CREAM) => R(x, y, w, h, g.cyl(color), { rx });

/** Price tag in the palette colour — the variant detail for fresh produce. */
const tag = (p, x = 188, y = 200, rot = -16) =>
  G(
    tf(x, y, rot),
    S('M-19 0C-28 -2 -30 -12 -24 -18', TWINE, 1.6),
    P('M-13 -9H11Q15 -9 15 -5V5Q15 9 11 9H-13L-21 0Z', p.base),
    P('M3 -9H11Q15 -9 15 -5V5Q15 9 11 9H3Z', p.dark, { op: 0.35 }),
    C(-14, 0, 2.5, WHITE),
    R(-7, -3.6, 15, 2.6, WHITE, { rx: 1.3, op: 0.9 }),
    R(-7, 1.2, 9, 2.6, WHITE, { rx: 1.3, op: 0.65 }),
  );

/** Round plate in 3/4 view in the palette colour (the variant detail for fresh food). */
const plate = (p, cx, cy, rx, ry) =>
  E(cx, cy + 6, rx, ry, dk(p.base, 0.12)) + E(cx, cy, rx, ry, p.base) + E(cx, cy + 2, rx * 0.78, ry * 0.7, lt(p.base, 0.22));

/** Shallow rectangular tray in perspective (foam tray for meat/fish). */
const tray = (p, x, y, w, h) =>
  P(d`M${x} ${y + 6}Q${x} ${y} ${x + 8} ${y}H${x + w - 8}Q${x + w} ${y} ${x + w} ${y + 6}L${x + w - 8} ${y + h - 4}Q${x + w - 10} ${y + h} ${x + w - 16} ${y + h}H${x + 16}Q${x + 10} ${y + h} ${x + 8} ${y + h - 4}Z`, dk(p.base, 0.1)) +
  P(d`M${x + 2} ${y + 5}Q${x + 2} ${y + 2} ${x + 8} ${y + 2}H${x + w - 8}Q${x + w - 2} ${y + 2} ${x + w - 2} ${y + 5}L${x + w - 9} ${y + h - 9}H${x + 9}Z`, p.base) +
  P(d`M${x + 10} ${y + 6}H${x + w - 10}L${x + w - 15} ${y + h - 12}H${x + 15}Z`, lt(p.base, 0.2));

/** Three-quarter box: front face, right side (shade) and top (highlight). */
const box3 = (x, y, w, h, dx, dy, front, side, top) =>
  PG([x + w, y, x + w + dx, y - dy, x + w + dx, y + h - dy, x + w, y + h], side) +
  PG([x, y, x + dx, y - dy, x + w + dx, y - dy, x + w, y], top) +
  R(x, y, w, h, front);

/** Upright cylinder side (x..x+w, top..bottom) with an elliptical bottom edge. */
const cylSideD = (x, top, w, bottom, ry) => d`M${x} ${top}V${bottom}A${w / 2} ${ry} 0 0 0 ${x + w} ${bottom}V${top}Z`;
/** Band wrapped around a cylinder between y1 and y2 (both edges curve down in the middle). */
const cylBandD = (x, y1, w, y2, ry) =>
  d`M${x} ${y1}A${w / 2} ${ry} 0 0 0 ${x + w} ${y1}V${y2}A${w / 2} ${ry} 0 0 1 ${x} ${y2}Z`;
/** Many circles as one path: list of [cx, cy, r]. */
const circlesD = (list) =>
  list.map(([cx, cy, r]) => d`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`).join('');

/** Scatter of rice grains as one path. */
const grainScatter = (seed, x, y, w, h, count, len = 4.4, wid = 1.8) => {
  const rand = rng(seed);
  let out = '';
  for (let i = 0; i < count; i += 1) out += ellD(x + rand() * w, y + rand() * h, len, wid, rand() * 180);
  return out;
};

/** @type {Record<string, (p: typeof PALETTES[number], g: ReturnType<typeof makeGradients>) => unknown>} */
const SHAPES = {};

// ===========================================================================
// Staples: oil, rice, flour, spices, salt & sugar
// ===========================================================================
/** Circles (dots) as one path. */
const dotsD = (seed, x, y, w, h, count, r) => {
  const rand = rng(seed);
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const cx = x + rand() * w;
    const cy = y + rand() * h;
    const rr = r * (0.7 + rand() * 0.6);
    out += d`M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0Z`;
  }
  return out;
};
/** Zig-zag crimp seal: band from x to x+w, y to y+h, teeth on the outer (top or bottom) edge. */
const crimpD = (x, y, w, h, teeth, top = true) => {
  const step = w / teeth;
  let out = top ? d`M${x} ${y + h}V${y + 2}` : d`M${x} ${y}V${y + h - 2}`;
  for (let i = 0; i < teeth; i += 1) {
    const x1 = x + step * (i + 0.5);
    const x2 = x + step * (i + 1);
    out += top ? d`L${x1} ${y - 1.5}L${x2} ${y + 2}` : d`L${x1} ${y + h + 1.5}L${x2} ${y + h - 2}`;
  }
  return out + (top ? d`V${y + h}Z` : d`V${y}Z`);
};
/** Pillow pack (crimped top and bottom seals, bulging sides). */
const pillowPack = (g, fill, x, y, w, h, seal = 13) =>
  P(crimpD(x + 2, y, w - 4, seal, Math.round(w / 9)), dk(fill, 0.12)) +
  P(crimpD(x + 2, y + h - seal, w - 4, seal, Math.round(w / 9), false), dk(fill, 0.12)) +
  P(d`M${x + 2} ${y + seal}C${x - 5} ${y + h * 0.3} ${x - 5} ${y + h * 0.7} ${x + 2} ${y + h - seal}H${x + w - 2}C${x + w + 5} ${y + h * 0.7} ${x + w + 5} ${y + h * 0.3} ${x + w - 2} ${y + seal}Z`, g.cyl(fill)) +
  S(d`M${x + 4} ${y + seal + 3}H${x + w - 4}M${x + 4} ${y + h - seal - 3}H${x + w - 4}`, SHADOW, 1.2, { op: 0.12 });

// ---- oil ----
SHAPES['oil/bottle'] = (p, g) => [
  shadow(42),
  P('M116 68C116 82 92 86 92 104V206Q92 218 104 218H152Q164 218 164 206V104C164 86 140 82 140 68Z', g.cyl(OIL)),
  R(116, 54, 24, 16, g.cyl('#f7d98a'), { rx: 2 }),
  R(110, 50, 36, 7, g.cyl(p.dark), { rx: 3.5 }),
  R(113, 32, 30, 20, g.cyl(p.base), { rx: 4 }),
  S('M119 36V48M125 36V48M131 36V48M137 36V48', dk(p.base, 0.35), 1.3, { op: 0.35 }),
  P('M92 116Q128 123 164 116V180Q128 187 92 180Z', g.cyl(p.base)),
  labelPanel(g, 104, 126, 48, 46, 9),
  brand(p, 128, 142, 9.5, 'drop'),
  P('M92 192Q128 199 164 192V196Q128 203 92 196Z', SHADOW, { op: 0.1 }),
  P('M92 202Q128 209 164 202V206Q128 213 92 206Z', SHADOW, { op: 0.1 }),
  highlight(98, 98, 7, 14),
  highlight(98, 186, 7, 24),
];

SHAPES['oil/jerrycan'] = (p, g) => [
  shadow(64),
  P('M122 102V72Q122 56 138 56H164Q180 56 180 72V102H169V74Q169 67 162 67H140Q133 67 133 74V102Z', g.cyl(lt(OIL, 0.18))),
  R(88, 80, 26, 20, g.cyl('#f7d98a'), { rx: 3 }),
  R(81, 62, 40, 21, g.cyl(p.base), { rx: 5 }),
  S('M88 66V79M95 66V79M101 66V79M107 66V79M114 66V79', dk(p.base, 0.35), 1.3, { op: 0.35 }),
  P('M70 116Q70 96 90 96H166Q186 96 186 116V204Q186 218 172 218H84Q70 218 70 204Z', g.cyl(OIL)),
  P('M70 126Q128 134 186 126V192Q128 200 70 192Z', g.cyl(p.base)),
  labelPanel(g, 94, 136, 68, 50, 10),
  brand(p, 128, 154, 11, 'drop'),
  highlight(77, 104, 7, 16),
  highlight(77, 198, 7, 12),
];

SHAPES['oil/jar'] = (p, g) => {
  const ghee = '#f3cd6a';
  return [
    shadow(52),
    P('M86 104Q80 110 80 122V204Q80 218 94 218H162Q176 218 176 204V122Q176 110 170 104Z', g.cyl(ghee)),
    P(dotsD(3, 90, 108, 76, 18, 9, 1.8), lt(ghee, 0.45)),
    P(dotsD(5, 90, 196, 76, 16, 7, 1.6), lt(ghee, 0.45)),
    R(84, 68, 88, 38, g.cyl(p.base), { rx: 7 }),
    R(84, 68, 88, 7, lt(p.base, 0.25), { rx: 3.5 }),
    R(84, 98, 88, 8, dk(p.base, 0.2), { rx: 3 }),
    P('M80 130Q128 138 176 130V190Q128 198 80 190Z', g.cyl(CREAM)),
    P('M80 174Q104 166 128 174T176 174V190Q128 198 80 190Z', p.base),
    emblem(p, 128, 152, 11, 'crown'),
    highlight(88, 112, 6, 12),
    highlight(88, 196, 6, 12),
  ];
};

SHAPES['oil/tin'] = (p, g) => {
  const x = 70;
  const y = 90;
  const w = 94;
  const h = 128;
  return [
    shadow(64, 138),
    box3(x, y, w, h, 24, 16, p.base, dk(p.base, 0.22), SILVER),
    PG([x + 7, y - 2, x + 28, y - 13, x + w + 18, y - 13, x + w - 3, y - 2], lt(SILVER, 0.35)),
    R(x + 24, y - 21, 16, 12, g.cyl(p.dark), { rx: 2 }),
    E(x + 32, y - 21, 8, 3, lt(p.base, 0.3)),
    S(`M${x + 46} ${y - 8}Q${x + 72} ${y - 46} ${x + 102} ${y - 13}`, STEEL, 3.2),
    R(x, y, w, 6, lt(p.base, 0.22)),
    R(x, y + h - 8, w, 8, dk(p.base, 0.14)),
    labelPanel(g, x + 11, y + 24, w - 22, 74, 8),
    brand(p, x + w / 2, y + 50, 12.5, 'drop'),
    P(d`M${x + 11} ${y + 84}Q${x + 30} ${y + 78} ${x + 47} ${y + 84}T${x + 83} ${y + 84}V${y + 90}Q${x + 83} ${y + 98} ${x + 75} ${y + 98}H${x + 19}Q${x + 11} ${y + 98} ${x + 11} ${y + 90}Z`, p.base),
  ];
};

// ---- rice & flour ----
const SACK_BODY =
  'M112 84C90 88 71 102 69 128C67 160 65 190 67 206L62 217Q128 223 194 217L189 206C191 190 189 160 187 128C185 102 166 88 144 84Z';
const sack = (p, g, cloth, print) => [
  shadow(66),
  P('M113 82L99 54Q104 46 111 50Q116 42 123 47Q128 39 133 47Q140 42 145 50Q152 46 157 54L143 82Z', g.cyl(dk(cloth, 0.08))),
  S('M113 56L119 78M128 50V78M143 56L137 78', dk(cloth, 0.3), 1.2, { op: 0.35 }),
  P(SACK_BODY, g.cyl(cloth)),
  S('M71 136H185M69 148H187M68 160H188M68 172H188M67 184H189M67 196H189M67 208H189', '#6e5a36', 1.1, { op: 0.12 }),
  print,
  R(106, 76, 44, 11, g.cyl(p.dark), { rx: 5.5 }),
  S('M141 86Q148 97 142 108M135 87Q135 99 128 107', p.dark, 3),
];

SHAPES['rice/sack'] = (p, g) =>
  sack(p, g, '#f1e8d3', [
    emblem(p, 128, 146, 24, 'grain'),
    bars(128, 178, [46, 30], 3.6, p.dark, 0.8),
    R(68, 197, 120, 7, p.base),
  ]);

SHAPES['flour/sack'] = (p, g) =>
  sack(p, g, '#f7f3ea', [
    P('M68 176Q98 164 128 176T188 176V206L189 206H67Z', p.base),
    R(67, 190, 122, 3, p.accent, { op: 0.9 }),
    C(128, 140, 25, p.base),
    C(128, 140, 19.5, CREAM),
    glyph('wheat', 128, 140, 1.45, '#d29a32'),
  ]);

SHAPES['rice/pouch'] = (p, g) => [
  shadow(52),
  P('M88 50Q88 42 96 42H160Q168 42 168 50L176 202Q177 216 163 216H93Q79 216 80 202Z', g.cyl(p.base)),
  P('M88 58V50Q88 42 96 42H160Q168 42 168 50V58Z', SHADOW, { op: 0.14 }),
  R(89, 63, 78, 2.6, SHADOW, { op: 0.16 }),
  emblem(p, 128, 96, 19, 'grain', CREAM, p.base),
  R(101, 128, 54, 54, '#ece3d0', { rx: 13 }),
  P(grainScatter(7, 108, 135, 40, 40, 20, 4, 1.7), '#fffdf6'),
  bars(128, 190, [44], 4, CREAM, 0.85),
  P('M80 198Q128 188 176 198V202Q177 216 163 216H93Q79 216 80 202Z', SHADOW, { op: 0.1 }),
  highlight(95, 70, 7, 46, 0.26),
];

SHAPES['rice/grains'] = (p, g) => {
  const rice = '#f8f4ea';
  const rand = rng(21);
  let grains = '';
  for (let i = 0; i < 34; i += 1) {
    const a = rand() * Math.PI;
    const rr = Math.sqrt(rand()) * 0.9;
    grains += ellD(128 + Math.cos(a) * 70 * rr, 138 - Math.sin(a) * 66 * rr, 4.2, 1.8, rand() * 180);
  }
  return [
    shadow(66),
    R(106, 200, 44, 18, dk(p.base, 0.25), { rx: 4 }),
    E(128, 138, 84, 18, dk(p.base, 0.35)),
    P(bumpyDome(128, 142, 74, 72, 18, 7), g.orb(rice)),
    P(grains, '#e4d9c1'),
    P('M44 138A84 18 0 0 0 212 138Q208 206 128 208Q48 206 44 138Z', g.cyl(p.base)),
    S('M50 144A78 14 0 0 0 206 144', lt(p.base, 0.35), 3, { op: 0.7 }),
    P(ellD(64, 221, 4.2, 1.8, 20) + ellD(76, 225, 4.2, 1.8, -30) + ellD(190, 222, 4.2, 1.8, 40), rice),
  ];
};

SHAPES['flour/pouch'] = (p, g) => [
  shadow(50),
  pillowPack(g, p.base, 82, 40, 92, 178),
  labelPanel(g, 96, 78, 64, 84, 10),
  glyph('wheat', 116, 112, 2, '#d29a32'),
  glyph('wheat', 140, 112, 2, '#e0b04c'),
  bars(128, 144, [40, 26], 3.4, p.dark, 0.8),
  E(128, 186, 24, 9, lt(p.base, 0.3)),
  emblem(p, 128, 186, 7.5, 'star', p.accent, p.deep),
  highlight(90, 66, 6, 60, 0.26),
];

SHAPES['flour/packet'] = (p, g) => {
  const x = 80;
  const y = 74;
  const w = 76;
  const h = 144;
  return [
    shadow(56, 138),
    box3(x, y, w, h, 24, 12, p.base, dk(p.base, 0.24), lt(p.base, 0.2)),
    S(`M${x + w} ${y}L${x + w + 12} ${y + 16}L${x + w + 24} ${y - 12}`, dk(p.base, 0.4), 1.4, { op: 0.5 }),
    R(x, y, w, 24, lt(p.base, 0.12)),
    R(x, y + 24, w, 4, SHADOW, { op: 0.16 }),
    labelPanel(g, x + 9, y + 40, w - 18, 82, 8),
    glyph('wheat', x + w / 2, y + 70, 2.3, '#d29a32'),
    bars(x + w / 2, y + 100, [36, 24], 3.4, p.dark, 0.8),
    R(x, y + h - 12, w, 5, p.accent, { op: 0.85 }),
  ];
};

// ---- spices ----
const SPICE = ['#c8352b', '#e2a41c', '#8a5a32', '#b8863e', '#7d402b', '#d6602c'];

SHAPES['spices/jar'] = (p, g) => [
  shadow(40),
  P('M100 94Q96 98 96 106V206Q96 218 108 218H148Q160 218 160 206V106Q160 98 156 94Z', g.cyl(SPICE[p.i])),
  P('M97 104H159V112Q128 106 97 112Z', g.cyl(GLASS), { op: 0.9 }),
  R(93, 62, 70, 34, g.cyl(p.base), { rx: 6 }),
  R(93, 62, 70, 7, lt(p.base, 0.25), { rx: 3.5 }),
  S('M100 74V90M107 74V90M114 74V90M121 74V90M128 74V90M135 74V90M142 74V90M149 74V90M156 74V90', dk(p.base, 0.35), 1.3, { op: 0.3 }),
  P('M96 130Q128 136 160 130V190Q128 196 96 190Z', g.cyl(CREAM)),
  brand(p, 128, 152, 10, 'chili'),
  highlight(101, 112, 6, 12),
  highlight(101, 196, 6, 14),
];

SHAPES['spices/pouch'] = (p, g) => {
  const hole = 'M121 56a7 4 0 1 0 14 0a7 4 0 1 0 -14 0Z';
  return [
    shadow(46),
    P('M92 44H164Q170 44 170 50V206Q170 216 160 216H96Q86 216 86 206V50Q86 44 92 44Z' + hole, g.cyl(p.base), { evenodd: true }),
    P('M86 68V50Q86 44 92 44H164Q170 44 170 50V68Z' + hole, SHADOW, { op: 0.14, evenodd: true }),
    emblem(p, 128, 100, 17, 'chili', CREAM, p.base),
    bars(128, 124, [44, 28], 3.4, CREAM, 0.85),
    R(100, 146, 56, 56, '#f4ede2', { rx: 12 }),
    P('M100 176Q114 164 128 170T156 166V190Q156 202 144 202H112Q100 202 100 190Z', g.cyl(SPICE[p.i])),
    P(dotsD(9, 106, 176, 44, 20, 8, 1.2), dk(SPICE[p.i], 0.2)),
    highlight(93, 76, 6, 40, 0.26),
  ];
};

SHAPES['spices/box'] = (p, g) => {
  const x = 84;
  const y = 92;
  const w = 70;
  const h = 126;
  return [
    shadow(54, 136),
    box3(x, y, w, h, 22, 12, p.base, dk(p.base, 0.24), lt(p.base, 0.22)),
    labelPanel(g, x + 8, y + 16, w - 16, 70, 8),
    G(tf(x + w / 2, y + 50, -28, 2.2), P('M-9 6C-2 8 6 3 8.5 -5C9 -7 7.6 -8.2 6.4 -6.4C3.5 -1 -1.5 3 -9 3.5Z', SPICE[0]), P('M5.6 -6.2L7.6 -8.8L9.8 -9.4L8.6 -7.2Z', LEAF)),
    bars(x + w / 2, y + 96, [44, 28], 3.4, CREAM, 0.85),
    R(x, y + h - 14, w, 5, p.accent, { op: 0.9 }),
  ];
};

SHAPES['spices/whole'] = (p, g) => {
  const anise = (cx, cy, s, rot) =>
    G(tf(cx, cy, rot, s), PG(starPts(0, 0, 12, 4.4, 8), '#7b4424'), C(0, 0, 3.4, '#b06f3c'));
  const pod = (cx, cy, rot) => G(tf(cx, cy, rot), P(ellD(0, 0, 13, 7, 0), g.orb('#93bd5f')), S('M-9 0H9', '#6b9142', 1.4));
  const stick = (cx, cy, rot, len) =>
    G(tf(cx, cy, rot), R(-len / 2, -7, len, 14, g.cylV('#a9663b'), { rx: 7 }), S(d`M${-len / 2 + 6} -1H${len / 2 - 8}`, '#7d4526', 1.6, { op: 0.6 }), E(len / 2, 0, 4.5, 7, '#cf8f5c'), E(len / 2, 0, 2, 3.4, '#9a5a32'));
  return [
    shadow(64),
    R(108, 200, 40, 18, dk(p.base, 0.25), { rx: 4 }),
    E(128, 140, 80, 17, dk(p.base, 0.35)),
    P(bumpyDome(128, 144, 70, 38, 14, 8), g.orb('#a8703f')),
    P(ellD(84, 124, 5, 2.2, 30) + ellD(176, 128, 5, 2.2, -40) + ellD(146, 138, 5, 2.2, 70) + ellD(104, 140, 5, 2.2, -20), '#5a3320'),
    stick(106, 104, -30, 84),
    stick(150, 100, 24, 70),
    pod(92, 128, -20),
    pod(166, 128, 30),
    pod(136, 122, 8),
    anise(114, 128, 1.3, 10),
    anise(160, 108, 1.05, -12),
    P('M48 140A80 17 0 0 0 208 140Q204 206 128 208Q52 206 48 140Z', g.cyl(p.base)),
    S('M54 146A74 13 0 0 0 202 146', lt(p.base, 0.35), 3, { op: 0.7 }),
    anise(62, 212, 0.65, 18),
    pod(196, 214, 18),
  ];
};

// ---- salt & sugar ----
SHAPES['salt-sugar/pouch'] = (p, g) => {
  const sugar = '#f4f1ea';
  const hole = 'M120 54a8 4 0 1 0 16 0a8 4 0 1 0 -16 0Z';
  return [
    shadow(50),
    P('M86 64H170L174 204Q174 216 162 216H94Q82 216 82 204Z', g.cyl(sugar)),
    P(dotsD(13, 92, 76, 72, 132, 26, 1.3), '#d9dfe7'),
    P('M86 40H170V70H86Z' + hole, g.cyl(p.base), { evenodd: true }),
    R(86, 66, 84, 4, SHADOW, { op: 0.15 }),
    P('M84 118Q128 124 172 118V168Q128 174 84 168Z', g.cyl(p.base)),
    labelPanel(g, 104, 126, 48, 34, 7),
    G(tf(128, 144), PG([-12, -4, 0, -10, 12, -4, 0, 2], lt(p.base, 0.35)), PG([-12, -4, 0, 2, 0, 14, -12, 8], p.base), PG([0, 2, 12, -4, 12, 8, 0, 14], p.dark)),
    glyph('sparkle', 104, 94, 0.8, WHITE),
    glyph('sparkle', 150, 190, 0.6, WHITE),
    P('M82 194Q128 188 174 194V204Q174 216 162 216H94Q82 216 82 204Z', p.base, { op: 0.9 }),
    highlight(90, 78, 6, 34, 0.5),
  ];
};

SHAPES['salt-sugar/packet'] = (p, g) => [
  shadow(46),
  pillowPack(g, p.base, 88, 44, 80, 174),
  P('M86 150Q107 140 128 150T170 150V176H86Z', lt(p.base, 0.3), { op: 0.6 }),
  labelPanel(g, 98, 76, 60, 70, 10),
  P('M116 94Q116 82 128 82Q140 82 140 94Z', g.cyl(STEEL)),
  P(circlesD([[123, 88, 1.3], [128, 86, 1.3], [133, 88, 1.3]]), INK),
  P('M115 94H141L144 130Q144 136 138 136H118Q112 136 112 130Z', g.cyl('#bfdcee')),
  P('M114 110Q128 106 142 110L144 130Q144 136 138 136H118Q112 136 112 130Z', g.cyl(WHITE)),
  P(dotsD(4, 116, 112, 24, 20, 6, 0.9), '#c9d3de'),
  R(117, 97, 3, 30, WHITE, { rx: 1.5, op: 0.7 }),
  bars(128, 142, [30], 2.6, p.dark, 0.7),
  emblem(p, 128, 182, 9, 'sparkle', p.dark),
  highlight(95, 70, 6, 60, 0.26),
];

SHAPES['salt-sugar/jar'] = (p, g) => [
  shadow(46),
  P('M92 92Q86 98 86 108V204Q86 218 100 218H156Q170 218 170 204V108Q170 98 164 92Z', g.cyl(GLASS)),
  P('M88 118Q128 112 168 118V204Q168 214 156 214H100Q88 214 88 204Z', g.cyl('#f7f6f2')),
  P(dotsD(17, 94, 122, 70, 88, 22, 1.2), '#d8dee6'),
  R(90, 64, 76, 30, g.cyl(p.base), { rx: 6 }),
  R(90, 64, 76, 6, lt(p.base, 0.25), { rx: 3 }),
  R(90, 88, 76, 6, dk(p.base, 0.2), { rx: 2 }),
  E(128, 164, 26, 20, g.cyl(CREAM)),
  G(tf(128, 164, 0, 0.9), PG([-12, -4, 0, -10, 12, -4, 0, 2], lt(p.base, 0.35)), PG([-12, -4, 0, 2, 0, 14, -12, 8], p.base), PG([0, 2, 12, -4, 12, 8, 0, 14], p.dark)),
  highlight(94, 104, 7, 90, 0.5),
];

// ===========================================================================
// Packaged food & drinks: biscuits, snacks, drinks, juice, dairy, frozen
// ===========================================================================
/** Vertical crimp seal (left or right end of a lying packet). */
const crimpVD = (x, y, w, h, teeth, left = true) => {
  const step = h / teeth;
  let out = left ? d`M${x + w} ${y}H${x + 2}` : d`M${x} ${y}H${x + w - 2}`;
  for (let i = 0; i < teeth; i += 1) {
    const y1 = y + step * (i + 0.5);
    const y2 = y + step * (i + 1);
    out += left ? d`L${x - 1.5} ${y1}L${x + 2} ${y2}` : d`L${x + w + 1.5} ${y1}L${x + w - 2} ${y2}`;
  }
  return out + (left ? d`H${x + w}Z` : d`H${x}Z`);
};
/** Short cylinder slice (cookie, coin, lid): side then top ellipse. */
const disc = (cx, y, rx, ry, h, side, top) =>
  P(d`M${cx - rx} ${y}V${y + h}A${rx} ${ry} 0 0 0 ${cx + rx} ${y + h}V${y}Z`, side) + E(cx, y, rx, ry, top);

/** Small fruit marks for juice packs (drawn within ±12 at scale 1). */
const FRUIT_MARKS = {
  apple: () => [
    P('M0 -6C-3 -9 -11 -9 -11 0C-11 7 -6 12 -3 12C-1.5 12 -1 11 0 11C1 11 1.5 12 3 12C6 12 11 7 11 0C11 -9 3 -9 0 -6Z', '#d93b3b'),
    S('M-.5 -6Q0 -10 2 -12', '#7a4a2a', 1.6),
    P(ellD(5, -10, 4.5, 2.2, -25), LEAF),
    E(-5, -2, 2, 3.5, WHITE, { op: 0.45 }),
  ],
  guava: () => [C(0, 0, 11.5, '#8dc63f'), C(0, 0, 9, '#f7a39b'), C(0, 0, 5, '#f58b82'), P(circlesD([[-2, -2, 0.9], [2, -1, 0.9], [0, 2.5, 0.9], [-3, 2, 0.8], [3, 2.5, 0.8]]), CREAM)],
  orange: () => [
    C(0, 0, 11.5, '#f28c1c'),
    C(0, 0, 9.5, '#fff3dc'),
    C(0, 0, 8.5, '#ffb43f'),
    S('M0 -8V8M-8 0H8M-5.7 -5.7L5.7 5.7M-5.7 5.7L5.7 -5.7', '#fff3dc', 1.3),
  ],
  mango: () => [
    P('M-9 5C-12 -4 -6 -11 2 -10C9 -9 12 -2 10 5C8 11 -5 12 -9 5Z', '#f7b52c'),
    P('M2 -10C9 -9 12 -2 10 5C9 1 6 -4 0 -6Z', '#f0663a', { op: 0.8 }),
    P(ellD(-4, -11, 5, 2.2, -20), LEAF),
  ],
  grape: () => [
    P(circlesD([[-6, -4, 4.4], [0, -4, 4.4], [6, -4, 4.4], [-3, 3, 4.4], [3, 3, 4.4], [0, 9.5, 4.2]]), '#7d3c98'),
    P(circlesD([[-7, -5.5, 1.3], [-1, -5.5, 1.3], [5, -5.5, 1.3], [-4, 1.5, 1.3], [2, 1.5, 1.3]]), WHITE, { op: 0.5 }),
    P(ellD(4, -11, 5, 2.4, -15), LEAF),
  ],
  lychee: () => [
    C(-4, 2, 8.5, '#d8404f'),
    P(circlesD([[-7, 0, 1], [-3, -3, 1], [-1, 4, 1], [-6, 6, 1]]), '#a92c3b'),
    C(6, -2, 6.5, '#f7f1e6'),
    E(4.5, -4, 2, 2.6, WHITE),
    P(ellD(-8, -8, 5, 2.2, 30), LEAF),
  ],
};
const JUICES = [
  { mark: 'apple', liquid: '#e9a23b' },
  { mark: 'guava', liquid: '#f29a8c' },
  { mark: 'orange', liquid: '#f7a21b' },
  { mark: 'mango', liquid: '#f5b120' },
  { mark: 'grape', liquid: '#8e3a73' },
  { mark: 'lychee', liquid: '#f1d9bd' },
];
const fruitMark = (kind, cx, cy, s) => G(tf(cx, cy, 0, s), FRUIT_MARKS[kind]());

/** Wavy potato chip. */
const chip = (cx, cy, rot, s = 1) =>
  G(
    tf(cx, cy, rot, s),
    P('M-12 -2C-11 -9 -2 -11 5 -9C12 -7 13 0 11 5C8 11 -1 11 -6 9C-11 7 -13 3 -12 -2Z', '#f4c653'),
    S('M-8 -3Q-2 -6 6 -3M-6 3Q0 0 8 3', '#d99a2b', 1.3, { op: 0.7 }),
  );

// ---- biscuits ----
const marieBiscuit = (cx, cy, r) =>
  C(cx + r * 0.08, cy + r * 0.1, r, '#c98b45') +
  C(cx, cy, r, '#e3b467') +
  C(cx, cy, r * 0.78, '#e9c07a') +
  P(circlesD([[cx, cy, 1.5], [cx - r * 0.4, cy - r * 0.35, 1.3], [cx + r * 0.4, cy - r * 0.35, 1.3], [cx - r * 0.4, cy + r * 0.35, 1.3], [cx + r * 0.4, cy + r * 0.35, 1.3]]), '#b67a3a');

SHAPES['biscuits/packet'] = (p, g) => [
  shadow(84, 128, 206),
  G(
    'rotate(-12 128 150)',
    P(crimpVD(36, 116, 16, 70, 7, true), dk(p.base, 0.14)),
    P(crimpVD(204, 116, 16, 70, 7, false), dk(p.base, 0.14)),
    P('M50 114Q128 106 206 114V188Q128 196 50 188Z', g.cylV(p.base)),
    P('M50 132Q128 124 206 132V170Q128 178 50 170Z', g.cylV(CREAM)),
    marieBiscuit(188, 150, 19),
    marieBiscuit(166, 150, 19),
    marieBiscuit(144, 150, 19),
    emblem(p, 88, 150, 14, 'star'),
    R(56, 176, 150, 3, p.accent, { op: 0.9 }),
    highlight(62, 118, 120, 4, 0.3),
  ),
];

SHAPES['biscuits/box'] = (p, g) => {
  const x = 74;
  const y = 76;
  const w = 84;
  const h = 142;
  const cookie = (cx, cy) =>
    disc(cx, cy + 3, 22, 6, 6, '#3f271d', '#3f271d') +
    disc(cx, cy, 21.5, 6, 3, '#eadcc5', '#f7efe2') +
    disc(cx, cy - 7, 22, 6, 6, '#553523', '#6b4431') +
    E(cx, cy - 7, 15, 3.8, '#583624') +
    E(cx - 6, cy - 8.5, 5, 1.4, WHITE, { op: 0.25 });
  return [
    shadow(60, 138),
    box3(x, y, w, h, 24, 14, p.base, dk(p.base, 0.24), lt(p.base, 0.22)),
    emblem(p, x + w / 2, y + 30, 14, 'heart', CREAM, p.base),
    bars(x + w / 2, y + 50, [48, 32], 3.4, CREAM, 0.85),
    labelPanel(g, x + 8, y + 72, w - 16, 58, 9),
    cookie(x + 32, y + 108),
    cookie(x + 54, y + 96),
    R(x, y + h - 8, w, 4, p.accent, { op: 0.9 }),
  ];
};

SHAPES['biscuits/tin'] = (p, g) => {
  const ring = (cx, cy, r) =>
    P(d`M${cx - r} ${cy}a${r} ${r * 0.8} 0 1 0 ${r * 2} 0a${r} ${r * 0.8} 0 1 0 ${-r * 2} 0ZM${cx - r * 0.42} ${cy}a${r * 0.42} ${r * 0.34} 0 1 1 ${r * 0.84} 0a${r * 0.42} ${r * 0.34} 0 1 1 ${-r * 0.84} 0Z`, '#e2ad5f', { evenodd: true });
  return [
    shadow(70),
    P(cylSideD(60, 118, 136, 204, 14), g.cyl(p.base)),
    R(60, 194, 136, 4, p.accent, { op: 0.85 }),
    P(cylSideD(55, 100, 146, 120, 15), g.cyl(p.dark)),
    E(128, 100, 73, 16, lt(p.base, 0.1)),
    E(128, 100, 58, 11.5, p.base),
    E(128, 100, 44, 8, lt(p.base, 0.16)),
    E(128, 158, 42, 25, g.cyl(CREAM)),
    ring(110, 160, 14),
    ring(142, 156, 13),
    C(126, 172, 6, '#d69c4f'),
    highlight(66, 128, 7, 50, 0.28),
  ];
};

// ---- snacks ----
SHAPES['snacks/chips-bag'] = (p, g) => [
  shadow(58),
  pillowPack(g, p.base, 76, 36, 104, 178, 14),
  PG(starPts(128, 112, 40, 33, 16), p.accent, { op: 0.9 }),
  PG(starPts(128, 112, 35, 29, 16), CREAM),
  chip(118, 106, -20, 1.25),
  chip(138, 118, 15, 1.2),
  bars(128, 162, [56, 36], 4, CREAM, 0.9),
  highlight(84, 60, 6, 70, 0.26),
  chip(174, 208, 25, 1.1),
  chip(84, 212, -15, 1),
];

SHAPES['snacks/packet'] = (p, g) => {
  const hole = 'M120 54a8 4 0 1 0 16 0a8 4 0 1 0 -16 0Z';
  const rand = rng(33);
  let sev = '';
  let nuts = '';
  let peas = '';
  for (let i = 0; i < 16; i += 1) {
    const x = 106 + rand() * 44;
    const y = 138 + rand() * 42;
    const a = rand() * Math.PI;
    sev += d`M${x} ${y}l${Math.cos(a) * 9} ${Math.sin(a) * 9}`;
    if (i % 2) nuts += ellD(106 + rand() * 44, 140 + rand() * 40, 3.6, 2.6, rand() * 180);
    if (i % 3 === 0) peas += circlesD([[108 + rand() * 40, 142 + rand() * 38, 2.4]]);
  }
  return [
    shadow(48),
    P('M90 44H166Q172 44 172 50V210Q172 216 166 216H90Q84 216 84 210V50Q84 44 90 44Z' + hole, g.cyl(p.base), { evenodd: true }),
    P('M84 64V50Q84 44 90 44H166Q172 44 172 50V64Z' + hole, SHADOW, { op: 0.15, evenodd: true }),
    emblem(p, 128, 92, 16, 'flame', CREAM, p.base),
    bars(128, 114, [44], 3.4, CREAM, 0.85),
    R(100, 130, 56, 58, '#f5e8cf', { rx: 12 }),
    S(sev, '#e5ad37', 3),
    P(nuts, '#b8733c'),
    P(peas, '#86b04a'),
    R(84, 196, 88, 5, p.accent, { op: 0.9 }),
    highlight(91, 72, 6, 50, 0.26),
  ];
};

SHAPES['snacks/canister'] = (p, g) => {
  const saddle = (y) => P(d`M104 ${y}Q128 ${y - 9} 152 ${y}Q128 ${y + 7} 104 ${y}Z`, '#f3c451') + P(d`M104 ${y}Q128 ${y + 7} 152 ${y}Q128 ${y + 10} 104 ${y}Z`, '#d9a23a');
  return [
    shadow(40),
    P(cylSideD(96, 62, 64, 206, 8), g.cyl(p.base)),
    P('M96 198A32 8 0 0 0 160 198V206A32 8 0 0 1 96 206Z', g.cyl(SILVER)),
    P(cylBandD(96, 112, 64, 176, 8), g.cyl(CREAM)),
    saddle(132),
    saddle(144),
    saddle(156),
    saddle(168),
    emblem(p, 128, 88, 12, 'star', CREAM, p.base),
    P(cylSideD(93, 48, 70, 62, 9), g.cyl(SILVER)),
    E(128, 48, 35, 9, '#eef2f6'),
    E(128, 48, 28, 6.5, '#dfe5ec'),
    bars(128, 186, [34], 3, CREAM, 0.8),
    highlight(101, 66, 6, 40, 0.3),
  ];
};

SHAPES['snacks/nuts'] = (p, g) => {
  const KRAFT = '#c99b62';
  const peanut = (cx, cy, rot) =>
    G(
      tf(cx, cy, rot),
      P('M-12 0C-12 -6 -6 -7 -3 -4C-1 -2.5 1 -2.5 3 -4C6 -7 12 -6 12 0C12 6 6 7 3 4C1 2.5 -1 2.5 -3 4C-6 7 -12 6 -12 0Z', '#dcb57d'),
      P('M3 -4C6 -7 12 -6 12 0C12 6 6 7 3 4C5 2 5 -2 3 -4Z', '#c89c62'),
      P(circlesD([[-7, -1, 0.9], [-5, 2, 0.9], [6, -1.5, 0.9], [8, 1.5, 0.9]]), '#b8894f'),
    );
  const kernel = (cx, cy, rot) => G(tf(cx, cy, rot), P(ellD(0, 0, 5, 3.4, 0), '#b4603a'), P(ellD(-1, -1, 2.4, 1.4, 0), WHITE, { op: 0.3 }));
  return [
    shadow(56),
    P('M82 108L90 92L100 104L110 90L120 104L130 88L140 104L150 90L160 104L170 92L176 108Z', dk(KRAFT, 0.18)),
    peanut(104, 92, -30),
    peanut(128, 84, 10),
    peanut(152, 94, 35),
    peanut(116, 104, 20),
    peanut(144, 106, -15),
    P('M80 106H176L168 212Q167 218 160 218H96Q89 218 88 212Z', g.cyl(KRAFT)),
    P('M80 106H176L175 118H81Z', dk(KRAFT, 0.12)),
    P('M82 140H174L172 176H84Z', p.base),
    emblem(p, 128, 158, 11, 'star', CREAM, p.base),
    R(82, 182, 90, 3, p.base, { op: 0.8 }),
    kernel(72, 214, 20),
    kernel(186, 212, -30),
    peanut(196, 206, -20),
  ];
};

// ---- drinks ----
SHAPES['drinks/pet-bottle'] = (p, g) => [
  shadow(38),
  P('M118 60C118 76 96 82 96 100C96 116 104 122 104 134C104 146 96 152 96 168V202Q96 212 102 215Q110 212 116 216Q128 220 140 216Q146 212 154 215Q160 212 160 202V168C160 152 152 146 152 134C152 122 160 116 160 100C160 82 138 76 138 60Z', g.cyl(p.base)),
  R(118, 44, 20, 18, g.cyl(lt(p.base, 0.55)), { rx: 2 }),
  R(112, 41, 32, 6, g.cyl(p.dark), { rx: 3 }),
  R(114, 25, 28, 18, g.cyl(p.dark), { rx: 4 }),
  S('M120 29V39M126 29V39M132 29V39M138 29V39', WHITE, 1.2, { op: 0.25 }),
  P('M100 116C103 122 104 128 104 134C104 140 103 146 100 152Q128 158 156 152C153 146 152 140 152 134C152 128 153 122 156 116Q128 122 100 116Z', g.cyl(CREAM)),
  P('M103 142Q116 134 128 140T154 138C152 144 153 148 156 152Q128 158 100 152C103 148 103 145 103 142Z', p.base),
  emblem(p, 128, 128, 8, 'sparkle', p.dark),
  P(circlesD([[110, 100, 2.4], [144, 92, 1.6], [112, 182, 2], [146, 172, 2.8], [124, 196, 1.6]]), WHITE, { op: 0.45 }),
  highlight(101, 88, 6, 22),
  highlight(101, 164, 6, 32),
];

SHAPES['drinks/can'] = (p, g) => [
  shadow(40),
  P('M94 72V204Q94 214 104 216H152Q162 214 162 204V72Z', g.cyl(p.base)),
  P('M101 56Q94 62 94 72H162Q162 62 155 56Z', g.cyl(SILVER)),
  E(128, 56, 27, 6.5, '#eef2f6'),
  E(128, 57, 23, 4.8, '#c3ccd6'),
  R(121, 52, 16, 7, '#9aa6b4', { rx: 3.5 }),
  C(133, 55.5, 1.6, '#eef2f6'),
  P('M94 200H162V204Q162 214 152 216H104Q94 214 94 204Z', g.cyl(SILVER)),
  P('M94 152Q111 138 128 148T162 142V166Q145 178 128 168T94 172Z', CREAM),
  P('M94 164Q111 152 128 161T162 156V160Q145 172 128 164T94 168Z', p.accent, { op: 0.9 }),
  emblem(p, 128, 108, 15, 'sparkle', CREAM, p.base),
  bars(128, 184, [40], 3.4, CREAM, 0.8),
  highlight(100, 78, 6, 116, 0.3),
];

SHAPES['drinks/glass-bottle'] = (p, g) => {
  const glass = dk(p.base, 0.12);
  return [
    shadow(32),
    P('M119 46V72C119 90 103 100 103 120V204Q103 217 116 218H140Q153 217 153 204V120C153 100 137 90 137 72V46Z', g.cyl(glass)),
    R(117, 44, 22, 6, g.cyl(lt(glass, 0.3)), { rx: 3 }),
    P('M116 30H140V42L137.5 45L135 42L132.5 45L130 42L127.5 45L125 42L122.5 45L120 42L117.5 45L116 42Z', g.cyl(SILVER)),
    E(128, 164, 21, 25, g.cyl(CREAM)),
    emblem(p, 128, 158, 9, 'star'),
    bars(128, 172, [22], 2.6, p.dark, 0.7),
    R(103, 200, 50, 5, WHITE, { op: 0.18 }),
    highlight(108, 118, 5, 72, 0.4),
    highlight(122, 52, 3.5, 30, 0.4),
  ];
};

SHAPES['drinks/water-bottle'] = (p, g) => {
  const water = '#cde6f4';
  return [
    shadow(38),
    P('M118 64C118 76 98 80 98 96V206Q98 218 110 218H146Q158 218 158 206V96C158 80 138 76 138 64Z', g.cyl(water)),
    P('M98 100H158V105H98ZM98 111H158V116H98ZM98 122H158V127H98ZM98 180H158V185H98ZM98 191H158V196H98ZM98 202H158V207H98Z', '#9fcbe6', { op: 0.55 }),
    R(117, 52, 22, 14, g.cyl(lt(water, 0.3)), { rx: 2 }),
    R(113, 49, 30, 5, g.cyl(p.dark), { rx: 2.5 }),
    R(115, 32, 26, 18, g.cyl(p.base), { rx: 4 }),
    P('M98 134Q128 140 158 134V172Q128 178 98 172Z', g.cyl(p.base)),
    P('M98 158Q113 150 128 157T158 154V172Q128 178 98 172Z', WHITE, { op: 0.9 }),
    glyph('drop', 128, 147, 0.85, WHITE),
    highlight(103, 86, 6, 100, 0.55),
  ];
};

SHAPES['drinks/tea-box'] = (p, g) => {
  const x = 70;
  const y = 98;
  const w = 94;
  const h = 120;
  return [
    shadow(62, 138),
    box3(x, y, w, h, 26, 14, p.base, dk(p.base, 0.24), lt(p.base, 0.22)),
    labelPanel(g, x + 10, y + 14, w - 20, 70, 9),
    glyph('leaf', x + 62, y + 30, 1, LEAF),
    glyph('leaf', x + 70, y + 38, 0.8, LEAF_DARK),
    S(`M${x + 38} ${y + 34}q-4 -6 0 -12M${x + 46} ${y + 34}q-4 -6 0 -12`, dk(CREAM, 0.35), 2),
    P(d`M${x + 26} ${y + 42}H${x + 58}V${y + 48}A16 14 0 0 1 ${x + 26} ${y + 48}Z`, p.base),
    E(x + 42, y + 42, 16, 3.6, '#9a5a2e'),
    P(d`M${x + 57} ${y + 45}a6 6 0 0 1 0 12v-3.4a2.6 2.6 0 0 0 0 -5.2Z`, p.base),
    E(x + 42, y + 67, 24, 4.5, p.dark),
    bars(x + w / 2, y + 94, [52, 34], 3.6, CREAM, 0.85),
    R(x, y + h - 10, w, 4, p.accent, { op: 0.9 }),
  ];
};

SHAPES['drinks/coffee-jar'] = (p, g) => {
  const coffee = '#6d4531';
  return [
    shadow(46),
    P('M92 94Q86 100 86 110V204Q86 218 100 218H156Q170 218 170 204V110Q170 100 164 94Z', g.cyl(coffee)),
    P(dotsD(8, 92, 100, 72, 24, 12, 1.4) + dotsD(9, 92, 192, 72, 20, 10, 1.4), lt(coffee, 0.18)),
    R(90, 60, 76, 36, g.cyl(p.base), { rx: 6 }),
    R(90, 60, 76, 6, lt(p.base, 0.25), { rx: 3 }),
    S('M97 72V92M104 72V92M111 72V92M118 72V92M125 72V92M132 72V92M139 72V92M146 72V92M153 72V92M160 72V92', dk(p.base, 0.35), 1.3, { op: 0.3 }),
    P('M86 126Q128 133 170 126V186Q128 193 86 186Z', g.cyl(CREAM)),
    P('M86 170Q107 162 128 170T170 170V186Q128 193 86 186Z', p.base),
    G(tf(128, 148, -30), P(ellD(0, 0, 13, 9, 0), '#7a4a2c'), S('M-10 0Q-4 -4 0 0T10 0', '#4d2c19', 2)),
    highlight(92, 104, 6, 14, 0.25),
  ];
};

// ---- juice ----
SHAPES['juice/carton'] = (p, g) => {
  const j = JUICES[p.i];
  const x = 82;
  const y = 66;
  const w = 72;
  const h = 152;
  return [
    shadow(54, 138),
    box3(x, y, w, h, 22, 12, p.base, dk(p.base, 0.24), lt(p.base, 0.3)),
    P(cylSideD(x + 42, y - 18, 20, y - 8, 4), g.cyl(p.dark)),
    E(x + 52, y - 18, 10, 4, lt(p.base, 0.25)),
    P(waveD(x, y + 104, w, h - 104, 7), j.liquid),
    PG([x + w, y + 104, x + w + 22, y + 92, x + w + 22, y + h - 12, x + w, y + h], dk(j.liquid, 0.2)),
    C(x + w / 2, y + 62, 26, CREAM),
    fruitMark(j.mark, x + w / 2, y + 62, 1.7),
    bars(x + w / 2, y + 22, [44], 3.6, CREAM, 0.85),
    bars(x + w / 2, y + 128, [40, 26], 3.4, WHITE, 0.85),
  ];
};

SHAPES['juice/tetra-pack'] = (p, g) => {
  const j = JUICES[p.i];
  const x = 92;
  const y = 106;
  const w = 58;
  const h = 112;
  return [
    shadow(46, 136),
    box3(x, y, w, h, 20, 11, p.base, dk(p.base, 0.24), lt(p.base, 0.3)),
    E(140, 100, 5, 2.2, dk(p.base, 0.3)),
    S('M140 100V66L150 56V40', '#cdd5df', 7),
    S('M140 100V66L150 56V40', '#fafbfc', 4.4),
    S('M140 76V66L150 56', p.accent, 4.4),
    P(waveD(x, y + 76, w, h - 76, 6), j.liquid),
    PG([x + w, y + 76, x + w + 20, y + 65, x + w + 20, y + h - 11, x + w, y + h], dk(j.liquid, 0.2)),
    C(x + w / 2, y + 42, 22, CREAM),
    fruitMark(j.mark, x + w / 2, y + 42, 1.45),
    bars(x + w / 2, y + 90, [30], 3, WHITE, 0.85),
  ];
};

SHAPES['juice/pet-bottle'] = (p, g) => {
  const j = JUICES[p.i];
  return [
    shadow(46),
    P('M110 64C110 76 90 82 90 100V204Q90 218 104 218H152Q166 218 166 204V100C166 82 146 76 146 64Z', g.cyl(j.liquid)),
    S('M96 94H160M93 104H163', WHITE, 2, { op: 0.25 }),
    R(110, 54, 36, 12, g.cyl(lt(j.liquid, 0.4)), { rx: 2 }),
    R(106, 52, 44, 6, g.cyl(p.dark), { rx: 3 }),
    R(106, 32, 44, 22, g.cyl(p.base), { rx: 5 }),
    S('M113 36V50M120 36V50M127 36V50M134 36V50M141 36V50', dk(p.base, 0.35), 1.3, { op: 0.35 }),
    P('M90 118Q128 125 166 118V188Q128 195 90 188Z', g.cyl(p.base)),
    C(128, 150, 25, CREAM),
    fruitMark(j.mark, 128, 150, 1.6),
    highlight(96, 106, 6, 10),
    highlight(96, 194, 6, 14),
  ];
};

// ---- dairy ----
SHAPES['dairy/milk-carton'] = (p, g) => {
  const x = 84;
  const y = 98;
  const w = 68;
  const h = 120;
  const dx = 22;
  const dy = 12;
  const ax = x + w / 2;
  const ay = y - 30;
  return [
    shadow(56, 138),
    PG([ax, ay, ax + dx, ay - dy, ax + dx, ay - dy - 9, ax, ay - 9], p.dark),
    PG([ax, ay, x + w, y, x + w + dx, y - dy, ax + dx, ay - dy], lt(p.base, 0.2)),
    PG([x + w, y, x + w + dx, y - dy, x + w + dx, y + h - dy, x + w, y + h], '#d9dee6'),
    PG([x + w, y + h - 44, x + w + dx, y + h - 44 - dy, x + w + dx, y + h - dy, x + w, y + h], p.dark),
    PG([x, y, ax, ay, x + w, y], p.base),
    R(x, y, w, h, '#f8f6f1'),
    P(waveD(x, y + h - 46, w, 46, 7), p.base),
    emblem(p, ax, y + 30, 13, 'drop'),
    bars(ax, y + 52, [40, 26], 3, p.dark, 0.6),
    bars(ax, y + h - 22, [36], 3, WHITE, 0.85),
  ];
};

SHAPES['dairy/milk-bottle'] = (p, g) => [
  shadow(44),
  P('M114 54V66C114 78 92 86 92 104V204Q92 218 106 218H150Q164 218 164 204V104C164 86 142 78 142 66V54Z', g.cyl(GLASS)),
  P('M116 74C114 86 95 92 95 106V204Q95 215 106 215H150Q161 215 161 204V106C161 92 142 86 140 74Z', g.cyl('#fbfbf8')),
  R(111, 50, 34, 9, g.cyl(lt(GLASS, 0.3)), { rx: 4 }),
  R(110, 36, 36, 16, g.cyl(p.base), { rx: 4 }),
  E(128, 37, 17, 3.5, lt(p.base, 0.3)),
  P('M95 128Q128 134 161 128V178Q128 184 95 178Z', g.cyl(p.base)),
  C(128, 154, 15, CREAM),
  glyph('drop', 128, 154, 1.05, p.base),
  highlight(99, 108, 6, 14),
  highlight(99, 184, 6, 22),
];

SHAPES['dairy/cup'] = (p, g) => [
  shadow(50),
  P('M72 84L90 206Q128 222 166 206L184 84Z', g.cyl(p.base)),
  P('M76 112Q128 124 180 112L174 162Q128 174 82 162Z', g.cyl(CREAM)),
  emblem(p, 128, 138, 12, 'heart'),
  E(128, 84, 58, 14, dk(p.base, 0.25)),
  E(128, 82, 56, 12.5, '#e8edf2'),
  E(128, 82, 42, 8.5, lt(p.base, 0.35)),
  glyph('heart', 128, 82, 0.55, p.base),
  P('M172 80Q186 76 194 64Q184 62 176 72Q172 76 172 80Z', '#d5dce4'),
  highlight(84, 116, 6, 60, 0.28),
];

SHAPES['dairy/tub'] = (p, g) => {
  const clay = '#bd6a3f';
  return [
    shadow(64),
    P('M74 126C54 144 56 186 82 204Q128 226 174 204C200 186 202 144 182 126Z', g.orb(clay)),
    S('M64 158Q128 176 192 158', dk(clay, 0.2), 1.6, { op: 0.45 }),
    S('M70 186Q128 204 186 186', dk(clay, 0.2), 1.6, { op: 0.35 }),
    E(128, 126, 58, 12, dk(clay, 0.18)),
    P('M64 124Q64 102 128 98Q192 102 192 124L188 136Q180 130 172 138Q164 130 156 138Q148 130 140 138Q132 130 124 138Q116 130 108 138Q100 130 92 138Q84 130 76 138L68 134Z', g.cyl(p.base)),
    E(126, 106, 48, 7, lt(p.base, 0.22)),
    S('M66 128Q128 142 190 128', TWINE, 2.6),
    S('M160 136Q166 146 162 154M156 137Q154 147 148 152', TWINE, 2),
  ];
};

SHAPES['dairy/powder-tin'] = (p, g) => [
  shadow(48),
  P(cylSideD(86, 80, 84, 204, 10), g.cyl(p.base)),
  P('M86 196A42 10 0 0 0 170 196V204A42 10 0 0 1 86 204Z', g.cyl(SILVER)),
  P(cylBandD(86, 106, 84, 176, 10), g.cyl(CREAM)),
  P('M86 150Q107 142 128 150T170 150V176A42 10 0 0 1 86 176Z', p.base),
  emblem(p, 128, 128, 14, 'drop'),
  bars(128, 160, [40], 3.4, CREAM, 0.9),
  P('M86 78Q86 56 128 52Q170 56 170 78A42 10 0 0 1 86 78Z', g.cyl('#e9eef3')),
  P(cylSideD(86, 76, 84, 84, 10), g.cyl(SILVER)),
  E(128, 60, 22, 4, WHITE, { op: 0.6 }),
  highlight(92, 110, 6, 60, 0.3),
];

SHAPES['dairy/eggs'] = (p, g) => {
  const tray = lt(p.base, 0.3);
  const egg = (cx, cy, c) => E(cx, cy, 19, 24, g.orb(c));
  return [
    shadow(88, 128, 214),
    P('M46 150Q48 120 70 118H186Q208 120 210 150L214 184H42Z', dk(tray, 0.22)),
    egg(88, 116, '#f3d2a8'),
    egg(128, 112, '#f7ede0'),
    egg(168, 116, '#eec79a'),
    egg(86, 146, '#f7ede0'),
    egg(128, 143, '#eec79a'),
    egg(170, 146, '#f3d2a8'),
    P('M40 184Q40 176 48 176H64A22 15 0 0 1 107 176A22 15 0 0 1 149 176A22 15 0 0 1 192 176H208Q216 176 216 184V202Q216 210 208 210H48Q40 210 40 202Z', g.cyl(tray)),
    S('M107 178V204M149 178V204M64 178V204M192 178V204', dk(tray, 0.25), 1.6, { op: 0.45 }),
    S('M60 166Q70 160 80 162M102 164Q112 158 122 160M146 166Q156 160 166 162', WHITE, 2, { op: 0.35 }),
  ];
};

SHAPES['dairy/butter'] = (p, g) => {
  const butter = '#f7d56e';
  const x = 42;
  const y = 142;
  const w = 130;
  const h = 60;
  const dx = 40;
  const dy = 24;
  const ww = 78;
  // crinkled foil edge along the front (vertical) and the top face (slanted)
  const front = [];
  for (let i = 0; i <= 10; i += 1) front.push([x + ww + (i % 2 ? 4 : -1), y + (h * i) / 10]);
  const top = [];
  for (let i = 8; i >= 0; i -= 1) top.push([x + ww + (dx * i) / 8 + (i % 2 ? 4 : -1), y - (dy * i) / 8]);
  const line = (pts) => 'M' + pts.map(([a, b]) => `${f(a)} ${f(b)}`).join('L');
  return [
    shadow(90, 140, 210),
    box3(x, y, w, h, dx, dy, butter, dk(butter, 0.2), lt(butter, 0.32)),
    S(`M${x + w + 10} ${y - 12}q12 -6 22 0`, dk(butter, 0.18), 2.2, { op: 0.6 }),
    PG([x, y, x + dx, y - dy, ...top.flat()], lt(p.base, 0.2)),
    PG([x, y, ...front.flat(), x, y + h], g.cyl(p.base)),
    S(line(top) + line(front), SILVER, 3),
    E(x + ww / 2, y + h / 2, 27, 19, CREAM),
    emblem(p, x + ww / 2, y + h / 2 - 4, 9, 'crown'),
    bars(x + ww / 2, y + h / 2 + 10, [24], 2.4, p.dark, 0.7),
  ];
};

// ---- frozen ----
const frost = (x, y, s = 1) => glyph('sparkle', x, y, s, WHITE);

SHAPES['frozen/box'] = (p, g) => {
  const x = 58;
  const y = 120;
  const w = 112;
  const h = 90;
  const nug = (cx, cy, rot) => G(tf(cx, cy, rot), P('M-11 -4C-10 -9 2 -10 8 -7C13 -4 12 5 7 8C1 11 -9 9 -11 4C-12 1 -12 -1 -11 -4Z', '#d99a45'), P(dotsD(Math.round(cx), -8, -6, 16, 12, 5, 1), '#b8762f'));
  return [
    shadow(78, 140, 212),
    box3(x, y, w, h, 32, 20, p.base, dk(p.base, 0.24), lt(p.base, 0.45)),
    PG([x + 10, y - 3, x + 30, y - 15, x + w + 22, y - 15, x + w + 2, y - 3], WHITE, { op: 0.35 }),
    labelPanel(g, x + 8, y + 12, 66, 66, 9),
    E(x + 41, y + 58, 28, 9, lt(p.base, 0.3)),
    nug(x + 30, y + 44, -10),
    nug(x + 52, y + 46, 20),
    nug(x + 40, y + 58, 5),
    emblem(p, x + 94, y + 30, 11, 'snow', p.dark),
    bars(x + 94, y + 52, [26, 18], 3, CREAM, 0.85),
    frost(x + 100, y + 76, 0.6),
    frost(x + 86, y + 70, 0.4),
  ];
};

SHAPES['frozen/bag'] = (p, g) => {
  const rand = rng(51);
  const peas = [];
  const carrots = [];
  const corn = [];
  for (let i = 0; i < 12; i += 1) peas.push([106 + rand() * 44, 136 + rand() * 40, 4]);
  for (let i = 0; i < 5; i += 1) carrots.push(d`M${108 + rand() * 38} ${138 + rand() * 36}h6v6h-6Z`);
  for (let i = 0; i < 6; i += 1) corn.push([108 + rand() * 40, 138 + rand() * 38, 2.6]);
  return [
    shadow(54),
    pillowPack(g, p.base, 78, 40, 100, 176, 13),
    P('M80 54H110L80 90Z', WHITE, { op: 0.3 }),
    P('M176 202H146L176 170Z', WHITE, { op: 0.25 }),
    emblem(p, 128, 86, 15, 'snow', CREAM, p.base),
    E(128, 158, 32, 30, '#f2f6f8'),
    P(circlesD(peas), '#6fae45'),
    P(carrots.join(''), '#ee8a2f'),
    P(circlesD(corn), '#f4cd3c'),
    bars(128, 196, [44], 3.4, CREAM, 0.85),
    frost(98, 118, 0.6),
    frost(162, 110, 0.5),
  ];
};

const SCOOPS = ['#f5a6b8', '#bcdc8f', '#f6e6c0', '#f7c35f', '#c8a2de', '#a9e2d3'];
SHAPES['frozen/ice-cream-tub'] = (p, g) => {
  const cream = SCOOPS[p.i];
  return [
    shadow(56),
    E(128, 108, 60, 13, dk(p.base, 0.3)),
    P(bumpyDome(128, 112, 56, 34, 9, 10), g.orb(cream)),
    C(128, 76, 22, g.orb(cream)),
    P(circlesD([[118, 70, 1.8], [132, 64, 1.6], [138, 80, 1.8], [112, 96, 1.8], [150, 100, 1.6], [96, 104, 1.6]]), '#6b3e2a'),
    C(140, 56, 5, '#d8323f'),
    S('M140 51Q142 44 148 42', '#4a7a35', 1.6),
    P('M66 108A62 14 0 0 0 190 108L178 206Q128 222 78 206Z', g.cyl(p.base)),
    S('M68 112A60 12 0 0 0 188 112', lt(p.base, 0.3), 3, { op: 0.7 }),
    P('M72 144Q128 156 184 144L180 176Q128 188 76 176Z', g.cyl(CREAM)),
    emblem(p, 128, 160, 10, 'heart'),
    highlight(80, 118, 6, 70, 0.28),
  ];
};

SHAPES['frozen/ice-cream-cone'] = (p, g) => {
  const cream = SCOOPS[(p.i + 2) % 6];
  const top = SCOOPS[p.i];
  return [
    shadow(22, 128, 221),
    P('M92 102L128 216L164 102Z', '#e0a95a'),
    S('M100 110L140 186M114 104L150 156M128 104L156 128M156 110L116 186M142 104L106 156M128 104L100 128', '#b97d36', 1.6, { op: 0.8 }),
    P('M90 124L164 124L136 212Q128 220 120 212Z', g.cyl(p.base)),
    P('M94 134H162L158 146H98Z', CREAM),
    emblem(p, 128, 170, 10, 'star', CREAM, p.base),
    C(114, 94, 22, g.orb(cream)),
    C(142, 94, 22, g.orb(top)),
    C(128, 70, 24, g.orb(cream)),
    P('M104 72Q110 88 116 80Q120 92 128 84Q136 94 140 82Q146 90 152 74Q148 56 128 50Q108 56 104 72Z', '#6b3e2a'),
    P(circlesD([[116, 64, 1.8], [132, 58, 1.8], [142, 70, 1.8], [124, 76, 1.6]]), '#f7e4b5'),
    C(128, 46, 5.5, '#d8323f'),
    S('M128 41Q129 34 135 32', '#4a7a35', 1.6),
  ];
};

// ===========================================================================
// Fresh: meat, fish (natural colours; the palette shows on tray / plate / tag)
// ===========================================================================
const SKIN = '#f3c29c';
const BONE = '#f6eee0';
const MEAT = '#c9443c';

/** Leaf pointing up from (0,0): two-tone halves with a midrib. */
const leaf = (cx, cy, len, wid, rot, c) =>
  G(
    tf(cx, cy, rot, [wid / 18, len / 30]),
    P('M0 0C-9 -6 -11 -18 0 -30Z', lt(c, 0.12)),
    P('M0 0C9 -6 11 -18 0 -30Z', dk(c, 0.1)),
  );

SHAPES['meat/chicken'] = (p, g) => {
  const leg = (cx, cy, rot) =>
    G(
      tf(cx, cy, rot),
      R(-3.5, -34, 7, 16, BONE, { rx: 3 }),
      P(circlesD([[-4.2, -35, 5.2], [4.2, -35, 5.2]]), BONE),
      P('M-15 12C-17 -4 -6 -16 -3 -22H3C6 -16 17 -4 15 12C14 28 -14 28 -15 12Z', g.orb('#ebb48c')),
    );
  return [
    shadow(88, 128, 212),
    tray(p, 34, 168, 188, 44),
    leg(160, 132, 34),
    P('M50 156C44 122 76 100 116 102C150 100 184 118 186 150C188 180 158 196 118 196C80 196 54 184 50 156Z', g.orb(SKIN)),
    P('M62 160C54 150 58 136 70 134C74 146 80 156 90 162C80 168 68 166 62 160Z', dk(SKIN, 0.1)),
    S('M96 110Q112 104 132 108', WHITE, 5, { op: 0.35 }),
    S('M104 120Q120 150 112 186', dk(SKIN, 0.12), 2, { op: 0.45 }),
    leg(170, 158, 58),
  ];
};

SHAPES['meat/meat-cut'] = (p, g) => {
  const steak = 'M58 144C54 118 82 98 116 100C146 94 184 104 192 130C198 154 180 178 146 180C118 184 62 176 58 144Z';
  return [
    shadow(92, 128, 206),
    plate(p, 128, 170, 100, 28),
    G('translate(0 10)', P(steak, '#98302d')),
    P(steak, g.orb(MEAT)),
    P('M58 144C54 118 82 98 116 100C146 94 184 104 192 130C184 112 150 106 118 110C88 110 66 124 66 146Z', '#f3dcc4'),
    S('M92 140Q110 128 128 138T164 132M88 158Q108 150 124 158T158 154M118 118Q130 124 146 118', '#ec9f97', 2.2, { op: 0.75 }),
    R(160, 150, 40, 12, BONE, { rx: 6, t: 'rotate(28 160 150)' }),
    P(circlesD([[196, 164, 7], [192, 174, 7]]), BONE),
    E(162, 150, 9, 7, '#e9d6bd'),
    E(162, 150, 4.5, 3.5, '#c98a6a'),
  ];
};

SHAPES['meat/drumstick'] = (p, g) => {
  const stick = (cx, cy, rot) =>
    G(
      tf(cx, cy, rot),
      R(-4.5, -56, 9, 30, BONE, { rx: 4 }),
      P(circlesD([[-5.5, -58, 6.5], [5.5, -58, 6.5]]), BONE),
      P('M-22 18C-25 -6 -9 -24 -4 -32H4C9 -24 25 -6 22 18C20 40 -20 40 -22 18Z', g.orb('#f0b690')),
      E(-9, 4, 4, 11, WHITE, { op: 0.3 }),
    );
  return [
    shadow(84, 128, 208),
    plate(p, 128, 176, 96, 26),
    stick(104, 146, -50),
    stick(152, 150, 42),
    leaf(92, 182, 22, 14, -70, LEAF),
    leaf(98, 188, 18, 12, -110, LEAF_DARK),
  ];
};

SHAPES['meat/mince'] = (p, g) => {
  const rand = rng(77);
  let light = '';
  let dark = '';
  for (let i = 0; i < 44; i += 1) {
    const a = rand() * Math.PI;
    const rr = Math.sqrt(rand()) * 0.9;
    const x = 128 + Math.cos(a) * 70 * rr;
    const y = 164 - Math.sin(a) * 48 * rr;
    const seg = d`M${x} ${y}q2 -3 4 0t4 0`;
    if (i % 3) light += seg;
    else dark += seg;
  }
  return [
    shadow(90, 128, 210),
    tray(p, 34, 152, 188, 56),
    P(bumpyDome(128, 170, 78, 56, 22, 7), g.orb('#d3564d')),
    S(light, '#ee9d93', 2.2, { op: 0.95 }),
    S(dark, '#9f3733', 2.2, { op: 0.55 }),
    P('M34 158H222L216 166H40Z', WHITE, { op: 0.2 }),
  ];
};

// ---- fish ----
const FIN = '#d97f6d';
const fishBody = (g, scaleSeed) => {
  const rand = rng(scaleSeed);
  let scales = '';
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 7; i += 1) {
      const x = 82 + i * 12 + (row % 2) * 6 + rand();
      const y = 118 + row * 12;
      scales += d`M${x} ${y}q4 5 8 0`;
    }
  }
  return [
    P('M100 104Q120 78 150 104Z', FIN),
    P('M112 158Q122 180 140 158Z', FIN),
    P('M36 134C52 102 108 90 152 106C166 111 178 120 186 126L212 102Q222 97 222 108L214 132L222 156Q222 167 212 162L186 138C176 146 166 153 152 158C108 174 52 166 36 134Z', g.vert('#72889a', '#eef2f4')),
    P('M186 126L212 102Q222 97 222 108L214 132L222 156Q222 167 212 162L186 138Z', FIN, { op: 0.55 }),
    P('M44 132C70 124 120 124 176 130C130 138 80 142 44 136Z', '#f1b9a1', { op: 0.35 }),
    S(scales, WHITE, 1.3, { op: 0.4 }),
    S('M70 110Q84 134 70 158', '#5c6f7e', 2, { op: 0.45 }),
    P('M82 140Q98 148 92 162Q84 154 80 146Z', FIN, { op: 0.85 }),
    C(54, 126, 6.5, WHITE),
    C(55, 126, 3.4, '#1f2533'),
    S('M37 136Q42 138 46 136', '#5c6f7e', 1.6),
  ];
};

SHAPES['fish/fish'] = (p, g) => [
  shadow(96, 128, 204),
  plate(p, 128, 166, 104, 26),
  G('translate(0 12)', fishBody(g, 5)),
];

SHAPES['fish/shrimp'] = (p, g) => {
  const PRAWN = '#f28a5b';
  const shrimp = (cx, cy, s, flip) =>
    G(
      tf(cx, cy, 0, flip ? [-s, s] : s),
      S('M66 -14Q58 -52 6 -58M64 -12Q72 -46 34 -64', '#e07a4f', 1.4),
      S('M30 -8L25 5M40 -6L37 7M50 -2L49 10M20 -9L13 2', '#e98a63', 2),
      P('M-34 34L-52 42Q-47 51 -38 49L-31 41L-26 52Q-17 50 -16 41L-24 26Z', '#e8683f'),
      P('M72 -10C58 -26 30 -34 0 -32C-28 -30 -48 -18 -50 2C-51 16 -44 28 -34 34L-24 26C-32 18 -32 6 -24 -2C-14 -12 10 -12 30 -8C46 -4 58 4 72 6Z', g.orb(PRAWN)),
      P('M72 -10C66 -18 56 -24 44 -28C42 -18 42 -8 44 -4C54 0 62 4 72 6Z', dk(PRAWN, 0.08)),
      S('M24 -30Q20 -20 24 -9M4 -32Q2 -22 6 -11M-16 -29Q-12 -18 -10 -8M-34 -21Q-26 -12 -22 -4M-46 -3Q-38 0 -31 4M-48 14Q-40 14 -32 12', dk(PRAWN, 0.2), 1.6, { op: 0.6 }),
      S('M-8 -27Q-30 -22 -40 -6', WHITE, 2.2, { op: 0.4 }),
      P('M72 -10L86 -15L72 -3Z', dk(PRAWN, 0.1)),
      C(60, -12, 2.8, '#2b2f3a'),
    );
  return [
    shadow(86, 128, 208),
    plate(p, 128, 178, 96, 24),
    shrimp(106, 134, 1.05, false),
    shrimp(150, 156, 1.05, true),
    G(tf(184, 188, -10), E(0, 0, 15, 8.5, '#f6e27a'), E(0, 0, 12, 6.2, '#fbf1b8'), S('M-8 0H8M0 -5V5M-6 -4L6 4M-6 4L6 -4', '#f1d860', 1.2)),
  ];
};

SHAPES['fish/fish-steak'] = (p, g) => {
  const SLICE = 'M0 -22C14 -22 26 -12 26 2C26 14 16 22 6 22L0 12L-6 22C-16 22 -26 14 -26 2C-26 -12 -14 -22 0 -22Z';
  const slice = (cx, cy, rot) =>
    G(
      tf(cx, cy, rot, [1.55, 1.2]),
      G('translate(0 5)', P(SLICE, '#c48f7b')),
      P(SLICE, '#7d91a2'),
      G('scale(0.84)', P(SLICE, g.orb('#f6d0bb'))),
      S('M-14 0Q-16 -12 -4 -14M14 0Q16 -12 4 -14M-10 8Q-12 2 -8 -2M10 8Q12 2 8 -2', '#e3a38c', 1.2, { op: 0.8 }),
      C(0, -4, 4.4, BONE),
      C(0, -4, 1.8, '#d8b7a6'),
    );
  return [
    shadow(92, 128, 212),
    tray(p, 34, 156, 188, 54),
    slice(90, 146, -10),
    slice(166, 142, 10),
    slice(128, 176, 0),
  ];
};

SHAPES['fish/dried-fish'] = (p, g) => {
  const dry = (cx, cy, rot, c) =>
    G(
      tf(cx, cy, rot),
      P('M-20 -15L-6 -24L14 -15Z', dk(c, 0.15)),
      P('M-82 0C-70 -14 -30 -18 20 -13C40 -11 54 -6 62 -3L80 -16Q84 -6 76 0Q84 6 80 16L62 3C54 6 40 11 20 13C-30 18 -70 14 -82 0Z', g.cylV(c)),
      P('M-82 0C-70 -14 -30 -18 20 -13C40 -11 54 -6 62 -3C30 -6 -30 -6 -82 0Z', dk(c, 0.18)),
      S('M-58 2C-20 0 20 0 56 1', lt(c, 0.35), 2, { op: 0.7 }),
      S('M-60 -12Q-54 0 -60 11', dk(c, 0.3), 1.6, { op: 0.6 }),
      S('M-40 7H-28M-18 8H-6M4 8H16M26 7H38', dk(c, 0.22), 1.3, { op: 0.45 }),
      C(-70, -3, 2.6, '#3e2718'),
    );
  return [
    shadow(92, 128, 208),
    dry(120, 116, -10, '#c9975c'),
    dry(128, 150, 0, '#d8aa6c'),
    dry(136, 184, 10, '#c18c55'),
    R(190, 118, 12, 80, p.base, { rx: 5, t: 'rotate(6 196 158)' }),
    R(192, 118, 4, 80, lt(p.base, 0.3), { rx: 2, t: 'rotate(6 196 158)' }),
    S('M198 196Q208 206 202 216', p.dark, 2.6),
  ];
};

// ===========================================================================
// Vegetables (natural colours; the palette shows on the price tag or band)
// ===========================================================================
/** Rubber band / tie in the palette colour (w×h centred on cx, cy, rotated). */
const band = (p, cx, cy, w, h, rot = 0) =>
  G(tf(cx, cy, rot), R(-w / 2, -h / 2, w, h, p.base, { rx: h / 2.4 }), R(-w / 2, -h / 2, w, h * 0.36, lt(p.base, 0.3), { rx: h / 5 }));

const potato = (g, cx, cy, s, rot) =>
  G(
    tf(cx, cy, rot, s),
    P('M-30 -4C-32 -18 -14 -24 2 -22C20 -21 32 -12 31 2C30 16 16 22 -2 22C-20 22 -29 10 -30 -4Z', g.orb('#caa066')),
    P(circlesD([[-14, -8, 1.9], [10, -12, 1.6], [17, 7, 1.9], [-6, 10, 1.5]]), '#96703f'),
    P(circlesD([[-21, 3, 0.9], [3, -3, 0.9], [22, -4, 0.8], [-1, 16, 0.8], [9, 14, 0.9], [-12, -16, 0.8]]), '#ad834f', { op: 0.8 }),
  );
SHAPES['vegetables/potato'] = (p, g) => [
  shadow(78),
  potato(g, 94, 150, 1.35, -14),
  potato(g, 164, 146, 1.3, 18),
  potato(g, 128, 184, 1.5, 4),
  tag(p, 200, 204),
];

const onion = (g, cx, cy, s, c = '#c4566d') =>
  G(
    tf(cx, cy, 0, s),
    S('M-6 29Q-7 36 -11 39M0 30V39M6 29Q7 36 11 39', '#b69572', 1.5),
    P('M0 -34C4 -26 8 -22 18 -16C30 -9 33 6 26 16C19 26 8 30 0 30C-8 30 -19 26 -26 16C-33 6 -30 -9 -18 -16C-8 -22 -4 -26 0 -34Z', g.orb(c)),
    S('M-4 -28C-18 -14 -21 12 -8 28M4 -28C18 -14 21 12 8 28M0 -30V29', lt(c, 0.4), 1.4, { op: 0.55 }),
    P('M-2.5 -32L-4 -44Q0 -47 3.5 -44L2.5 -32Z', '#b98c5c'),
  );
SHAPES['vegetables/onion'] = (p, g) => [
  shadow(74),
  onion(g, 96, 146, 1.45),
  onion(g, 160, 142, 1.4, '#b94d64'),
  onion(g, 128, 174, 1.55),
  tag(p, 200, 204),
];

const tomato = (g, cx, cy, s) =>
  G(
    tf(cx, cy, 0, s),
    P('M-30 0C-30 -18 -16 -24 0 -21C16 -24 30 -18 30 0C30 18 16 26 0 26C-16 26 -30 18 -30 0Z', g.orb('#e3453a')),
    S('M-12 -19Q-18 -4 -14 8M12 -19Q18 -4 14 8', dk('#e3453a', 0.12), 1.5, { op: 0.35 }),
    E(-15, -7, 4.5, 8, WHITE, { op: 0.32, t: 'rotate(-35 -15 -7)' }),
    G('translate(0 -19) scale(1 0.55)', PG(starPts(0, 0, 13, 4.2, 5), '#3e8c3a')),
    R(-1.6, -28, 3.2, 9, '#3a7331', { rx: 1.6 }),
  );
SHAPES['vegetables/tomato'] = (p, g) => [
  shadow(76),
  tomato(g, 96, 142, 1.55),
  tomato(g, 162, 148, 1.45),
  tomato(g, 128, 178, 1.6),
  tag(p, 200, 204),
];

const chiliPod = (g, cx, cy, rot, s, c) =>
  G(
    tf(cx, cy, rot, s),
    P('M-48 -8C-20 -12 10 -8 30 2C44 9 52 18 56 30C46 22 32 16 16 14C-10 10 -34 8 -48 6Q-54 -1 -48 -8Z', g.cylV(c)),
    S('M-40 -5C-20 -8 4 -5 20 1', WHITE, 2.2, { op: 0.35 }),
    P('M-46 -8Q-58 -8 -58 -1Q-58 6 -46 6Q-50 -1 -46 -8Z', '#4a7a2b'),
    S('M-57 -1Q-66 -2 -71 -11', '#4a7a2b', 3.2),
  );
SHAPES['vegetables/chili'] = (p, g) => [
  shadow(80),
  chiliPod(g, 132, 116, -18, 1.25, '#3f9e3c'),
  chiliPod(g, 124, 150, -6, 1.3, '#d63a2b'),
  chiliPod(g, 136, 184, 8, 1.25, '#358f35'),
  tag(p, 206, 206),
];

const carrot = (g, cx, cy, rot) =>
  G(
    tf(cx, cy, rot),
    S('M0 -40Q-8 -62 -20 -74M0 -40Q1 -64 3 -84M0 -40Q9 -60 22 -70', '#4f9d3a', 3.4),
    P(ellD(-20, -74, 9, 4, 60) + ellD(3, -84, 9, 4, 90) + ellD(22, -70, 9, 4, 120) + ellD(-11, -60, 8, 3.6, 60) + ellD(12, -58, 8, 3.6, 120) + ellD(-3, -68, 7, 3.4, 80), '#5aa843'),
    P('M-16 -40Q0 -47 16 -40C15 -10 6 22 0 48C-6 22 -15 -10 -16 -40Z', g.cyl('#f07f2c')),
    S('M-11 -24H-3M4 -12H10M-8 2H-2M2 16H6M-4 30H-1', dk('#f07f2c', 0.25), 1.6, { op: 0.6 }),
  );
SHAPES['vegetables/carrot'] = (p, g) => [
  shadow(56, 128, 222),
  carrot(g, 106, 164, 14),
  carrot(g, 150, 164, -14),
  carrot(g, 128, 170, 0),
  band(p, 128, 128, 44, 11),
];

SHAPES['vegetables/leafy'] = (p, g) => {
  const big = (cx, cy, rot, s, c) =>
    G(tf(cx, cy, rot, s), P('M0 0C-26 -14 -30 -58 0 -92C30 -58 26 -14 0 0Z', lt(c, 0.1)), P('M0 0C26 -14 30 -58 0 -92Z', dk(c, 0.1)), S('M0 -4V-84M0 -30L-12 -44M0 -50L-12 -64M0 -30L12 -44M0 -50L12 -64', lt(c, 0.45), 1.6, { op: 0.8 }));
  return [
    shadow(44, 128, 222),
    S('M110 170L122 216M146 170L134 216M128 168V216M118 172L126 216M138 172L130 216', '#b8d98c', 5),
    big(104, 160, -34, 1.05, '#3f8f35'),
    big(154, 160, 34, 1.05, '#3a8a31'),
    big(116, 156, -12, 1.2, '#4fa23f'),
    big(142, 156, 14, 1.15, '#459a39'),
    big(128, 156, 0, 1.25, '#58ac47'),
    band(p, 128, 186, 36, 12),
  ];
};

const eggplant = (g, cx, cy, rot, s) =>
  G(
    tf(cx, cy, rot, s),
    P('M-14 -26C0 -34 16 -26 20 -8C26 12 30 34 18 44C6 54 -14 46 -20 26C-26 8 -28 -18 -14 -26Z', g.orb('#6f3c93')),
    E(-10, 6, 3.5, 14, WHITE, { op: 0.28, t: 'rotate(-10 -10 6)' }),
    P('M-18 -22C-12 -34 12 -34 18 -22L11 -17L5 -25L0 -15L-5 -25L-11 -17Z', '#4f8f3a'),
    R(-3, -44, 6, 14, '#5b8a3a', { rx: 3 }),
  );
SHAPES['vegetables/eggplant'] = (p, g) => [
  shadow(70),
  eggplant(g, 104, 140, -24, 1.35),
  eggplant(g, 152, 150, 20, 1.45),
  tag(p, 202, 206),
];

SHAPES['vegetables/gourd'] = (p, g) => [
  shadow(84, 128, 206),
  G(
    tf(128, 146, -28),
    P('M-90 -7C-90 -15 -80 -17 -64 -15C-40 -13 -24 -24 10 -30C52 -36 92 -24 94 0C96 26 56 36 12 30C-22 26 -40 13 -64 15C-80 17 -90 5 -90 -7Z', g.cylV('#a5cf66')),
    P(dotsD(12, -60, -20, 140, 36, 18, 1.8), lt('#a5cf66', 0.4), { op: 0.9 }),
    S('M-50 -10C-20 -16 20 -24 60 -20', WHITE, 4, { op: 0.3 }),
    R(-102, -10, 14, 7, '#7c8c3a', { rx: 3 }),
    S('M-100 -6Q-110 -14 -106 -24', '#6f7f33', 2),
  ),
  tag(p, 196, 206),
];

SHAPES['vegetables/cauliflower'] = (p, g) => {
  const cream = '#f3ebd6';
  const florets = [
    [104, 108, 16], [128, 98, 17], [152, 108, 16], [92, 128, 15], [116, 122, 17], [140, 122, 17], [164, 128, 15], [128, 138, 16],
  ];
  return [
    shadow(78),
    big2(78, 172, -46, 0.85),
    big2(178, 172, 46, 0.85),
    P(bumpyEllipse(128, 124, 62, 42, 16, 12), g.orb(cream)),
    florets.map(([x, y, r]) => C(x, y, r, g.orb(cream))).join(''),
    P(circlesD(florets.map(([x, y]) => [x - 4, y - 4, 2.2])), WHITE, { op: 0.7 }),
    big2(96, 208, -34, 0.82),
    big2(160, 208, 34, 0.82),
    big2(128, 214, 0, 0.72),
    tag(p, 206, 208),
  ];
};
/** Broad leaf with pale veins (cauliflower / cabbage wrapper leaves). */
function big2(cx, cy, rot, s) {
  return G(
    tf(cx, cy, rot, s),
    P('M0 0C-34 -12 -40 -60 0 -84C40 -60 34 -12 0 0Z', '#4f9a45'),
    P('M0 0C34 -12 40 -60 0 -84Z', '#3f843a'),
    S('M0 -6V-76M0 -28L-16 -44M0 -48L-14 -62M0 -28L16 -44M0 -48L14 -62', '#cfe5b8', 2.2, { op: 0.85 }),
  );
}

SHAPES['vegetables/pumpkin'] = (p, g) => [
  shadow(80),
  E(96, 150, 40, 58, '#e27a24'),
  E(160, 150, 40, 58, '#d06a1d'),
  E(110, 152, 36, 62, '#f28f33'),
  E(146, 152, 36, 62, '#e47d27'),
  E(128, 152, 30, 64, g.cyl('#f59a3a')),
  S('M100 112Q92 150 100 190M156 112Q164 150 156 190', dk('#e27a24', 0.2), 2, { op: 0.35 }),
  E(114, 122, 6, 16, WHITE, { op: 0.2, t: 'rotate(15 114 122)' }),
  P('M122 92Q120 74 128 62Q136 60 136 66Q130 76 132 92Z', '#6b7a33'),
  S('M136 70Q150 58 160 66Q166 74 158 78', '#6b8f3a', 2.2),
  leaf(150, 94, 26, 20, 70, LEAF),
  tag(p, 204, 206),
];

const cucumber = (g, cx, cy, rot, s = 1) =>
  G(
    tf(cx, cy, rot, s),
    P('M-70 -13C-40 -19 40 -19 70 -11C81 -7 81 8 70 12C40 19 -40 19 -70 13C-81 8 -81 -8 -70 -13Z', g.cylV('#3f8c3a')),
    S('M-60 -6C-20 -10 20 -10 60 -5M-56 5C-20 8 20 8 58 5', '#78b86a', 2, { op: 0.5 }),
    P(dotsD(4, -64, -12, 128, 22, 9, 1.2), '#a8d49a', { op: 0.8 }),
    E(76, 0, 3, 5, '#c9dc8a'),
  );
const cucSlice = (cx, cy) => E(cx, cy + 3, 21, 12, '#2f7331') + E(cx, cy, 21, 12, '#3f8c3a') + E(cx, cy, 18, 10, '#dff0b8') + E(cx, cy, 10, 5.5, '#c3e08e') + P(circlesD([[cx - 5, cy - 1, 1.2], [cx, cy - 2.5, 1.2], [cx + 5, cy - 1, 1.2], [cx - 2, cy + 2, 1.2], [cx + 3, cy + 2, 1.2]]), '#f4f8df');
SHAPES['vegetables/cucumber'] = (p, g) => [
  shadow(84),
  cucumber(g, 132, 124, -22, 1.05),
  cucumber(g, 126, 158, -12, 1.1),
  cucSlice(84, 196),
  cucSlice(126, 204),
  tag(p, 196, 206),
];

const garlicBulb = (g, cx, cy, s) =>
  G(
    tf(cx, cy, 0, s),
    S('M-8 31Q-6 37 -11 41M0 32V41M8 31Q6 37 11 41', '#bca78a', 1.4),
    P('M0 -40C4 -30 10 -26 22 -20C36 -12 38 8 30 20C22 30 10 32 0 32C-10 32 -22 30 -30 20C-38 8 -36 -12 -22 -20C-10 -26 -4 -30 0 -40Z', g.orb('#f0e6d6')),
    S('M-12 -20C-25 -6 -23 16 -10 30M12 -20C25 -6 23 16 10 30M0 -26V31', '#d6c3ae', 1.6),
    S('M-22 -8Q-28 6 -20 20M22 -8Q28 6 20 20', '#b98aa6', 1.6, { op: 0.6 }),
    P('M-3 -38L-2 -52Q0 -54 2 -52L3 -38Z', '#d8c9b1'),
  );
SHAPES['vegetables/garlic'] = (p, g) => [
  shadow(70),
  garlicBulb(g, 102, 142, 1.35),
  garlicBulb(g, 150, 156, 1.45),
  G(tf(76, 202, -20), P('M-12 6C-12 -6 0 -14 12 -12C5 -6 3 4 5 12C-2 14 -12 12 -12 6Z', g.orb('#efe3d0'))),
  tag(p, 202, 206),
];

SHAPES['vegetables/ginger'] = (p, g) => {
  const body = ellD(-30, 6, 28, 16, -8) + ellD(6, 0, 32, 18, 4) + ellD(34, -18, 16, 11, -40) + ellD(42, 14, 17, 11, 28) + ellD(-12, -18, 13, 9, -60) + ellD(14, -26, 11, 8, -80);
  return [
    shadow(82),
    G(
      tf(124, 150, -8, 1.45),
      P(body, g.orb('#d9a65f')),
      S('M-40 -2Q-38 8 -40 18M-14 -6Q-12 6 -14 16M18 -8Q20 4 18 14M30 -24L38 -12M36 8L46 18', dk('#d9a65f', 0.25), 1.3, { op: 0.6 }),
      E(-56, 7, 5, 11, '#f2d27a'),
      E(-56, 7, 3, 7, '#f7e3a1'),
    ),
    tag(p, 204, 206),
  ];
};

const lime = (g, cx, cy, s, rot) =>
  G(
    tf(cx, cy, rot, s),
    P('M-32 0C-28 -18 -12 -24 4 -22C20 -20 30 -12 34 -4L40 0L34 4C30 12 20 20 4 22C-12 24 -28 18 -32 0Z', g.orb('#86c33f')),
    P(dotsD(21, -24, -14, 50, 28, 12, 0.8), '#6ea930', { op: 0.7 }),
    E(-12, -9, 8, 3.5, WHITE, { op: 0.35 }),
  );
SHAPES['vegetables/lemon'] = (p, g) => [
  shadow(78),
  lime(g, 104, 142, 1.5, -18),
  G(
    tf(154, 170, 0, 1.3),
    E(0, 3, 30, 25, '#5f9a2c'),
    E(0, 0, 30, 25, '#7fbd3c'),
    E(0, 0, 26, 21.5, '#f4f8d8'),
    E(0, 0, 23.5, 19, '#d8ec8c'),
    S('M0 -19V19M-23 0H23M-16 -13L16 13M-16 13L16 -13', '#f4f8d8', 2),
    C(0, 0, 3, '#f4f8d8'),
  ),
  tag(p, 204, 208),
];

SHAPES['vegetables/beans'] = (p, g) => {
  const pod = (dy, rot, c) =>
    G(tf(128, 150 + dy, rot), P('M-72 -4C-40 -8 30 -8 70 -2Q77 0 70 4C30 9 -40 9 -72 5Q-78 0 -72 -4Z', g.cylV(c)), S('M-50 -3C-20 -5 20 -5 50 -2', WHITE, 1.6, { op: 0.3 }), S('M70 0Q80 2 84 -4', '#4a7a2b', 1.6));
  return [
    shadow(84),
    G(
      'rotate(-30 128 150)',
      pod(-24, -3, '#5aa845'),
      pod(-12, 2, '#4f9c3d'),
      pod(0, -1, '#62b04b'),
      pod(12, 3, '#56a342'),
      pod(24, -2, '#4c983b'),
      band(p, 128, 150, 14, 66, 0),
    ),
    tag(p, 204, 206),
  ];
};

// ===========================================================================
// Fruits (natural colours; the palette shows on the price tag or plate)
// ===========================================================================
/** Parallel lines clipped to an ellipse (pineapple / basket texture). */
const hatchEllipse = (cx, cy, rx, ry, deg, gap, inset = 0.94) => {
  const a = (deg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  let out = '';
  const span = Math.max(rx, ry);
  for (let k = -span + gap / 2; k <= span; k += gap) {
    const A = (dx / rx) ** 2 + (dy / ry) ** 2;
    const B = 2 * ((nx * k * dx) / rx ** 2 + (ny * k * dy) / ry ** 2);
    const Cc = ((nx * k) / rx) ** 2 + ((ny * k) / ry) ** 2 - inset ** 2;
    const disc = B * B - 4 * A * Cc;
    if (disc <= 0) continue;
    const t1 = (-B - Math.sqrt(disc)) / (2 * A);
    const t2 = (-B + Math.sqrt(disc)) / (2 * A);
    out += d`M${cx + nx * k + dx * t1} ${cy + ny * k + dy * t1}L${cx + nx * k + dx * t2} ${cy + ny * k + dy * t2}`;
  }
  return out;
};

const apple = (g, cx, cy, s, c, withLeaf = true) =>
  G(
    tf(cx, cy, 0, s),
    P('M0 -18C-6 -24 -30 -26 -32 -2C-33 18 -18 32 -8 32C-4 32 -2 30 0 30C2 30 4 32 8 32C18 32 33 18 32 -2C30 -26 6 -24 0 -18Z', g.orb(c)),
    S('M0 -18Q1 -28 5 -33', '#6b4226', 3),
    withLeaf ? P(ellD(13, -28, 10, 4.6, -25), LEAF) + S('M5 -26L20 -31', LEAF_DARK, 1, { op: 0.6 }) : '',
    E(-16, -6, 4, 9, WHITE, { op: 0.32, t: 'rotate(-20 -16 -6)' }),
  );
SHAPES['fruits/apple'] = (p, g) => [
  shadow(74),
  apple(g, 160, 140, 1.4, '#a3c83f', false),
  apple(g, 110, 158, 1.75, '#d9363a'),
  tag(p, 200, 206),
];

SHAPES['fruits/banana'] = (p, g) => {
  const banana = (rot, c) =>
    G(
      tf(66, 104, rot),
      P('M0 -9C24 18 80 26 114 -8L119 -3C94 42 28 42 -4 9Z', g.orb(c)),
      S('M12 4C38 22 78 22 106 2', lt(c, 0.4), 2, { op: 0.8 }),
      P('M114 -8L121 -10L120 -3L117 -2Z', '#5a4526'),
    );
  return [
    shadow(72, 128, 214),
    banana(12, '#f2c43a'),
    banana(26, '#f6cf46'),
    banana(40, '#f2c43a'),
    banana(54, '#f7d552'),
    G(tf(66, 104, 34), R(-18, -8, 24, 16, '#8a9a3c', { rx: 6 }), R(-25, -5, 9, 10, '#5a5a2a', { rx: 2 })),
    tag(p, 204, 208),
  ];
};

SHAPES['fruits/orange'] = (p, g) => [
  shadow(76),
  C(106, 146, 46, g.orb('#f6921f')),
  P(dotsD(31, 76, 112, 60, 64, 16, 1), '#e07d10', { op: 0.6 }),
  E(90, 128, 7, 12, WHITE, { op: 0.3, t: 'rotate(-35 90 128)' }),
  C(106, 102, 3.5, '#6b7a33'),
  leaf(108, 102, 26, 16, 55, LEAF),
  G(
    tf(166, 184),
    E(0, 5, 36, 22, '#e57d12'),
    E(0, 0, 36, 22, '#f7a33a'),
    E(0, 0, 32, 19, '#fff0cf'),
    E(0, 0, 29, 16.5, '#ffb13f'),
    S('M0 -16V16M-28 0H28M-21 -12L21 12M-21 12L21 -12', '#fff0cf', 1.8),
    E(0, 0, 3.5, 2.2, '#fff0cf'),
  ),
  tag(p, 206, 212),
];

const mango = (g, cx, cy, s, rot) =>
  G(
    tf(cx, cy, rot, s),
    P('M-30 6C-36 -14 -18 -32 4 -30C26 -28 36 -10 32 8C28 26 8 34 -8 30C-20 27 -27 18 -30 6Z', g.orb('#f7b52c')),
    P('M4 -30C26 -28 36 -10 32 8C28 -6 16 -18 -2 -20Z', '#ef6a3a', { op: 0.7 }),
    E(-14, -8, 4, 9, WHITE, { op: 0.3, t: 'rotate(-30 -14 -8)' }),
    R(-2, -36, 4, 8, '#6b5a2a', { rx: 2 }),
  );
SHAPES['fruits/mango'] = (p, g) => [
  shadow(76),
  mango(g, 156, 138, 1.4, 24),
  mango(g, 108, 162, 1.6, -12),
  leaf(106, 112, 40, 20, 62, LEAF),
  leaf(104, 110, 34, 18, 18, LEAF_DARK),
  tag(p, 202, 208),
];

SHAPES['fruits/grapes'] = (p, g) => {
  const pos = [
    [100, 96], [126, 92], [152, 98], [88, 120], [114, 118], [140, 118], [164, 122], [100, 144], [126, 142], [152, 146], [112, 168], [138, 168], [126, 190],
  ];
  return [
    shadow(52),
    S('M128 90Q126 70 138 58', '#6b4a2a', 4),
    leaf(140, 70, 44, 32, 60, LEAF),
    pos.map(([x, y]) => C(x, y, 15, g.orb('#7b3b93'))).join(''),
    P(circlesD(pos.map(([x, y]) => [x - 5, y - 5, 2.6])), WHITE, { op: 0.45 }),
    tag(p, 198, 206),
  ];
};

SHAPES['fruits/watermelon'] = (p, g) => [
  shadow(84),
  E(106, 140, 66, 52, g.orb('#3f9440')),
  S('M106 90Q56 140 106 190M106 90Q81 140 106 190M106 90V190M106 90Q131 140 106 190M106 90Q156 140 106 190', '#276b2c', 6, { op: 0.8 }),
  E(84, 116, 10, 16, WHITE, { op: 0.18, t: 'rotate(-35 84 116)' }),
  G(
    tf(170, 212, 8),
    P('M-44 -4Q0 10 44 -4L46 4Q0 20 -46 4Z', '#3f9440'),
    P('M-42 -8Q0 6 42 -8L44 -4Q0 10 -44 -4Z', '#eaf5d5'),
    P('M0 -84L-42 -8Q0 6 42 -8Z', g.orb('#ef4a52')),
    P('M-10 -40q2 -6 4 0q-2 3 -4 0ZM8 -46q2 -6 4 0q-2 3 -4 0ZM-18 -22q2 -6 4 0q-2 3 -4 0ZM2 -24q2 -6 4 0q-2 3 -4 0ZM18 -20q2 -6 4 0q-2 3 -4 0ZM-2 -62q2 -6 4 0q-2 3 -4 0Z', '#2b2f3a'),
  ),
  tag(p, 62, 206, 16),
];

SHAPES['fruits/guava'] = (p, g) => {
  const guava = (cx, cy, s) =>
    G(
      tf(cx, cy, 0, s),
      P('M0 -30C18 -30 31 -16 31 2C31 20 17 31 0 31C-17 31 -31 20 -31 2C-31 -16 -18 -30 0 -30Z', g.orb('#a9d055')),
      P(dotsD(41, -20, -16, 40, 36, 10, 1), '#8dba3e', { op: 0.8 }),
      R(-2, -37, 4, 9, '#6b5a2a', { rx: 2 }),
      E(-13, -9, 4, 8, WHITE, { op: 0.3, t: 'rotate(-30 -13 -9)' }),
    );
  return [
    shadow(78),
    guava(104, 142, 1.5),
    leaf(108, 98, 34, 18, 50, LEAF),
    G(
      tf(166, 184),
      E(0, 5, 34, 22, '#86b53e'),
      E(0, 0, 34, 22, '#a9d055'),
      E(0, 0, 30, 19, '#fbd9d0'),
      E(0, 0, 18, 11, '#f58f84'),
      P(circlesD([[-8, -2, 1.6], [-3, -5, 1.6], [3, -5, 1.6], [8, -2, 1.6], [6, 3, 1.6], [0, 5, 1.6], [-6, 3, 1.6]]), '#fff1d6'),
    ),
    tag(p, 206, 212),
  ];
};

SHAPES['fruits/pineapple'] = (p, g) => {
  const crown = [-44, -26, -10, 8, 24, 40].map((a, i) =>
    G(tf(128, 108, a, [1, i % 2 ? 1 : 1.15]), P('M0 0C-6 -20 -4 -40 0 -58C4 -40 6 -20 0 0Z', i % 2 ? '#3e8a35' : '#52a340')),
  );
  return [
    shadow(56),
    crown,
    E(128, 160, 46, 58, g.orb('#eaa93a')),
    S(hatchEllipse(128, 160, 46, 58, 45, 16) + hatchEllipse(128, 160, 46, 58, -45, 16), '#c9812a', 1.8, { op: 0.8 }),
    P(dotsD(61, 96, 116, 64, 88, 20, 1.4), '#fbd77a', { op: 0.8 }),
    E(108, 136, 7, 18, WHITE, { op: 0.2, t: 'rotate(-20 108 136)' }),
    tag(p, 196, 208),
  ];
};

SHAPES['fruits/papaya'] = (p, g) => [
  shadow(84),
  G(
    tf(112, 132, -30),
    P('M-70 0C-70 -22 -40 -30 0 -32C44 -34 72 -20 72 0C72 20 44 34 0 32C-40 30 -70 22 -70 0Z', g.orb('#f2b53a')),
    P('M-70 0C-70 -22 -40 -30 -10 -31C-30 -20 -34 20 -10 31C-40 30 -70 22 -70 0Z', '#86b843', { op: 0.75 }),
    R(-80, -4, 12, 8, '#7c7a3a', { rx: 3 }),
  ),
  G(
    tf(160, 180, -8),
    P('M-58 0C-58 -18 -30 -26 0 -26C34 -26 58 -16 58 0C58 16 34 26 0 26C-30 26 -58 18 -58 0Z', '#8fbf45'),
    P('M-54 0C-54 -15 -28 -22 0 -22C31 -22 54 -13 54 0C54 13 31 22 0 22C-28 22 -54 15 -54 0Z', '#f7893b'),
    P('M-30 0C-30 -8 -12 -11 4 -11C22 -11 34 -6 34 0C34 6 22 11 4 11C-12 11 -30 8 -30 0Z', '#f36a2a'),
    P(circlesD([[-22, 0, 3], [-14, -4, 3], [-14, 4, 3], [-6, -6, 3], [-6, 1, 3], [-6, 7, 2.8], [2, -5, 3], [2, 3, 3], [10, -4, 3], [10, 4, 3], [18, 0, 3], [24, -3, 2.6]]), '#2b2f3a'),
    P(circlesD([[-15, -5, 0.9], [-7, -7, 0.9], [1, -6, 0.9], [9, -5, 0.9]]), WHITE, { op: 0.6 }),
  ),
  tag(p, 208, 214),
];

SHAPES['fruits/pomegranate'] = (p, g) => [
  shadow(78),
  PG([98, 104, 94, 88, 104, 96, 110, 84, 116, 96, 126, 88, 122, 104], '#a3283a'),
  C(110, 148, 46, g.orb('#c9313f')),
  E(92, 128, 7, 13, WHITE, { op: 0.28, t: 'rotate(-35 92 128)' }),
  G(
    tf(166, 186),
    E(0, 5, 34, 22, '#9e2433'),
    E(0, 0, 34, 22, '#c9313f'),
    E(0, 0, 30, 19, '#f6e3cf'),
    P(circlesD([[-18, -2, 4.2], [-10, -8, 4.2], [-2, -10, 4.2], [8, -9, 4.2], [16, -4, 4.2], [-14, 6, 4.2], [-5, 2, 4.2], [4, 0, 4.2], [13, 4, 4.2], [-6, 11, 4], [4, 10, 4], [20, 3, 3.6]]), '#e23a4c'),
    P(circlesD([[-19, -4, 1.2], [-11, -10, 1.2], [-3, -12, 1.2], [7, -11, 1.2], [-15, 4, 1.2], [-6, 0, 1.2], [3, -2, 1.2], [12, 2, 1.2]]), WHITE, { op: 0.6 }),
  ),
  tag(p, 206, 212),
];

SHAPES['fruits/dates'] = (p, g) => {
  const date = (cx, cy, rot) => G(tf(cx, cy, rot), P(ellD(0, 0, 20, 11.5, 0), g.orb('#8a4424')), S('M-12 -3Q-4 -6 4 -3M-8 4Q0 1 10 4', '#5e2a14', 1.4, { op: 0.7 }), E(-8, -5, 6, 2.2, WHITE, { op: 0.3 }));
  return [
    shadow(92, 128, 210),
    plate(p, 128, 184, 96, 26),
    G(
      about(134, 178, 1.3),
      date(96, 170, -10),
      date(138, 168, 8),
      date(176, 176, -18),
      date(112, 186, 14),
      date(154, 190, -6),
      date(118, 156, 30),
      date(150, 152, -24),
    ),
  ];
};

SHAPES['fruits/lychee'] = (p, g) => {
  const lychee = (cx, cy, r) =>
    P(bumpyEllipse(cx, cy, r, r, 13, r * 0.3), g.orb('#d63f4e')) + P(dotsD(Math.round(cx * cy), cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2, 6, 1.2), '#a92c3b', { op: 0.8 });
  return [
    shadow(78),
    S('M128 64Q120 90 104 110M128 64Q138 92 156 108M128 64Q128 100 128 126', '#6b4a2a', 3),
    leaf(128, 66, 38, 20, -60, LEAF),
    leaf(128, 66, 36, 18, 40, LEAF_DARK),
    lychee(100, 128, 24),
    lychee(158, 126, 23),
    lychee(128, 152, 26),
    G(tf(166, 188), P('M-26 4C-26 -8 -16 -14 -8 -14L0 -4L8 -14C16 -14 26 -8 26 4C26 14 14 20 0 20C-14 20 -26 14 -26 4Z', '#c53848'), E(0, -4, 17, 18, g.orb('#f4efe4')), E(-6, -10, 4, 6, WHITE, { op: 0.6 })),
    tag(p, 206, 212),
  ];
};

const pear = (g, cx, cy, s, rot, c) =>
  G(
    tf(cx, cy, rot, s),
    P('M0 -40C8 -40 12 -30 14 -18C16 -8 30 0 30 18C30 36 16 44 0 44C-16 44 -30 36 -30 18C-30 0 -16 -8 -14 -18C-12 -30 -8 -40 0 -40Z', g.orb(c)),
    E(-12, 10, 4, 11, WHITE, { op: 0.28, t: 'rotate(-15 -12 10)' }),
    S('M0 -40Q2 -48 7 -52', '#6b4226', 3),
  );
SHAPES['fruits/pear'] = (p, g) => [
  shadow(72),
  pear(g, 158, 138, 1.35, 16, '#b9cd4c'),
  pear(g, 110, 150, 1.6, -8, '#d3d652'),
  leaf(116, 84, 30, 18, 55, LEAF),
  tag(p, 202, 208),
];

SHAPES['fruits/coconut'] = (p, g) => {
  const rand = rng(91);
  let fibre = '';
  for (let i = 0; i < 26; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * 32;
    const x = 104 + Math.cos(a) * r;
    const y = 144 + Math.sin(a) * r * 0.95;
    fibre += d`M${x} ${y}l${(rand() - 0.5) * 10} ${4 + rand() * 5}`;
  }
  return [
    shadow(78),
    C(104, 144, 46, g.orb('#8a5733')),
    S(fibre, '#b07a4c', 1.6, { op: 0.8 }),
    P(circlesD([[92, 112, 4], [104, 106, 4], [98, 120, 4]]), '#4a2c1a'),
    G(
      tf(166, 186),
      E(0, 6, 36, 24, '#6f4428'),
      E(0, 0, 36, 22, '#8a5733'),
      E(0, 0, 31, 18.5, '#fbf8f0'),
      E(0, 1, 24, 13, '#e8e1d2'),
      E(0, 2, 20, 10, '#f4f1e8'),
    ),
    tag(p, 206, 212),
  ];
};

SHAPES['fruits/dragon-fruit'] = (p, g) => {
  const flap = (x, y, rot, s = 1) => G(tf(x, y, rot, s), P('M0 0C-6 -6 -6 -14 0 -20C6 -14 6 -6 0 0Z', '#e8568f'), P('M0 -20C3 -16 4 -12 3 -9L0 -13L-3 -9C-4 -12 -3 -16 0 -20Z', '#8cc63f'));
  return [
    shadow(80),
    G(tf(104, 140, -20, 1.2), P(ellD(0, 0, 44, 36, 0), g.orb('#e2447f')), flap(0, -30, 0, 1.1), flap(-24, -18, -40), flap(24, -18, 40), flap(-30, 8, -80), flap(30, 8, 80), flap(-12, 4, -20), flap(12, 12, 25), flap(46, -4, 95)),
    G(
      tf(168, 186),
      E(0, 5, 34, 22, '#c23269'),
      E(0, 0, 34, 22, '#e2447f'),
      E(0, 0, 30, 19, '#f7f4ee'),
      P(dotsD(71, -24, -12, 48, 24, 18, 1.2), '#2b2f3a'),
    ),
    tag(p, 206, 212),
  ];
};

// ===========================================================================
// Bakery, noodles & other groceries
// ===========================================================================
const CRUST = '#c9894a';
const CRUMB = '#f6e3bb';

// ---- bakery ----
SHAPES['bakery/bread'] = (p, g) => [
  shadow(88, 128, 210),
  P('M42 196V146C42 118 58 102 84 102C98 90 116 88 130 96C144 88 164 90 176 102C200 104 214 120 214 146V196Q214 204 206 204H50Q42 204 42 196Z', g.orb(CRUST)),
  S('M84 108Q92 122 88 138M130 100Q136 116 132 132M176 108Q184 122 180 138', dk(CRUST, 0.25), 3, { op: 0.6 }),
  E(98, 114, 16, 5, WHITE, { op: 0.2, t: 'rotate(-20 98 114)' }),
  R(146, 96, 30, 108, p.base),
  R(146, 96, 30, 108, g.cyl(p.base)),
  C(161, 150, 10, CREAM),
  glyph('wheat', 161, 150, 0.75, p.base),
  G(
    tf(70, 176, -8),
    P('M-30 30V-8C-40 -12 -40 -30 -26 -38C-16 -44 -6 -45 0 -44C6 -45 16 -44 26 -38C40 -30 40 -12 30 -8V30Z', CRUST),
    P('M-25 26V-10C-33 -14 -33 -28 -22 -34C-14 -39 -6 -40 0 -39C6 -40 14 -39 22 -34C33 -28 33 -14 25 -10V26Z', CRUMB),
    P(dotsD(81, -20, -30, 40, 52, 16, 1), '#e8cf9e'),
  ),
];

SHAPES['bakery/bun'] = (p, g) => {
  const bun = (cx, cy, s) =>
    G(
      tf(cx, cy, 0, s),
      P('M-40 8Q-42 20 -30 22H30Q42 20 40 8Z', '#f1c67e'),
      P('M-41 8C-41 -20 -20 -30 0 -30C20 -30 41 -20 41 8Z', g.orb('#d58c3c')),
      P(ellD(-18, -12, 2.8, 1.3, -20) + ellD(-4, -20, 2.8, 1.3, 10) + ellD(12, -14, 2.8, 1.3, 40) + ellD(22, -4, 2.8, 1.3, -30) + ellD(-26, 0, 2.8, 1.3, 30) + ellD(2, -6, 2.8, 1.3, -50) + ellD(-12, 2, 2.8, 1.3, 20) + ellD(16, 4, 2.8, 1.3, 70), '#fbeccb'),
      E(-18, -16, 10, 4, WHITE, { op: 0.25, t: 'rotate(-20 -18 -16)' }),
    );
  return [
    shadow(88, 128, 210),
    plate(p, 128, 184, 96, 22),
    bun(92, 150, 1.05),
    bun(164, 150, 1.05),
    bun(128, 172, 1.2),
  ];
};

SHAPES['bakery/cake'] = (p, g) => [
  shadow(80, 128, 212),
  E(128, 198, 92, 20, dk(p.base, 0.15)),
  E(128, 194, 92, 20, p.base),
  P(cylSideD(56, 120, 144, 186, 18), g.cyl('#f0c98a')),
  P('M56 150A72 18 0 0 0 200 150V160A72 18 0 0 1 56 160Z', '#fbf3e6'),
  P('M56 118A72 18 0 0 0 200 118V132Q192 146 186 132Q178 150 170 136Q160 154 150 138Q140 156 130 140Q118 156 110 138Q100 152 92 136Q82 150 76 134Q68 146 62 132Q58 140 56 132Z', '#6b3e2a'),
  E(128, 118, 72, 18, '#7a4731'),
  P(circlesD([[80, 116, 7], [104, 108, 7], [128, 106, 7], [152, 108, 7], [176, 116, 7], [96, 126, 7], [128, 128, 7], [160, 126, 7]]), '#fbf3e6'),
  C(128, 102, 8, g.orb('#d8323f')),
  S('M128 94Q130 84 138 80', '#4a7a35', 2),
  C(98, 116, 5.5, g.orb('#d8323f')),
  C(158, 116, 5.5, g.orb('#d8323f')),
];

SHAPES['bakery/croissant'] = (p, g) => {
  // seven rolled segments along a crescent, tips first so the middle sits on top
  const segs = [
    [204, 19, 12, '#c98434'],
    [336, 19, 12, '#c98434'],
    [226, 28, 18, '#d8973f'],
    [314, 28, 18, '#d8973f'],
    [248, 35, 22, '#e4a64c'],
    [292, 35, 22, '#e4a64c'],
    [270, 40, 26, '#eeb65c'],
  ];
  return [
    shadow(88, 128, 212),
    plate(p, 128, 196, 90, 20),
    segs.map(([a, ry, rx, c]) => {
      const t = (a * Math.PI) / 180;
      return G(
        tf(128 + Math.cos(t) * 80, 202 + Math.sin(t) * 80, a - 270),
        P(ellD(0, 0, ry, rx, 90), g.orb(c)),
        S(d`M${-rx * 0.62} ${-ry * 0.55}Q0 ${-ry * 0.2} ${rx * 0.62} ${-ry * 0.55}`, dk(c, 0.22), 1.8, { op: 0.55 }),
      );
    }),
    E(116, 104, 9, 4, WHITE, { op: 0.35, t: 'rotate(-12 116 104)' }),
  ];
};

SHAPES['bakery/toast'] = (p, g) => {
  const slice = (x) =>
    P(d`M${x} 196V148C${x - 5} 146 ${x - 5} 134 ${x + 2} 130C${x + 8} 126 ${x + 20} 126 ${x + 26} 130C${x + 33} 134 ${x + 33} 146 ${x + 28} 148V196Z`, '#d99a52') +
    P(d`M${x + 3} 196V150C${x} 148 ${x} 138 ${x + 5} 135C${x + 10} 132 ${x + 18} 132 ${x + 23} 135C${x + 28} 138 ${x + 28} 148 ${x + 25} 150V196Z`, '#eec07a');
  return [
    shadow(72, 128, 214),
    P('M56 86Q56 76 66 76H190Q200 76 200 86V204Q200 212 192 212H64Q56 212 56 204Z', g.cyl(p.base)),
    R(56, 76, 144, 14, dk(p.base, 0.15), { rx: 6 }),
    R(68, 120, 120, 82, '#f6efe2', { rx: 10 }),
    slice(76),
    slice(104),
    slice(132),
    slice(160),
    emblem(p, 128, 102, 11, 'wheat', CREAM, p.base),
    bars(94, 100, [24], 3, CREAM, 0.8),
    bars(162, 100, [24], 3, CREAM, 0.8),
    highlight(62, 94, 5, 100, 0.25),
  ];
};

SHAPES['bakery/cookies'] = (p, g) => {
  const cookie = (cx, cy, c = '#d7a05a') =>
    disc(cx, cy, 42, 13, 9, dk(c, 0.2), c) +
    E(cx, cy, 34, 9.5, lt(c, 0.08)) +
    P(ellD(cx - 16, cy - 2, 4.5, 2.4, 10) + ellD(cx + 6, cy - 5, 4.5, 2.4, -20) + ellD(cx + 20, cy + 2, 4.5, 2.4, 30) + ellD(cx - 4, cy + 5, 4.5, 2.4, 0) + ellD(cx + 26, cy - 5, 3.5, 2, 0) + ellD(cx - 28, cy + 4, 3.5, 2, 0), '#5a3726');
  return [
    shadow(80, 128, 212),
    E(128, 200, 92, 18, dk(p.base, 0.12)),
    E(128, 196, 92, 18, p.base),
    cookie(128, 170),
    cookie(124, 150, '#dcaa66'),
    cookie(132, 130),
    cookie(126, 110, '#dcaa66'),
    G(tf(190, 176, 64), disc(0, 0, 30, 9, 7, '#b27f40', '#d7a05a'), P(ellD(-8, 0, 3.5, 2, 0) + ellD(8, -2, 3.5, 2, 0), '#5a3726')),
  ];
};

// ---- noodles ----
const noodleBowl = (cx, cy, s, bowl) =>
  G(
    tf(cx, cy, 0, s),
    S('M-12 -30Q-16 -38 -12 -44M0 -30Q-4 -38 0 -44M12 -30Q8 -38 12 -44', WHITE, 2, { op: 0.6 }),
    L(10, -26, 34, -46, '#b98553', 3),
    L(16, -24, 40, -42, '#b98553', 3),
    E(0, -14, 30, 7, '#f1c24f'),
    S('M-24 -15q4 -6 8 0t8 0t8 0t8 0t8 0M-20 -11q4 -5 8 0t8 0t8 0t8 0', '#d99a2b', 1.6),
    P('M-31 -14H31A31 24 0 0 1 -31 -14Z', bowl),
  );

SHAPES['noodles/noodle-pack'] = (p, g) => [
  shadow(84, 128, 206),
  P(crimpD(38, 88, 180, 12, 20), dk(p.base, 0.14)),
  P(crimpD(38, 182, 180, 12, 20, false), dk(p.base, 0.14)),
  P('M40 100Q34 142 40 182H216Q222 142 216 100Z', g.cylV(p.base)),
  E(150, 142, 46, 34, CREAM),
  noodleBowl(150, 150, 1.1, p.dark),
  emblem(p, 80, 128, 15, 'flame', p.accent, p.deep),
  bars(80, 152, [44, 30], 3.6, CREAM, 0.9),
  highlight(46, 106, 120, 4, 0.25),
];

SHAPES['noodles/noodle-cup'] = (p, g) => [
  shadow(52),
  P('M70 86L88 206Q128 222 168 206L186 86Z', g.cyl(p.base)),
  P('M74 112Q128 124 182 112L176 164Q128 176 80 164Z', g.cyl(CREAM)),
  emblem(p, 128, 138, 12, 'flame'),
  E(128, 86, 58, 14, dk(p.base, 0.3)),
  E(128, 85, 52, 11, '#f1c24f'),
  S('M84 84q5 -6 10 0t10 0t10 0t10 0t10 0t10 0t10 0M90 90q5 -5 10 0t10 0t10 0t10 0t10 0t10 0', '#d99a2b', 1.8),
  P('M128 71Q164 64 188 50L200 76Q176 92 136 90Z', '#e6ebf1'),
  P('M136 90Q176 92 200 76L204 82Q180 98 138 96Z', '#c3ccd6'),
  L(116, 80, 142, 36, SILVER, 4),
  S('M136 44L144 30M140 46L150 34M144 48L154 38', SILVER, 2),
  highlight(82, 114, 6, 60, 0.28),
];

/** Penne tube with slanted cut ends. */
const penne = (cx, cy, rot, s = 1) =>
  G(tf(cx, cy, rot, s), P('M-13 -7L15 -9L11 7L-17 9Z', '#f0c45a'), E(-15, 1, 2.6, 7.6, '#c9952f', { t: 'rotate(14 -15 1)' }), S('M-9 -4L11 -6M-11 3L9 1', '#d9a53a', 1.3));

SHAPES['noodles/pasta'] = (p, g) => [
  shadow(56),
  P('M88 46H168Q174 46 174 52V210Q174 216 168 216H88Q82 216 82 210V52Q82 46 88 46Z', g.cyl(p.base)),
  R(82, 46, 92, 12, dk(p.base, 0.15), { rx: 6 }),
  emblem(p, 128, 82, 13, 'wheat', p.accent, p.deep),
  bars(128, 104, [48], 3.4, CREAM, 0.85),
  R(94, 118, 68, 78, '#f7eedb', { rx: 12 }),
  penne(112, 134, -30),
  penne(142, 132, -30),
  penne(108, 160, -30),
  penne(140, 158, -30),
  penne(116, 184, -30),
  penne(146, 182, -30),
  penne(70, 208, 20, 1.1),
  penne(190, 206, -24, 1.1),
  highlight(88, 64, 6, 44, 0.26),
];

SHAPES['noodles/soup-packet'] = (p, g) => [
  shadow(64, 128, 214),
  G(
    'rotate(-8 128 132)',
    P(crimpD(66, 44, 124, 12, 14), dk(p.base, 0.14)),
    P(crimpD(66, 196, 124, 12, 14, false), dk(p.base, 0.14)),
    R(66, 56, 124, 140, g.cyl(p.base)),
    E(128, 132, 44, 38, CREAM),
    S('M112 110q-5 -8 0 -16M128 108q-5 -8 0 -16M144 110q-5 -8 0 -16', dk(CREAM, 0.3), 2.2),
    E(128, 126, 32, 7, '#e7a33c'),
    P(circlesD([[118, 126, 2.4], [132, 124, 2.4], [140, 128, 2]]), '#7cae4a'),
    P(circlesD([[124, 128, 2], [146, 124, 1.8]]), '#ef8a2f'),
    P('M96 126H160A32 26 0 0 1 96 126Z', p.dark),
    emblem(p, 128, 80, 11, 'leaf', p.accent, p.deep),
    bars(128, 176, [56, 36], 3.6, CREAM, 0.9),
  ),
];

// ---- others ----
SHAPES['others/honey-jar'] = (p, g) => {
  const honey = '#f0a62a';
  return [
    shadow(56),
    P('M92 98Q82 104 82 118V204Q82 218 96 218H160Q174 218 174 204V118Q174 104 164 98Z', g.orb(honey)),
    R(88, 64, 80, 36, g.cyl(p.base), { rx: 7 }),
    R(88, 64, 80, 7, lt(p.base, 0.25), { rx: 3.5 }),
    P('M88 94H168V104Q164 112 158 104Q152 116 146 104Q140 112 134 104Q128 114 122 104Q116 112 110 104Q104 116 98 104Q92 112 88 104Z', honey),
    P('M82 134Q128 142 174 134V188Q128 196 82 188Z', g.cyl(CREAM)),
    PG(ngon(128, 160, 16, 6, 0), p.base),
    PG(ngon(128, 160, 10, 6, 0), p.accent),
    S('M112 160H144', CREAM, 1),
    E(94, 124, 5, 8, WHITE, { op: 0.4 }),
    highlight(90, 196, 6, 12, 0.35),
    G(tf(182, 176, 24), R(-4, -60, 8, 70, WOOD, { rx: 4 }), P('M-14 10Q-14 0 0 0Q14 0 14 10V26Q14 36 0 36Q-14 36 -14 26Z', '#c8904f'), S('M-14 12H14M-14 20H14M-14 28H14', '#9a6a36', 2)),
  ];
};

SHAPES['others/sauce-bottle'] = (p, g) => {
  const sauce = '#c9302a';
  return [
    shadow(42),
    P('M104 46C90 48 88 60 88 80V170C88 186 102 196 110 200H146C154 196 168 186 168 170V80C168 60 166 48 152 46Z', g.cyl(sauce)),
    R(104, 196, 48, 24, g.cyl(p.base), { rx: 5 }),
    R(100, 194, 56, 7, g.cyl(p.dark), { rx: 3.5 }),
    P('M88 96Q128 102 168 96V160Q128 166 88 160Z', g.cyl(CREAM)),
    G(tf(128, 126, 0, 1.05), P('M-16 0C-16 -10 -8 -14 0 -12C8 -14 16 -10 16 0C16 10 8 15 0 15C-8 15 -16 10 -16 0Z', '#e3453a'), G('translate(0 -11) scale(1 0.5)', PG(starPts(0, 0, 9, 3, 5), '#3e8c3a'))),
    bars(128, 146, [40, 26], 3.2, p.dark, 0.75),
    highlight(94, 58, 6, 34, 0.35),
    highlight(94, 166, 6, 14, 0.3),
  ];
};

SHAPES['others/jam-jar'] = (p, g) => {
  const jam = '#b4263b';
  const checks = [];
  for (let i = 0; i < 6; i += 1) checks.push(d`M${86 + i * 16} 64h8v8h-8ZM${94 + i * 16} 72h8v8h-8ZM${86 + i * 16} 80h8v8h-8Z`);
  return [
    shadow(52),
    P('M94 96Q86 100 86 110V204Q86 218 100 218H156Q170 218 170 204V110Q170 100 162 96Z', g.cyl(jam)),
    P(dotsD(29, 94, 104, 68, 26, 8, 2), '#8e1c2e'),
    P('M78 66Q128 52 178 66L184 96Q176 104 168 98Q160 106 152 98Q144 106 136 98Q128 106 120 98Q112 106 104 98Q96 106 88 98Q80 104 72 96Z', g.cyl(p.base)),
    P(checks.join(''), WHITE, { op: 0.35 }),
    S('M80 92Q128 102 176 92', TWINE, 3),
    S('M150 98Q156 110 150 118M146 99Q144 110 138 116', TWINE, 2.2),
    P('M86 132Q128 138 170 132V190Q128 196 86 190Z', g.cyl(CREAM)),
    G(tf(128, 158, 0, 1.2), P('M0 -8C-10 -14 -16 -4 -12 4C-8 12 0 16 0 16C0 16 8 12 12 4C16 -4 10 -14 0 -8Z', '#d8323f'), P(circlesD([[-5, -2, 0.9], [4, -2, 0.9], [-2, 5, 0.9], [5, 6, 0.9]]), '#fbe7a1'), P('M-6 -10L0 -6L6 -10L3 -13H-3Z', '#3e8c3a')),
    highlight(92, 112, 6, 14, 0.3),
    highlight(92, 196, 6, 12, 0.3),
  ];
};

SHAPES['others/cereal-box'] = (p, g) => {
  const x = 72;
  const y = 58;
  const w = 88;
  const h = 160;
  const flakes = (cx, cy, n, seed) => {
    const rand = rng(seed);
    let out = '';
    for (let i = 0; i < n; i += 1) out += ellD(cx + (rand() - 0.5) * 50, cy + (rand() - 0.5) * 14, 6, 3.6, rand() * 180);
    return out;
  };
  return [
    shadow(66, 136),
    box3(x, y, w, h, 24, 14, p.base, dk(p.base, 0.24), lt(p.base, 0.25)),
    emblem(p, x + w / 2, y + 30, 15, 'sparkle', p.accent, p.deep),
    bars(x + w / 2, y + 54, [56, 38], 3.6, CREAM, 0.9),
    E(x + w / 2, y + 108, 38, 30, lt(p.base, 0.3)),
    E(x + w / 2, y + 104, 30, 7, '#f8f4ea'),
    P(flakes(x + w / 2, y + 100, 9, 3), '#e9b24a'),
    P(d`M${x + w / 2 - 31} ${y + 104}H${x + w / 2 + 31}A31 24 0 0 1 ${x + w / 2 - 31} ${y + 104}Z`, CREAM),
    R(x, y + h - 12, w, 5, p.accent, { op: 0.9 }),
    P(flakes(200, 212, 3, 9), '#e9b24a'),
  ];
};

SHAPES['others/semai'] = (p, g) => {
  const rand = rng(63);
  let strands = '';
  for (let i = 0; i < 9; i += 1) {
    const r = 10 + rand() * 20;
    const a = rand() * Math.PI * 2;
    strands += d`M${128 + Math.cos(a) * r} ${146 + Math.sin(a) * r * 0.8}a${r} ${r * 0.8} 0 1 1 ${-Math.cos(a) * r * 1.6} ${-Math.sin(a) * r * 1.2}`;
  }
  return [
    shadow(54),
    P('M84 64Q84 48 100 46H156Q172 48 172 64V206Q172 216 162 216H94Q84 216 84 206Z', g.cyl(p.base)),
    R(84, 46, 88, 12, dk(p.base, 0.15), { rx: 6 }),
    C(128, 146, 38, '#f7ecd4'),
    C(128, 146, 30, '#e8b25a'),
    S(strands, '#c98a35', 1.4),
    S(strands.replace(/M(\d+)/g, (m, x) => `M${Number(x) + 3}`), '#f6d58c', 1.2, { op: 0.9 }),
    glyph('moon', 110, 82, 1.1, p.accent),
    glyph('star', 124, 76, 0.45, p.accent),
    bars(146, 82, [30, 20], 3.2, CREAM, 0.85),
    bars(128, 196, [50], 3.6, CREAM, 0.85),
    highlight(90, 70, 6, 50, 0.25),
  ];
};

SHAPES['others/nuts'] = (p, g) => {
  const cashew = (cx, cy, rot) => G(tf(cx, cy, rot), P('M-12 -8C-4 -14 10 -12 14 -2C16 6 12 12 6 12C4 6 0 2 -6 2C-12 2 -16 -4 -12 -8Z', g.orb('#f1d7a4')));
  const almond = (cx, cy, rot) => G(tf(cx, cy, rot), P('M0 -14C8 -8 10 4 6 10C3 14 -3 14 -6 10C-10 4 -8 -8 0 -14Z', g.orb('#b8733d')), S('M-2 -8Q-4 0 -2 8M3 -6Q2 2 3 8', '#8e5427', 1, { op: 0.6 }));
  return [
    shadow(92, 128, 210),
    plate(p, 128, 184, 96, 26),
    G(
      about(128, 180, 1.35),
      cashew(94, 172, 10),
      almond(120, 168, 70),
      cashew(150, 170, -30),
      almond(176, 176, -60),
      cashew(118, 190, 40),
      almond(146, 190, 20),
      cashew(82, 188, -20),
      cashew(170, 192, 60),
      almond(104, 154, -30),
      cashew(134, 152, 20),
      almond(160, 154, 50),
      cashew(128, 136, -10),
    ),
  ];
};

SHAPES['others/pickle-jar'] = (p, g) => {
  const oil = '#c2621f';
  return [
    shadow(48),
    P('M96 88Q88 92 88 102V204Q88 218 102 218H154Q168 218 168 204V102Q168 92 160 88Z', g.cyl(oil)),
    P(ellD(104, 110, 9, 6, 20) + ellD(150, 104, 9, 6, -30) + ellD(120, 200, 10, 6, 10) + ellD(148, 196, 9, 6, -20) + ellD(100, 192, 7, 5, 40), '#f0a54a'),
    G(tf(130, 102, 30), P('M-14 -2C-6 -5 6 -4 14 2C8 3 -6 3 -14 -2Z', '#d8323f')),
    R(92, 56, 72, 34, g.cyl(p.base), { rx: 6 }),
    R(92, 56, 72, 6, lt(p.base, 0.25), { rx: 3 }),
    R(92, 84, 72, 6, dk(p.base, 0.2), { rx: 2 }),
    P('M88 124Q128 130 168 124V178Q128 184 88 178Z', g.cyl(CREAM)),
    G(tf(128, 146, -20, 1.2), P('M-9 7C-2 8 6 3 8.5 -5C9 -7 7.6 -8.2 6.4 -6.4C3.5 -1 -1.5 3 -9 3.5Z', '#d8323f'), P('M5.6 -6.2L7.6 -8.8L9.8 -9.4L8.6 -7.2Z', LEAF)),
    bars(128, 162, [40, 26], 3.2, p.dark, 0.75),
    highlight(94, 100, 6, 16, 0.3),
    highlight(94, 186, 6, 20, 0.3),
  ];
};

SHAPES['others/jaggery'] = (p, g) => {
  const gur = '#a0602a';
  const cake = (cx, cy, s) =>
    G(tf(cx, cy, 0, s), P('M-34 0C-34 -16 -18 -24 0 -24C18 -24 34 -16 34 0V8A34 12 0 0 1 -34 8Z', g.orb(gur)), P(dotsD(Math.round(cx), -24, -18, 48, 22, 7, 1.2), dk(gur, 0.2)), E(-12, -14, 9, 3.5, WHITE, { op: 0.18 }));
  return [
    shadow(92, 128, 210),
    plate(p, 128, 186, 96, 24),
    cake(96, 168, 1),
    cake(160, 168, 1),
    cake(128, 150, 1.05),
    cake(128, 118, 0.95),
    G(tf(184, 196, 12), PG([-10, -6, 8, -9, 12, 4, -6, 8], '#b57232'), PG([-10, -6, 8, -9, 2, -12, -12, -10], lt(gur, 0.2))),
  ];
};

SHAPES['others/puffed-rice'] = (p, g) => {
  const muri = '#f3e7cc';
  const rand = rng(99);
  const puffs = [];
  for (let i = 0; i < 30; i += 1) puffs.push(ellD(80 + rand() * 96, 92 + rand() * 116, 4.6, 3, rand() * 180));
  return [
    shadow(62),
    P('M106 66L96 42Q104 38 112 44Q118 36 128 42Q138 36 144 44Q152 38 160 42L150 66Z', '#e9eef3', { op: 0.9 }),
    P('M108 72C80 78 70 96 70 120C68 150 68 180 72 204Q74 216 88 216H168Q182 216 184 204C188 180 188 150 186 120C186 96 176 78 148 72Z', g.orb(muri)),
    P(puffs.join(''), '#e2cfa6', { op: 0.9 }),
    R(106, 64, 44, 10, g.cyl(p.base), { rx: 5 }),
    R(92, 132, 72, 50, g.cyl(p.base), { rx: 10 }),
    emblem(p, 128, 150, 12, 'grain', CREAM, p.base),
    bars(128, 170, [36], 3, CREAM, 0.85),
    highlight(80, 110, 6, 80, 0.5),
  ];
};

// ===========================================================================
// Cosmetics, personal care & baby
// ===========================================================================
const GOLD = '#e2b24f';
const LIPS = ['#c0283a', '#e0574f', '#d9467a', '#a7604f', '#8e2f5a', '#c94b6d'];

// ---- cosmetics ----
SHAPES['cosmetics/lipstick'] = (p, g) => [
  shadow(66, 132),
  P('M114 106V78Q114 70 122 66L140 58Q146 56 146 62V106Z', g.cyl(LIPS[p.i])),
  P('M116 80L144 66V74L116 88Z', WHITE, { op: 0.18 }),
  R(110, 104, 40, 30, g.cyl(GOLD), { rx: 2 }),
  P(cylSideD(104, 132, 52, 212, 5), g.cyl(p.base)),
  R(104, 132, 52, 8, g.cyl(GOLD)),
  R(104, 200, 52, 4, GOLD, { op: 0.9 }),
  highlight(109, 146, 5, 48, 0.4),
  G(
    tf(186, 196, -90),
    P(cylSideD(-26, -34, 52, 30, 5), g.cyl(p.base)),
    R(-26, 22, 52, 6, g.cyl(GOLD)),
  ),
];

SHAPES['cosmetics/cream-jar'] = (p, g) => [
  shadow(76),
  G(tf(176, 120, 18), E(0, 0, 40, 38, dk(p.base, 0.15)), E(-3, 0, 36, 34, g.orb(p.base)), E(-3, 0, 20, 19, lt(p.base, 0.2))),
  P(cylSideD(64, 150, 128, 206, 14), g.cyl(CREAM)),
  P(cylBandD(64, 166, 128, 190, 14), g.cyl(p.base)),
  E(128, 150, 64, 14, '#e9e2d6'),
  E(128, 151, 56, 11, '#fbf9f4'),
  P('M104 150Q108 132 128 130Q146 132 148 144Q138 138 128 142Q118 146 104 150Z', '#f1ece4'),
  E(96, 186, 12, 3, WHITE, { op: 0.3 }),
  glyph('sparkle', 128, 178, 0.7, CREAM),
];

SHAPES['cosmetics/lotion'] = (p, g) => [
  shadow(40),
  P('M124 36H154Q160 36 160 42V46H124Z', g.cyl(STEEL)),
  R(122, 36, 8, 26, g.cyl(SILVER), { rx: 3 }),
  R(114, 54, 28, 16, g.cyl(p.dark), { rx: 3 }),
  R(118, 64, 20, 10, g.cyl(SILVER)),
  P('M104 86Q104 72 116 72H140Q152 72 152 86V206Q152 218 140 218H116Q104 218 104 206Z', g.cyl(p.base)),
  labelPanel(g, 108, 112, 40, 72, 8),
  glyph('flower', 128, 136, 0.9, p.base),
  C(128, 136, 3, p.accent),
  bars(128, 158, [26, 18], 2.8, p.dark, 0.7),
  highlight(108, 86, 5, 20, 0.35),
];

SHAPES['cosmetics/compact'] = (p, g) => [
  shadow(80, 128, 212),
  G(tf(128, 138, 0, [1, 1]), E(0, -22, 72, 56, dk(p.base, 0.15)), E(0, -24, 66, 50, g.orb(p.base)), E(0, -24, 54, 40, g.vert('#e8f0f6', '#a9bccb')), P('M-30 -52L-10 -60L-40 -2L-50 -14Z', WHITE, { op: 0.45 })),
  P('M56 170A72 26 0 0 0 200 170V182A72 26 0 0 1 56 182Z', dk(p.base, 0.2)),
  E(128, 170, 72, 26, p.base),
  E(128, 170, 58, 19, GOLD),
  E(128, 170, 54, 17, '#e8bf98'),
  E(116, 166, 22, 7, '#f1d0ae'),
  E(150, 174, 22, 9, '#fbf3ea'),
  E(150, 172, 16, 5.5, WHITE),
];

SHAPES['cosmetics/tube'] = (p, g) => [
  shadow(36),
  P('M86 58H170L148 190H108Z', g.cyl(p.base)),
  P(crimpD(84, 44, 88, 16, 10), dk(p.base, 0.15)),
  S('M90 50H166M90 55H166', dk(p.base, 0.3), 1, { op: 0.4 }),
  P('M92 92H164L156 150H100Z', g.cyl(CREAM)),
  glyph('leaf', 128, 114, 1.1, p.base),
  bars(128, 134, [34, 22], 3, p.dark, 0.7),
  R(106, 188, 44, 30, g.cyl(p.dark), { rx: 4 }),
  S('M113 192V214M120 192V214M127 192V214M134 192V214M141 192V214', WHITE, 1.2, { op: 0.2 }),
  highlight(96, 66, 5, 70, 0.3),
];

SHAPES['cosmetics/hair-oil'] = (p, g) => {
  const oil = '#f3c24a';
  return [
    shadow(50),
    P('M114 64V74C114 84 86 88 86 104V204Q86 218 100 218H156Q170 218 170 204V104C170 88 142 84 142 74V64Z', g.cyl(lt(GLASS, 0.1))),
    P('M114 92C100 96 89 100 89 110V204Q89 215 100 215H156Q167 215 167 204V110C167 100 156 96 142 92Z', g.cyl(oil)),
    R(110, 38, 36, 28, g.cyl(p.base), { rx: 5 }),
    R(110, 58, 36, 6, dk(p.base, 0.2), { rx: 2 }),
    P('M86 128Q128 134 170 128V186Q128 192 86 186Z', g.cyl(p.base)),
    C(128, 156, 18, CREAM),
    G(tf(128, 158), C(0, 0, 10, '#8a5733'), C(0, -1, 7, '#fbf8f0'), C(0, -1, 4.5, '#e9e2d4')),
    leaf(128, 142, 16, 10, -40, LEAF),
    highlight(92, 110, 6, 14, 0.4),
    highlight(92, 192, 6, 16, 0.35),
  ];
};

SHAPES['cosmetics/kajal'] = (p, g) => {
  const stick = (cx, open) =>
    G(
      tf(cx, 0),
      open
        ? P('M-9 92L-2 64Q0 60 2 64L9 92Z', '#2c2f38') + S('M-4 86L-1 68', WHITE, 1.4, { op: 0.35 }) + R(-11, 90, 22, 8, g.cyl(GOLD))
        : P(cylSideD(-11, 60, 22, 96, 3), g.cyl(p.dark)) + R(-11, 90, 22, 6, g.cyl(GOLD)),
      P(cylSideD(-11, 96, 22, 212, 3), g.cyl(p.base)),
      R(-11, 190, 22, 4, GOLD, { op: 0.9 }),
      highlight(-7, 104, 3.5, 80, 0.4),
    );
  return [shadow(42), stick(108, false), stick(148, true), G(tf(186, 206, -90), P(cylSideD(-11, -18, 22, 18, 3), g.cyl(p.dark)))];
};

// ---- personal care ----
SHAPES['personal-care/soap'] = (p, g) => {
  const bar = lt(p.base, 0.38);
  return [
    shadow(80, 128, 208),
    P('M46 150Q46 132 64 128L172 116Q200 114 204 132L208 168Q210 186 190 190L78 202Q52 204 50 186Z', dk(bar, 0.18)),
    P('M46 144Q46 128 64 124L172 112Q200 110 204 126L206 150Q208 166 190 170L78 182Q52 184 50 168Z', g.orb(bar)),
    E(126, 147, 36, 17, dk(bar, 0.08), { t: 'rotate(-6 126 147)' }),
    E(126, 145, 32, 14, lt(bar, 0.15), { t: 'rotate(-6 126 145)' }),
    glyph('leaf', 126, 145, 0.8, dk(bar, 0.12)),
    P(circlesD([[62, 110, 12], [84, 96, 8], [188, 96, 10], [206, 112, 6], [170, 84, 6]]), WHITE, { op: 0.55 }),
    P(circlesD([[58, 106, 3], [81, 93, 2], [184, 92, 2.6]]), WHITE, { op: 0.9 }),
  ];
};

SHAPES['personal-care/shampoo'] = (p, g) => [
  shadow(46),
  R(110, 34, 36, 16, g.cyl(p.dark), { rx: 5 }),
  R(106, 46, 44, 16, g.cyl(p.dark), { rx: 4 }),
  S('M118 38H138', WHITE, 2, { op: 0.35 }),
  P('M102 62H154Q166 64 166 82C166 108 152 120 152 140C152 160 170 170 170 194V206Q170 218 158 218H98Q86 218 86 206V194C86 170 104 160 104 140C104 120 90 108 90 82Q90 64 102 62Z', g.cyl(p.base)),
  P('M100 124Q128 130 156 124C153 132 152 136 152 140C152 150 156 158 160 164Q128 170 96 164C100 158 104 150 104 140C104 136 103 132 100 124Z', g.cyl(CREAM)),
  emblem(p, 128, 140, 9, 'drop'),
  bars(128, 176, [40, 26], 3.2, CREAM, 0.85),
  highlight(96, 76, 6, 26, 0.35),
  highlight(94, 176, 6, 26, 0.3),
];

SHAPES['personal-care/toothpaste'] = (p, g) => [
  shadow(86, 128, 204),
  G(
    'rotate(-18 128 150)',
    P(crimpVD(194, 124, 16, 52, 6, false), dk(p.base, 0.15)),
    P('M70 128Q72 120 82 120L194 118V182L82 180Q72 180 70 172Z', g.cylV(p.base)),
    R(46, 136, 26, 28, g.cylV(WHITE), { rx: 4 }),
    R(40, 140, 8, 20, g.cylV(SILVER), { rx: 2 }),
    P('M84 134H182V166H84Z', g.cylV(CREAM)),
    P('M84 154Q108 146 133 154T182 152V166H84Z', p.base),
    emblem(p, 110, 146, 8, 'sparkle'),
    bars(150, 142, [40], 3.2, p.dark, 0.8),
    highlight(90, 123, 90, 3.5, 0.35),
  ),
];

SHAPES['personal-care/toothbrush'] = (p, g) => [
  shadow(80, 128, 206),
  G(
    'rotate(-32 128 140)',
    R(40, 132, 150, 16, g.cylV(p.base), { rx: 8 }),
    R(96, 134, 60, 12, lt(p.base, 0.35), { rx: 6 }),
    R(186, 130, 42, 20, g.cylV(p.base), { rx: 9 }),
    S('M191 128V106M197 128V104M203 128V104M209 128V104M215 128V104M221 128V106', '#e6eef6', 4.4),
    S('M194 128V108M206 128V106M218 128V108', lt(p.base, 0.45), 3),
    P('M186 98Q192 86 204 90Q210 80 220 88Q230 90 226 100Q222 106 206 104Q190 106 186 98Z', WHITE),
    S('M194 97Q206 93 220 95', p.light, 3),
  ),
];

SHAPES['personal-care/deodorant'] = (p, g) => [
  shadow(36),
  P(cylSideD(106, 44, 44, 70, 6), g.cyl(SILVER)),
  E(128, 44, 22, 6, WHITE),
  R(122, 36, 12, 10, g.cyl(STEEL), { rx: 2 }),
  P('M104 74Q104 62 118 60H138Q152 62 152 74Z', g.cyl(SILVER)),
  P(cylSideD(104, 74, 48, 208, 6), g.cyl(p.dark)),
  P(cylBandD(104, 112, 48, 168, 6), g.cyl(p.base)),
  PG([128, 122, 136, 140, 128, 158, 120, 140], p.accent),
  bars(128, 184, [30, 20], 3, WHITE, 0.6),
  P('M104 202A24 6 0 0 0 152 202V208A24 6 0 0 1 104 208Z', SILVER),
  highlight(108, 80, 5, 116, 0.35),
];

SHAPES['personal-care/razor'] = (p, g) => [
  shadow(80, 128, 206),
  G(
    'rotate(-38 128 144)',
    R(36, 136, 130, 16, g.cylV(p.base), { rx: 8 }),
    S('M60 138V150M68 138V150M76 138V150M84 138V150M92 138V150', dk(p.base, 0.3), 2, { op: 0.5 }),
    R(160, 138, 20, 12, g.cylV(SILVER), { rx: 3 }),
    R(176, 116, 22, 56, g.cyl(p.dark), { rx: 6 }),
    R(184, 118, 16, 52, g.cyl(SILVER), { rx: 3 }),
    S('M188 122V166M194 122V166', STEEL, 1.6),
    R(196, 118, 5, 52, p.light, { rx: 2.5 }),
  ),
];

SHAPES['personal-care/pads'] = (p, g) => [
  shadow(66),
  P('M70 72Q70 58 86 58H170Q186 58 186 72L190 202Q190 216 176 216H80Q66 216 66 202Z', g.cyl(p.base)),
  R(92, 50, 72, 14, g.cyl(dk(p.base, 0.12)), { rx: 7 }),
  E(128, 142, 46, 42, lt(p.base, 0.3)),
  G(
    tf(128, 142, -30),
    P('M-14 -34C-6 -40 6 -40 14 -34C18 -22 16 -12 26 -6C30 0 30 6 26 10C16 14 18 24 14 34C6 40 -6 40 -14 34C-18 24 -16 14 -26 10C-30 6 -30 0 -26 -6C-16 -12 -18 -22 -14 -34Z', WHITE),
    E(0, 0, 8, 26, lt(p.base, 0.55)),
  ),
  glyph('flower', 92, 88, 0.7, CREAM),
  bars(128, 196, [48], 3.4, CREAM, 0.85),
  highlight(76, 76, 6, 110, 0.25),
];

SHAPES['personal-care/handwash'] = (p, g) => [
  shadow(56),
  P('M96 58H132Q138 58 138 64V68H96Z', g.cyl(p.dark)),
  R(90, 54, 14, 8, g.cyl(p.dark), { rx: 3 }),
  R(120, 64, 16, 30, g.cyl(SILVER)),
  R(110, 90, 36, 18, g.cyl(p.dark), { rx: 3 }),
  P('M96 118Q96 106 110 106H146Q160 106 160 118Q176 124 176 146V204Q176 218 162 218H94Q80 218 80 204V146Q80 124 96 118Z', g.cyl(lt(p.base, 0.15))),
  P('M84 136Q128 128 172 136V204Q172 214 160 214H96Q84 214 84 204Z', g.cyl(p.base)),
  P('M80 150Q128 157 176 150V196Q128 203 80 196Z', g.cyl(CREAM)),
  emblem(p, 128, 170, 12, 'bubbles'),
  highlight(86, 122, 6, 24, 0.4),
];

SHAPES['personal-care/tissue-box'] = (p, g) => {
  const x = 60;
  const y = 118;
  const w = 108;
  const h = 96;
  return [
    shadow(78, 142),
    box3(x, y, w, h, 34, 22, p.base, dk(p.base, 0.24), lt(p.base, 0.22)),
    E(x + w / 2 + 17, y - 11, 34, 7, dk(p.base, 0.35)),
    P('M108 106Q100 80 118 70Q130 60 138 72Q150 56 164 70Q176 84 164 106Z', WHITE),
    P('M138 72Q150 56 164 70Q176 84 164 106H150Q160 88 138 72Z', '#e3e8ef'),
    glyph('flower', x + 26, y + 30, 1, lt(p.base, 0.35)),
    glyph('flower', x + 70, y + 62, 1.3, lt(p.base, 0.35)),
    glyph('flower', x + 86, y + 22, 0.7, lt(p.base, 0.35)),
    R(x, y + h - 10, w, 4, p.accent, { op: 0.9 }),
  ];
};

SHAPES['personal-care/tissue-roll'] = (p, g) => {
  const roll = (cx, top, w, h) =>
    P(cylSideD(cx - w / 2, top, w, top + h, 12), g.cyl('#f7f8fa')) +
    P(cylBandD(cx - w / 2, top + h * 0.42, w, top + h * 0.72, 12), g.cyl(p.base)) +
    E(cx, top + h * 0.57, 11, 8, CREAM) +
    E(cx, top, w / 2, 12, '#eef1f5') +
    E(cx, top, 12, 5, '#c9a57a') +
    E(cx, top, 7, 3, '#8e6f4c');
  return [
    shadow(80, 128, 214),
    roll(166, 88, 64, 88),
    roll(96, 110, 72, 98),
  ];
};

// ---- baby ----
SHAPES['baby/diapers'] = (p, g) => [
  shadow(76),
  S('M100 72Q100 38 128 38Q156 38 156 72', dk(p.base, 0.1), 7),
  P('M60 88Q60 70 80 70H176Q196 70 196 88L200 200Q200 216 184 216H72Q56 216 56 200Z', g.cyl(p.base)),
  E(128, 146, 50, 44, lt(p.base, 0.3)),
  P('M96 122H160V134C150 134 144 142 144 152V170H112V152C112 142 106 134 96 134Z', WHITE),
  R(96, 122, 64, 8, lt(p.base, 0.55)),
  R(96, 122, 10, 12, p.accent, { rx: 2 }),
  R(150, 122, 10, 12, p.accent, { rx: 2 }),
  glyph('star', 84, 94, 0.7, p.accent),
  glyph('star', 176, 104, 0.5, CREAM),
  bars(128, 198, [52], 3.6, CREAM, 0.85),
  highlight(64, 90, 6, 100, 0.25),
];

SHAPES['baby/feeder'] = (p, g) => [
  shadow(40),
  P('M116 84Q116 56 124 46Q128 40 132 46Q140 56 140 84Z', g.cyl('#f2d9b2')),
  E(128, 44, 4, 4, '#ecc99a'),
  R(106, 80, 44, 20, g.cyl(p.base), { rx: 4 }),
  S('M112 84V96M119 84V96M126 84V96M133 84V96M140 84V96M147 84V96', dk(p.base, 0.3), 1.3, { op: 0.35 }),
  P('M102 100H154V204Q154 218 140 218H116Q102 218 102 204Z', g.cyl(lt(GLASS, 0.3))),
  P('M104 138H152V204Q152 216 140 216H116Q104 216 104 204Z', g.cyl('#fbfbf6')),
  S('M108 112H116M108 124H114M108 136H116M108 148H114M108 160H116M108 172H114', p.dark, 1.6, { op: 0.7 }),
  glyph('heart', 136, 178, 0.8, p.base),
  highlight(144, 108, 4, 90, 0.45),
];

SHAPES['baby/formula-tin'] = (p, g) => [
  shadow(72, 124),
  P(cylSideD(72, 110, 104, 208, 13), g.cyl(p.base)),
  P(cylBandD(72, 130, 104, 190, 13), g.cyl(CREAM)),
  glyph('heart', 124, 154, 1.2, p.base),
  bars(124, 176, [44], 3, p.dark, 0.7),
  P(cylSideD(68, 92, 112, 112, 13), g.cyl(lt(p.base, 0.3))),
  E(124, 92, 56, 13, lt(p.base, 0.5)),
  E(124, 92, 44, 9, lt(p.base, 0.38)),
  G(tf(190, 204, -12), E(0, 0, 16, 10, '#f4f6f9'), E(0, -1, 12, 6.5, '#dfe5ec'), R(12, -3, 26, 6, '#f4f6f9', { rx: 3 })),
  highlight(78, 134, 6, 60, 0.3),
];

SHAPES['baby/baby-lotion'] = (p, g) => {
  const body = lt(p.base, 0.32);
  return [
    shadow(62, 120),
    R(106, 42, 36, 30, g.cyl(p.base), { rx: 7 }),
    R(106, 42, 36, 8, lt(p.base, 0.25), { rx: 4 }),
    P('M110 72H138Q140 84 150 90Q172 104 172 140V200Q172 218 154 218H94Q76 218 76 200V140Q76 104 98 90Q108 84 110 72Z', g.cyl(body)),
    E(124, 150, 30, 32, CREAM),
    glyph('heart', 124, 146, 1.2, p.base),
    bars(124, 170, [26], 2.6, p.dark, 0.6),
    highlight(84, 118, 6, 60, 0.35),
    G(
      tf(192, 196),
      E(0, 8, 18, 12, g.orb('#f7cf46')),
      C(-6, -8, 10, g.orb('#f7cf46')),
      P('M-16 -8L-24 -5L-16 -3Z', '#f08a2c'),
      C(-9, -10, 1.6, '#2b2f3a'),
    ),
  ];
};

SHAPES['baby/wipes'] = (p, g) => [
  shadow(88, 128, 210),
  P('M44 140Q44 126 58 124L190 116Q212 116 212 132L214 188Q214 204 198 204H60Q44 204 44 190Z', dk(p.base, 0.2)),
  P('M44 136Q46 118 68 114L180 104Q208 102 210 122L212 150Q212 164 196 166L62 176Q44 176 44 160Z', g.orb(p.base)),
  E(128, 138, 42, 16, dk(p.base, 0.3), { t: 'rotate(-5 128 138)' }),
  E(128, 136, 40, 14, g.cyl(lt(p.base, 0.35)), { t: 'rotate(-5 128 136)' }),
  P('M108 136Q100 110 118 102Q128 96 136 106Q148 94 156 108Q160 124 150 136Z', WHITE),
  P('M136 106Q148 94 156 108Q160 124 150 136H142Q152 118 136 106Z', '#e3e8ef'),
  glyph('heart', 74, 172, 0.8, CREAM),
  bars(150, 186, [60], 3.6, CREAM, 0.8),
];

SHAPES['baby/cereal-box'] = (p, g) => {
  const x = 72;
  const y = 90;
  const w = 96;
  const h = 128;
  return [
    shadow(68, 138),
    box3(x, y, w, h, 24, 14, lt(p.base, 0.1), dk(p.base, 0.2), lt(p.base, 0.35)),
    glyph('heart', x + 22, y + 22, 0.9, CREAM),
    bars(x + 60, y + 20, [40, 26], 3.4, CREAM, 0.9),
    E(x + w / 2, y + 78, 38, 30, CREAM),
    E(x + w / 2, y + 78, 28, 6, '#f0d9a8'),
    P(d`M${x + w / 2 - 28} ${y + 78}H${x + w / 2 + 28}A28 22 0 0 1 ${x + w / 2 - 28} ${y + 78}Z`, p.base),
    G(tf(x + w / 2 + 16, y + 62, 40), R(-3, -24, 6, 30, lt(p.accent, 0.1), { rx: 3 }), E(0, 8, 8, 6, lt(p.accent, 0.1))),
    R(x, y + h - 10, w, 4, p.accent, { op: 0.9 }),
  ];
};

// ===========================================================================
// Cleaning & household
// ===========================================================================
/** Detergent "wash" mark: cream disc with two water swooshes and bubbles. */
const washMark = (p, cx, cy, r) =>
  C(cx, cy, r, CREAM) +
  S(d`M${cx - r * 0.62} ${cy + r * 0.12}Q${cx - r * 0.1} ${cy - r * 0.55} ${cx + r * 0.62} ${cy - r * 0.14}`, p.base, r * 0.2) +
  S(d`M${cx - r * 0.5} ${cy + r * 0.46}Q${cx} ${cy + r * 0.08} ${cx + r * 0.52} ${cy + r * 0.3}`, p.light, r * 0.16) +
  P(circlesD([[cx + r * 0.8, cy - r * 0.8, r * 0.22], [cx + r * 1.05, cy - r * 0.35, r * 0.13], [cx - r * 0.9, cy + r * 0.7, r * 0.16]]), WHITE, { op: 0.85 });

const lemonMark = (cx, cy, s) =>
  G(tf(cx, cy, 0, s), C(0, 0, 11, '#f2cf2a'), C(0, 0, 9.4, '#fff6c8'), C(0, 0, 8.4, '#f8e06a'), S('M0 -7V7M-7 0H7M-5 -5L5 5M-5 5L5 -5', '#fff6c8', 1.3), P(ellD(9, -11, 5, 2.4, -30), LEAF));

// ---- cleaning ----
SHAPES['cleaning/detergent-box'] = (p, g) => {
  const x = 62;
  const y = 90;
  const w = 106;
  const h = 128;
  return [
    shadow(76, 140),
    S(`M${x + 40} ${y - 9}Q${x + 64} ${y - 44} ${x + 96} ${y - 15}`, dk(p.base, 0.3), 7),
    box3(x, y, w, h, 30, 18, p.base, dk(p.base, 0.24), lt(p.base, 0.25)),
    R(x + 42, y - 13, 12, 6, dk(p.base, 0.4), { rx: 2 }),
    washMark(p, x + w / 2, y + 58, 30),
    PG(starPts(x + w - 16, y + 18, 13, 10, 10), p.accent),
    bars(x + w / 2, y + 102, [64, 42], 4, CREAM, 0.9),
  ];
};

SHAPES['cleaning/detergent-pouch'] = (p, g) => {
  const hole = 'M112 56h32a6 6 0 0 1 0 12h-32a6 6 0 0 1 0 -12Z';
  return [
    shadow(58),
    P('M84 42H172Q178 42 178 48L184 204Q184 216 172 216H84Q72 216 72 204L78 48Q78 42 84 42Z' + hole, g.cyl(p.base), { evenodd: true }),
    P('M78 48Q78 42 84 42H172Q178 42 178 48V78H78Z' + hole, SHADOW, { op: 0.12, evenodd: true }),
    washMark(p, 128, 128, 34),
    bars(128, 184, [60, 40], 4, CREAM, 0.9),
    P('M72 200Q128 190 184 200V204Q184 216 172 216H84Q72 216 72 204Z', SHADOW, { op: 0.1 }),
    highlight(84, 86, 6, 60, 0.26),
  ];
};

SHAPES['cleaning/liquid-bottle'] = (p, g) => [
  shadow(42),
  R(122, 28, 12, 14, g.cyl(p.dark), { rx: 3 }),
  R(114, 40, 28, 24, g.cyl(p.dark), { rx: 4 }),
  P('M108 64H148Q156 66 158 76L162 100V204Q162 218 148 218H108Q94 218 94 204V100L98 76Q100 66 108 64Z', g.cyl(p.base)),
  P('M94 118Q128 124 162 118V186Q128 192 94 186Z', g.cyl(CREAM)),
  lemonMark(128, 146, 1.4),
  bars(128, 172, [40], 3.2, p.dark, 0.7),
  P(circlesD([[108, 96, 5], [118, 86, 3], [146, 200, 4]]), WHITE, { op: 0.45 }),
  highlight(100, 96, 6, 18, 0.35),
];

SHAPES['cleaning/toilet-cleaner'] = (p, g) => [
  shadow(46),
  P('M114 92L96 60Q93 54 99 51L112 45Q118 43 121 49L140 92Z', g.cyl(p.base)),
  G(tf(104, 44, -26), R(-11, -18, 22, 18, g.cyl(p.dark), { rx: 3 }), S('M-6 -14V-4M0 -14V-4M6 -14V-4', WHITE, 1.2, { op: 0.25 })),
  P('M98 104Q98 90 112 90H146Q160 90 160 104V204Q160 218 146 218H112Q98 218 98 204Z', g.cyl(p.base)),
  R(104, 112, 12, 60, lt(p.base, 0.25), { rx: 6 }),
  P('M98 126Q129 132 160 126V190Q129 196 98 190Z', g.cyl(CREAM)),
  glyph('sparkle', 129, 150, 1.25, p.base),
  P('M98 172Q113 164 129 172T160 170V190Q129 196 98 190Z', p.base),
  highlight(102, 196, 6, 12, 0.3),
];

SHAPES['cleaning/spray'] = (p, g) => [
  shadow(46),
  P(circlesD([[62, 70, 2.4], [54, 62, 1.8], [52, 76, 2], [44, 68, 1.6], [46, 82, 1.4], [40, 58, 1.2]]), GLASS),
  P('M84 62H150Q156 62 156 68V86Q156 94 148 94H114L98 78H84Q78 78 78 72V68Q78 62 84 62Z', g.cyl('#f2f4f8')),
  R(72, 66, 8, 8, g.cyl(STEEL), { rx: 2 }),
  P('M112 94Q106 112 116 124L124 120Q118 108 122 94Z', '#dfe4eb'),
  R(114, 92, 28, 12, g.cyl('#e6eaf0')),
  P('M104 104H152Q162 108 164 120V206Q164 218 152 218H104Q92 218 92 206V120Q94 108 104 104Z', g.cyl(lt(p.base, 0.2))),
  S('M128 106V208', WHITE, 1.6, { op: 0.45 }),
  P('M92 136Q128 142 164 136V186Q128 192 92 186Z', g.cyl(CREAM)),
  emblem(p, 128, 158, 11, 'sparkle'),
  highlight(98, 118, 6, 14, 0.35),
];

SHAPES['cleaning/dishwash-bar'] = (p, g) => {
  const bar = '#c3dc56';
  const x = 50;
  const y = 136;
  const w = 118;
  const h = 48;
  const ww = 70;
  return [
    shadow(86, 132, 208),
    box3(x, y, w, h, 32, 20, bar, dk(bar, 0.18), lt(bar, 0.25)),
    PG([x, y, x + 32, y - 20, x + 32 + ww, y - 20, x + ww, y], lt(p.base, 0.2)),
    PG([x + ww, y, x + ww + 32, y - 20, x + ww + 32, y - 14, x + ww, y + 6], dk(p.base, 0.3)),
    R(x, y, ww, h, g.cyl(p.base)),
    lemonMark(x + ww / 2, y + h / 2, 1.3),
    G(tf(176, 200), box3(-22, -8, 40, 22, 14, 9, '#f6cc45', dk('#f6cc45', 0.18), '#3f8a3a'), PG([-22, -8, -8, -17, 32, -17, 18, -8], '#4f9a45')),
    P(circlesD([[178, 118, 9], [196, 104, 6], [206, 124, 4.5], [60, 124, 5]]), WHITE, { op: 0.55 }),
  ];
};

SHAPES['cleaning/mosquito-coil'] = (p, g) => {
  let spiral = '';
  const pts = [];
  for (let i = 0; i <= 52; i += 1) {
    const t = i / 52;
    const a = t * Math.PI * 2 * 3.1;
    const r = 8 + t * 58;
    pts.push([128 + Math.cos(a) * r, 174 + Math.sin(a) * r * 0.42]);
  }
  spiral = 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
  const [ex, ey] = pts[pts.length - 1];
  const bx = 58;
  const by = 96;
  return [
    shadow(78, 128, 208),
    box3(bx, by, 74, 64, 22, 12, p.base, dk(p.base, 0.24), lt(p.base, 0.25)),
    emblem(p, bx + 37, by + 30, 13, 'leaf', CREAM, p.base),
    G('translate(0 4)', S(spiral, '#2f5a2c', 8)),
    S(spiral, '#4f7e3e', 8),
    S(spiral, '#77a55c', 2.4, { op: 0.7 }),
    E(128, 174, 5, 3, SILVER),
    C(ex, ey, 4, '#f36b2c'),
    C(ex, ey, 2, '#ffd37a'),
    S(d`M${ex} ${ey - 4}q-8 -14 2 -26t0 -28`, '#b7c0cc', 2.4, { op: 0.7 }),
  ];
};

// ---- household ----
SHAPES['household/bulb'] = (p, g) => [
  shadow(40),
  C(128, 92, 70, '#ffe9a3', { op: 0.16 }),
  P('M128 36C166 36 186 62 186 92C186 116 172 130 162 142C156 150 154 158 154 164H102C102 158 100 150 94 142C84 130 70 116 70 92C70 62 90 36 128 36Z', g.orb('#fdf4d8')),
  S('M116 160V132Q116 118 128 118Q140 118 140 132V160', '#f0b73a', 2.4, { op: 0.8 }),
  S('M94 74Q102 54 124 50', WHITE, 6, { op: 0.75 }),
  R(102, 160, 52, 16, g.cyl(p.base), { rx: 4 }),
  R(104, 174, 48, 28, g.cyl(SILVER), { rx: 5 }),
  S('M104 181L152 185M104 189L152 193M104 197L152 201', STEEL, 2.2),
  P('M114 202H142L136 214Q128 218 120 214Z', '#3c4454'),
];

SHAPES['household/battery'] = (p, g) => {
  const cell = (x, top, h) => [
    P(cylSideD(x, top, 42, top + h, 8), g.cyl(p.base)),
    P(cylSideD(x, top, 42, top + h * 0.3, 8), g.cyl('#3b4456')),
    P(d`M${x} ${top + h - 6}A21 8 0 0 0 ${x + 42} ${top + h - 6}V${top + h}A21 8 0 0 1 ${x} ${top + h}Z`, g.cyl(SILVER)),
    E(x + 21, top, 21, 8, SILVER),
    R(x + 14, top - 9, 14, 10, g.cyl(SILVER), { rx: 3 }),
    E(x + 21, top - 9, 7, 2.6, WHITE),
    glyph('bolt', x + 21, top + h * 0.62, 1.1, WHITE),
    highlight(x + 5, top + 8, 4, h - 20, 0.3),
  ];
  return [shadow(68), cell(76, 72, 138), cell(132, 96, 116)];
};

SHAPES['household/candle'] = (p, g) => {
  const wax = lt(p.base, 0.42);
  const candle = (x, top, w) => {
    const cx = x + w / 2;
    return [
      C(cx, top - 26, 18, '#ffd66b', { op: 0.18 }),
      P(cylSideD(x, top, w, 206, 8), g.cyl(wax)),
      E(cx, top, w / 2, 8, lt(wax, 0.35)),
      P(d`M${x + 4} ${top + 2}Q${x + 6} ${top + 22} ${x + 10} ${top + 20}Q${x + 13} ${top + 8} ${x + 16} ${top + 4}Z`, lt(wax, 0.35)),
      L(cx, top - 1, cx, top - 10, '#3c3226', 2.2),
      P(d`M${cx} ${top - 38}C${cx + 9} ${top - 26} ${cx + 9} ${top - 14} ${cx} ${top - 10}C${cx - 9} ${top - 14} ${cx - 9} ${top - 26} ${cx} ${top - 38}Z`, '#f7a928'),
      P(d`M${cx} ${top - 28}C${cx + 4} ${top - 22} ${cx + 4} ${top - 15} ${cx} ${top - 12}C${cx - 4} ${top - 15} ${cx - 4} ${top - 22} ${cx} ${top - 28}Z`, '#fff1b3'),
    ];
  };
  return [shadow(70), candle(74, 92, 50), candle(134, 124, 54)];
};

SHAPES['household/matchbox'] = (p, g) => {
  const x = 50;
  const y = 144;
  const w = 118;
  const h = 44;
  const dx = 30;
  const dy = 22;
  let sticks = '';
  let heads = '';
  for (let i = 0; i < 6; i += 1) {
    const sx = x + w + 4 + i * 5;
    const sy = y - 3 - i * 3.6;
    sticks += d`M${sx - 30} ${sy + 1}L${sx} ${sy}`;
    heads += ellD(sx + 1, sy, 3.4, 2.4, -8);
  }
  return [
    shadow(88, 136, 208),
    box3(x + 36, y, w, h, dx, dy, '#c9a36a', dk('#c9a36a', 0.18), '#8e6c43'),
    S(sticks, '#f1d9a8', 3),
    P(heads, '#c9352d'),
    box3(x, y, w, h, dx, dy, p.base, dk(p.base, 0.28), lt(p.base, 0.2)),
    PG([x + w, y + 6, x + w + dx, y - dy + 6, x + w + dx, y + h - dy - 6, x + w, y + h - 6], '#6b4a32'),
    P(dotsD(8, x + w + 4, y - 10, dx - 8, h - 8, 12, 0.9), '#8e6a4a'),
    labelPanel(g, x + 10, y + 8, w - 20, h - 16, 5),
    glyph('flame', x + 30, y + h / 2, 0.9, '#e8552e'),
    bars(x + 72, y + h / 2 - 4, [52, 36], 3, p.dark, 0.7),
  ];
};

SHAPES['household/broom'] = (p, g) => {
  let straws = '';
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    straws += d`M${-8 + t * 16} 18Q${-16 + t * 32} 60 ${-48 + t * 96} ${100 - Math.abs(t - 0.5) * 16}`;
  }
  return [
    shadow(70, 128, 214),
    G(
      tf(138, 112, -22),
      P('M-12 14C-30 44 -44 72 -54 96Q-50 104 -40 102Q-30 110 -20 104Q-10 112 0 106Q10 112 20 104Q30 110 40 102Q50 104 54 96C44 72 30 44 12 14Z', g.cyl('#dcbd82')),
      S(straws, '#b89458', 1.4, { op: 0.8 }),
      S('M-30 96Q-20 88 -10 98M4 98Q14 88 24 98', '#f1dcaa', 3, { op: 0.8 }),
      R(-12, -92, 24, 112, g.cyl('#c9a46a'), { rx: 6 }),
      R(-13, -84, 26, 84, g.cyl(p.base), { rx: 5 }),
      S('M-13 -70L13 -64M-13 -50L13 -44M-13 -30L13 -24M-13 -10L13 -4', lt(p.base, 0.35), 2, { op: 0.8 }),
      R(-14, 4, 28, 8, TWINE, { rx: 3 }),
      R(-14, -96, 28, 10, TWINE, { rx: 4 }),
    ),
  ];
};

SHAPES['household/bucket'] = (p, g) => [
  shadow(56),
  S('M72 114Q128 22 184 114', STEEL, 4),
  R(112, 60, 32, 10, g.cyl('#3c4454'), { rx: 5 }),
  P('M68 112L84 204Q128 222 172 204L188 112Z', g.cyl(p.base)),
  E(128, 112, 60, 15, dk(p.base, 0.35)),
  S('M70 114A58 13 0 0 0 186 114', lt(p.base, 0.3), 5),
  S('M76 146Q128 160 180 146M80 176Q128 190 176 176', dk(p.base, 0.2), 2, { op: 0.4 }),
  C(72, 118, 5, dk(p.base, 0.2)),
  C(184, 118, 5, dk(p.base, 0.2)),
  highlight(80, 124, 6, 70, 0.28),
];

SHAPES['household/garbage-bag'] = (p, g) => [
  shadow(96, 128, 200),
  G(
    'translate(-24 -30) scale(1.2)',
    P('M56 112H176A16 36 0 0 1 176 184H56A16 36 0 0 1 56 112Z', g.cylV(p.base)),
    E(176, 148, 16, 36, dk(p.base, 0.12)),
    S('M176 124A10 24 0 0 1 176 172A7 17 0 0 1 176 138', lt(p.base, 0.2), 1.6),
    E(176, 148, 8, 15, '#c9a57a'),
    E(176, 148, 4.5, 9, '#6b5236'),
    R(96, 112, 46, 72, g.cylV(CREAM)),
    emblem(p, 119, 144, 11, 'leaf'),
    bars(119, 164, [26], 2.8, p.dark, 0.7),
    highlight(60, 118, 110, 5, 0.3),
  ),
];

SHAPES['household/foil-roll'] = (p, g) => [
  shadow(92, 132, 210),
  box3(64, 104, 116, 40, 28, 18, p.base, dk(p.base, 0.24), lt(p.base, 0.22)),
  P(crimpD(70, 100, 104, 4, 18), STEEL),
  labelPanel(g, 134, 110, 38, 28, 4),
  glyph('sparkle', 153, 124, 0.9, p.base),
  P('M56 194H160L170 214Q150 208 132 214Q112 208 94 214Q74 208 48 214Z', g.cyl('#dfe5ec')),
  S('M70 204L84 196M104 206L116 198M134 204L144 198', WHITE, 2.2, { op: 0.8 }),
  P('M52 148H168A14 26 0 0 1 168 200H52A14 26 0 0 1 52 148Z', g.cylV('#dfe5ec')),
  E(168, 174, 14, 26, '#eef2f6'),
  E(168, 174, 7, 13, '#c9a57a'),
  E(168, 174, 4, 8, '#7d6246'),
  S('M56 158H150', WHITE, 4, { op: 0.8 }),
  S('M60 188H150', STEEL, 2, { op: 0.5 }),
];

SHAPES['household/air-freshener'] = (p, g) => [
  shadow(46),
  P(circlesD([[80, 62, 3], [70, 54, 2.2], [66, 70, 2.6], [58, 60, 1.8], [60, 80, 1.6], [52, 70, 1.4]]), p.light, { op: 0.8 }),
  P('M98 72Q98 48 128 46Q158 48 158 72Z', g.cyl(lt(p.base, 0.3))),
  R(92, 60, 12, 8, g.cyl(STEEL), { rx: 2 }),
  P(cylSideD(94, 74, 68, 208, 9), g.cyl(p.base)),
  P('M94 74A34 9 0 0 0 162 74V82A34 9 0 0 1 94 82Z', SILVER),
  C(128, 132, 26, CREAM),
  glyph('flower', 128, 132, 1.6, p.light),
  C(128, 132, 5, p.accent),
  bars(128, 172, [44, 30], 3.4, CREAM, 0.85),
  P('M94 202A34 9 0 0 0 162 202V208A34 9 0 0 1 94 208Z', SILVER),
  highlight(99, 86, 6, 110, 0.3),
];

// ===========================================================================
// Stationery & kitchen
// ===========================================================================
const RUBBER = '#f3a6ad';
const NONSTICK = '#434b5b';

// ---- stationery ----
SHAPES['stationery/pen'] = (p, g) => {
  const pen = (cy, rot, capped) =>
    G(
      tf(128, cy, rot),
      P('M-86 -2L-100 0L-86 2Z', '#3c4454'),
      P('M-86 -6L-70 -7V7L-86 6Z', g.cylV(SILVER)),
      R(-70, -8, 120, 16, g.cylV(capped ? lt(p.base, 0.55) : p.base), { rx: 3 }),
      capped ? R(-60, -2.5, 98, 5, p.base, { rx: 2.5 }) : '',
      R(36, -9, 56, 18, g.cylV(p.dark), { rx: 6 }),
      R(46, -14, 40, 5, g.cylV(SILVER), { rx: 2.5 }),
      R(-66, -6, 90, 3, WHITE, { rx: 1.5, op: 0.4 }),
    );
  return [shadow(84, 128, 206), pen(124, -28, true), pen(160, -18, false)];
};

SHAPES['stationery/pencil'] = (p, g) => {
  const pencil = (cy, rot, c) =>
    G(
      tf(128, cy, rot),
      P('M-70 -9L-98 0L-70 9Z', '#eecb96'),
      P('M-88 -3.2L-98 0L-88 3.2Z', '#3c4454'),
      R(-70, -9, 128, 18, c),
      R(-70, -9, 128, 6, lt(c, 0.25)),
      R(-70, 3, 128, 6, dk(c, 0.15)),
      R(58, -9.5, 16, 19, g.cylV(SILVER)),
      S('M62 -9V9M68 -9V9', STEEL, 1.4),
      R(74, -9, 16, 18, g.cylV(RUBBER), { rx: 5 }),
    );
  return [shadow(84, 128, 206), pencil(124, -24, p.base), pencil(158, -14, p.accent === '#c8412f' ? '#2f6fd6' : p.accent)];
};

SHAPES['stationery/notebook'] = (p, g) => {
  let rings = '';
  for (let i = 0; i < 9; i += 1) rings += d`M76 ${62 + i * 17}h-10a4 4 0 0 0 0 8h10`;
  return [
    shadow(66),
    R(78, 50, 116, 168, CREAM, { rx: 6 }),
    S('M190 56V214', dk(CREAM, 0.2), 3),
    R(72, 46, 116, 168, g.cyl(p.base), { rx: 7 }),
    labelPanel(g, 96, 76, 72, 44, 6),
    bars(132, 90, [48, 32], 3.6, p.dark, 0.75),
    glyph('star', 132, 158, 1.2, lt(p.base, 0.3)),
    R(160, 46, 10, 168, g.cyl(p.dark)),
    S(rings, STEEL, 3),
  ];
};

SHAPES['stationery/paper-ream'] = (p, g) => {
  const x = 50;
  const y = 136;
  const w = 128;
  const h = 64;
  const dx = 34;
  const dy = 22;
  let sheets = '';
  for (let i = 1; i < 8; i += 1) sheets += d`M${x + w} ${y + i * 8}L${x + w + dx} ${y + i * 8 - dy}`;
  return [
    shadow(92, 140, 210),
    box3(x, y, w, h, dx, dy, p.base, '#f4f6f9', '#fbfcfd'),
    S(sheets, '#d4dae3', 1.2),
    PG([x + 40, y, x + 40 + dx, y - dy, x + 88 + dx, y - dy, x + 88, y], lt(p.base, 0.25)),
    PG([x + w, y + 20, x + w + dx, y + 20 - dy, x + w + dx, y + 44 - dy, x + w, y + 44], dk(p.base, 0.2)),
    R(x, y, w, h, g.cyl(p.base)),
    labelPanel(g, x + 34, y + 12, 60, 40, 5),
    glyph('leaf', x + 50, y + 32, 0.9, p.base),
    bars(x + 74, y + 26, [22, 14], 3, p.dark, 0.7),
    PG([x + 40, y, x + 40 + dx, y - dy, x + 88 + dx, y - dy, x + 88, y], lt(p.base, 0.25)),
  ];
};

SHAPES['stationery/marker'] = (p, g) => {
  const marker = (cy, rot, capped) =>
    G(
      tf(128, cy, rot),
      capped ? '' : P('M-88 -8L-104 -3V5L-88 8Z', p.base),
      capped ? '' : R(-90, -11, 14, 22, g.cylV(SILVER), { rx: 3 }),
      R(-78, -14, 150, 28, g.cylV('#f4f6f9'), { rx: 7 }),
      R(30, -14, 36, 28, g.cylV(p.base)),
      R(66, -12, 18, 24, g.cylV(p.dark), { rx: 5 }),
      capped ? R(-104, -16, 56, 32, g.cylV(p.base), { rx: 8 }) + R(-96, -21, 44, 7, g.cylV(p.dark), { rx: 3.5 }) : '',
      R(-72, -10, 130, 4, WHITE, { rx: 2, op: 0.6 }),
    );
  return [shadow(86, 128, 208), marker(112, -26, true), marker(160, -16, false)];
};

SHAPES['stationery/glue'] = (p, g) => [
  shadow(70),
  P('M92 74Q92 58 118 56Q144 58 144 74Z', '#f7f8fa'),
  P(cylSideD(88, 74, 60, 90, 8), g.cyl(lt(p.base, 0.3))),
  E(118, 74, 30, 8, '#eef1f5'),
  P('M96 74Q96 62 118 60Q140 62 140 74A22 6 0 0 1 96 74Z', '#fbfcfd'),
  P(cylSideD(86, 88, 64, 212, 9), g.cyl('#f4f6f9')),
  P(cylBandD(86, 116, 64, 176, 9), g.cyl(p.base)),
  emblem(p, 118, 142, 11, 'star', CREAM, p.base),
  R(86, 196, 64, 16, dk('#f4f6f9', 0.1)),
  G(tf(182, 184, 0), P(cylSideD(-24, -8, 48, 28, 7), g.cyl(p.base)), E(0, -8, 24, 7, lt(p.base, 0.3))),
  highlight(92, 94, 5, 90, 0.4),
];

SHAPES['stationery/calculator'] = (p, g) => {
  const keys = [];
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) keys.push([88 + c * 22, 118 + r * 22]);
  return [
    shadow(62),
    R(70, 46, 116, 172, dk(p.base, 0.2), { rx: 14 }),
    R(70, 42, 116, 170, g.cyl(p.base), { rx: 14 }),
    R(82, 56, 92, 40, '#2f3a36', { rx: 6 }),
    R(86, 60, 84, 32, g.vert('#c9dcc3', '#a9c2a2'), { rx: 4 }),
    R(128, 70, 34, 12, '#4f6b52', { rx: 2, op: 0.6 }),
    keys.map(([x, y], i) => R(x - 8, y - 7, 16, 14, (i + 1) % 4 === 0 ? p.accent : '#f4f6f9', { rx: 4 })).join(''),
    R(80, 198, 96, 3, WHITE, { rx: 1.5, op: 0.2 }),
  ];
};

SHAPES['stationery/stapler'] = (p, g) => [
  shadow(86, 128, 208),
  P('M40 188Q40 176 52 176H206Q214 176 214 184V196Q214 204 206 204H48Q40 204 40 196Z', '#3c4454'),
  P('M52 176H206Q212 176 212 182H48Q48 176 52 176Z', '#58627a'),
  R(150, 166, 58, 12, g.cyl(SILVER), { rx: 3 }),
  P('M44 170C44 142 60 128 84 126L196 118Q214 118 214 134V150Q214 160 204 162L60 178Q44 180 44 170Z', g.cylV(p.base)),
  P('M60 130L196 120Q210 120 212 130L66 142Q54 142 60 130Z', lt(p.base, 0.3)),
  P('M196 118Q214 118 214 134V150Q214 160 204 162L198 162Z', dk(p.base, 0.2)),
  C(70, 160, 6, SILVER),
  C(70, 160, 2.5, STEEL),
];

SHAPES['stationery/eraser'] = (p, g) => {
  const x = 56;
  const y = 136;
  const w = 118;
  const h = 44;
  const dx = 36;
  const dy = 24;
  return [
    shadow(88, 140, 206),
    box3(x, y, w, h, dx, dy, RUBBER, dk(RUBBER, 0.14), lt(RUBBER, 0.3)),
    PG([x + 40, y, x + 40 + dx, y - dy, x + 100 + dx, y - dy, x + 100, y], lt(p.base, 0.22)),
    R(x + 40, y, 60, h, g.cyl(p.base)),
    PG([x + 100, y, x + 100 + dx, y - dy, x + 100 + dx, y + h - dy, x + 100, y + h], dk(p.base, 0.25)),
    emblem(p, x + 70, y + 20, 9, 'star', CREAM, p.base),
    bars(x + 70, y + 34, [28], 2.6, CREAM, 0.8),
    E(x + 18, y - 8, 10, 3, WHITE, { op: 0.35 }),
  ];
};

// ---- kitchen ----
SHAPES['kitchen/frying-pan'] = (p, g) => [
  shadow(88, 118, 206),
  G(tf(176, 148, -22), R(0, -8, 72, 16, g.cylV('#3c4454'), { rx: 8 }), R(12, -6, 56, 12, g.cylV(p.base), { rx: 6 }), C(62, 0, 3, dk(p.base, 0.3))),
  E(112, 166, 80, 34, dk(p.base, 0.22)),
  E(112, 160, 80, 34, p.base),
  E(112, 158, 72, 29, NONSTICK),
  E(112, 162, 62, 22, '#4c5566'),
  S('M62 150Q84 136 118 136', WHITE, 4, { op: 0.25 }),
];

SHAPES['kitchen/pressure-cooker'] = (p, g) => [
  shadow(88, 124, 210),
  P('M36 110Q36 104 42 104H64V118H42Q36 118 36 112Z', g.cylV(p.dark)),
  P(cylSideD(62, 104, 124, 202, 14), g.cyl(SILVER)),
  S('M64 150A62 14 0 0 0 186 150', STEEL, 2, { op: 0.5 }),
  E(124, 104, 62, 14, STEEL),
  P('M66 104Q66 86 124 82Q182 86 182 104A58 12 0 0 1 66 104Z', g.orb('#eef2f6')),
  R(114, 76, 20, 8, g.cyl(SILVER), { rx: 2 }),
  R(117, 56, 14, 22, g.cyl('#3c4454'), { rx: 5 }),
  P('M178 100H224Q232 100 232 107V110Q232 116 224 116H178Z', g.cylV(p.dark)),
  P('M184 118H226Q232 118 232 124V128Q232 134 226 134H184Z', g.cylV(dk(p.dark, 0.12))),
  highlight(70, 122, 7, 66, 0.45),
];

SHAPES['kitchen/kettle'] = (p, g) => [
  shadow(70),
  P('M168 94Q204 96 204 136Q204 172 170 184V170Q190 162 190 136Q190 110 168 108Z', g.cyl(dk(p.base, 0.2))),
  P('M84 112L56 92Q50 90 50 96L72 136Z', g.cyl(p.base)),
  P('M86 94Q86 84 96 84H160Q170 84 170 94L178 192H78Z', g.cyl(p.base)),
  E(128, 86, 38, 8, lt(p.base, 0.3)),
  R(118, 70, 20, 12, g.cyl('#3c4454'), { rx: 5 }),
  R(146, 100, 10, 70, '#dfe9f2', { rx: 5, op: 0.9 }),
  R(148, 140, 6, 28, '#a9cde8', { rx: 3 }),
  P('M72 192H184Q190 192 190 198V206Q190 214 182 214H74Q66 214 66 206V198Q66 192 72 192Z', g.cyl('#3c4454')),
  C(112, 203, 3, '#6ee06e'),
  highlight(92, 100, 6, 76, 0.3),
];

SHAPES['kitchen/rice-cooker'] = (p, g) => [
  shadow(76),
  P('M104 70Q104 58 128 56Q152 58 152 70H140V64H116V70Z', '#6b7485'),
  P('M62 104Q62 74 128 70Q194 74 194 104Z', g.cyl(p.base)),
  E(128, 76, 34, 6, lt(p.base, 0.3), { op: 0.8 }),
  R(62, 100, 132, 10, g.cyl(dk(p.base, 0.2)), { rx: 4 }),
  P('M66 110H190L184 200Q182 212 168 212H88Q74 212 72 200Z', g.cyl('#f5f3ee')),
  R(106, 132, 44, 50, g.cyl(p.dark), { rx: 8 }),
  C(118, 146, 4, '#ff6b5b'),
  C(138, 146, 4, '#7be07b'),
  R(116, 160, 24, 14, '#f5f3ee', { rx: 4 }),
  S('M74 120L84 120M172 120H182', dk('#f5f3ee', 0.2), 3),
  highlight(76, 116, 6, 74, 0.5),
];

SHAPES['kitchen/blender'] = (p, g) => {
  const smoothie = ['#e8576a', '#9ccc5a', '#8fb3e8', '#f6b53c', '#b07acc', '#6fcfb7'][p.i];
  return [
    shadow(56),
    R(98, 40, 60, 12, g.cyl('#3c4454'), { rx: 5 }),
    P('M92 52H164L156 150H100Z', g.cyl(lt(GLASS, 0.2))),
    P('M95 88H161L156 150H100Z', g.cyl(smoothie)),
    P('M164 64H176Q184 64 184 72V116Q184 124 176 124H160L162 114H172V74H163Z', g.cyl(lt(GLASS, 0.1))),
    S('M110 140L146 136', STEEL, 3),
    S('M98 60L104 146', WHITE, 4, { op: 0.5 }),
    P('M84 150H172L178 204Q178 216 166 216H90Q78 216 78 204Z', g.cyl(p.base)),
    C(128, 184, 12, dk(p.base, 0.3)),
    C(128, 184, 8, SILVER),
    R(126, 174, 4, 8, '#3c4454', { rx: 2 }),
  ];
};

SHAPES['kitchen/knife'] = (p, g) => [
  shadow(88, 128, 202),
  G(
    'rotate(-30 128 140)',
    P('M24 126H148V156Q98 158 64 150Q36 144 24 126Z', g.cylV('#dfe5ec')),
    P('M24 126H148V132H26Z', WHITE, { op: 0.6 }),
    P('M30 136Q70 148 148 150V156Q98 158 64 150Q40 145 30 136Z', STEEL, { op: 0.55 }),
    R(146, 124, 10, 34, g.cylV(SILVER), { rx: 2 }),
    R(154, 126, 72, 28, g.cylV(p.base), { rx: 10 }),
    P(circlesD([[172, 140, 3.2], [192, 140, 3.2], [212, 140, 3.2]]), SILVER),
  ),
];

SHAPES['kitchen/container'] = (p, g) => {
  const x = 50;
  const y = 128;
  const w = 128;
  const h = 72;
  const dx = 32;
  const dy = 20;
  return [
    shadow(90, 140, 210),
    box3(x, y, w, h, dx, dy, lt(GLASS, 0.1), '#c2dbe8', lt(GLASS, 0.4)),
    R(x + 8, y + 8, 8, h - 20, WHITE, { rx: 4, op: 0.55 }),
    box3(x - 3, y - 2, w + 6, 14, dx, dy, p.base, dk(p.base, 0.25), lt(p.base, 0.2)),
    R(x + 24, y + 10, 16, 20, g.cyl(p.dark), { rx: 3 }),
    R(x + 88, y + 10, 16, 20, g.cyl(p.dark), { rx: 3 }),
    PG([x + w + 3, y + 10, x + w + 3 + dx, y + 10 - dy, x + w + 3 + dx, y + 26 - dy, x + w + 3, y + 26], dk(p.base, 0.35)),
  ];
};

SHAPES['kitchen/bottle'] = (p, g) => [
  shadow(40),
  S('M128 30Q150 30 150 44', SILVER, 5),
  R(110, 34, 36, 30, g.cyl(SILVER), { rx: 7 }),
  R(106, 60, 44, 8, g.cyl(STEEL), { rx: 3 }),
  P('M106 66H150Q156 70 158 84V204Q158 218 144 218H112Q98 218 98 204V84Q100 70 106 66Z', g.cyl(p.base)),
  R(98, 196, 60, 10, g.cyl(SILVER)),
  emblem(p, 128, 130, 10, 'drop', lt(p.base, 0.3), p.base),
  highlight(104, 82, 6, 100, 0.3),
];

SHAPES['kitchen/glass-set'] = (p, g) => {
  const glass = (x, top, w, bottom) => [
    P(d`M${x} ${top}L${x + 5} ${bottom}Q${x + w / 2} ${bottom + 6} ${x + w - 5} ${bottom}L${x + w} ${top}Z`, g.cyl('#c6dfec')),
    P(d`M${x + 5} ${bottom - 14}H${x + w - 5}L${x + w - 5.5} ${bottom}Q${x + w / 2} ${bottom + 6} ${x + 5.5} ${bottom}Z`, '#a9cde2'),
    E(x + w / 2, top, w / 2, 6, '#e8f3f9'),
    P(d`M${x + 2} ${top + 24}L${x + w - 2} ${top + 24}L${x + w - 3} ${top + 36}L${x + 3} ${top + 36}Z`, p.base),
    R(x + 7, top + 42, 4, bottom - top - 50, WHITE, { rx: 2, op: 0.7 }),
    R(x + 4, bottom - 8, w - 8, 6, WHITE, { op: 0.35 }),
  ];
  return [shadow(88), glass(54, 96, 50, 206), glass(150, 96, 50, 206), glass(100, 110, 56, 214)];
};

SHAPES['kitchen/spoon-set'] = (p, g) => {
  const spoon = (rot, fork) =>
    G(
      tf(128, 210, rot),
      R(-5, -96, 10, 70, g.cyl(p.base), { rx: 5 }),
      R(-3, -120, 6, 30, g.cyl(SILVER), { rx: 3 }),
      fork
        ? P('M-12 -170V-146Q-12 -130 0 -126Q12 -130 12 -146V-170H8V-148H4V-170H0V-148H-4V-170H-8V-148H-12Z', g.cyl('#dfe5ec'))
        : E(0, -148, 14, 24, g.cyl('#dfe5ec')) + E(-3, -152, 5, 12, WHITE, { op: 0.6 }),
    );
  return [shadow(56, 128, 216), spoon(-30, false), spoon(-10, true), spoon(10, false), spoon(30, true)];
};

// ===========================================================================
// Optical fit: [dx, scale] per shape. Compositions with an accessory on one
// side (cap, scoop, spray mist) are nudged so the whole reads as centred, and
// compact objects are scaled up (around the ground point) toward ~70 % height.
// ===========================================================================
const OPTICAL_FIT = {
  'spices/box': [0, 1.15],
  'snacks/nuts': [0, 1.1],
  'drinks/tea-box': [-4, 1.15],
  'dairy/tub': [0, 1.12],
  'frozen/box': [0, 1.08],
  'fruits/lychee': [-8, 1],
  'bakery/toast': [0, 1.1],
  'cosmetics/lipstick': [-22, 1],
  'cosmetics/kajal': [-16, 1],
  'personal-care/tissue-roll': [0, 1.1],
  'baby/formula-tin': [-12, 1],
  'baby/baby-lotion': [-10, 1],
  'baby/cereal-box': [-4, 1.12],
  'cleaning/spray': [14, 1],
  'cleaning/mosquito-coil': [0, 1.12],
  'household/broom': [-22, 1],
  'household/air-freshener': [12, 1],
  'stationery/glue': [-12, 1],
  'kitchen/glass-set': [0, 1.1],
  'others/honey-jar': [-12, 1],
};
for (const [ref, [dx, s]] of Object.entries(OPTICAL_FIT)) {
  const draw = SHAPES[ref];
  const transform = [dx ? `translate(${dx} 0)` : '', s !== 1 ? about(128, 221, s) : ''].filter(Boolean).join(' ');
  SHAPES[ref] = (p, g) => G(transform, draw(p, g));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
function renderSvg(draw, palette, prefix) {
  const g = makeGradients(prefix);
  const body = [draw(palette, g)].flat(Infinity).join('');
  const defs = g.defs.length ? `<defs>${g.defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${defs}${body}</svg>\n`;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'products');

const missing = Object.entries(ART_REGISTRY)
  .flatMap(([folder, shapes]) => shapes.map((shape) => `${folder}/${shape}`))
  .filter((ref) => typeof SHAPES[ref] !== 'function');
if (missing.length) {
  console.error(`generate-product-art: no drawing function for ${missing.length} shape(s): ${missing.join(', ')}`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let files = 0;
let bytes = 0;
let largest = { ref: '', size: 0 };
let shapeIndex = 0;
for (const [folder, shapes] of Object.entries(ART_REGISTRY)) {
  fs.mkdirSync(path.join(outDir, folder), { recursive: true });
  for (const shape of shapes) {
    for (let n = 1; n <= ART_VARIANT_COUNT; n += 1) {
      const palette = PALETTES[(n - 1) % PALETTES.length];
      const svg = renderSvg(SHAPES[`${folder}/${shape}`], palette, `s${shapeIndex.toString(36)}v${n}_`);
      const size = Buffer.byteLength(svg);
      if (size > largest.size) largest = { ref: `${folder}/${shape}-${n}`, size };
      fs.writeFileSync(path.join(outDir, folder, `${shape}-${n}.svg`), svg);
      files += 1;
      bytes += size;
    }
    shapeIndex += 1;
  }
}

const manifest = { variants: ART_VARIANT_COUNT, folders: ART_REGISTRY };
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.info(
  `Product art: ${files} SVGs (${shapeIndex} shapes × ${ART_VARIANT_COUNT}) in public/products, ` +
    `${(bytes / 1024).toFixed(1)} KB total, largest ${largest.ref} ${(largest.size / 1024).toFixed(1)} KB`,
);
