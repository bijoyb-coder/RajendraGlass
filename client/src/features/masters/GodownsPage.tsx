import { useState, useEffect } from 'react'
import { Plus, X, Warehouse, Pencil, Check, PackageSearch } from 'lucide-react'
import {
  useListGodownsQuery, useGetGodownQuery, useCreateGodownMutation, useUpdateGodownMutation,
  useCreateRackMutation, useUpdateRackMutation,
} from '../inventory/inventoryApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { GodownDto, RackDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm = { code: '', name: '', location: '' }

type SortKey = 'code' | 'name' | 'rackCount'

/** Godown master-detail: one screen for both. A godown is the master; its racks are entered,
 * listed and edited as details of that godown — there is no separate Rack master screen. */
export default function GodownsPage() {
  const { data, isLoading } = useListGodownsQuery()
  const [createGodown, { isLoading: saving }] = useCreateGodownMutation()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

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
  } = useDataGrid<GodownDto, SortKey>(data?.items, {
    defaultSortKey: 'name',
    comparators: {
      code: (a, b) => a.code.localeCompare(b.code),
      name: (a, b) => a.name.localeCompare(b.name),
      rackCount: (a, b) => a.rackCount - b.rackCount,
    },
    matches: (g, term) => g.code.toLowerCase().includes(term) || g.name.toLowerCase().includes(term) || (g.location ?? '').toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Enter a godown name.'); return }
    try {
      const res = await createGodown({ code: form.code || undefined, name: form.name, location: form.location || undefined }).unwrap()
      setForm(emptyForm)
      setShowForm(false)
      setSelectedId(res.godownId)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the godown.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Godowns</h1>
          <p className="text-sm text-slate-500 mt-1">Storage locations and their racks — one master-detail screen. Select a godown to edit it and manage its racks.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Godown'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="Godown1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Location</label>
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className={inputClass} placeholder="e.g. Industrial Area, Shed 3" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Code (optional)</label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className={inputClass} placeholder="Auto from name if left blank" />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Godown'}
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search code, name or location…"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => toggleSort('code')}>
                    Code <SortIcon column="code" sortKey={sortKey} sortDir={sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => toggleSort('name')}>
                    Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => toggleSort('rackCount')} align="right">
                    Racks <SortIcon column="rackCount" sortKey={sortKey} sortDir={sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-14 text-center text-slate-400">
                      <Warehouse size={28} className="mx-auto mb-2 text-slate-300" />
                      {search ? 'No godowns match your search.' : 'No godowns yet.'}
                    </td>
                  </tr>
                )}
                {rows.map((g) => (
                  <tr
                    key={g.godownId}
                    onClick={() => setSelectedId(g.godownId)}
                    className={`${DATA_GRID_ROW_CLASS} cursor-pointer ${selectedId === g.godownId ? 'bg-brand-50' : ''}`}
                  >
                    <td className="px-5 py-3 font-medium text-brand-700">{g.code}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {g.name}
                      {g.location && <div className="text-xs text-slate-400">{g.location}</div>}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">{g.rackCount}</td>
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

        <div className="lg:col-span-3">
          {selectedId ? (
            <GodownDetailPanel godownId={selectedId} />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 shadow-sm p-10 text-center text-slate-400">
              <PackageSearch size={28} className="mx-auto mb-2 text-slate-300" />
              Select a godown on the left to view or edit its details and racks.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GodownDetailPanel({ godownId }: { godownId: number }) {
  const { data: godown, isLoading } = useGetGodownQuery(godownId)
  const [updateGodown, { isLoading: savingGodown }] = useUpdateGodownMutation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (godown) { setName(godown.name); setLocation(godown.location ?? '') }
    setEditing(false)
  }, [godown?.godownId, godown?.name, godown?.location])

  async function saveGodown(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) { setError('Enter a godown name.'); return }
    try {
      await updateGodown({ id: godownId, body: { name, location: location || undefined } }).unwrap()
      setEditing(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save changes.')
    }
  }

  if (isLoading || !godown) {
    return <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        {editing ? (
          <form onSubmit={saveGodown} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="e.g. Industrial Area, Shed 3" />
            </div>
            {error && <div className="sm:col-span-2 text-sm text-red-600">{error}</div>}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button type="submit" disabled={savingGodown} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition disabled:opacity-60">
                <Check size={15} /> {savingGodown ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-brand-600">{godown.code}</div>
              <div className="text-lg font-bold text-brand-900">{godown.name}</div>
              <div className="text-sm text-slate-500 mt-0.5">{godown.location || <span className="text-slate-300">No location set</span>}</div>
            </div>
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition shrink-0">
              <Pencil size={14} /> Edit
            </button>
          </div>
        )}
      </div>

      <RacksPanel godownId={godownId} godownName={godown.name} racks={godown.racks} />
    </div>
  )
}

function RacksPanel({ godownId, godownName, racks }: { godownId: number; godownName: string; racks: RackDto[] }) {
  const [createRack, { isLoading: creating }] = useCreateRackMutation()
  const [updateRack, { isLoading: updating }] = useUpdateRackMutation()
  const [showAdd, setShowAdd] = useState(false)
  const [rackName, setRackName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingRackId, setEditingRackId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const previewCode = godownName && rackName.trim() ? `${godownName.replace(/\s+/g, '')}_${rackName.trim()}` : null

  async function addRack(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!rackName.trim()) { setError('Enter a rack name.'); return }
    try {
      await createRack({ godownId, name: rackName }).unwrap()
      setRackName('')
      setShowAdd(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the rack.')
    }
  }

  async function saveRackEdit(rackId: number) {
    setError(null)
    if (!editingName.trim()) { setError('Enter a rack name.'); return }
    try {
      await updateRack({ id: rackId, body: { name: editingName } }).unwrap()
      setEditingRackId(null)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the rack.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <div className="font-semibold text-brand-900">Racks</div>
          <div className="text-xs text-slate-500">Physical shelving inside this godown. Rack code is combined automatically as GodownName_RackName.</div>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow transition shrink-0">
          {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Cancel' : 'Add Rack'}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addRack} className="px-5 py-4 border-b border-slate-100 bg-slate-50 grid sm:grid-cols-3 gap-3 items-end animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rack Name *</label>
            <input required autoFocus value={rackName} onChange={(e) => setRackName(e.target.value)} className={inputClass} placeholder="Rack1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rack Code (auto)</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500">
              {previewCode ?? '—'}
            </div>
          </div>
          <button type="submit" disabled={creating} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition disabled:opacity-60">
            {creating ? 'Saving…' : 'Save Rack'}
          </button>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={DATA_GRID_HEAD_ROW_CLASS}>
              <th className="px-5 py-2.5 text-left font-semibold">Rack Code</th>
              <th className="px-5 py-2.5 text-left font-semibold">Rack Name</th>
              <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {racks.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-slate-400">No racks yet. Add one above.</td>
              </tr>
            )}
            {racks.map((r) => (
              <tr key={r.rackId} className={DATA_GRID_ROW_CLASS}>
                <td className="px-5 py-2.5 font-medium text-brand-700">{r.code}</td>
                <td className="px-5 py-2.5 text-slate-700">
                  {editingRackId === r.rackId ? (
                    <input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className={inputClass} />
                  ) : (
                    r.name
                  )}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {editingRackId === r.rackId ? (
                    <div className="inline-flex gap-2">
                      <button onClick={() => setEditingRackId(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">Cancel</button>
                      <button onClick={() => saveRackEdit(r.rackId)} disabled={updating} className="text-xs font-semibold text-brand-700 hover:text-brand-900 disabled:opacity-60">
                        {updating ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingRackId(r.rackId); setEditingName(r.name); setError(null) }} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900">
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
