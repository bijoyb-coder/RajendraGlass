import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, X, Layers, Printer, Pencil, ArrowLeftCircle } from 'lucide-react'
import { useCreateProductMutation, useListProductsQuery, useUpdateProductMutation, useDeleteProductMutation, useListCategoriesQuery } from './mastersApi'
import SearchableSelect from '../../components/SearchableSelect'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridPagination,
  DataGridButton,
  printReport,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from '../../components/DataGrid'
import { alertError } from '../../lib/alerts'
import type { ProductDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: Partial<ProductDto> = { code: '', description: '', brand: '', colour: '', hsnCode: '', gstRatePct: 18, stockUnit: 'Sqm', sellingUnit: 'Sqm' }

type SortKey = 'code' | 'description' | 'thicknessMm' | 'colour' | 'sellingRate'

export default function ProductsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Only set when we arrived here via Quotation Entry's "+ Add New Product…" -- a direct visit
  // from the main menu never carries this, so it never redirects back (see handleSubmit below).
  const returnState = location.state as { returnTo?: string; targetLineKey?: string; draft?: unknown } | null
  const returningToQuotation = returnState?.returnTo === 'quotation'

  const { data, isLoading } = useListProductsQuery()
  const { data: categories } = useListCategoriesQuery()
  const [createProduct, { isLoading: creating }] = useCreateProductMutation()
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation()
  const [deleteProduct] = useDeleteProductMutation()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<ProductDto>>(emptyForm)
  const saving = creating || updating

  // Jump straight to the New Product form -- the whole point of this trip.
  useEffect(() => {
    if (returningToQuotation) openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    rows,
    allRows,
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
  } = useDataGrid<ProductDto, SortKey>(data?.items, {
    defaultSortKey: 'code',
    comparators: {
      code: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
      description: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
      thicknessMm: (a, b) => (a.thicknessMm ?? 0) - (b.thicknessMm ?? 0),
      colour: (a, b) => (a.colour ?? '').localeCompare(b.colour ?? ''),
      sellingRate: (a, b) => (a.sellingRate ?? 0) - (b.sellingRate ?? 0),
    },
    matches: (p, term) =>
      !!p.code?.toLowerCase().includes(term) ||
      !!p.description?.toLowerCase().includes(term) ||
      !!p.categoryCode?.toLowerCase().includes(term) ||
      !!p.categoryName?.toLowerCase().includes(term) ||
      !!p.category?.toLowerCase().includes(term) ||
      !!p.brand?.toLowerCase().includes(term) ||
      !!p.colour?.toLowerCase().includes(term),
  })

  function set<K extends keyof ProductDto>(key: K, value: ProductDto[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** Every master field, not just the compact set shown on screen — matches the current
   * search/sort but ignores pagination, same as every other list's Print button. */
  function printProducts() {
    printReport({
      title: 'Products',
      subtitle: search ? `Filtered by "${search}"` : undefined,
      columns: [
        { label: 'Code' }, { label: 'Description' }, { label: 'Category' }, { label: 'Brand' },
        { label: 'Thickness (mm)', align: 'right' }, { label: 'Colour' }, { label: 'HSN Code' },
        { label: 'GST %', align: 'right' }, { label: 'Stock Unit' }, { label: 'Selling Unit' },
        { label: 'Purchase Rate', align: 'right' }, { label: 'Selling Rate', align: 'right' },
        { label: 'Min Selling Price', align: 'right' }, { label: 'Status' },
      ],
      rows: allRows.map((p) => [
        p.code, p.description, p.categoryName ?? p.category ?? '—', p.brand || '—',
        p.thicknessMm ?? '—', p.colour || '—', p.hsnCode || '—',
        p.gstRatePct, p.stockUnit, p.sellingUnit,
        p.purchaseRate ?? '—', p.sellingRate ?? '—',
        p.minSellingPrice ?? '—', p.isActive ? 'Active' : 'Inactive',
      ]),
    })
  }

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(p: ProductDto) {
    setEditingId(p.productId)
    setForm({
      // category (the legacy free-text field) has no input on this form any more, but is carried
      // through unedited so saving doesn't null it out — see db/52_product_category_link.sql.
      code: p.code, description: p.description, category: p.category ?? undefined, categoryId: p.categoryId ?? undefined, brand: p.brand ?? '',
      thicknessMm: p.thicknessMm ?? undefined, colour: p.colour ?? '', hsnCode: p.hsnCode ?? '',
      gstRatePct: p.gstRatePct, stockUnit: p.stockUnit, sellingUnit: p.sellingUnit,
      sellingRate: p.sellingRate ?? undefined, minSellingPrice: p.minSellingPrice ?? undefined,
      standardSheetLengthMm: p.standardSheetLengthMm ?? undefined, standardSheetWidthMm: p.standardSheetWidthMm ?? undefined,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editingId) {
        await updateProduct({ id: editingId, body: form }).unwrap()
        setForm(emptyForm)
        closeForm()
      } else {
        const result = await createProduct(form).unwrap()
        setForm(emptyForm)
        closeForm()
        // Only the "+ Add New Product…" trip from Quotation Entry carries this -- a product
        // created from the main menu just stays here, as it always has.
        if (returningToQuotation) {
          navigate('/sales/quotations', {
            state: { restoreDraft: returnState!.draft, targetLineKey: returnState!.targetLineKey, newProductId: result.productId },
          })
        }
      }
    } catch (err: any) {
      void alertError(err?.data?.title ?? 'Could not save', err?.data?.detail ?? 'The product could not be saved.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {returningToQuotation && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          <ArrowLeftCircle size={16} />
          Save this product to return to your quotation with it selected.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Products</h1>
          <p className="text-sm text-slate-500 mt-1">Glass SKUs — thickness, colour, brand, pricing.</p>
        </div>
        <button onClick={showForm ? closeForm : openNew} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <h2 className="sm:col-span-3 text-sm font-semibold text-slate-700 -mb-2">{editingId ? 'Edit Product' : 'New Product'}</h2>
          <Field label="Code *"><input required disabled={!!editingId} value={form.code} onChange={(e) => set('code', e.target.value)} className={`${inputClass} ${editingId ? 'bg-slate-100 text-slate-500' : ''}`} /></Field>
          <Field label="Description *" wide><input required value={form.description} onChange={(e) => set('description', e.target.value)} className={inputClass} /></Field>
          <Field label="Category">
            {/* Database-driven — options come from the Category Master (CategoriesController.List),
                never a hard-coded array. Optional: not every product has one yet. */}
            <SearchableSelect
              value={form.categoryId ?? ''}
              onChange={(id) => set('categoryId', id)}
              options={categories?.items.map((c) => ({ value: c.categoryId, label: `${c.code} - ${c.name}` })) ?? []}
              placeholder="Search Category…"
              className={inputClass}
            />
          </Field>
          <Field label="Brand"><input value={form.brand ?? ''} onChange={(e) => set('brand', e.target.value)} className={inputClass} /></Field>
          <Field label="Thickness (mm)"><input type="number" step="0.1" value={form.thicknessMm ?? ''} onChange={(e) => set('thicknessMm', Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Colour"><input value={form.colour ?? ''} onChange={(e) => set('colour', e.target.value)} className={inputClass} /></Field>
          <Field label="HSN Code"><input value={form.hsnCode ?? ''} onChange={(e) => set('hsnCode', e.target.value)} className={inputClass} /></Field>
          <Field label="GST %"><input type="number" step="0.01" value={form.gstRatePct ?? 18} onChange={(e) => set('gstRatePct', Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Selling Rate"><input type="number" step="0.01" value={form.sellingRate ?? ''} onChange={(e) => set('sellingRate', Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Min Selling Price"><input type="number" step="0.01" value={form.minSellingPrice ?? ''} onChange={(e) => set('minSellingPrice', Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Standard Sheet Length (mm)"><input type="number" step="0.01" value={form.standardSheetLengthMm ?? ''} onChange={(e) => set('standardSheetLengthMm', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} placeholder="Optional" /></Field>
          <Field label="Standard Sheet Width (mm)"><input type="number" step="0.01" value={form.standardSheetWidthMm ?? ''} onChange={(e) => set('standardSheetWidthMm', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} placeholder="Optional" /></Field>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Product'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search code, description, category, brand or colour…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          rightSlot={<DataGridButton onClick={printProducts} title="Print the full product list, every column"><Printer size={15} /> Print</DataGridButton>}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('code')}>
                  Code <SortIcon column="code" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('description')}>
                  Description <SortIcon column="description" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Category</Th>
                <SortableTh onClick={() => toggleSort('thicknessMm')}>
                  Thickness <SortIcon column="thicknessMm" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('colour')}>
                  Colour <SortIcon column="colour" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('sellingRate')} align="right">
                  Selling Rate <SortIcon column="sellingRate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Unit</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    <Layers size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No products match your search.' : 'No products yet.'}
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.productId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{p.code}</td>
                  <td className="px-5 py-3 text-slate-700">{p.description}</td>
                  <td className="px-5 py-3 text-slate-500">{p.categoryName ?? p.category ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{p.thicknessMm ? `${p.thicknessMm} mm` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{p.colour ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{p.sellingRate ? `₹${p.sellingRate.toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{p.sellingUnit}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        title="Edit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <DeleteRowAction
                        canDelete={p.canDelete}
                        itemLabel={`Product ${p.description}`}
                        onDelete={() => deleteProduct(p.productId).unwrap()}
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

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
