import { Link } from 'react-router-dom'
import { IndianRupee, Receipt, Truck, Users, Layers, TrendingUp } from 'lucide-react'
import { useGetSummaryQuery } from './dashboardApi'
import { useSelector } from 'react-redux'
import type { RootState } from '../../app/store'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function DashboardPage() {
  const { data, isLoading } = useGetSummaryQuery()
  const user = useSelector((s: RootState) => s.auth.user)

  const cards = [
    { label: "Today's Sales", value: data ? money(data.todaySalesValue) : '—', sub: `${data?.todayInvoiceCount ?? 0} invoices`, icon: IndianRupee, tone: 'from-brand-600 to-brand-500' },
    { label: 'This Month', value: data ? money(data.monthSalesValue) : '—', sub: `${data?.monthInvoiceCount ?? 0} invoices`, icon: TrendingUp, tone: 'from-gold-600 to-gold-400' },
    { label: 'Active Customers', value: data?.activeCustomers ?? '—', sub: 'in master data', icon: Users, tone: 'from-emerald-600 to-emerald-400' },
    { label: 'Active Products', value: data?.activeProducts ?? '—', sub: 'SKUs available', icon: Layers, tone: 'from-indigo-600 to-indigo-400' },
    { label: 'Pending Waybills', value: data?.pendingWaybills ?? '—', sub: 'awaiting delivery', icon: Truck, tone: 'from-orange-600 to-orange-400' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Welcome back, {user?.fullName?.split(' ')[0] ?? ''}</h1>
        <p className="text-sm text-slate-500 mt-1">Here's what's happening at Rajendra Glass Centre today.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
            <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${c.tone} flex items-center justify-center text-white mb-3`}>
              <c.icon size={17} />
            </div>
            <div className="text-xl font-bold text-slate-800">{isLoading ? '…' : c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Recent Sales Invoices</h2>
            <Link to="/sales/invoices" className="text-xs font-medium text-brand-600 hover:text-brand-700">View all →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.recentInvoices ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No invoices yet. Create your first sales invoice.</div>
            )}
            {data?.recentInvoices.map((inv) => (
              <Link to={`/sales/invoices/${inv.invoiceId}`} key={inv.invoiceId} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                    <Receipt size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{inv.invoiceNo}</div>
                    <div className="text-xs text-slate-400 truncate">{inv.customerName}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-800">{money(inv.totalValue)}</div>
                  <div className="text-[11px] text-slate-400">{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <Link to="/sales/invoices/new" className="block rounded-lg bg-brand-50 text-brand-700 text-sm font-medium px-4 py-2.5 hover:bg-brand-100 transition">
              + New Sales Invoice
            </Link>
            <Link to="/dispatch/waybills/new" className="block rounded-lg bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 hover:bg-slate-100 transition">
              + Generate Waybill
            </Link>
            <Link to="/masters/customers" className="block rounded-lg bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 hover:bg-slate-100 transition">
              Manage Customers
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
