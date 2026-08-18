import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Trash2, ShoppingCart, Printer } from 'lucide-react'
import { useListPurchaseOrdersQuery, useCreatePurchaseOrderMutation, useDeletePurchaseOrderMutation, useListSuppliersQuery } from './purchaseApi'
import { useListProductsQuery } from '../masters/mastersApi'
import { useDataGrid, SortIcon, SortableTh, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh, DeleteRowAction } from '../../components/DataGrid'
import type { PurchaseOrderDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) }

interface Line { key: string; productId: number; qty: number; rate: number }

type SortKey = 'poNo' | 'poDate' | 'supplierName' | 'totalValue' | 'status'

export default function PurchaseOrdersPage() {
  const { data, isLoading } = useListPurchaseOrdersQuery()
  const { data: suppliers } = useListSuppliersQuery()
  const { data: products } = useListProductsQuery()
  const [createPO, { isLoading: saving }] = useCreatePurchaseOrderMutation()
  const [deletePO] = useDeletePurchaseOrderMutation()

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
  } = useDataGrid<PurchaseOrderDto, SortKey>(
    data?.items,
    {
      defaultSortKey: 'poDate',
      defaultSortDir: 'desc',
      comparators: {
        poNo: (a, b) => (a.poNo ?? '').localeCompare(b.poNo ?? ''),
        poDate: (a, b) => new Date(a.poDate).getTime() - new Date(b.poDate).getTime(),
        supplierName: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
        totalValue: (a, b) => a.totalValue - b.totalValue,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (po, term) =>
        !!po.poNo?.toLowerCase().includes(term) ||
        !!po.supplierName?.toLowerCase().includes(term) ||
        po.status.toLowerCase().includes(term),
    },
  )

  const [showForm, setShowForm] = useState(false)
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: 0, qty: 0, rate: 0 }])
  const [error, setError] = useState<string | null>(null)

  function addLine() { setLines((p) => [...p, { key: crypto.randomUUID(), productId: 0, qty: 0, rate: 0 }]) }
  function removeLine(key: string) { setLines((p) => p.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<Line>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))) }
  function onProductChange(key: string, productId: number) {
    const product = products?.items.find((p) => p.productId === productId)
    updateLine(key, { productId, rate: product?.purchaseRate ?? 0 })
  }

  const total = lines.reduce((sum, l) => sum + l.qty * l.rate, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supplierId) { setError('Select a supplier.'); return }
    const valid = lines.filter((l) => l.productId && l.qty > 0 && l.rate > 0)
    if (valid.length === 0) { setError('Add at least one line item.'); return }
    try {
      await createPO({ supplierId: Number(supplierId), lines: valid.map(({ productId, qty, rate }) => ({ productId, qty, rate })) }).unwrap()
      setShowForm(false)
      setLines([{ key: crypto.randomUUID(), productId: 0, qty: 0, rate: 0 }])
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the purchase order.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Orders placed with suppliers for glass and materials.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Purchase Order'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="max-w-sm">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier *</label>
            <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select supplier…</option>
              {suppliers?.items.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
            </select>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium w-32">Qty</th>
                <th className="py-2 font-medium w-32">Rate</th>
                <th className="py-2 font-medium w-32 text-right">Value</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-2 pr-2">
                    <select value={l.productId || ''} onChange={(e) => onProductChange(l.key, Number(e.target.value))} className={inputClass}>
                      <option value="">Select product…</option>
                      {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2"><input type="number" min={0} step="0.001" value={l.qty || ''} onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })} className={inputClass} /></td>
                  <td className="py-2 pr-2"><input type="number" min={0} step="0.01" value={l.rate || ''} onChange={(e) => updateLine(l.key, { rate: Number(e.target.value) })} className={inputClass} /></td>
                  <td className="py-2 pr-2 text-right font-medium text-slate-700">{money(l.qty * l.rate)}</td>
                  <td><button type="button" onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500 transition"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><Plus size={15} /> Add Line</button>
            <div className="text-sm font-bold text-brand-900">Total: {money(total)}</div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Purchase Order'}</button>
          </div>
        </form>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search PO no., supplier or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('poNo')}>
                  PO No. <SortIcon column="poNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('poDate')}>
                  Date <SortIcon column="poDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('supplierName')}>
                  Supplier <SortIcon column="supplierName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
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
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <ShoppingCart size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No purchase orders match your search.' : 'No purchase orders yet.'}
                  </td>
                </tr>
              )}
              {rows.map((po) => (
                <tr key={po.purchaseOrderId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{po.poNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(po.poDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{po.supplierName}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(po.totalValue)}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{po.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/purchase/orders/${po.purchaseOrderId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Printer size={14} /> View / Print
                      </Link>
                      <DeleteRowAction
                        canDelete={po.canDelete}
                        itemLabel={`Purchase Order ${po.poNo}`}
                        onDelete={() => deletePO(po.purchaseOrderId).unwrap()}
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
