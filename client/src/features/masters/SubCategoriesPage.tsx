import { useState } from 'react'
import { Plus, X, Tag, Pencil } from 'lucide-react'
import { useListSubCategoriesQuery, useCreateSubCategoryMutation, useUpdateSubCategoryMutation, useDeleteSubCategoryMutation, useListCategoriesQuery } from './mastersApi'
import SearchableSelect from '../../components/SearchableSelect'
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
import { alertError, alertSuccess } from '../../lib/alerts'
import type { SubCategoryDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: { code: string; name: string; categoryId: number | '' } = { code: '', name: '', categoryId: '' }

type SortKey = 'code' | 'name' | 'categoryCode'

/** Sub-Category Master — the child side of the Category → Sub-Category relationship. Every
 * Sub-Category maps to one Category (many Sub-Categories can share the same Category), via the
 * database-driven Category dropdown below. Category Name is never typed here: it's always the
 * live join from CategoriesPage's own table (CategoryDto.name), so there is exactly one
 * authoritative place it can be edited. */
export default function SubCategoriesPage() {
  const { data, isLoading } = useListSubCategoriesQuery()
  const { data: categories } = useListCategoriesQuery()
  const [createSubCategory, { isLoading: creating }] = useCreateSubCategoryMutation()
  const [updateSubCategory, { isLoading: updating }] = useUpdateSubCategoryMutation()
  const [deleteSubCategory] = useDeleteSubCategoryMutation()
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
  } = useDataGrid<SubCategoryDto, SortKey>(data?.items, {
    defaultSortKey: 'code',
    comparators: {
      code: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
      name: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
      categoryCode: (a, b) => (a.categoryCode ?? '').localeCompare(b.categoryCode ?? ''),
    },
    matches: (sc, term) =>
      !!sc.code?.toLowerCase().includes(term) ||
      !!sc.name?.toLowerCase().includes(term) ||
      !!sc.categoryCode?.toLowerCase().includes(term) ||
      !!sc.categoryName?.toLowerCase().includes(term),
  })

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(sc: SubCategoryDto) {
    setEditingId(sc.subCategoryId)
    setForm({ code: sc.code, name: sc.name, categoryId: sc.categoryId })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Fast client-side feedback — the server validates the same rules again regardless (required,
    // trimmed, unique code, and that categoryId actually names a real, active Category), since a
    // direct API call must never be able to skip them.
    if (!form.code.trim()) { void alertError('Validation failed', 'Sub-Category Code is required.'); return }
    if (!form.name.trim()) { void alertError('Validation failed', 'Sub-Category Name is required.'); return }
    if (!form.categoryId) { void alertError('Validation failed', 'Please select a Category.'); return }
    const body = { code: form.code, name: form.name, categoryId: Number(form.categoryId) }
    try {
      if (editingId) {
        await updateSubCategory({ id: editingId, body }).unwrap()
        void alertSuccess('Sub-Category updated successfully.')
      } else {
        await createSubCategory(body).unwrap()
        void alertSuccess('Sub-Category saved successfully.')
      }
      setForm(emptyForm)
      closeForm()
    } catch (err: any) {
      const message =
        err?.data?.errorCode === 'DUPLICATE_CODE' ? 'Sub-Category Code already exists.' : err?.data?.detail ?? 'The sub-category could not be saved.'
      void alertError('Could not save', message)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Sub-Category Master</h1>
          <p className="text-sm text-slate-500 mt-1">Glass product sub-categories, each mapped to a Category.</p>
        </div>
        <button onClick={showForm ? closeForm : openNew} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Sub-Category'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <h2 className="sm:col-span-3 text-sm font-semibold text-slate-700 -mb-2">{editingId ? 'Edit Sub-Category' : 'New Sub-Category'}</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sub-Category Code *</label>
            <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. GLS001" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sub-Category Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Clear Glass" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category *</label>
            {/* Database-driven — options come from CategoriesController.List (the same list
                CategoriesPage itself uses), never a hard-coded array. Search matches both the
                code and the name since the label is "CODE - Name". */}
            <SearchableSelect
              value={form.categoryId}
              onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
              options={categories?.items.map((c) => ({ value: c.categoryId, label: `${c.code} - ${c.name}` })) ?? []}
              placeholder="Search Category…"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Sub-Category'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search sub-category or category code/name…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('code')}>
                  Sub-Category Code <SortIcon column="code" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('name')}>
                  Sub-Category Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('categoryCode')}>
                  Category Code <SortIcon column="categoryCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Category Name</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <Tag size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No sub-categories match your search.' : 'No sub-categories yet.'}
                  </td>
                </tr>
              )}
              {rows.map((sc) => (
                <tr key={sc.subCategoryId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{sc.code}</td>
                  <td className="px-5 py-3 text-slate-700">{sc.name}</td>
                  <td className="px-5 py-3 text-slate-500">{sc.categoryCode ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{sc.categoryName ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(sc)}
                        title="Edit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <DeleteRowAction
                        canDelete={sc.canDelete}
                        itemLabel={`sub-category ${sc.code} — ${sc.name}`}
                        onDelete={() => deleteSubCategory(sc.subCategoryId).unwrap()}
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
