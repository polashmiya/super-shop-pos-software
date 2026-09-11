import {
  Apple,
  Baby,
  Banana,
  Bath,
  Beef,
  Cake,
  Candy,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Droplet,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gift,
  GlassWater,
  Grape,
  House,
  IceCreamCone,
  Leaf,
  Lightbulb,
  Milk,
  Package,
  PawPrint,
  Pencil,
  Pill,
  Popcorn,
  Salad,
  Sandwich,
  Shirt,
  ShoppingBasket,
  Snowflake,
  Soup,
  Sparkles,
  SprayCan,
  Store,
  Utensils,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons available for categories (stored by name in the database). Only
 * these are bundled, so the app does not ship the whole icon set. Add a
 * name here to make it selectable in the category editor.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Apple,
  Baby,
  Banana,
  Bath,
  Beef,
  Cake,
  Candy,
  Carrot,
  ChefHat,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  CupSoda,
  Droplet,
  Drumstick,
  Egg,
  Fish,
  Flame,
  Gift,
  GlassWater,
  Grape,
  House,
  IceCreamCone,
  Leaf,
  Lightbulb,
  Milk,
  Package,
  PawPrint,
  Pencil,
  Pill,
  Popcorn,
  Salad,
  Sandwich,
  Shirt,
  ShoppingBasket,
  Snowflake,
  Soup,
  Sparkles,
  SprayCan,
  Store,
  Utensils,
  Wheat,
};

export function categoryIcon(name: string | undefined | null): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Package;
}

/** Resolves a product image reference to a URL the renderer can load, or null. */
export function resolveImageSrc(image: string | null | undefined): string | null {
  if (!image) return null;
  if (image.startsWith('data:image/')) return image;
  if (/^products\/[a-z0-9-]+\/[a-z0-9-]+\.svg$/.test(image)) return `./${image}`;
  return null;
}
