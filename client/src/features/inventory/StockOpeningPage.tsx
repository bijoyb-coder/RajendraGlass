import { useState } from 'react'
import { Plus, X, Trash2, PackagePlus } from 'lucide-react'
import { useListStockOpeningsQuery, useCreateStockOpeningMutation, useDeleteStockOpeningMutation, useListGodownsQuery } from './inventoryApi'
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
import type { StockOpeningDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

interface Line { key: string; productId: number; qty: number; areaSqm: number }

type SortKey = 'openingNo' | 'openingDate' | 'godownName' | 'status'

/** Records the opening balance of a product at a godown -- e.g. stock that already physically
 * exists but predates the system. Unlike Stock Adjustment, which corrects book qty to a counted
 * actual and can move the balance either way, this always adds the entered quantity, the same way
 * a Purchase/GRN would. */
export default function StockOpeningPage() {
  const { data, isLoading } = useListStockOpeningsQuery()
  const { data: godowns } = useListGodownsQuery()
  const { data: products } = useListProductsQuery()
  const [createOpening, { isLoading: saving }] = useCreateStockOpeningMutation()
  const [deleteOpening] = useDeleteStockOpeningMutation()

  const [showForm, setShowForm] = useState(false)
  const [godownId, setGodownId] = useState<number | ''>('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: 0, qty: 0, areaSqm: 0 }])
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
  } = useDataGrid<StockOpeningDto, SortKey>(data?.items, {
    defaultSortKey: 'openingDate',
    defaultSortDir: 'desc',
    comparators: {
      openingNo: (a, b) => (a.openingNo ?? '').localeCompare(b.openingNo ?? ''),
      openingDate: (a, b) => new Date(a.openingDate).getTime() - new Date(b.openingDate).getTime(),
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (o, term) =>
      !!o.openingNo?.toLowerCase().includes(term) ||
      !!o.godownName?.toLowerCase().includes(term) ||
      !!o.remarks?.toLowerCase().includes(term) ||
      o.status.toLowerCase().includes(term),
  })

  function addLine() { setLines((p) => [...p, { key: crypto.randomUUID(), productId: 0, qty: 0, areaSqm: 0 }]) }
  function removeLine(key: string) { setLines((p) => p.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<Line>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!godownId) { setError('Select a godown.'); return }
    const valid = lines.filter((l) => l.productId && l.qty > 0 && l.areaSqm > 0)
    if (valid.length === 0) { setError('Add at least one product with an opening quantity and area (SQM) greater than zero.'); return }
    try {
      await createOpening({ godownId: Number(godownId), remarks: remarks || undefined, lines: valid.map(({ productId, qty, areaSqm }) => ({ productId, qty, areaSqm })) }).unwrap()
      setShowForm(false)
      setLines([{ key: crypto.randomUUID(), productId: 0, qty: 0, areaSqm: 0 }])
      setRemarks('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the opening balance.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Stock Opening</h1>
          <p className="text-sm text-slate-500 mt-1">Record the opening balance of an item at a godown.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Opening Balance'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Godown *</label>
              <select required value={godownId} onChange={(e) => setGodownId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select godown…</option>
                {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} placeholder="Migrated from paper records, etc." />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium w-40">Opening Qty</th>
                <th className="py-2 font-medium w-40">Area (SQM)</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-2 pr-2">
                    <select value={l.productId || ''} onChange={(e) => updateLine(l.key, { productId: Number(e.target.value) })} className={inputClass}>
                      <option value="">Select product…</option>
                      {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} step="0.001" value={l.qty || ''} onChange={(e) => updateLine(l.key, { qty: Number(e.target.value) })} className={inputClass} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={0} step="0.001" value={l.areaSqm || ''} onChange={(e) => updateLine(l.key, { areaSqm: Number(e.target.value) })} className={inputClass} />
                  </td>
                  <td>
                    <button type="button" onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500 transition"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><Plus size={15} /> Add Line</button>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Post Opening Balance'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search opening no., godown, remarks or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('openingNo')}>
                  Opening No. <SortIcon column="openingNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('openingDate')}>
                  Date <SortIcon column="openingDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('godownName')}>
                  Godown <SortIcon column="godownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Remarks</Th>
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
                    <PackagePlus size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No opening balances match your search.' : 'No opening balances posted yet.'}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr key={o.stockOpeningId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{o.openingNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(o.openingDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{o.godownName}</td>
                  <td className="px-5 py-3 text-slate-500">{o.remarks ?? '—'}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{o.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={o.canDelete}
                      itemLabel={`Stock Opening ${o.openingNo}`}
                      onDelete={() => deleteOpening(o.stockOpeningId).unwrap()}
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
