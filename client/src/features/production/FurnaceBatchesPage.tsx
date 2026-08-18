import { useState } from 'react'
import { Plus, X, Flame } from 'lucide-react'
import { useListFurnaceBatchesQuery, useCreateFurnaceBatchMutation, useDeleteFurnaceBatchMutation } from './productionApi'
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
import type { FurnaceBatchDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const statusStyles: Record<string, string> = {
  Planned: 'bg-slate-100 text-slate-600 ring-slate-200',
  Running: 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

type SortKey = 'batchNo' | 'thicknessMm' | 'batchDate' | 'utilisationPct' | 'estElectricityCost' | 'status'

export default function FurnaceBatchesPage() {
  const { data, isLoading } = useListFurnaceBatchesQuery()
  const [createBatch, { isLoading: saving }] = useCreateFurnaceBatchMutation()
  const [deleteBatch] = useDeleteFurnaceBatchMutation()
  const [showForm, setShowForm] = useState(false)
  const [thicknessMm, setThicknessMm] = useState<number | ''>('')
  const [utilisationPct, setUtilisationPct] = useState<number | ''>('')

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
  } = useDataGrid<FurnaceBatchDto, SortKey>(data?.items, {
    defaultSortKey: 'batchDate',
    defaultSortDir: 'desc',
    comparators: {
      batchNo: (a, b) => (a.batchNo ?? '').localeCompare(b.batchNo ?? ''),
      thicknessMm: (a, b) => a.thicknessMm - b.thicknessMm,
      batchDate: (a, b) => new Date(a.batchDate).getTime() - new Date(b.batchDate).getTime(),
      utilisationPct: (a, b) => (a.utilisationPct ?? 0) - (b.utilisationPct ?? 0),
      estElectricityCost: (a, b) => (a.estElectricityCost ?? 0) - (b.estElectricityCost ?? 0),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (b, term) =>
      !!b.batchNo?.toLowerCase().includes(term) ||
      b.status.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!thicknessMm || !utilisationPct) return
    await createBatch({ thicknessMm: Number(thicknessMm), utilisationPct: Number(utilisationPct) }).unwrap()
    setShowForm(false)
    setThicknessMm(''); setUtilisationPct('')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Furnace Batches</h1>
          <p className="text-sm text-slate-500 mt-1">Toughening batches — one thickness per batch, tracked for bed utilisation.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Batch'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-end gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Thickness (mm) *</label>
            <input type="number" min={0} step="0.1" required value={thicknessMm} onChange={(e) => setThicknessMm(e.target.value ? Number(e.target.value) : '')} className={`${inputClass} w-40`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Bed Utilisation (%) *</label>
            <input type="number" min={0} max={100} step="0.1" required value={utilisationPct} onChange={(e) => setUtilisationPct(e.target.value ? Number(e.target.value) : '')} className={`${inputClass} w-40`} />
          </div>
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Creating…' : 'Create Batch'}</button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search batch no. or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('batchNo')}>
                  Batch No. <SortIcon column="batchNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('thicknessMm')}>
                  Thickness <SortIcon column="thicknessMm" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('batchDate')}>
                  Date <SortIcon column="batchDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('utilisationPct')} align="right">
                  Utilisation <SortIcon column="utilisationPct" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('estElectricityCost')} align="right">
                  Est. Electricity <SortIcon column="estElectricityCost" sortKey={sortKey} sortDir={sortDir} />
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
                    <Flame size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No furnace batches match your search.' : 'No furnace batches yet.'}
                  </td>
                </tr>
              )}
              {rows.map((b) => (
                <tr key={b.furnaceBatchId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{b.batchNo}</td>
                  <td className="px-5 py-3 text-slate-700">{b.thicknessMm} mm</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(b.batchDate).toLocaleDateString('en-IN')}</td>
                  <td className={`px-5 py-3 text-right font-medium ${(b.utilisationPct ?? 0) < 60 ? 'text-red-600' : 'text-emerald-700'}`}>{b.utilisationPct ?? '—'}%</td>
                  <td className="px-5 py-3 text-right text-slate-700">₹{b.estElectricityCost?.toLocaleString('en-IN') ?? '—'}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[b.status] ?? statusStyles.Planned}`}>{b.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={b.canDelete}
                      itemLabel={`Furnace Batch ${b.batchNo}`}
                      onDelete={() => deleteBatch(b.furnaceBatchId).unwrap()}
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
