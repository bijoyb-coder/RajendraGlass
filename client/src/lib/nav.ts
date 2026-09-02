import type { LucideIcon } from 'lucide-react'
import {
  LayoutGrid, Receipt, Truck, FileText, ClipboardList, Zap,
  Building2, Layers, Users, Factory, Warehouse,
  Boxes, ClipboardEdit, ArrowLeftRight, Puzzle, PackageSearch, PackagePlus, Tags, Tag,
  ShoppingCart, PackageCheck, FileStack, ScanLine,
  Scissors, Wrench, LayoutList, Flame, Ruler,
  Wallet, Receipt as ReceiptIcon, Wallet2,
  HeartHandshake,
  IdCard, CalendarCheck2,
  BarChart3,
  ShieldCheck, UserCog, Radio,
  CreditCard,
} from 'lucide-react'

export interface NavItem {
  label: string
  path?: string
  icon: LucideIcon
  implemented: boolean
  /** Screen-level RBAC (FRS 12.3 level 1): item is hidden unless the user holds this permission.
   * Omit for items every signed-in user may see (e.g. Dashboard). */
  perm?: string
  children?: NavItem[]
}

export const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/', icon: LayoutGrid, implemented: true }],
  },
  {
    title: 'Sales & Dispatch',
    items: [
      { label: 'Quotations', path: '/sales/quotations', icon: FileText, implemented: true, perm: 'Quotation.View' },
      { label: 'Cutting', path: '/sales/cutting', icon: Ruler, implemented: true, perm: 'CuttingEntry.View' },
      { label: 'Sales Orders', path: '/sales/orders', icon: ClipboardList, implemented: true, perm: 'SalesOrder.View' },
      { label: 'Sales Invoices', path: '/sales/invoices', icon: Receipt, implemented: true, perm: 'Invoice.View' },
      { label: 'Waybills / e-Way Bills', path: '/dispatch/waybills', icon: Truck, implemented: true, perm: 'Waybill.View' },
      { label: 'Counter Billing', path: '/sales/counter-billing', icon: Zap, implemented: true, perm: 'CounterInvoice.View' },
      { label: 'Payment Transactions', path: '/sales/payments', icon: CreditCard, implemented: true, perm: 'Voucher.View' },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Company Profile', path: '/masters/company', icon: Building2, implemented: true, perm: 'Company.View' },
      { label: 'Products', path: '/masters/products', icon: Layers, implemented: true, perm: 'Product.View' },
      { label: 'Category Master', path: '/masters/categories', icon: Tags, implemented: true, perm: 'Category.View' },
      { label: 'Sub-Category Master', path: '/masters/subcategories', icon: Tag, implemented: true, perm: 'SubCategory.View' },
      { label: 'Customers', path: '/masters/customers', icon: Users, implemented: true, perm: 'Customer.View' },
      { label: 'Suppliers', path: '/masters/suppliers', icon: Factory, implemented: true, perm: 'Supplier.View' },
      { label: 'Godowns', path: '/masters/godowns', icon: Warehouse, implemented: true, perm: 'Stock.View' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Stock Enquiry', path: '/inventory/stock', icon: Boxes, implemented: true, perm: 'Stock.View' },
      { label: 'Stock Opening', path: '/inventory/opening', icon: PackagePlus, implemented: true, perm: 'Stock.View' },
      { label: 'Stock Adjustments', path: '/inventory/adjustments', icon: ClipboardEdit, implemented: true, perm: 'Stock.View' },
      { label: 'Godown Stock Shifting', path: '/inventory/transfers', icon: ArrowLeftRight, implemented: true, perm: 'Stock.View' },
      { label: 'Offcuts', path: '/inventory/offcuts', icon: Puzzle, implemented: true, perm: 'Offcut.View' },
      { label: 'Rack Stock', path: '/inventory/rack-stock', icon: PackageSearch, implemented: true, perm: 'Stock.View' },
    ],
  },
  {
    title: 'Purchase',
    items: [
      { label: 'Purchase Orders', path: '/purchase/orders', icon: ShoppingCart, implemented: true, perm: 'PurchaseOrder.View' },
      { label: 'Goods Receipt (GRN)', path: '/purchase/grn', icon: PackageCheck, implemented: true, perm: 'Grn.View' },
      { label: 'Purchase Invoices', path: '/purchase/invoices', icon: FileStack, implemented: true, perm: 'PurchaseInvoice.View' },
      { label: 'Purchase E-way Bill Entry', path: '/purchase/eway-bills', icon: ScanLine, implemented: true, perm: 'EwayBill.View' },
    ],
  },
  {
    title: 'Cutting & Production',
    items: [
      { label: 'Cutting Plans', path: '/cutting/plans', icon: Scissors, implemented: true, perm: 'CuttingPlan.View' },
      { label: 'Work Orders', path: '/production/work-orders', icon: Wrench, implemented: true, perm: 'WorkOrder.View' },
      { label: 'Job Cards', path: '/production/job-cards', icon: LayoutList, implemented: true, perm: 'JobCard.View' },
      { label: 'Furnace Batches', path: '/production/furnace-batches', icon: Flame, implemented: true, perm: 'FurnaceBatch.View' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Vouchers', path: '/finance/vouchers', icon: Wallet, implemented: true, perm: 'Voucher.View' },
      { label: 'Expenses', path: '/finance/expenses', icon: ReceiptIcon, implemented: true, perm: 'Expense.View' },
      { label: 'Receivables', path: '/finance/receivables', icon: Wallet2, implemented: true, perm: 'Ledger.View' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'Complaints', path: '/crm/complaints', icon: HeartHandshake, implemented: true, perm: 'Complaint.View' },
    ],
  },
  {
    title: 'HR & Admin',
    items: [
      { label: 'Employees', path: '/hr/employees', icon: IdCard, implemented: true, perm: 'Employee.View' },
      { label: 'Attendance', path: '/hr/attendance', icon: CalendarCheck2, implemented: true, perm: 'Attendance.View' },
      { label: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck, implemented: true, perm: 'Role.View' },
      { label: 'Users', path: '/admin/users', icon: UserCog, implemented: true, perm: 'User.View' },
      { label: 'Integration Log', path: '/admin/integration', icon: Radio, implemented: true, perm: 'Integration.View' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Reports', path: '/reports', icon: BarChart3, implemented: true, perm: 'Report.View' },
    ],
  },
]
