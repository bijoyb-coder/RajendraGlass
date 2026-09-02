import { useState } from 'react'
import { Plus, X, Tags, Pencil } from 'lucide-react'
import {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useListSubCategoriesQuery,
} from './mastersApi'
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
import type { CategoryDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: { code: string; name: string; subCategoryId: number | '' } = { code: '', name: '', subCategoryId: '' }

type SortKey = 'code' | 'name' | 'subCategoryCode'

/** Category Master — every Category maps to one Sub-Category (many Categories can share the same
 * Sub-Category), via the database-driven Sub-Category dropdown below. Sub-Category Name is never
 * typed here: it's always the live join from SubCategoriesPage's own table (SubCategoryDto.name),
 * so there is exactly one authoritative place it can be edited. */
export default function CategoriesPage() {
  const { data, isLoading } = useListCategoriesQuery()
  const { data: subCategories } = useListSubCategoriesQuery()
  const [createCategory, { isLoading: creating }] = useCreateCategoryMutation()
  const [updateCategory, { isLoading: updating }] = useUpdateCategoryMutation()
  const [deleteCategory] = useDeleteCategoryMutation()
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
  } = useDataGrid<CategoryDto, SortKey>(data?.items, {
    defaultSortKey: 'code',
    comparators: {
      code: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
      name: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
      subCategoryCode: (a, b) => (a.subCategoryCode ?? '').localeCompare(b.subCategoryCode ?? ''),
    },
    matches: (c, term) =>
      !!c.code?.toLowerCase().includes(term) ||
      !!c.name?.toLowerCase().includes(term) ||
      !!c.subCategoryCode?.toLowerCase().includes(term) ||
      !!c.subCategoryName?.toLowerCase().includes(term),
  })

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(c: CategoryDto) {
    setEditingId(c.categoryId)
    setForm({ code: c.code, name: c.name, subCategoryId: c.subCategoryId })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Fast client-side feedback — the server validates the same rules again regardless (required
    // fields, unique code, and that subCategoryId actually names a real, active Sub-Category).
    if (!form.code.trim()) { void alertError('Validation failed', 'Category Code is required.'); return }
    if (!form.name.trim()) { void alertError('Validation failed', 'Category Name is required.'); return }
    if (!form.subCategoryId) { void alertError('Validation failed', 'Please select a Sub-Category.'); return }
    const body = { code: form.code, name: form.name, subCategoryId: Number(form.subCategoryId) }
    try {
      if (editingId) {
        await updateCategory({ id: editingId, body }).unwrap()
        void alertSuccess('Category updated successfully.')
      } else {
        await createCategory(body).unwrap()
        void alertSuccess('Category saved successfully.')
      }
      setForm(emptyForm)
      closeForm()
    } catch (err: any) {
      const message =
        err?.data?.errorCode === 'DUPLICATE_CODE' ? 'Category Code already exists.' : err?.data?.detail ?? 'The category could not be saved.'
      void alertError('Could not save', message)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Category Master</h1>
          <p className="text-sm text-slate-500 mt-1">Glass product categories, each mapped to a Sub-Category.</p>
        </div>
        <button onClick={showForm ? closeForm : openNew} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Category'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <h2 className="sm:col-span-3 text-sm font-semibold text-slate-700 -mb-2">{editingId ? 'Edit Category' : 'New Category'}</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category Code *</label>
            <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. GLS001" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Clear Glass" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sub-Category *</label>
            {/* Database-driven — options come from SubCategoriesController.List (the same list
                SubCategoriesPage itself uses), never a hard-coded array. Search matches both the
                code and the name since the label is "CODE - Name". */}
            <SearchableSelect
              value={form.subCategoryId}
              onChange={(id) => setForm((f) => ({ ...f, subCategoryId: id }))}
              options={subCategories?.items.map((sc) => ({ value: sc.subCategoryId, label: `${sc.code} - ${sc.name}` })) ?? []}
              placeholder="Search Sub-Category…"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Category'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search category or sub-category code/name…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('code')}>
                  Category Code <SortIcon column="code" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('name')}>
                  Category Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('subCategoryCode')}>
                  Sub-Category Code <SortIcon column="subCategoryCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Sub-Category Name</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <Tags size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No categories match your search.' : 'No categories yet.'}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.categoryId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{c.code}</td>
                  <td className="px-5 py-3 text-slate-700">{c.name}</td>
                  <td className="px-5 py-3 text-slate-500">{c.subCategoryCode ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{c.subCategoryName ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        title="Edit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <DeleteRowAction
                        canDelete={c.canDelete}
                        itemLabel={`category ${c.code} — ${c.name}`}
                        onDelete={() => deleteCategory(c.categoryId).unwrap()}
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
