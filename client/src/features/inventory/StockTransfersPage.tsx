import { useState } from 'react'
import { Plus, X, Trash2, ArrowLeftRight } from 'lucide-react'
import { useListTransfersQuery, useCreateTransferMutation, useListGodownsQuery } from './inventoryApi'
import { useListProductsQuery } from '../masters/mastersApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { StockTransferDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

interface Line { key: string; productId: number; qty: number }

type SortKey = 'transferNo' | 'transferDate' | 'fromGodownName' | 'toGodownName' | 'status'

export default function StockTransfersPage() {
  const { data, isLoading } = useListTransfersQuery()
  const { data: godowns } = useListGodownsQuery()
  const { data: products } = useListProductsQuery()
  const [createTransfer, { isLoading: saving }] = useCreateTransferMutation()

  const [showForm, setShowForm] = useState(false)
  const [fromGodownId, setFromGodownId] = useState<number | ''>('')
  const [toGodownId, setToGodownId] = useState<number | ''>('')
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: 0, qty: 0 }])
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
  } = useDataGrid<StockTransferDto, SortKey>(data?.items, {
    defaultSortKey: 'transferDate',
    defaultSortDir: 'desc',
    comparators: {
      transferNo: (a, b) => (a.transferNo ?? '').localeCompare(b.transferNo ?? ''),
      transferDate: (a, b) => new Date(a.transferDate).getTime() - new Date(b.transferDate).getTime(),
      fromGodownName: (a, b) => (a.fromGodownName ?? '').localeCompare(b.fromGodownName ?? ''),
      toGodownName: (a, b) => (a.toGodownName ?? '').localeCompare(b.toGodownName ?? ''),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (t, term) =>
      !!t.transferNo?.toLowerCase().includes(term) ||
      !!t.fromGodownName?.toLowerCase().includes(term) ||
      !!t.toGodownName?.toLowerCase().includes(term) ||
      t.status.toLowerCase().includes(term),
  })

  function addLine() { setLines((p) => [...p, { key: crypto.randomUUID(), productId: 0, qty: 0 }]) }
  function removeLine(key: string) { setLines((p) => p.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<Line>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fromGodownId || !toGodownId) { setError('Select both godowns.'); return }
    if (fromGodownId === toGodownId) { setError('Source and destination godown must differ.'); return }
    const valid = lines.filter((l) => l.productId && l.qty > 0)
    if (valid.length === 0) { setError('Add at least one product with a quantity.'); return }
    try {
      await createTransfer({ fromGodownId: Number(fromGodownId), toGodownId: Number(toGodownId), lines: valid.map(({ productId, qty }) => ({ productId, qty })) }).unwrap()
      setShowForm(false)
      setLines([{ key: crypto.randomUUID(), productId: 0, qty: 0 }])
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the transfer.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Stock Transfers</h1>
          <p className="text-sm text-slate-500 mt-1">Move stock between godowns.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Transfer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">From Godown *</label>
              <select required value={fromGodownId} onChange={(e) => setFromGodownId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select…</option>
                {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To Godown *</label>
              <select required value={toGodownId} onChange={(e) => setToGodownId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select…</option>
                {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
              </select>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium w-40">Quantity</th>
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
                  <td><button type="button" onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-500 transition"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"><Plus size={15} /> Add Line</button>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Transfer Stock'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search transfer no., godown or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('transferNo')}>
                  Transfer No. <SortIcon column="transferNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('transferDate')}>
                  Date <SortIcon column="transferDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('fromGodownName')}>
                  From <SortIcon column="fromGodownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('toGodownName')}>
                  To <SortIcon column="toGodownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <ArrowLeftRight size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No transfers match your search.' : 'No transfers yet.'}
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.stockTransferId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{t.transferNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(t.transferDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{t.fromGodownName}</td>
                  <td className="px-5 py-3 text-slate-700">{t.toGodownName}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{t.status}</span></td>
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
