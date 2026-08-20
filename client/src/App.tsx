import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './features/auth/LoginPage'
import MfaSetupPage from './features/auth/MfaSetupPage'
import RequireAuth from './components/RequireAuth'
import AppShell from './layouts/AppShell'
import DashboardPage from './features/dashboard/DashboardPage'

import InvoiceListPage from './features/sales/InvoiceListPage'
import InvoiceCreatePage from './features/sales/InvoiceCreatePage'
import InvoiceViewPage from './features/sales/InvoiceViewPage'
import QuotationsPage from './features/sales/QuotationsPage'
import QuotationViewPage from './features/sales/QuotationViewPage'
import SalesOrdersPage from './features/sales/SalesOrdersPage'
import SalesOrderViewPage from './features/sales/SalesOrderViewPage'
import CounterBillingPage from './features/counter/CounterBillingPage'
import PaymentTransactionsPage from './features/sales/PaymentTransactionsPage'

import WaybillListPage from './features/dispatch/WaybillListPage'
import WaybillCreatePage from './features/dispatch/WaybillCreatePage'
import WaybillViewPage from './features/dispatch/WaybillViewPage'

import CompanyProfilePage from './features/masters/CompanyProfilePage'
import ProductsPage from './features/masters/ProductsPage'
import CustomersPage from './features/masters/CustomersPage'
import GodownsPage from './features/masters/GodownsPage'
import SuppliersPage from './features/purchase/SuppliersPage'

import StockPage from './features/inventory/StockPage'
import StockAdjustmentsPage from './features/inventory/StockAdjustmentsPage'
import StockTransfersPage from './features/inventory/StockTransfersPage'
import OffcutsPage from './features/inventory/OffcutsPage'
import RackStockPage from './features/inventory/RackStockPage'

import PurchaseOrdersPage from './features/purchase/PurchaseOrdersPage'
import PurchaseOrderViewPage from './features/purchase/PurchaseOrderViewPage'
import GrnPage from './features/purchase/GrnPage'
import GrnViewPage from './features/purchase/GrnViewPage'
import PurchaseInvoicesPage from './features/purchase/PurchaseInvoicesPage'
import PurchaseInvoiceCreatePage from './features/purchase/PurchaseInvoiceCreatePage'
import PurchaseInvoiceViewPage from './features/purchase/PurchaseInvoiceViewPage'
import EwayBillsPage from './features/purchase/EwayBillsPage'

import CuttingPlansPage from './features/cutting/CuttingPlansPage'
import WorkOrdersPage from './features/production/WorkOrdersPage'
import JobCardsPage from './features/production/JobCardsPage'
import FurnaceBatchesPage from './features/production/FurnaceBatchesPage'

import VouchersPage from './features/finance/VouchersPage'
import ExpensesPage from './features/finance/ExpensesPage'
import ReceivablesPage from './features/finance/ReceivablesPage'

import ComplaintsPage from './features/crm/ComplaintsPage'

import EmployeesPage from './features/hr/EmployeesPage'
import AttendancePage from './features/hr/AttendancePage'

import ReportsPage from './features/reports/ReportsPage'

import RolesPage from './features/admin/RolesPage'
import UsersPage from './features/admin/UsersPage'
import IntegrationLogPage from './features/admin/IntegrationLogPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa-setup" element={<MfaSetupPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />

            <Route path="/sales/quotations" element={<QuotationsPage />} />
            <Route path="/sales/quotations/:id" element={<QuotationViewPage />} />
            <Route path="/sales/orders" element={<SalesOrdersPage />} />
            <Route path="/sales/orders/:id" element={<SalesOrderViewPage />} />
            <Route path="/sales/counter-billing" element={<CounterBillingPage />} />
            <Route path="/sales/payments" element={<PaymentTransactionsPage />} />
            <Route path="/sales/invoices" element={<InvoiceListPage />} />
            <Route path="/sales/invoices/new" element={<InvoiceCreatePage />} />
            <Route path="/sales/invoices/:id" element={<InvoiceViewPage />} />

            <Route path="/dispatch/waybills" element={<WaybillListPage />} />
            <Route path="/dispatch/waybills/new" element={<WaybillCreatePage />} />
            <Route path="/dispatch/waybills/:id" element={<WaybillViewPage />} />

            <Route path="/masters/company" element={<CompanyProfilePage />} />
            <Route path="/masters/products" element={<ProductsPage />} />
            <Route path="/masters/customers" element={<CustomersPage />} />
            <Route path="/masters/godowns" element={<GodownsPage />} />
            <Route path="/masters/suppliers" element={<SuppliersPage />} />

            <Route path="/inventory/stock" element={<StockPage />} />
            <Route path="/inventory/adjustments" element={<StockAdjustmentsPage />} />
            <Route path="/inventory/transfers" element={<StockTransfersPage />} />
            <Route path="/inventory/offcuts" element={<OffcutsPage />} />
            <Route path="/inventory/rack-stock" element={<RackStockPage />} />

            <Route path="/purchase/orders" element={<PurchaseOrdersPage />} />
            <Route path="/purchase/orders/:id" element={<PurchaseOrderViewPage />} />
            <Route path="/purchase/grn" element={<GrnPage />} />
            <Route path="/purchase/grn/:id" element={<GrnViewPage />} />
            <Route path="/purchase/invoices" element={<PurchaseInvoicesPage />} />
            <Route path="/purchase/invoices/new" element={<PurchaseInvoiceCreatePage />} />
            <Route path="/purchase/invoices/:id" element={<PurchaseInvoiceViewPage />} />
            <Route path="/purchase/eway-bills" element={<EwayBillsPage />} />

            <Route path="/cutting/plans" element={<CuttingPlansPage />} />
            <Route path="/production/work-orders" element={<WorkOrdersPage />} />
            <Route path="/production/job-cards" element={<JobCardsPage />} />
            <Route path="/production/furnace-batches" element={<FurnaceBatchesPage />} />

            <Route path="/finance/vouchers" element={<VouchersPage />} />
            <Route path="/finance/expenses" element={<ExpensesPage />} />
            <Route path="/finance/receivables" element={<ReceivablesPage />} />

            <Route path="/crm/complaints" element={<ComplaintsPage />} />

            <Route path="/hr/employees" element={<EmployeesPage />} />
            <Route path="/hr/attendance" element={<AttendancePage />} />

            <Route path="/reports" element={<ReportsPage />} />

            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/integration" element={<IntegrationLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
