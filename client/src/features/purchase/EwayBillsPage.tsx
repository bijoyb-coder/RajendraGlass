import { useState } from 'react'
import { Plus, X, Radio } from 'lucide-react'
import { useListEwayBillsQuery, useCreateEwayBillMutation, useDeleteEwayBillMutation, useListSuppliersQuery } from './purchaseApi'
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
import type { EwayBillDto, CreateEwayBillRequest } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: Partial<CreateEwayBillRequest> = { ewayBillNo: '', supplierId: undefined, ewayBillDate: new Date().toISOString().slice(0, 10) }

type SortKey = 'ewayBillNo' | 'supplierName' | 'ewayBillDate' | 'validUpto'

/** Purchase > E-way Bill Entry — a small master of e-Way Bill numbers received from suppliers,
 * entered once off the government e-Way Bill slip/QR printout, then picked from a dropdown when
 * booking the matching Purchase Invoice instead of retyping the number by hand. */
export default function EwayBillsPage() {
  const { data, isLoading } = useListEwayBillsQuery()
  const { data: suppliers } = useListSuppliersQuery()
  const [createEwayBill, { isLoading: saving }] = useCreateEwayBillMutation()
  const [deleteEwayBill] = useDeleteEwayBillMutation()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<CreateEwayBillRequest>>(emptyForm)
  const [error, setError] = useState<string | null>(null)

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
  } = useDataGrid<EwayBillDto, SortKey>(data?.items, {
    defaultSortKey: 'ewayBillDate',
    defaultSortDir: 'desc',
    comparators: {
      ewayBillNo: (a, b) => a.ewayBillNo.localeCompare(b.ewayBillNo),
      supplierName: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
      ewayBillDate: (a, b) => new Date(a.ewayBillDate).getTime() - new Date(b.ewayBillDate).getTime(),
      validUpto: (a, b) => new Date(a.validUpto ?? 0).getTime() - new Date(b.validUpto ?? 0).getTime(),
    },
    matches: (e, term) =>
      e.ewayBillNo.toLowerCase().includes(term) ||
      !!e.supplierName?.toLowerCase().includes(term) ||
      !!e.vehicleNo?.toLowerCase().includes(term) ||
      !!e.documentNo?.toLowerCase().includes(term) ||
      !!e.purchaseInvoiceNo?.toLowerCase().includes(term),
  })

  function set<K extends keyof CreateEwayBillRequest>(key: K, value: CreateEwayBillRequest[K]) { setForm((f) => ({ ...f, [key]: value })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.ewayBillNo || !form.supplierId || !form.ewayBillDate) {
      setError('e-Way Bill No., Supplier and Date are required.')
      return
    }
    try {
      await createEwayBill(form as CreateEwayBillRequest).unwrap()
      setForm(emptyForm)
      setShowForm(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the e-Way Bill.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Purchase E-way Bill Entry</h1>
          <p className="text-sm text-slate-500 mt-1">Entered off the supplier's e-Way Bill slip — select from here when booking the matching Purchase Invoice.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New e-Way Bill'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">e-Way Bill No. *</label>
            <input required value={form.ewayBillNo ?? ''} onChange={(e) => set('ewayBillNo', e.target.value)} className={inputClass} placeholder="e.g. 891723097167" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier *</label>
            <select required value={form.supplierId ?? ''} onChange={(e) => set('supplierId', Number(e.target.value))} className={inputClass}>
              <option value="">Select supplier…</option>
              {suppliers?.items.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">e-Way Bill Date *</label>
            <input type="date" required value={form.ewayBillDate ?? ''} onChange={(e) => set('ewayBillDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Valid Upto</label>
            <input type="date" value={form.validUpto ?? ''} onChange={(e) => set('validUpto', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Vehicle No.</label>
            <input value={form.vehicleNo ?? ''} onChange={(e) => set('vehicleNo', e.target.value)} className={inputClass} placeholder="e.g. WB11D1799" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Document No.</label>
            <input value={form.documentNo ?? ''} onChange={(e) => set('documentNo', e.target.value)} className={inputClass} placeholder="Supplier's invoice/document no." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Value of Goods</label>
            <input type="number" step="0.01" value={form.goodsValue ?? ''} onChange={(e) => set('goodsValue', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save e-Way Bill'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search e-Way Bill no., supplier, vehicle no. or document no.…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('ewayBillNo')}>
                  e-Way Bill No. <SortIcon column="ewayBillNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('supplierName')}>
                  Supplier <SortIcon column="supplierName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('ewayBillDate')}>
                  Date <SortIcon column="ewayBillDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('validUpto')}>
                  Valid Upto <SortIcon column="validUpto" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Vehicle No.</Th>
                <Th>Status</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <Radio size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No e-Way Bills match your search.' : 'No e-Way Bills entered yet.'}
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.ewayBillId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{e.ewayBillNo}</td>
                  <td className="px-5 py-3 text-slate-700">{e.supplierName}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(e.ewayBillDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-600">{e.validUpto ? new Date(e.validUpto).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{e.vehicleNo ?? '—'}</td>
                  <td className="px-5 py-3">
                    {e.isUsed ? (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                        Used — {e.purchaseInvoiceNo ?? `Invoice ${e.purchaseInvoiceId}`}
                      </span>
                    ) : (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Available</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={e.canDelete}
                      itemLabel={`e-Way Bill ${e.ewayBillNo}`}
                      onDelete={() => deleteEwayBill(e.ewayBillId).unwrap()}
                    />
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
