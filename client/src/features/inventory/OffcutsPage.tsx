import { useState } from 'react'
import { Plus, X, Puzzle } from 'lucide-react'
import { useListOffcutsQuery, useCreateOffcutMutation, useDeleteOffcutMutation, useListGodownsQuery } from './inventoryApi'
import { useListProductsQuery } from '../masters/mastersApi'
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
import type { OffcutDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const statusStyles: Record<string, string> = {
  Available: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Reserved: 'bg-amber-50 text-amber-700 ring-amber-200',
  Used: 'bg-slate-100 text-slate-600 ring-slate-200',
  Scrapped: 'bg-red-50 text-red-700 ring-red-200',
}

type SortKey = 'offcutCode' | 'productCode' | 'areaSqft' | 'godownName' | 'status'

export default function OffcutsPage() {
  const { data, isLoading } = useListOffcutsQuery()
  const { data: godowns } = useListGodownsQuery()
  const { data: products } = useListProductsQuery()
  const [createOffcut, { isLoading: saving }] = useCreateOffcutMutation()
  const [deleteOffcut] = useDeleteOffcutMutation()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ productId: 0, lengthMm: 0, widthMm: 0, godownId: 0 })
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
  } = useDataGrid<OffcutDto, SortKey>(data?.items, {
    defaultSortKey: 'offcutCode',
    comparators: {
      offcutCode: (a, b) => (a.offcutCode ?? '').localeCompare(b.offcutCode ?? ''),
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      areaSqft: (a, b) => a.areaSqft - b.areaSqft,
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (o, term) =>
      !!o.offcutCode?.toLowerCase().includes(term) ||
      !!o.productCode?.toLowerCase().includes(term) ||
      !!o.godownName?.toLowerCase().includes(term) ||
      o.status.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.productId || !form.godownId || form.lengthMm <= 0 || form.widthMm <= 0) { setError('Fill in all fields.'); return }
    try {
      await createOffcut(form).unwrap()
      setShowForm(false)
      setForm({ productId: 0, lengthMm: 0, widthMm: 0, godownId: 0 })
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the offcut.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Offcuts</h1>
          <p className="text-sm text-slate-500 mt-1">Reusable leftover pieces — offered before a fresh sheet is cut.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Log Offcut'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-4 gap-4 animate-fade-in">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Product *</label>
            <select value={form.productId || ''} onChange={(e) => setForm((f) => ({ ...f, productId: Number(e.target.value) }))} className={inputClass}>
              <option value="">Select product…</option>
              {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Length (mm) *</label>
            <input type="number" min={0} value={form.lengthMm || ''} onChange={(e) => setForm((f) => ({ ...f, lengthMm: Number(e.target.value) }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Width (mm) *</label>
            <input type="number" min={0} value={form.widthMm || ''} onChange={(e) => setForm((f) => ({ ...f, widthMm: Number(e.target.value) }))} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Godown *</label>
            <select value={form.godownId || ''} onChange={(e) => setForm((f) => ({ ...f, godownId: Number(e.target.value) }))} className={inputClass}>
              <option value="">Select godown…</option>
              {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
            </select>
          </div>
          {error && <div className="sm:col-span-4 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Offcut'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search code, product, godown or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('offcutCode')}>
                  Code <SortIcon column="offcutCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('productCode')}>
                  Product <SortIcon column="productCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Size (mm)</Th>
                <SortableTh onClick={() => toggleSort('areaSqft')} align="right">
                  Area (sqft) <SortIcon column="areaSqft" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th align="right">Area (product unit)</Th>
                <SortableTh onClick={() => toggleSort('godownName')}>
                  Godown <SortIcon column="godownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Source / Used By</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-slate-400">
                    <Puzzle size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No offcuts match your search.' : 'No offcuts logged yet.'}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr key={o.offcutId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{o.offcutCode}</td>
                  <td className="px-5 py-3 text-slate-700">{o.productCode}</td>
                  <td className="px-5 py-3 text-slate-500">{o.lengthMm} × {o.widthMm}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{o.areaSqft}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{o.areaInStockUnit != null ? `${o.areaInStockUnit} ${o.stockUnit ?? ''}` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{o.godownName}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[o.status] ?? statusStyles.Available}`}>{o.status}</span></td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {o.sourceDocType ? <div>From {o.sourceDocType} #{o.sourceDocId}</div> : null}
                    {o.consumedByDocType ? <div>Used by {o.consumedByDocType} #{o.consumedByDocId}</div> : null}
                    {!o.sourceDocType && !o.consumedByDocType ? '—' : null}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={o.canDelete}
                      itemLabel={`Offcut ${o.offcutCode}`}
                      onDelete={() => deleteOffcut(o.offcutId).unwrap()}
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
