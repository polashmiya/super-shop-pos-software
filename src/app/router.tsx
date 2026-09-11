import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createHashRouter } from 'react-router';
import type { Permission } from '@/config/permissions';
import { AppShell } from '@/layouts/AppShell';
import LoginPage from '@/pages/auth/LoginPage';
import PosPage from '@/pages/pos/PosPage';
import { Guard, Landing, RequireAuth } from './RouteGuards';

/* ==========================================================================
   Routes (hash router — works from file:// in Electron). POS loads eagerly
   for instant start; every other screen is lazy-loaded.
   ========================================================================== */

type Page = LazyExoticComponent<ComponentType>;

const page = (loader: () => Promise<{ default: ComponentType }>): Page => lazy(loader);

const Pages = {
  Welcome: page(() => import('@/pages/auth/WelcomePage')),
  Dashboard: page(() => import('@/pages/dashboard/DashboardPage')),
  Sales: page(() => import('@/pages/sales/SalesPage')),
  SaleDetail: page(() => import('@/pages/sales/SaleDetailPage')),
  Returns: page(() => import('@/pages/sales/ReturnsPage')),
  Products: page(() => import('@/pages/products/ProductsPage')),
  ProductForm: page(() => import('@/pages/products/ProductFormPage')),
  ProductDetail: page(() => import('@/pages/products/ProductDetailPage')),
  Categories: page(() => import('@/pages/products/CategoriesPage')),
  Brands: page(() => import('@/pages/products/BrandsPage')),
  Units: page(() => import('@/pages/products/UnitsPage')),
  Inventory: page(() => import('@/pages/inventory/InventoryPage')),
  StockLedger: page(() => import('@/pages/inventory/StockLedgerPage')),
  Purchases: page(() => import('@/pages/purchases/PurchasesPage')),
  PurchaseForm: page(() => import('@/pages/purchases/PurchaseFormPage')),
  PurchaseDetail: page(() => import('@/pages/purchases/PurchaseDetailPage')),
  Suppliers: page(() => import('@/pages/suppliers/SuppliersPage')),
  SupplierDetail: page(() => import('@/pages/suppliers/SupplierDetailPage')),
  Customers: page(() => import('@/pages/customers/CustomersPage')),
  CustomerDetail: page(() => import('@/pages/customers/CustomerDetailPage')),
  Reports: page(() => import('@/pages/reports/ReportsPage')),
  ReportView: page(() => import('@/pages/reports/ReportViewPage')),
  Shift: page(() => import('@/pages/shift/ShiftPage')),
  ShiftHistory: page(() => import('@/pages/shift/ShiftHistoryPage')),
  ShiftDetail: page(() => import('@/pages/shift/ShiftDetailPage')),
  Counters: page(() => import('@/pages/shift/CountersPage')),
  Expenses: page(() => import('@/pages/expenses/ExpensesPage')),
  Settings: page(() => import('@/pages/settings/SettingsPage')),
  Audit: page(() => import('@/pages/audit/AuditPage')),
  Profile: page(() => import('@/pages/profile/ProfilePage')),
  Notifications: page(() => import('@/pages/notifications/NotificationsPage')),
};

function guarded(permission: Permission | null, Component: ComponentType) {
  return (
    <Guard permission={permission}>
      <Component />
    </Guard>
  );
}

export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/welcome',
    element: (
      <RequireAuth>
        <Pages.Welcome />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Landing /> },
      { path: 'pos', element: guarded('pos.sell', PosPage) },
      { path: 'dashboard', element: guarded('dashboard.view', Pages.Dashboard) },
      { path: 'sales', element: guarded('sales.view', Pages.Sales) },
      { path: 'sales/returns', element: guarded('sales.view', Pages.Returns) },
      { path: 'sales/:saleId', element: guarded('sales.view', Pages.SaleDetail) },
      { path: 'products', element: guarded('products.view', Pages.Products) },
      { path: 'products/new', element: guarded('products.manage', Pages.ProductForm) },
      { path: 'products/categories', element: guarded('products.view', Pages.Categories) },
      { path: 'products/brands', element: guarded('products.view', Pages.Brands) },
      { path: 'products/units', element: guarded('products.view', Pages.Units) },
      { path: 'products/:productId', element: guarded('products.view', Pages.ProductDetail) },
      { path: 'products/:productId/edit', element: guarded('products.manage', Pages.ProductForm) },
      { path: 'inventory', element: guarded('inventory.view', Pages.Inventory) },
      { path: 'inventory/ledger', element: guarded('inventory.view', Pages.StockLedger) },
      { path: 'purchases', element: guarded('purchases.view', Pages.Purchases) },
      { path: 'purchases/new', element: guarded('purchases.manage', Pages.PurchaseForm) },
      { path: 'purchases/:purchaseId', element: guarded('purchases.view', Pages.PurchaseDetail) },
      { path: 'purchases/:purchaseId/edit', element: guarded('purchases.manage', Pages.PurchaseForm) },
      { path: 'suppliers', element: guarded('suppliers.view', Pages.Suppliers) },
      { path: 'suppliers/:supplierId', element: guarded('suppliers.view', Pages.SupplierDetail) },
      { path: 'customers', element: guarded('customers.view', Pages.Customers) },
      { path: 'customers/:customerId', element: guarded('customers.view', Pages.CustomerDetail) },
      { path: 'reports', element: guarded('reports.view', Pages.Reports) },
      { path: 'reports/:reportId', element: guarded('reports.view', Pages.ReportView) },
      { path: 'shift', element: guarded('shift.operate', Pages.Shift) },
      { path: 'shift/history', element: guarded('shift.operate', Pages.ShiftHistory) },
      { path: 'shift/:shiftId', element: guarded('shift.operate', Pages.ShiftDetail) },
      { path: 'counters', element: guarded('counters.manage', Pages.Counters) },
      { path: 'expenses', element: guarded('expenses.create', Pages.Expenses) },
      { path: 'settings', element: guarded(null, Pages.Settings) },
      { path: 'settings/:sectionId', element: guarded(null, Pages.Settings) },
      { path: 'audit', element: guarded('audit.view', Pages.Audit) },
      { path: 'profile', element: guarded(null, Pages.Profile) },
      { path: 'notifications', element: guarded(null, Pages.Notifications) },
      { path: '*', element: <Landing /> },
    ],
  },
]);
