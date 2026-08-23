import { useState } from 'react'
import { Plus, X, Factory } from 'lucide-react'
import { useListSuppliersQuery, useCreateSupplierMutation, useDeleteSupplierMutation } from './purchaseApi'
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
import type { SupplierDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: Partial<SupplierDto> = { code: '', name: '', gstin: '', phone: '', email: '', address: '', stateName: 'West Bengal', creditPeriodDays: 30 }

type SortKey = 'code' | 'name' | 'gstin' | 'creditPeriodDays'

export default function SuppliersPage() {
  const { data, isLoading } = useListSuppliersQuery()
  const [createSupplier, { isLoading: saving }] = useCreateSupplierMutation()
  const [deleteSupplier] = useDeleteSupplierMutation()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<SupplierDto>>(emptyForm)
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
  } = useDataGrid<SupplierDto, SortKey>(data?.items, {
    defaultSortKey: 'name',
    comparators: {
      code: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
      name: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
      gstin: (a, b) => (a.gstin ?? '').localeCompare(b.gstin ?? ''),
      creditPeriodDays: (a, b) => (a.creditPeriodDays ?? 0) - (b.creditPeriodDays ?? 0),
    },
    matches: (s, term) =>
      !!s.code?.toLowerCase().includes(term) ||
      !!s.name?.toLowerCase().includes(term) ||
      !!s.gstin?.toLowerCase().includes(term) ||
      !!s.phone?.toLowerCase().includes(term) ||
      !!s.mobile?.toLowerCase().includes(term),
  })

  function set<K extends keyof SupplierDto>(key: K, value: SupplierDto[K]) { setForm((f) => ({ ...f, [key]: value })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createSupplier(form).unwrap()
      setForm(emptyForm)
      setShowForm(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the supplier.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Suppliers</h1>
          <p className="text-sm text-slate-500 mt-1">Vendors of glass, hardware and consumables.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Supplier'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Code *</label><input required value={form.code} onChange={(e) => set('code', e.target.value)} className={inputClass} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label><input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">GSTIN</label><input value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} maxLength={15} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label><input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Email</label><input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputClass} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-1">Address</label><input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Credit Period (days)</label><input type="number" value={form.creditPeriodDays ?? 0} onChange={(e) => set('creditPeriodDays', Number(e.target.value))} className={inputClass} /></div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Supplier'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search code, name, GSTIN or contact…"
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
                <SortableTh onClick={() => toggleSort('gstin')}>
                  GSTIN <SortIcon column="gstin" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Contact</Th>
                <SortableTh onClick={() => toggleSort('creditPeriodDays')}>
                  Credit Period <SortIcon column="creditPeriodDays" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <Factory size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No suppliers match your search.' : 'No suppliers yet.'}
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.supplierId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{s.code}</td>
                  <td className="px-5 py-3 text-slate-700">{s.name}</td>
                  <td className="px-5 py-3 text-slate-500">{s.gstin ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{s.phone ?? s.mobile ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{s.creditPeriodDays} days</td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={s.canDelete}
                      itemLabel={`Supplier ${s.name}`}
                      onDelete={() => deleteSupplier(s.supplierId).unwrap()}
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
