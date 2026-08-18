import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Receipt, Eye } from 'lucide-react'
import { useListInvoicesQuery, useDeleteInvoiceMutation } from './salesApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from '../../components/DataGrid'
import type { InvoiceDto } from '../../lib/types'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

const statusStyles: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  PendingApproval: 'bg-amber-50 text-amber-700 ring-amber-200',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

type SortKey = 'invoiceNo' | 'invoiceDate' | 'customerName' | 'totalValue' | 'status'

export default function InvoiceListPage() {
  // The search box still queries the server (as before — invoices can be a large list); sorting
  // is applied client-side over whatever page of results comes back, same shared grid behaviour
  // as Quotations and Sales Orders.
  const [search, setSearch] = useState('')
  const { data, isLoading } = useListInvoicesQuery({ search: search || undefined })
  const [deleteInvoice] = useDeleteInvoiceMutation()

  const {
    rows,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
  } = useDataGrid<InvoiceDto, SortKey>(data?.items, {
    defaultSortKey: 'invoiceDate',
    defaultSortDir: 'desc',
    comparators: {
      invoiceNo: (a, b) => (a.invoiceNo ?? '').localeCompare(b.invoiceNo ?? ''),
      invoiceDate: (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
      customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
      totalValue: (a, b) => a.totalValue - b.totalValue,
      status: (a, b) => a.status.localeCompare(b.status),
    },
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Sales Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">GST tax invoices raised to customers.</p>
        </div>
        <Link to="/sales/invoices/new" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          <Plus size={16} /> New Invoice
        </Link>
      </div>

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search invoice no. or customer…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('invoiceNo')}>
                  Invoice No. <SortIcon column="invoiceNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('invoiceDate')}>
                  Date <SortIcon column="invoiceDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Destination</Th>
                <SortableTh onClick={() => toggleSort('totalValue')} align="right">
                  Total <SortIcon column="totalValue" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <Receipt size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? (
                      'No invoices match your search.'
                    ) : (
                      <>No invoices yet. <Link to="/sales/invoices/new" className="text-brand-600 font-medium">Create one</Link>.</>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((inv) => (
                <tr key={inv.invoiceId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{inv.invoiceNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{inv.customerName}</td>
                  <td className="px-5 py-3 text-slate-500">{inv.destination ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(inv.totalValue)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[inv.status] ?? statusStyles.Draft}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/sales/invoices/${inv.invoiceId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Eye size={14} /> View
                      </Link>
                      <DeleteRowAction
                        canDelete={inv.canDelete}
                        itemLabel={`invoice ${inv.invoiceNo ?? inv.invoiceId}`}
                        onDelete={() => deleteInvoice(inv.invoiceId).unwrap()}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataGridPagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
