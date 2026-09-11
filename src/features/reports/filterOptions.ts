import { repos } from '@/repositories';
import { catalogService } from '@/services/catalogService';
import { supplierService } from '@/services/peopleService';
import { counterService } from '@/services/shiftService';
import type { BilingualText, Brand, Category, Counter, Id, Supplier, User } from '@/types';
import type { FilterKey } from './types';

/* ==========================================================================
   Choices for the report filters (only the lists a report actually uses
   are loaded). A list that fails to load simply shows "All …".
   ========================================================================== */

export interface FilterChoice {
  id: Id;
  name: BilingualText;
}

export interface FilterDirectory {
  cashiers: FilterChoice[];
  counters: FilterChoice[];
  categories: FilterChoice[];
  brands: FilterChoice[];
  suppliers: FilterChoice[];
}

function safe<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return load().catch(() => []);
  } catch {
    return Promise.resolve([]);
  }
}

const byEnglishName = (a: FilterChoice, b: FilterChoice) => a.name.en.localeCompare(b.name.en);

export async function loadFilterDirectory(filters: readonly FilterKey[]): Promise<FilterDirectory> {
  const needs = (key: FilterKey) => filters.includes(key);
  const [users, counters, categories, brands, suppliers] = await Promise.all([
    // Former staff are included so old sales can still be filtered by cashier.
    needs('cashier') ? safe(() => repos().users.list(true)) : Promise.resolve([] as User[]),
    needs('counter') ? safe(() => counterService.list()) : Promise.resolve([] as Counter[]),
    needs('category') ? safe(() => catalogService.listCategories()) : Promise.resolve([] as Category[]),
    needs('brand') ? safe(() => catalogService.listBrands()) : Promise.resolve([] as Brand[]),
    needs('supplier') ? safe(() => supplierService.list(undefined, 'all')) : Promise.resolve([] as Supplier[]),
  ]);
  return {
    cashiers: users.map((user) => ({ id: user.id, name: user.name })).sort(byEnglishName),
    counters: counters.map((counter) => ({ id: counter.id, name: counter.name })),
    categories: categories
      .filter((category) => category.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((category) => ({ id: category.id, name: category.name })),
    brands: brands.map((brand) => ({ id: brand.id, name: brand.name })).sort(byEnglishName),
    suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: { en: supplier.name, bn: supplier.name } })).sort(byEnglishName),
  };
}
