import type { CSSProperties } from 'react';
import { matchesTokens, normalizeSearch, tokenize } from '@/domain/text';
import type { Category, Id } from '@/types';

/* ==========================================================================
   Small helpers for the category, brand and unit editors.
   ========================================================================== */

/** Colour swatches offered for categories and brands (stored as hex). */
export const CATALOG_COLORS = [
  '#64748b',
  '#78716c',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#2e7d32',
  '#059669',
  '#0d9488',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#c026d3',
  '#db2777',
] as const;

export const DEFAULT_CATALOG_COLOR = CATALOG_COLORS[0];

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Soft tinted tile for a data colour (category/brand), readable in both themes. */
export function tintStyle(color: string, strength = 18): CSSProperties {
  const safe = isHexColor(color) ? color : DEFAULT_CATALOG_COLOR;
  return { backgroundColor: `color-mix(in srgb, ${safe} ${strength}%, transparent)`, color: `color-mix(in srgb, ${safe} 70%, var(--c-fg))` };
}

/** "Cooking Oil & Ghee" → "cooking-oil-ghee" (matches the service normalisation). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const UNIT_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,15}$/;

/** Main categories in display order, each with its subcategories. */
export function categoryTree(categories: readonly Category[]): Array<{ category: Category; children: Category[] }> {
  const byParent = new Map<Id, Category[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }
  const order = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en);
  return categories
    .filter((category) => !category.parentId)
    .sort(order)
    .map((category) => ({ category, children: (byParent.get(category.id) ?? []).sort(order) }));
}

export type CategoryNode = ReturnType<typeof categoryTree>[number];

/** True when a category's names or code contain every search token. */
function categoryMatches(category: Category, tokens: readonly string[]): boolean {
  return matchesTokens(normalizeSearch(`${category.name.bn} ${category.name.en} ${category.code}`), tokens);
}

/**
 * Filters the category tree by a search query: a matching main category keeps
 * all its subcategories; otherwise only matching subcategories are kept.
 */
export function filterCategoryTree(tree: readonly CategoryNode[], query: string): CategoryNode[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [...tree];
  const result: CategoryNode[] = [];
  for (const node of tree) {
    if (categoryMatches(node.category, tokens)) {
      result.push(node);
      continue;
    }
    const children = node.children.filter((child) => categoryMatches(child, tokens));
    if (children.length > 0) result.push({ category: node.category, children });
  }
  return result;
}

/** Counts items per key (e.g. products per brand or unit). */
export function countBy<T>(items: readonly T[], key: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Parses a whole number typed by the user (Bangla digits allowed); null when invalid. */
export function parseWholeNumber(input: string): number | null {
  const ascii = input.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)).trim();
  if (!/^-?\d{1,6}$/.test(ascii)) return null;
  return Number(ascii);
}
