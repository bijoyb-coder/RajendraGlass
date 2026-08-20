import { Link } from 'react-router-dom'
import { Plus, FileStack, Printer } from 'lucide-react'
import { useListPurchaseInvoicesQuery, useDeletePurchaseInvoiceMutation } from './purchaseApi'
import { useDataGrid, SortIcon, SortableTh, Th, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh, DeleteRowAction } from '../../components/DataGrid'
import type { PurchaseInvoiceDto } from '../../lib/types'

function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

type SortKey = 'invoiceNo' | 'supplierName' | 'invoiceDate' | 'totalValue' | 'status'

export default function PurchaseInvoicesPage() {
  const { data, isLoading } = useListPurchaseInvoicesQuery()
  const [deleteInvoice] = useDeletePurchaseInvoiceMutation()

  const {
    rows,
    search,
    setSearch,
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
  } = useDataGrid<PurchaseInvoiceDto, SortKey>(
    data?.items,
    {
      defaultSortKey: 'invoiceDate',
      defaultSortDir: 'desc',
      comparators: {
        invoiceNo: (a, b) => (a.invoiceNo ?? '').localeCompare(b.invoiceNo ?? ''),
        supplierName: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
        invoiceDate: (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
        totalValue: (a, b) => a.totalValue - b.totalValue,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (pi, term) =>
        !!pi.invoiceNo?.toLowerCase().includes(term) ||
        !!pi.supplierName?.toLowerCase().includes(term) ||
        !!pi.supplierInvoiceNo?.toLowerCase().includes(term) ||
        !!pi.ewayBillNo?.toLowerCase().includes(term) ||
        pi.status.toLowerCase().includes(term),
    },
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Purchase Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Entered directly from the supplier's tax invoice — Local or Inter-State. Stock is added on save.</p>
        </div>
        <Link to="/purchase/invoices/new" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          <Plus size={16} /> New Purchase Invoice
        </Link>
      </div>

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search invoice no., supplier, supplier invoice no., e-Way Bill no. or status…"
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
                <SortableTh onClick={() => toggleSort('supplierName')}>
                  Supplier <SortIcon column="supplierName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Type</Th>
                <Th>e-Way Bill No.</Th>
                <SortableTh onClick={() => toggleSort('invoiceDate')}>
                  Date <SortIcon column="invoiceDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('totalValue')} align="right">
                  Value <SortIcon column="totalValue" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    <FileStack size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No purchase invoices match your search.' : (
                      <>No purchase invoices yet. <Link to="/purchase/invoices/new" className="text-brand-600 font-medium">Create one</Link>.</>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((pi) => (
                <tr key={pi.purchaseInvoiceId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{pi.invoiceNo}</td>
                  <td className="px-5 py-3 text-slate-700">{pi.supplierName}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${pi.isInterState ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-blue-50 text-blue-700 ring-blue-200'}`}>
                      {pi.isInterState ? 'Inter-State' : 'Local'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{pi.ewayBillNo ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(pi.invoiceDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(pi.totalValue)}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{pi.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/purchase/invoices/${pi.purchaseInvoiceId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Printer size={14} /> View / Print
                      </Link>
                      <DeleteRowAction
                        canDelete={pi.canDelete}
                        itemLabel={`Purchase Invoice ${pi.invoiceNo}`}
                        onDelete={() => deleteInvoice(pi.purchaseInvoiceId).unwrap()}
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
