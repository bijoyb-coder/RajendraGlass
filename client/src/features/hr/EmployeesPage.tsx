import { useState } from 'react'
import { Plus, X, UserRoundCog, UserRoundX } from 'lucide-react'
import { useListEmployeesQuery, useCreateEmployeeMutation, useDeactivateEmployeeMutation } from './hrApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { EmployeeDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

type SortKey = 'code' | 'fullName' | 'designation' | 'department'

export default function EmployeesPage() {
  const { data, isLoading } = useListEmployeesQuery()
  const [createEmployee, { isLoading: saving }] = useCreateEmployeeMutation()
  const [deactivateEmployee] = useDeactivateEmployeeMutation()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', fullName: '', designation: '', department: '', phone: '', email: '' })
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
  } = useDataGrid<EmployeeDto, SortKey>(data?.items, {
    defaultSortKey: 'fullName',
    comparators: {
      code: (a, b) => a.code.localeCompare(b.code),
      fullName: (a, b) => a.fullName.localeCompare(b.fullName),
      designation: (a, b) => (a.designation ?? '').localeCompare(b.designation ?? ''),
      department: (a, b) => (a.department ?? '').localeCompare(b.department ?? ''),
    },
    matches: (e, term) =>
      e.code.toLowerCase().includes(term) ||
      e.fullName.toLowerCase().includes(term) ||
      !!e.designation?.toLowerCase().includes(term) ||
      !!e.department?.toLowerCase().includes(term) ||
      !!e.phone?.toLowerCase().includes(term) ||
      !!e.email?.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.code || !form.fullName) { setError('Code and name are required.'); return }
    try {
      await createEmployee(form).unwrap()
      setShowForm(false)
      setForm({ code: '', fullName: '', designation: '', department: '', phone: '', email: '' })
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the employee.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Employees</h1>
          <p className="text-sm text-slate-500 mt-1">Deactivating an employee disables their login immediately.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Employee'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Code *</label><input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className={inputClass} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label><input required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Designation</label><input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Department</label><input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className={inputClass} /></div>
          <div><label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} /></div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Employee'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search code, name, designation, department or contact…"
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
                <SortableTh onClick={() => toggleSort('fullName')}>
                  Name <SortIcon column="fullName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('designation')}>
                  Designation <SortIcon column="designation" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('department')}>
                  Department <SortIcon column="department" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <UserRoundCog size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No employees match your search.' : 'No employees yet.'}
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr key={e.employeeId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{e.code}</td>
                  <td className="px-5 py-3 text-slate-800">{e.fullName}</td>
                  <td className="px-5 py-3 text-slate-500">{e.designation ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{e.department ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{e.phone ?? e.email ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => deactivateEmployee(e.employeeId)} className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600">
                      <UserRoundX size={14} /> Deactivate
                    </button>
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
