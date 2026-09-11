import { AppError } from '@/domain/errors';
import { newId } from '@/domain/ids';
import type { Brand, Category, Id, Unit } from '@/types';
import type { SqlClient } from '@/types/database';
import type { Actor, BrandInput, CatalogRepository, CategoryInput } from '../types';
import { mapBrand, mapCategory, mapUnit } from './mappers';
import { SqlError, bool, toNum, toStr } from './sql';
import { auditStatement } from './statements';

export class LocalCatalogRepository implements CatalogRepository {
  constructor(private readonly sql: SqlClient) {}

  async listCategories(): Promise<Category[]> {
    const rows = await this.sql.all('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY parent_id IS NOT NULL, sort_order, name_en');
    return rows.map(mapCategory);
  }

  async saveCategory(input: CategoryInput, actor: Actor): Promise<Category> {
    const now = new Date().toISOString();
    const id = input.id ?? newId();
    const params = [input.parentId, input.code.trim(), input.name.bn.trim(), input.name.en.trim(), input.icon, input.color, input.image, input.sortOrder, bool(input.isActive), now];
    try {
      await this.sql.transaction([
        input.id
          ? {
              sql: 'UPDATE categories SET parent_id = ?, code = ?, name_bn = ?, name_en = ?, icon = ?, color = ?, image = ?, sort_order = ?, is_active = ?, updated_at = ?, version = version + 1 WHERE id = ?',
              params: [...params, id],
            }
          : {
              sql: 'INSERT INTO categories (parent_id, code, name_bn, name_en, icon, color, image, sort_order, is_active, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              params: [...params, id, now],
            },
        auditStatement(actor, 'category.saved', 'category', id, { code: input.code, name: input.name.en }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateCode');
      throw new AppError('saveFailed', {}, error);
    }
    const row = await this.sql.get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!row) throw new AppError('saveFailed');
    return mapCategory(row);
  }

  async listBrands(): Promise<Array<Brand & { productCount: number }>> {
    const rows = await this.sql.all(
      `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.deleted_at IS NULL) AS product_count
         FROM brands b WHERE b.deleted_at IS NULL ORDER BY b.name_en COLLATE NOCASE`,
    );
    return rows.map((row) => ({ ...mapBrand(row), productCount: toNum(row.product_count) }));
  }

  async saveBrand(input: BrandInput, actor: Actor): Promise<Brand> {
    const now = new Date().toISOString();
    const id = input.id ?? newId();
    const params = [input.code.trim(), input.name.bn.trim(), input.name.en.trim(), input.logo, input.color, bool(input.isActive), now];
    try {
      await this.sql.transaction([
        input.id
          ? { sql: 'UPDATE brands SET code = ?, name_bn = ?, name_en = ?, logo = ?, color = ?, is_active = ?, updated_at = ?, version = version + 1 WHERE id = ?', params: [...params, id] }
          : { sql: 'INSERT INTO brands (code, name_bn, name_en, logo, color, is_active, updated_at, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [...params, id, now] },
        auditStatement(actor, 'brand.saved', 'brand', id, { code: input.code, name: input.name.en }, now),
      ]);
    } catch (error) {
      if (error instanceof SqlError && error.code === 'constraint_unique') throw new AppError('duplicateCode');
      throw new AppError('saveFailed', {}, error);
    }
    const row = await this.sql.get('SELECT * FROM brands WHERE id = ?', [id]);
    if (!row) throw new AppError('saveFailed');
    return mapBrand(row);
  }

  async listUnits(): Promise<Unit[]> {
    const rows = await this.sql.all('SELECT * FROM units ORDER BY sort_order, name_en');
    return rows.map(mapUnit);
  }

  async saveUnit(unit: Unit): Promise<Unit> {
    const now = new Date().toISOString();
    await this.sql.run(
      `INSERT INTO units (id, name_bn, name_en, short_bn, short_en, allow_decimal, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name_bn = excluded.name_bn, name_en = excluded.name_en, short_bn = excluded.short_bn, short_en = excluded.short_en,
         allow_decimal = excluded.allow_decimal, sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = excluded.updated_at`,
      [unit.id.trim(), unit.name.bn, unit.name.en, unit.short.bn, unit.short.en, bool(unit.allowDecimal), unit.sortOrder, bool(unit.isActive), now, now],
    );
    return unit;
  }

  async categoryProductCounts(): Promise<Map<Id, number>> {
    const rows = await this.sql.all(
      `SELECT category_id AS id, COUNT(*) AS count FROM products WHERE deleted_at IS NULL GROUP BY category_id
       UNION ALL
       SELECT subcategory_id AS id, COUNT(*) AS count FROM products WHERE deleted_at IS NULL AND subcategory_id IS NOT NULL GROUP BY subcategory_id`,
    );
    return new Map(rows.map((row) => [toStr(row.id), toNum(row.count)]));
  }
}
