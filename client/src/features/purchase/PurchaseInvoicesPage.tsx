import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, FileStack, Printer } from 'lucide-react'
import { useListPurchaseInvoicesQuery, useCreatePurchaseInvoiceMutation, useDeletePurchaseInvoiceMutation, useListGrnsQuery } from './purchaseApi'
import { useDataGrid, SortIcon, SortableTh, Th, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh, DeleteRowAction } from '../../components/DataGrid'
import type { PurchaseInvoiceDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

type SortKey = 'invoiceNo' | 'grnNo' | 'invoiceDate' | 'totalValue' | 'status'

export default function PurchaseInvoicesPage() {
  const { data, isLoading } = useListPurchaseInvoicesQuery()
  const { data: grns } = useListGrnsQuery()
  const [createInvoice, { isLoading: saving }] = useCreatePurchaseInvoiceMutation()
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
        grnNo: (a, b) => (a.grnNo ?? '').localeCompare(b.grnNo ?? ''),
        invoiceDate: (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
        totalValue: (a, b) => a.totalValue - b.totalValue,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (pi, term) =>
        !!pi.invoiceNo?.toLowerCase().includes(term) ||
        !!pi.grnNo?.toLowerCase().includes(term) ||
        !!pi.supplierInvoiceNo?.toLowerCase().includes(term) ||
        pi.status.toLowerCase().includes(term),
    },
  )

  const [showForm, setShowForm] = useState(false)
  const [grnId, setGrnId] = useState<number | ''>('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [totalValue, setTotalValue] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!grnId || !totalValue) { setError('Select a GRN and enter the invoice value.'); return }
    try {
      await createInvoice({ grnId: Number(grnId), supplierInvoiceNo, totalValue: Number(totalValue) }).unwrap()
      setShowForm(false)
      setGrnId(''); setSupplierInvoiceNo(''); setTotalValue('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the purchase invoice.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Purchase Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Supplier bills booked against a posted GRN.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Book Invoice'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div className="sm:col-span-3 sm:max-w-sm">
            <label className="block text-xs font-semibold text-slate-600 mb-1">GRN *</label>
            <select required value={grnId} onChange={(e) => setGrnId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select posted GRN…</option>
              {grns?.items.filter((g) => g.status === 'Posted').map((g) => <option key={g.grnId} value={g.grnId}>{g.grnNo} — {g.supplierName}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Supplier Invoice No.</label><input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Value *</label><input type="number" min={0} step="0.01" required value={totalValue} onChange={(e) => setTotalValue(e.target.value ? Number(e.target.value) : '')} className={inputClass} /></div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Book Invoice'}</button>
          </div>
        </form>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search invoice no., GRN, supplier invoice no. or status…"
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
                <SortableTh onClick={() => toggleSort('grnNo')}>
                  GRN <SortIcon column="grnNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Supplier Invoice No.</Th>
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
              {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <FileStack size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No purchase invoices match your search.' : 'No purchase invoices yet.'}
                  </td>
                </tr>
              )}
              {rows.map((pi) => (
                <tr key={pi.purchaseInvoiceId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{pi.invoiceNo}</td>
                  <td className="px-5 py-3 text-slate-500">{pi.grnNo}</td>
                  <td className="px-5 py-3 text-slate-500">{pi.supplierInvoiceNo ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(pi.invoiceDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(pi.totalValue)}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{pi.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/purchase/invoices/${pi.purchaseInvoiceId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Printer size={14} /> View / Print / Edit
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
