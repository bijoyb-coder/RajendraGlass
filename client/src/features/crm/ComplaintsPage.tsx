import { Fragment, useState } from 'react'
import { Plus, X, HeartHandshake, CheckCircle2 } from 'lucide-react'
import { useListComplaintsQuery, useCreateComplaintMutation, useResolveComplaintMutation, useDeleteComplaintMutation } from './crmApi'
import { useListCustomersQuery } from '../masters/mastersApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  DeleteRowAction,
} from '../../components/DataGrid'
import type { ComplaintDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const statusStyles: Record<string, string> = {
  Open: 'bg-red-50 text-red-700 ring-red-200',
  InProgress: 'bg-amber-50 text-amber-700 ring-amber-200',
  Resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Closed: 'bg-slate-100 text-slate-600 ring-slate-200',
}

type SortKey = 'complaintNo' | 'customerName' | 'subject' | 'category' | 'status'

export default function ComplaintsPage() {
  const { data, isLoading } = useListComplaintsQuery()
  const { data: customers } = useListCustomersQuery()
  const [createComplaint, { isLoading: saving }] = useCreateComplaintMutation()
  const [resolveComplaint] = useResolveComplaintMutation()
  const [deleteComplaint] = useDeleteComplaintMutation()

  const [showForm, setShowForm] = useState(false)
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('Breakage')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [resolution, setResolution] = useState('')

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
  } = useDataGrid<ComplaintDto, SortKey>(data?.items, {
    defaultSortKey: 'complaintNo',
    comparators: {
      complaintNo: (a, b) => (a.complaintNo ?? '').localeCompare(b.complaintNo ?? ''),
      customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
      subject: (a, b) => a.subject.localeCompare(b.subject),
      category: (a, b) => a.category.localeCompare(b.category),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (c, term) =>
      !!c.complaintNo?.toLowerCase().includes(term) ||
      !!c.customerName?.toLowerCase().includes(term) ||
      c.subject.toLowerCase().includes(term) ||
      c.category.toLowerCase().includes(term) ||
      c.status.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerId || !subject) { setError('Customer and subject are required.'); return }
    try {
      await createComplaint({ customerId: Number(customerId), subject, category, description }).unwrap()
      setShowForm(false)
      setCustomerId(''); setSubject(''); setDescription('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the complaint.')
    }
  }

  async function handleResolve(id: number) {
    if (!resolution.trim()) return
    await resolveComplaint({ id, resolution }).unwrap()
    setResolvingId(null)
    setResolution('')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Complaints</h1>
          <p className="text-sm text-slate-500 mt-1">Breakage, quality and delivery issues raised by customers.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Complaint'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
            <select required value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select…</option>
              {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option>Breakage</option><option>Quality</option><option>Delay</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Subject *</label>
            <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Log Complaint'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search complaint no., customer, subject, category or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('complaintNo')}>
                  Complaint No. <SortIcon column="complaintNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('subject')}>
                  Subject <SortIcon column="subject" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('category')}>
                  Category <SortIcon column="category" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <HeartHandshake size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No complaints match your search.' : 'No complaints logged.'}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <Fragment key={c.complaintId}>
                <tr className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{c.complaintNo}</td>
                  <td className="px-5 py-3 text-slate-700">{c.customerName}</td>
                  <td className="px-5 py-3 text-slate-600">{c.subject}</td>
                  <td className="px-5 py-3 text-slate-500">{c.category}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[c.status] ?? statusStyles.Open}`}>{c.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {c.status === 'Open' && (
                        <button onClick={() => { setResolvingId(resolvingId === c.complaintId ? null : c.complaintId); setResolution('') }} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                          <CheckCircle2 size={14} /> Resolve
                        </button>
                      )}
                      <DeleteRowAction
                        canDelete={c.canDelete}
                        itemLabel={`Complaint ${c.complaintNo}`}
                        onDelete={() => deleteComplaint(c.complaintId).unwrap()}
                      />
                    </div>
                  </td>
                </tr>
                {resolvingId === c.complaintId && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[240px]">
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Resolution *</label>
                          <input value={resolution} onChange={(e) => setResolution(e.target.value)} className={inputClass} placeholder="What was done to resolve this?" />
                        </div>
                        <button onClick={() => handleResolve(c.complaintId)} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">Mark Resolved</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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
