import type { DateRange, ReportFilter } from '@/types';
import type { SqlClient, SqlValue } from '@/types/database';
import type { ReportQueryName, ReportRepository, ReportRow } from '../types';
import { Where } from './sql';

/* ==========================================================================
   Reporting queries (SQLite aggregates, indexed by date). Every figure in
   the dashboard and the reports is derived from real sales, payments,
   returns, stock movements, purchases, shifts and expenses.
   ========================================================================== */

type Filter = Partial<ReportFilter> & { from: string; to: string };

const LOCAL_DAY = "date(s.created_at, 'localtime')";

/** Sales filter (alias s); item-level filters (category/brand) need alias p for products. */
function salesWhere(filter: Filter, options: { itemLevel?: boolean } = {}): Where {
  const where = new Where()
    .add("s.status <> 'cancelled'")
    .add('s.created_at >= ?', filter.from)
    .add('s.created_at < ?', filter.to)
    .when(filter.branchId && filter.branchId !== 'all', 's.branch_id = ?', filter.branchId ?? null)
    .when(filter.counterId && filter.counterId !== 'all', 's.counter_id = ?', filter.counterId ?? null)
    .when(filter.cashierId && filter.cashierId !== 'all', 's.cashier_id = ?', filter.cashierId ?? null)
    .when(filter.customerId && filter.customerId !== 'all', 's.customer_id = ?', filter.customerId ?? null)
    .when(filter.paymentMethod && filter.paymentMethod !== 'all', 'EXISTS (SELECT 1 FROM payments pm WHERE pm.sale_id = s.id AND pm.method = ?)', filter.paymentMethod ?? null);
  if (options.itemLevel) {
    where
      .when(filter.categoryId && filter.categoryId !== 'all', '(p.category_id = ? OR p.subcategory_id = ?)', filter.categoryId ?? null, filter.categoryId ?? null)
      .when(filter.brandId && filter.brandId !== 'all', 'p.brand_id = ?', filter.brandId ?? null);
  } else {
    where
      .when(
        filter.categoryId && filter.categoryId !== 'all',
        'EXISTS (SELECT 1 FROM sale_items fi JOIN products fp ON fp.id = fi.product_id WHERE fi.sale_id = s.id AND (fp.category_id = ? OR fp.subcategory_id = ?))',
        filter.categoryId ?? null,
        filter.categoryId ?? null,
      )
      .when(
        filter.brandId && filter.brandId !== 'all',
        'EXISTS (SELECT 1 FROM sale_items fi JOIN products fp ON fp.id = fi.product_id WHERE fi.sale_id = s.id AND fp.brand_id = ?)',
        filter.brandId ?? null,
      );
  }
  return where;
}

function productWhere(filter: Filter): Where {
  return new Where()
    .add('p.deleted_at IS NULL')
    .add("p.status = 'active'")
    .when(filter.categoryId && filter.categoryId !== 'all', '(p.category_id = ? OR p.subcategory_id = ?)', filter.categoryId ?? null, filter.categoryId ?? null)
    .when(filter.brandId && filter.brandId !== 'all', 'p.brand_id = ?', filter.brandId ?? null)
    .when(filter.supplierId && filter.supplierId !== 'all', 'p.supplier_id = ?', filter.supplierId ?? null);
}

const ITEM_FROM = 'FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN products p ON p.id = si.product_id';

