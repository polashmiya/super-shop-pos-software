import { memo, useState } from 'react';
import { useCatalogStore } from '@/stores/catalogStore';
import type { Product } from '@/types';
import { cn } from '@/components/ui/cn';
import { categoryIcon, resolveImageSrc } from './categoryIcons';

interface ProductImageProps {
  product: Pick<Product, 'image' | 'categoryId'>;
  className?: string;
  /** Icon size for the fallback artwork. */
  iconSize?: number;
  rounded?: boolean;
}

/**
 * Product picture: bundled artwork or an uploaded photo. If the image is
 * missing or fails to load, a category icon tile is shown instead — the UI
 * never shows a broken image.
 */
export const ProductImage = memo(function ProductImage({ product, className, iconSize = 28, rounded = true }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const category = useCatalogStore((state) => state.categoryById.get(product.categoryId));
  const src = resolveImageSrc(product.image);

  if (!src || failedSrc === src) {
    const Icon = categoryIcon(category?.icon);
    return (
      <div className={cn('flex items-center justify-center bg-image-tile text-fg-subtle', rounded && 'rounded-md', className)} aria-hidden>
        <Icon size={iconSize} strokeWidth={1.6} />
      </div>
    );
  }
  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-image-tile', rounded && 'rounded-md', className)}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(src)}
        className={cn('h-full w-full', src.startsWith('data:') ? 'object-cover' : 'object-contain p-[8%]')}
      />
    </div>
  );
});
