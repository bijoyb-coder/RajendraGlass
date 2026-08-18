import { useState } from 'react'
import { Plus, X, Trash2, Scissors } from 'lucide-react'
import { useListCuttingPlansQuery, useCreateCuttingPlanMutation, useDeleteCuttingPlanMutation } from './cuttingApi'
import { useListProductsQuery } from '../masters/mastersApi'
import { useListSalesOrdersQuery } from '../sales/salesExtraApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from '../../components/DataGrid'
import type { CuttingPlanDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

interface Line { key: string; productId: number; requiredLengthMm: number; requiredWidthMm: number; qty: number }

type SortKey = 'planNo' | 'planDate' | 'orderNo' | 'totalSheets' | 'yieldPct' | 'status'

export default function CuttingPlansPage() {
  const { data, isLoading } = useListCuttingPlansQuery()
  const { data: products } = useListProductsQuery()
  const { data: orders } = useListSalesOrdersQuery()
  const [createPlan, { isLoading: saving }] = useCreateCuttingPlanMutation()
  const [deletePlan] = useDeleteCuttingPlanMutation()

  const [showForm, setShowForm] = useState(false)
  const [salesOrderId, setSalesOrderId] = useState<number | ''>('')
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: 0, requiredLengthMm: 0, requiredWidthMm: 0, qty: 1 }])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ estimatedSheets: number; yieldPct: number; wasteAreaSqft: number } | null>(null)

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
  } = useDataGrid<CuttingPlanDto, SortKey>(data?.items, {
    defaultSortKey: 'planDate',
    defaultSortDir: 'desc',
    comparators: {
      planNo: (a, b) => (a.planNo ?? '').localeCompare(b.planNo ?? ''),
      planDate: (a, b) => new Date(a.planDate).getTime() - new Date(b.planDate).getTime(),
      orderNo: (a, b) => (a.orderNo ?? '').localeCompare(b.orderNo ?? ''),
      totalSheets: (a, b) => a.totalSheets - b.totalSheets,
      yieldPct: (a, b) => (a.yieldPct ?? 0) - (b.yieldPct ?? 0),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (p, term) =>
      !!p.planNo?.toLowerCase().includes(term) ||
      !!p.orderNo?.toLowerCase().includes(term) ||
      p.status.toLowerCase().includes(term),
  })

  function addLine() { setLines((p) => [...p, { key: crypto.randomUUID(), productId: 0, requiredLengthMm: 0, requiredWidthMm: 0, qty: 1 }]) }
  function removeLine(key: string) { setLines((p) => p.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<Line>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const valid = lines.filter((l) => l.productId && l.requiredLengthMm > 0 && l.requiredWidthMm > 0 && l.qty > 0)
    if (valid.length === 0) { setError('Add at least one required piece.'); return }
    try {
      const res = await createPlan({
        salesOrderId: salesOrderId ? Number(salesOrderId) : undefined,
        lines: valid.map(({ productId, requiredLengthMm, requiredWidthMm, qty }) => ({ productId, requiredLengthMm, requiredWidthMm, qty })),
      }).unwrap()
      setResult({ estimatedSheets: res.estimatedSheets, yieldPct: res.yieldPct, wasteAreaSqft: res.wasteAreaSqft })
      setLines([{ key: crypto.randomUUID(), productId: 0, requiredLengthMm: 0, requiredWidthMm: 0, qty: 1 }])
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not create the cutting plan.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Cutting Plans</h1>
          <p className="text-sm text-slate-500 mt-1">Nest required pieces onto sheets; offcuts are offered before a fresh sheet.</p>
        </div>
        <button onClick={() => { setShowForm((v) => !v); setResult(null) }} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Cutting Plan'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="max-w-sm">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sales Order (optional)</label>
            <select value={salesOrderId} onChange={(e) => setSalesOrderId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Not linked to an order</option>
              {orders?.items.map((o) => <option key={o.salesOrderId} value={o.salesOrderId}>{o.orderNo} — {o.customerName}</option>)}
            </select>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium w-28">Length (mm)</th>
                <th className="py-2 font-medium w-28">Width (mm)</th>
                <th className="py-2 font-medium w-20">Qty</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-2 pr-2">
                    <select value={l.productId || ''} onChange={(e) => updateLine(l.key, { productId: Number(e.target.value) })} className={inputClass}>
                      <option value="">Select product…</option>
                      {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2"><input type="number" min={0} value={l.requiredLengthMm || ''} onChange={(e) => updateLine(l.key, { requiredLengthMm: Number(e.target.value) })} className={inputClass} /></td>
                  <td className="py-2 pr-2"><input type="number" min={0} value={l.requiredWidthMm || ''} onChange={(e) => updateLine(l.key, { requiredWidthMm: Number(e.target.value) })} className={inputClass} /></td>
                  <td className="py-2 pr-2"><input type="number" min={1} value={l.qty || ''} onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })} className={inputClass} /></td>
                  <td><button type="button" onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500 transition"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><Plus size={15} /> Add Piece</button>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Optimising…' : 'Generate Plan'}</button>
          </div>

          {result && (
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <div className="text-center"><div className="text-xl font-bold text-brand-900">{result.estimatedSheets}</div><div className="text-xs text-slate-500">Sheets needed</div></div>
              <div className="text-center"><div className="text-xl font-bold text-emerald-700">{result.yieldPct}%</div><div className="text-xs text-slate-500">Estimated yield</div></div>
              <div className="text-center"><div className="text-xl font-bold text-amber-700">{result.wasteAreaSqft}</div><div className="text-xs text-slate-500">Waste (sqft)</div></div>
            </div>
          )}
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search plan no., sales order or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('planNo')}>
                  Plan No. <SortIcon column="planNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('planDate')}>
                  Date <SortIcon column="planDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('orderNo')}>
                  Sales Order <SortIcon column="orderNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('totalSheets')} align="right">
                  Sheets <SortIcon column="totalSheets" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('yieldPct')} align="right">
                  Yield <SortIcon column="yieldPct" sortKey={sortKey} sortDir={sortDir} />
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
                    <Scissors size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No cutting plans match your search.' : 'No cutting plans yet.'}
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.cuttingPlanId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{p.planNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(p.planDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-500">{p.orderNo ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{p.totalSheets}</td>
                  <td className="px-5 py-3 text-right text-emerald-700 font-medium">{p.yieldPct ?? '—'}%</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{p.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={p.canDelete}
                      itemLabel={`Cutting Plan ${p.planNo}`}
                      onDelete={() => deletePlan(p.cuttingPlanId).unwrap()}
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