function build(name: ReportQueryName, filter: Filter, extra: Record<string, string | number>): { sql: string; params: SqlValue[] } {
  switch (name) {
    case 'salesByDay':
    case 'salesByHour':
    case 'salesByMonth': {
      const key = name === 'salesByDay' ? LOCAL_DAY : name === 'salesByHour' ? "strftime('%H', s.created_at, 'localtime')" : "strftime('%Y-%m', s.created_at, 'localtime')";
      const where = salesWhere(filter);
      return {
        sql: `SELECT ${key} AS key, COUNT(*) AS orders, SUM(s.grand_total) AS sales, SUM(s.discount_total) AS discount, SUM(s.tax_total) AS tax,
                     SUM(s.item_count) AS items, COUNT(DISTINCT s.customer_id) AS customers
                FROM sales s ${where} GROUP BY key ORDER BY key`,
        params: where.params,
      };
    }
    case 'paymentMethods': {
      const where = salesWhere(filter);
      return {
        sql: `SELECT p.method AS method, COALESCE(p.provider, '') AS provider, COUNT(DISTINCT p.sale_id) AS count, SUM(p.amount) AS amount
                FROM payments p JOIN sales s ON s.id = p.sale_id ${where}
               GROUP BY p.method, COALESCE(p.provider, '') ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'productSales': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT si.product_id AS id, MAX(si.name_en) AS name_en, MAX(si.name_bn) AS name_bn, MAX(si.sku) AS sku, MAX(p.image) AS image,
                     SUM(si.quantity) AS quantity, SUM(si.returned_quantity) AS returned, SUM(si.line_total) AS amount,
                     COUNT(DISTINCT si.sale_id) AS orders, SUM(si.cost_price * si.quantity) AS cost, SUM(si.tax_amount) AS tax,
                     SUM(si.discount_amount + si.order_discount_amount) AS discount
                ${ITEM_FROM} ${where}
               GROUP BY si.product_id ORDER BY amount DESC LIMIT ?`,
        params: [...where.params, Number(extra.limit ?? 500)],
      };
    }
    case 'categorySales': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT c.id AS id, c.name_en AS name_en, c.name_bn AS name_bn, SUM(si.line_total) AS amount, SUM(si.quantity) AS quantity,
                     COUNT(DISTINCT si.sale_id) AS orders, SUM(si.cost_price * si.quantity) AS cost, SUM(si.tax_amount) AS tax
                ${ITEM_FROM} JOIN categories c ON c.id = p.category_id ${where}
               GROUP BY c.id ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'brandSales': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT b.id AS id, b.name_en AS name_en, b.name_bn AS name_bn, SUM(si.line_total) AS amount, SUM(si.quantity) AS quantity,
                     COUNT(DISTINCT si.sale_id) AS orders, COUNT(DISTINCT si.product_id) AS products, SUM(si.cost_price * si.quantity) AS cost
                ${ITEM_FROM} JOIN brands b ON b.id = p.brand_id ${where}
               GROUP BY b.id ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'cashierSales': {
      const where = salesWhere(filter);
      return {
        sql: `SELECT s.cashier_id AS id, COALESCE(u.name_en, MAX(s.cashier_name)) AS name_en, COALESCE(u.name_bn, MAX(s.cashier_name)) AS name_bn, u.role_id AS role,
                     COUNT(*) AS orders, SUM(s.grand_total) AS amount, SUM(s.item_count) AS items, SUM(s.discount_total) AS discount,
                     SUM(s.returned_total) AS returns, COUNT(DISTINCT s.shift_id) AS shifts
                FROM sales s LEFT JOIN users u ON u.id = s.cashier_id ${where}
               GROUP BY s.cashier_id ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'counterSales': {
      const where = salesWhere(filter);
      return {
        sql: `SELECT s.counter_id AS id, c.name_en AS name_en, c.name_bn AS name_bn, COUNT(*) AS orders, SUM(s.grand_total) AS amount
                FROM sales s JOIN counters c ON c.id = s.counter_id ${where}
               GROUP BY s.counter_id ORDER BY c.code`,
        params: where.params,
      };
    }
    case 'discounts': {
      const where = salesWhere(filter).add('s.discount_total > 0');
      return {
        sql: `SELECT s.id, s.invoice_no, s.created_at, s.cashier_name, s.customer_name, s.subtotal, s.item_discount_total, s.order_discount_total,
                     s.discount_total, s.discount_reason, s.discount_approved_by, s.grand_total
                FROM sales s ${where} ORDER BY s.discount_total DESC LIMIT 2000`,
        params: where.params,
      };
    }
    case 'vatByRate': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT si.tax_rate AS rate, SUM(si.line_total - si.tax_amount) AS taxable, SUM(si.tax_amount) AS tax, SUM(si.line_total) AS gross,
                     COUNT(DISTINCT si.sale_id) AS orders, COUNT(*) AS lines
                ${ITEM_FROM} ${where}
               GROUP BY si.tax_rate ORDER BY si.tax_rate`,
        params: where.params,
      };
    }
    case 'returns': {
      const where = new Where()
        .add('r.created_at >= ?', filter.from)
        .add('r.created_at < ?', filter.to)
        .when(filter.counterId && filter.counterId !== 'all', 'r.counter_id = ?', filter.counterId ?? null)
        .when(filter.cashierId && filter.cashierId !== 'all', 'r.cashier_id = ?', filter.cashierId ?? null);
      return {
        sql: `SELECT r.id, r.return_no, r.invoice_no, r.sale_id, r.created_at, r.cashier_name, r.reason, r.refund_method, r.refund_total, r.tax_total,
                     r.approved_by, (SELECT SUM(quantity) FROM return_items ri WHERE ri.return_id = r.id) AS quantity
                FROM returns r ${where} ORDER BY r.created_at DESC`,
        params: where.params,
      };
    }
    case 'returnItems': {
      const where = new Where().add('r.created_at >= ?', filter.from).add('r.created_at < ?', filter.to);
      return {
        sql: `SELECT ri.product_id AS id, MAX(ri.name_en) AS name_en, MAX(ri.name_bn) AS name_bn, SUM(ri.quantity) AS quantity, SUM(ri.refund_amount) AS amount,
                     COUNT(DISTINCT r.id) AS orders, SUM(CASE WHEN ri.condition = 'damaged' THEN ri.quantity ELSE 0 END) AS damaged
                FROM return_items ri JOIN returns r ON r.id = ri.return_id ${where}
               GROUP BY ri.product_id ORDER BY amount DESC LIMIT 100`,
        params: where.params,
      };
    }
    case 'inventoryByCategory': {
      const where = productWhere(filter);
      return {
        sql: `SELECT c.id, c.name_en, c.name_bn, COUNT(p.id) AS products, SUM(MAX(COALESCE(sb.quantity, 0), 0)) AS quantity,
                     SUM(MAX(COALESCE(sb.quantity, 0), 0) * COALESCE(sb.avg_cost, p.purchase_price)) AS value,
                     SUM(MAX(COALESCE(sb.quantity, 0), 0) * p.selling_price) AS retail,
                     SUM(CASE WHEN COALESCE(sb.quantity, 0) > 0 AND COALESCE(sb.quantity, 0) <= p.min_stock THEN 1 ELSE 0 END) AS low,
                     SUM(CASE WHEN COALESCE(sb.quantity, 0) <= 0 THEN 1 ELSE 0 END) AS out_of_stock
                FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN stock_balances sb ON sb.product_id = p.id ${where}
               GROUP BY c.id ORDER BY value DESC`,
        params: where.params,
      };
    }
    case 'stockMovementSummary': {
      const where = new Where().add('m.created_at >= ?', filter.from).add('m.created_at < ?', filter.to);
      return {
        sql: `SELECT m.type, COUNT(*) AS count, SUM(m.quantity) AS quantity, SUM(ABS(m.quantity) * m.unit_cost) AS value
                FROM stock_movements m ${where} GROUP BY m.type ORDER BY count DESC`,
        params: where.params,
      };
    }
    case 'stockMovements': {
      const where = new Where()
        .add('m.created_at >= ?', filter.from)
        .add('m.created_at < ?', filter.to)
        .when(extra.type && extra.type !== 'all', 'm.type = ?', extra.type ?? null)
        .when(filter.categoryId && filter.categoryId !== 'all', '(p.category_id = ? OR p.subcategory_id = ?)', filter.categoryId ?? null, filter.categoryId ?? null);
      return {
        sql: `SELECT m.id, m.created_at, m.type, m.quantity, m.balance_after, m.unit_cost, m.reference_no, m.reason, m.user_name, p.sku, p.name_en, p.name_bn
                FROM stock_movements m JOIN products p ON p.id = m.product_id ${where}
               ORDER BY m.created_at DESC LIMIT 5000`,
        params: where.params,
      };
    }
    case 'lowStock':
    case 'outOfStock': {
      const where = productWhere(filter).add(
        name === 'lowStock' ? 'COALESCE(sb.quantity, 0) > 0 AND COALESCE(sb.quantity, 0) <= p.min_stock' : 'COALESCE(sb.quantity, 0) <= 0',
      );
      return {
        sql: `SELECT p.id, p.sku, p.name_en, p.name_bn, p.image, c.name_en AS category_en, c.name_bn AS category_bn, COALESCE(sb.quantity, 0) AS stock,
                     p.min_stock, p.max_stock, MAX(p.max_stock - COALESCE(sb.quantity, 0), 0) AS reorder, COALESCE(sb.avg_cost, p.purchase_price) AS cost,
                     s.name AS supplier, sb.last_movement_at,
                     (SELECT MAX(sa.created_at) FROM sale_items si2 JOIN sales sa ON sa.id = si2.sale_id WHERE si2.product_id = p.id) AS last_sale_at
                FROM products p
                JOIN categories c ON c.id = p.category_id
                LEFT JOIN stock_balances sb ON sb.product_id = p.id
                LEFT JOIN suppliers s ON s.id = p.supplier_id
                ${where}
               ORDER BY ${name === 'lowStock' ? 'COALESCE(sb.quantity, 0) * 1.0 / MAX(p.min_stock, 1)' : 'last_sale_at DESC'}`,
        params: where.params,
      };
    }
    case 'stockValuation': {
      const where = productWhere(filter);
      return {
        sql: `SELECT p.id, p.sku, p.name_en, p.name_bn, c.name_en AS category_en, c.name_bn AS category_bn, MAX(COALESCE(sb.quantity, 0), 0) AS stock,
                     COALESCE(sb.avg_cost, p.purchase_price) AS cost, p.selling_price AS price,
                     MAX(COALESCE(sb.quantity, 0), 0) * COALESCE(sb.avg_cost, p.purchase_price) AS value,
                     MAX(COALESCE(sb.quantity, 0), 0) * p.selling_price AS retail
                FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN stock_balances sb ON sb.product_id = p.id
                ${where}
               ORDER BY value DESC`,
        params: where.params,
      };
    }
    case 'purchases': {
      const where = new Where()
        .add('pu.deleted_at IS NULL')
        .add('pu.created_at >= ?', filter.from)
        .add('pu.created_at < ?', filter.to)
        .when(filter.supplierId && filter.supplierId !== 'all', 'pu.supplier_id = ?', filter.supplierId ?? null);
      return {
        sql: `SELECT pu.id, pu.po_no, pu.order_date, pu.supplier_name, pu.status, pu.item_count, pu.grand_total, pu.paid_amount,
                     pu.grand_total - pu.paid_amount AS due, pu.received_at
                FROM purchases pu ${where} ORDER BY pu.created_at DESC`,
        params: where.params,
      };
    }
    case 'supplierPurchases': {
      const where = new Where()
        .add('pu.deleted_at IS NULL')
        .add("pu.status <> 'cancelled'")
        .add('pu.created_at >= ?', filter.from)
        .add('pu.created_at < ?', filter.to)
        .when(filter.supplierId && filter.supplierId !== 'all', 'pu.supplier_id = ?', filter.supplierId ?? null);
      return {
        sql: `SELECT pu.supplier_id AS id, MAX(pu.supplier_name) AS name, COUNT(*) AS orders, SUM(pu.grand_total) AS amount,
                     SUM(CASE WHEN pu.status IN ('received', 'partially_received') THEN pu.grand_total ELSE 0 END) AS received,
                     SUM(pu.paid_amount) AS paid, SUM(pu.grand_total - pu.paid_amount) AS due
                FROM purchases pu ${where} GROUP BY pu.supplier_id ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'customerPurchases': {
      const where = salesWhere(filter).add('s.customer_id IS NOT NULL');
      return {
        sql: `SELECT s.customer_id AS id, MAX(s.customer_name) AS name, MAX(s.customer_phone) AS phone, MAX(cu.customer_type) AS type, COUNT(*) AS orders,
                     SUM(s.grand_total) AS amount, SUM(s.returned_total) AS returns, SUM(s.points_earned) AS points, MAX(s.created_at) AS last_at
                FROM sales s LEFT JOIN customers cu ON cu.id = s.customer_id ${where}
               GROUP BY s.customer_id ORDER BY amount DESC LIMIT ?`,
        params: [...where.params, Number(extra.limit ?? 300)],
      };
    }
    case 'profitByCategory': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT c.id, c.name_en, c.name_bn, SUM(si.line_total - si.tax_amount) AS revenue, SUM(si.cost_price * si.quantity) AS cost,
                     SUM(si.line_total - si.tax_amount) - SUM(si.cost_price * si.quantity) AS profit, SUM(si.quantity) AS quantity
                ${ITEM_FROM} JOIN categories c ON c.id = p.category_id ${where}
               GROUP BY c.id ORDER BY profit DESC`,
        params: where.params,
      };
    }
    case 'cashMovements': {
      const where = new Where()
        .add('cm.created_at >= ?', filter.from)
        .add('cm.created_at < ?', filter.to)
        .when(filter.counterId && filter.counterId !== 'all', 'cm.counter_id = ?', filter.counterId ?? null)
        .when(extra.type && extra.type !== 'all', 'cm.type = ?', extra.type ?? null);
      return {
        sql: `SELECT cm.id, cm.created_at, cm.type, cm.amount, cm.reference_no, cm.note, cm.user_name, cs.shift_no, c.name_en AS counter_en, c.name_bn AS counter_bn
                FROM cash_movements cm JOIN cash_sessions cs ON cs.id = cm.shift_id JOIN counters c ON c.id = cm.counter_id ${where}
               ORDER BY cm.created_at DESC LIMIT 5000`,
        params: where.params,
      };
    }
    case 'shifts': {
      const where = new Where()
        .add('cs.opened_at >= ?', filter.from)
        .add('cs.opened_at < ?', filter.to)
        .when(filter.counterId && filter.counterId !== 'all', 'cs.counter_id = ?', filter.counterId ?? null)
        .when(filter.cashierId && filter.cashierId !== 'all', 'cs.opened_by = ?', filter.cashierId ?? null);
      return {
        sql: `SELECT cs.id, cs.shift_no, cs.status, cs.opened_at, cs.closed_at, cs.opened_by_name, cs.opening_cash, cs.actual_cash, cs.difference, cs.closing_totals,
                     c.name_en AS counter_en, c.name_bn AS counter_bn,
                     (SELECT COUNT(*) FROM sales s WHERE s.shift_id = cs.id AND s.status <> 'cancelled') AS orders,
                     (SELECT COALESCE(SUM(s.grand_total), 0) FROM sales s WHERE s.shift_id = cs.id AND s.status <> 'cancelled') AS amount
                FROM cash_sessions cs JOIN counters c ON c.id = cs.counter_id ${where}
               ORDER BY cs.opened_at DESC`,
        params: where.params,
      };
    }
    case 'expenses': {
      const where = new Where().add('e.deleted_at IS NULL').add('e.created_at >= ?', filter.from).add('e.created_at < ?', filter.to);
      return {
        sql: `SELECT e.id, e.expense_no, e.expense_date, e.amount, e.description, e.paid_from, e.status, e.user_name, e.approved_by_name,
                     ec.name_en AS category_en, ec.name_bn AS category_bn
                FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id ${where}
               ORDER BY e.created_at DESC`,
        params: where.params,
      };
    }
    case 'expensesByCategory': {
      const where = new Where().add('e.deleted_at IS NULL').add("e.status <> 'rejected'").add('e.created_at >= ?', filter.from).add('e.created_at < ?', filter.to);
      return {
        sql: `SELECT ec.id, ec.name_en, ec.name_bn, COUNT(*) AS count, SUM(e.amount) AS amount
                FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id ${where}
               GROUP BY ec.id ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'slowMoving': {
      const where = productWhere(filter).add('COALESCE(sb.quantity, 0) > 0');
      return {
        sql: `SELECT p.id, p.sku, p.name_en, p.name_bn, p.image, c.name_en AS category_en, c.name_bn AS category_bn, COALESCE(sb.quantity, 0) AS stock,
                     COALESCE(sb.avg_cost, p.purchase_price) AS cost, COALESCE(sx.quantity, 0) AS sold, sx.last_at,
                     COALESCE(sb.quantity, 0) * COALESCE(sb.avg_cost, p.purchase_price) AS value
                FROM products p
                JOIN categories c ON c.id = p.category_id
                LEFT JOIN stock_balances sb ON sb.product_id = p.id
                LEFT JOIN (SELECT si.product_id, SUM(si.quantity) AS quantity, MAX(s.created_at) AS last_at
                             FROM sale_items si JOIN sales s ON s.id = si.sale_id
                            WHERE s.status <> 'cancelled' AND s.created_at >= ? AND s.created_at < ?
                            GROUP BY si.product_id) sx ON sx.product_id = p.id
                ${where}
               ORDER BY COALESCE(sx.quantity, 0) ASC, value DESC LIMIT 300`,
        params: [filter.from, filter.to, ...where.params],
      };
    }
    /* ------------------------------------------------------------------
       Reports module additions (reconciliation-grade aggregates).
       ------------------------------------------------------------------ */
    case 'salesReconciliation': {
      const where = salesWhere(filter);
      return {
        sql: `SELECT COUNT(*) AS orders,
                     COALESCE(SUM(s.subtotal), 0) AS subtotal,
                     COALESCE(SUM(s.item_discount_total), 0) AS item_discount,
                     COALESCE(SUM(s.order_discount_total), 0) AS order_discount,
                     COALESCE(SUM(s.discount_total), 0) AS discount,
                     COALESCE(SUM(s.tax_total), 0) AS tax,
                     COALESCE(SUM(CASE WHEN s.tax_mode = 'exclusive' THEN s.tax_total ELSE 0 END), 0) AS tax_added,
                     COALESCE(SUM(s.rounding_adjustment), 0) AS rounding,
                     COALESCE(SUM(s.grand_total), 0) AS grand_total,
                     COALESCE(SUM(s.paid_total), 0) AS tendered,
                     COALESCE(SUM(s.change_due), 0) AS change_due,
                     COALESCE(SUM(s.total_quantity), 0) AS quantity,
                     COALESCE(SUM(s.item_count), 0) AS lines,
                     COUNT(DISTINCT s.customer_id) AS customers,
                     COALESCE(SUM(CASE WHEN s.customer_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS member_orders,
                     COALESCE(SUM(CASE WHEN s.discount_total > 0 THEN 1 ELSE 0 END), 0) AS discounted_orders,
                     COALESCE(SUM(s.points_earned), 0) AS points_earned,
                     COALESCE(SUM(s.points_redeemed), 0) AS points_redeemed
                FROM sales s ${where}`,
        params: where.params,
      };
    }
    case 'cancelledSales': {
      const where = new Where()
        .add("s.status = 'cancelled'")
        .add('s.created_at >= ?', filter.from)
        .add('s.created_at < ?', filter.to)
        .when(filter.counterId && filter.counterId !== 'all', 's.counter_id = ?', filter.counterId ?? null)
        .when(filter.cashierId && filter.cashierId !== 'all', 's.cashier_id = ?', filter.cashierId ?? null);
      return {
        sql: `SELECT COUNT(*) AS count, COALESCE(SUM(s.grand_total), 0) AS amount FROM sales s ${where}`,
        params: where.params,
      };
    }
    case 'paymentDetails': {
      const where = salesWhere(filter).when(filter.paymentMethod && filter.paymentMethod !== 'all', 'p.method = ?', filter.paymentMethod ?? null);
      return {
        sql: `SELECT p.method AS method, COALESCE(p.provider, '') AS provider, COUNT(*) AS payments, COUNT(DISTINCT p.sale_id) AS count,
                     COALESCE(SUM(p.tendered), 0) AS tendered, COALESCE(SUM(p.change_amount), 0) AS change_amount, COALESCE(SUM(p.amount), 0) AS amount
                FROM payments p JOIN sales s ON s.id = p.sale_id ${where}
               GROUP BY p.method, COALESCE(p.provider, '') ORDER BY p.method, amount DESC`,
        params: where.params,
      };
    }
    case 'returnsByDay':
    case 'returnsByMonth':
    case 'returnsByHour': {
      const key =
        name === 'returnsByDay'
          ? "date(r.created_at, 'localtime')"
          : name === 'returnsByHour'
            ? "strftime('%H', r.created_at, 'localtime')"
            : "strftime('%Y-%m', r.created_at, 'localtime')";
      const where = reportReturnsWhere(filter);
      return {
        sql: `SELECT ${key} AS key, COUNT(*) AS count, COALESCE(SUM(r.refund_total), 0) AS amount, COALESCE(SUM(r.tax_total), 0) AS tax
                FROM returns r ${where} GROUP BY key ORDER BY key`,
        params: where.params,
      };
    }
    case 'returnsImpact': {
      const where = reportReturnsWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT COUNT(DISTINCT r.id) AS count, COALESCE(SUM(ri.refund_amount), 0) AS refund, COALESCE(SUM(ri.tax_amount), 0) AS tax,
                     CAST(ROUND(COALESCE(SUM(ri.quantity * si.cost_price), 0)) AS INTEGER) AS cost, COALESCE(SUM(ri.quantity), 0) AS quantity,
                     COALESCE(SUM(CASE WHEN ri.condition = 'damaged' THEN ri.quantity ELSE 0 END), 0) AS damaged
                FROM return_items ri
                JOIN returns r ON r.id = ri.return_id
                JOIN sale_items si ON si.id = ri.sale_item_id
                LEFT JOIN products p ON p.id = ri.product_id
                ${where}`,
        params: where.params,
      };
    }
    case 'returnProducts': {
      const where = reportReturnsWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT ri.product_id AS id, MAX(ri.name_en) AS name_en, MAX(ri.name_bn) AS name_bn, SUM(ri.quantity) AS quantity,
                     SUM(ri.refund_amount) AS amount, COUNT(DISTINCT r.id) AS count
                FROM return_items ri JOIN returns r ON r.id = ri.return_id LEFT JOIN products p ON p.id = ri.product_id ${where}
               GROUP BY ri.product_id ORDER BY amount DESC LIMIT ?`,
        params: [...where.params, Number(extra.limit ?? 10)],
      };
    }
    case 'profitByDay': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT ${LOCAL_DAY} AS key, COALESCE(SUM(si.line_total - si.tax_amount), 0) AS revenue,
                     CAST(ROUND(COALESCE(SUM(si.cost_price * si.quantity), 0)) AS INTEGER) AS cost, COALESCE(SUM(si.quantity), 0) AS quantity
                ${ITEM_FROM} ${where} GROUP BY key ORDER BY key`,
        params: where.params,
      };
    }
    case 'stockMovementByType': {
      const where = reportMovementWhere(filter, extra);
      return {
        sql: `SELECT m.type AS type, COUNT(*) AS count,
                     COALESCE(SUM(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END), 0) AS qty_in,
                     COALESCE(SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE 0 END), 0) AS qty_out,
                     COALESCE(SUM(m.quantity), 0) AS net,
                     CAST(ROUND(COALESCE(SUM(ABS(m.quantity) * m.unit_cost), 0)) AS INTEGER) AS value
                FROM stock_movements m JOIN products p ON p.id = m.product_id ${where}
               GROUP BY m.type ORDER BY count DESC`,
        params: where.params,
      };
    }
    case 'cashMovementSummary': {
      const where = new Where()
        .add('cm.created_at >= ?', filter.from)
        .add('cm.created_at < ?', filter.to)
        .when(filter.counterId && filter.counterId !== 'all', 'cm.counter_id = ?', filter.counterId ?? null)
        .when(extra.type && extra.type !== 'all', 'cm.type = ?', extra.type ?? null);
      return {
        sql: `SELECT cm.type AS type, COUNT(*) AS count, COALESCE(SUM(cm.amount), 0) AS amount
                FROM cash_movements cm ${where} GROUP BY cm.type ORDER BY cm.type`,
        params: where.params,
      };
    }
    case 'customerTypeSales': {
      const where = salesWhere(filter);
      const type = "CASE WHEN s.customer_id IS NULL THEN 'none' ELSE COALESCE(s.customer_type, 'regular') END";
      return {
        sql: `SELECT ${type} AS type, COUNT(*) AS orders, COALESCE(SUM(s.grand_total), 0) AS amount, COUNT(DISTINCT s.customer_id) AS customers
                FROM sales s ${where} GROUP BY ${type} ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'customerActivity': {
      const where = salesWhere(filter)
        .add('s.customer_id IS NOT NULL')
        .when(extra.customerType && extra.customerType !== 'all', 'COALESCE(cu.customer_type, s.customer_type) = ?', extra.customerType ?? null);
      return {
        sql: `SELECT s.customer_id AS id, MAX(s.customer_name) AS name, MAX(s.customer_phone) AS phone, MAX(COALESCE(cu.customer_type, s.customer_type)) AS type,
                     COUNT(*) AS orders, SUM(s.grand_total) AS amount, SUM(s.discount_total) AS discount, SUM(s.returned_total) AS returns,
                     SUM(s.points_earned) AS points, SUM(s.points_redeemed) AS redeemed, MAX(s.created_at) AS last_at, MAX(cu.loyalty_points) AS balance
                FROM sales s LEFT JOIN customers cu ON cu.id = s.customer_id ${where}
               GROUP BY s.customer_id ORDER BY amount DESC LIMIT ?`,
        params: [...where.params, Number(extra.limit ?? 1000)],
      };
    }
    case 'returnMethods': {
      const where = reportReturnsWhere(filter);
      return {
        sql: `SELECT r.refund_method AS method, COUNT(*) AS count, COALESCE(SUM(r.refund_total), 0) AS amount
                FROM returns r ${where} GROUP BY r.refund_method ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'stockMovementByDay': {
      const where = reportMovementWhere(filter, extra);
      return {
        sql: `SELECT date(m.created_at, 'localtime') AS key, COUNT(*) AS count,
                     COALESCE(SUM(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END), 0) AS qty_in,
                     COALESCE(SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE 0 END), 0) AS qty_out
                FROM stock_movements m JOIN products p ON p.id = m.product_id ${where}
               GROUP BY key ORDER BY key`,
        params: where.params,
      };
    }
    case 'brandSalesDetail': {
      const where = salesWhere(filter, { itemLevel: true });
      return {
        sql: `SELECT COALESCE(p.brand_id, '') AS id, MAX(b.name_en) AS name_en, MAX(b.name_bn) AS name_bn,
                     SUM(si.line_total) AS amount, SUM(si.tax_amount) AS tax, SUM(si.quantity) AS quantity,
                     COUNT(DISTINCT si.sale_id) AS orders, COUNT(DISTINCT si.product_id) AS products,
                     CAST(ROUND(COALESCE(SUM(si.cost_price * si.quantity), 0)) AS INTEGER) AS cost
                ${ITEM_FROM} LEFT JOIN brands b ON b.id = p.brand_id ${where}
               GROUP BY COALESCE(p.brand_id, '') ORDER BY amount DESC`,
        params: where.params,
      };
    }
    case 'expenseBreakdown': {
      const where = new Where().add('e.deleted_at IS NULL').add('e.created_at >= ?', filter.from).add('e.created_at < ?', filter.to);
      return {
        sql: `SELECT e.status AS status, e.paid_from AS paid_from, COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS amount
                FROM expenses e ${where} GROUP BY e.status, e.paid_from ORDER BY e.status, e.paid_from`,
        params: where.params,
      };
    }
    case 'purchaseStatusSummary': {
      const where = new Where()
        .add('pu.deleted_at IS NULL')
        .add('pu.created_at >= ?', filter.from)
        .add('pu.created_at < ?', filter.to)
        .when(filter.supplierId && filter.supplierId !== 'all', 'pu.supplier_id = ?', filter.supplierId ?? null);
      return {
        sql: `SELECT pu.status AS status, COUNT(*) AS count, COALESCE(SUM(pu.grand_total), 0) AS amount,
                     COALESCE(SUM(pu.paid_amount), 0) AS paid, COALESCE(SUM(pu.grand_total - pu.paid_amount), 0) AS due
                FROM purchases pu ${where} GROUP BY pu.status ORDER BY pu.status`,
        params: where.params,
      };
    }
    default:
      throw new Error(`Unknown report query ${String(name)}`);
  }
}

export class LocalReportRepository implements ReportRepository {
  constructor(private readonly sql: SqlClient) {}

  async query(name: ReportQueryName, filter: ReportFilter, extra: Record<string, string | number> = {}): Promise<ReportRow[]> {
    const { sql, params } = build(name, filter, extra);
    return this.sql.all<ReportRow>(sql, params);
  }

  async salesTotals(range: DateRange, filter: Partial<ReportFilter> = {}): Promise<ReportRow> {
    const merged: Filter = { ...filter, from: range.from, to: range.to };
    const where = salesWhere(merged);
    const [sales, payments, cost, returns] = await Promise.all([
      this.sql.get<ReportRow>(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(s.grand_total), 0) AS gross, COALESCE(SUM(s.discount_total), 0) AS discount,
                COALESCE(SUM(s.tax_total), 0) AS tax, COALESCE(SUM(s.total_quantity), 0) AS items, COUNT(DISTINCT s.customer_id) AS customers
           FROM sales s ${where}`,
        where.params,
      ),
      this.sql.get<ReportRow>(
        `SELECT COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount END), 0) AS cash,
                COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount END), 0) AS card,
                COALESCE(SUM(CASE WHEN p.method = 'mobile' THEN p.amount END), 0) AS mobile,
                COALESCE(SUM(CASE WHEN p.method = 'points' THEN p.amount END), 0) AS points
           FROM payments p JOIN sales s ON s.id = p.sale_id ${where}`,
        where.params,
      ),
      this.sql.get<ReportRow>(`SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost FROM sale_items si JOIN sales s ON s.id = si.sale_id ${where}`, where.params),
      this.sql.get<ReportRow>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(refund_total), 0) AS total FROM returns r
          WHERE r.created_at >= ? AND r.created_at < ?
            ${merged.counterId && merged.counterId !== 'all' ? 'AND r.counter_id = ?' : ''}
            ${merged.cashierId && merged.cashierId !== 'all' ? 'AND r.cashier_id = ?' : ''}`,
        [
          range.from,
          range.to,
          ...(merged.counterId && merged.counterId !== 'all' ? [merged.counterId] : []),
          ...(merged.cashierId && merged.cashierId !== 'all' ? [merged.cashierId] : []),
        ],
      ),
    ]);
    return {
      ...(sales ?? {}),
      ...(payments ?? {}),
      cost: cost?.cost ?? 0,
      returns: returns?.total ?? 0,
      returns_count: returns?.count ?? 0,
    };
  }
}

