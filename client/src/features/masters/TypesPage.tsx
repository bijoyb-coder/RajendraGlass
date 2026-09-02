import { useState } from 'react'
import { Plus, X, Shapes, Pencil, Power, PowerOff } from 'lucide-react'
import {
  useListTypesQuery,
  useCreateTypeMutation,
  useUpdateTypeMutation,
  useDeactivateTypeMutation,
  useActivateTypeMutation,
} from './mastersApi'
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
} from '../../components/DataGrid'
import { alertError, alertSuccess, confirmAction } from '../../lib/alerts'
import type { TypeDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm = { name: '' }

type SortKey = 'name'

/** Type Master — deliberately just TypeID + TypeName, no separate Code column (unlike Category and
 * Sub-Category). A Type already used by a Product is never physically deletable, so the only
 * lifecycle action is Activate/Deactivate. */
export default function TypesPage() {
  const { data, isLoading } = useListTypesQuery()
  const [createType, { isLoading: creating }] = useCreateTypeMutation()
  const [updateType, { isLoading: updating }] = useUpdateTypeMutation()
  const [deactivateType] = useDeactivateTypeMutation()
  const [activateType] = useActivateTypeMutation()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const saving = creating || updating

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
  } = useDataGrid<TypeDto, SortKey>(data?.items, {
    defaultSortKey: 'name',
    comparators: { name: (a, b) => (a.name ?? '').localeCompare(b.name ?? '') },
    matches: (t, term) => !!t.name?.toLowerCase().includes(term),
  })

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(t: TypeDto) {
    setEditingId(t.typeId)
    setForm({ name: t.name })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { void alertError('Validation failed', 'Type Name is required.'); return }
    const body = { name: form.name }
    try {
      if (editingId) {
        await updateType({ id: editingId, body }).unwrap()
        void alertSuccess('Type updated successfully.')
      } else {
        await createType(body).unwrap()
        void alertSuccess('Type created successfully.')
      }
      setForm(emptyForm)
      closeForm()
    } catch (err: any) {
      const message =
        err?.data?.errorCode === 'DUPLICATE_NAME' ? 'Type Name already exists.' : err?.data?.detail ?? 'The type could not be saved.'
      void alertError('Could not save', message)
    }
  }

  async function handleToggleActive(t: TypeDto) {
    if (t.isActive) {
      const confirmed = await confirmAction('Are you sure you want to deactivate this Type?', undefined, 'Yes, deactivate')
      if (!confirmed) return
      try {
        await deactivateType(t.typeId).unwrap()
        void alertSuccess('Type deactivated successfully.')
      } catch (err: any) {
        void alertError('Could not deactivate', err?.data?.detail ?? 'The type could not be deactivated.')
      }
    } else {
      try {
        await activateType(t.typeId).unwrap()
        void alertSuccess('Type activated successfully.')
      } catch (err: any) {
        void alertError('Could not activate', err?.data?.detail ?? 'The type could not be activated.')
      }
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Type Master</h1>
          <p className="text-sm text-slate-500 mt-1">Glass product types, used by Product Master's Type dropdown.</p>
        </div>
        <button onClick={showForm ? closeForm : openNew} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Type'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-2 gap-4 animate-fade-in">
          <h2 className="sm:col-span-2 text-sm font-semibold text-slate-700 -mb-2">{editingId ? 'Edit Type' : 'New Type'}</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type Name *</label>
            <input required value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="e.g. Plain, Laminated, Toughened" className={inputClass} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Type'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search type name…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <Th>Type ID</Th>
                <SortableTh onClick={() => toggleSort('name')}>
                  Type Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Status</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-14 text-center text-slate-400">
                    <Shapes size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No types match your search.' : 'No types yet.'}
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.typeId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 text-slate-500">{t.typeId}</td>
                  <td className="px-5 py-3 font-medium text-brand-700">{t.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${t.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        title="Edit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(t)}
                        title={t.isActive ? 'Deactivate' : 'Activate'}
                        className={`inline-flex items-center gap-1 text-xs font-medium transition ${t.isActive ? 'text-slate-400 hover:text-red-600' : 'text-slate-400 hover:text-emerald-600'}`}
                      >
                        {t.isActive ? <PowerOff size={13} /> : <Power size={13} />} {t.isActive ? 'Deactivate' : 'Activate'}
                      </button>
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
