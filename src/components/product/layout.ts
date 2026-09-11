import { PRODUCT_IMAGE_HEIGHT } from '@/config/theme.config';
import type { SizeOption } from '@/types';

export interface ProductCardDisplay {
  showImage: boolean;
  imageSize: SizeOption;
  showSku: boolean;
  showBarcode: boolean;
  showStock: boolean;
  showMrp: boolean;
  showDiscount: boolean;
  showSecondaryName: boolean;
  expiringDays: number;
}

/** Height of a card for the virtual grid (must match the rendered layout). */
export function productCardHeight(display: Pick<ProductCardDisplay, 'showImage' | 'imageSize' | 'showSecondaryName'>, rootFontPx: number): number {
  const scale = rootFontPx / 15;
  const text = Math.round((display.showSecondaryName ? 124 : 106) * scale);
  return display.showImage ? text + PRODUCT_IMAGE_HEIGHT[display.imageSize] : Math.round((display.showSecondaryName ? 118 : 100) * scale);
}