/**
 * Returns filter (alias r) for the Reports module. With `itemLevel`, the query
 * must also join return_items ri and products p so category/brand apply.
 */
function reportReturnsWhere(filter: Filter, options: { itemLevel?: boolean } = {}): Where {
  const where = new Where()
    .add('r.created_at >= ?', filter.from)
    .add('r.created_at < ?', filter.to)
    .when(filter.counterId && filter.counterId !== 'all', 'r.counter_id = ?', filter.counterId ?? null)
    .when(filter.cashierId && filter.cashierId !== 'all', 'r.cashier_id = ?', filter.cashierId ?? null);
  if (options.itemLevel) {
    where
      .when(filter.categoryId && filter.categoryId !== 'all', '(p.category_id = ? OR p.subcategory_id = ?)', filter.categoryId ?? null, filter.categoryId ?? null)
      .when(filter.brandId && filter.brandId !== 'all', 'p.brand_id = ?', filter.brandId ?? null);
  }
  return where;
}

/** Stock ledger filter (alias m, joined products p): period, movement type (extra.type) and category. */
function reportMovementWhere(filter: Filter, extra: Record<string, string | number>): Where {
  return new Where()
    .add('m.created_at >= ?', filter.from)
    .add('m.created_at < ?', filter.to)
    .when(extra.type && extra.type !== 'all', 'm.type = ?', extra.type ?? null)
    .when(filter.categoryId && filter.categoryId !== 'all', '(p.category_id = ? OR p.subcategory_id = ?)', filter.categoryId ?? null, filter.categoryId ?? null)
    .when(filter.brandId && filter.brandId !== 'all', 'p.brand_id = ?', filter.brandId ?? null);
}
