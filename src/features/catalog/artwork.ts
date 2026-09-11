import { ART_REGISTRY, ART_VARIANT_COUNT, type ArtFolder } from '@/data/seed/catalog/artRegistry';
import type { Category, Id, Product } from '@/types';

/* ==========================================================================
   Bundled product artwork: every (folder, shape) pair has colour variants
   on disk at public/products/<folder>/<shape>-<n>.svg.
   ========================================================================== */

export interface ArtworkItem {
  path: string;
  folder: ArtFolder;
  shape: string;
  variant: number;
}

export const ART_FOLDERS = Object.keys(ART_REGISTRY) as ArtFolder[];

function buildArtwork(): ArtworkItem[] {
  const items: ArtworkItem[] = [];
  for (const folder of ART_FOLDERS) {
    for (const shape of ART_REGISTRY[folder] as readonly string[]) {
      for (let variant = 1; variant <= ART_VARIANT_COUNT; variant += 1) {
        items.push({ path: `products/${folder}/${shape}-${variant}.svg`, folder, shape, variant });
      }
    }
  }
  return items;
}

/** Every bundled artwork image (≈950 files). */
export const ARTWORK: readonly ArtworkItem[] = buildArtwork();

const ARTWORK_PATH = /^products\/([a-z0-9-]+)\/([a-z0-9-]+)-(\d+)\.svg$/;

export function isArtFolder(value: string): value is ArtFolder {
  return Object.prototype.hasOwnProperty.call(ART_REGISTRY, value);
}

/** Parses "products/oil/bottle-3.svg"; null for uploaded photos and unknown paths. */
export function parseArtworkPath(image: string | null | undefined): ArtworkItem | null {
  if (!image) return null;
  const match = ARTWORK_PATH.exec(image);
  if (!match || !isArtFolder(match[1])) return null;
  return { path: image, folder: match[1], shape: match[2], variant: Number(match[3]) };
}

/** Category codes whose artwork folder has a different name. */
const FOLDER_ALIASES: Record<string, ArtFolder> = {
  'rice-dal': 'rice',
  beverages: 'drinks',
  'noodles-pasta': 'noodles',
  'home-care': 'household',
};

/**
 * The artwork folder that best fits a category: the folder most used by its
 * products, else a folder matching the category (or parent) code.
 */
export function suggestedArtFolder(categoryId: Id | null | undefined, products: readonly Product[], categoryById: ReadonlyMap<Id, Category>): ArtFolder | null {
  if (!categoryId) return null;
  const counts = new Map<ArtFolder, number>();
  for (const product of products) {
    if (product.categoryId !== categoryId && product.subcategoryId !== categoryId) continue;
    const art = parseArtworkPath(product.image);
    if (art) counts.set(art.folder, (counts.get(art.folder) ?? 0) + 1);
  }
  let best: ArtFolder | null = null;
  let bestCount = 0;
  for (const [folder, count] of counts) {
    if (count > bestCount) {
      best = folder;
      bestCount = count;
    }
  }
  if (best) return best;
  const category = categoryById.get(categoryId);
  for (const code of [category?.code, category?.parentId ? categoryById.get(category.parentId)?.code : undefined]) {
    if (!code) continue;
    if (isArtFolder(code)) return code;
    if (FOLDER_ALIASES[code]) return FOLDER_ALIASES[code];
  }
  return null;
}

/** "pet-bottle" → "pet bottle" (search haystack). */
export function shapeWords(shape: string): string {
  return shape.replace(/-/g, ' ');
}
