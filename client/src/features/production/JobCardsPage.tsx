import { Fragment, useState } from 'react'
import { Plus, X, CheckCircle2, LayoutList } from 'lucide-react'
import { useListJobCardsQuery, useCreateJobCardMutation, useFinishJobCardMutation, useDeleteJobCardMutation, useListWorkOrdersQuery } from './productionApi'
import { useListProductsQuery } from '../masters/mastersApi'
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
import type { JobCardDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

type SortKey = 'jobCardNo' | 'workOrderNo' | 'productCode' | 'qtyIn' | 'status'

export default function JobCardsPage() {
  const { data, isLoading } = useListJobCardsQuery()
  const { data: workOrders } = useListWorkOrdersQuery()
  const { data: products } = useListProductsQuery()
  const [createJobCard, { isLoading: saving }] = useCreateJobCardMutation()
  const [finishJobCard] = useFinishJobCardMutation()
  const [deleteJobCard] = useDeleteJobCardMutation()

  const [showForm, setShowForm] = useState(false)
  const [workOrderId, setWorkOrderId] = useState<number | ''>('')
  const [productId, setProductId] = useState<number | ''>('')
  const [qtyIn, setQtyIn] = useState<number | ''>('')
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
  } = useDataGrid<JobCardDto, SortKey>(data?.items, {
    defaultSortKey: 'jobCardNo',
    comparators: {
      jobCardNo: (a, b) => (a.jobCardNo ?? '').localeCompare(b.jobCardNo ?? ''),
      workOrderNo: (a, b) => (a.workOrderNo ?? '').localeCompare(b.workOrderNo ?? ''),
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      qtyIn: (a, b) => a.qtyIn - b.qtyIn,
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (jc, term) =>
      !!jc.jobCardNo?.toLowerCase().includes(term) ||
      !!jc.workOrderNo?.toLowerCase().includes(term) ||
      !!jc.productCode?.toLowerCase().includes(term) ||
      jc.status.toLowerCase().includes(term),
  })

  const [finishingId, setFinishingId] = useState<number | null>(null)
  const [finishForm, setFinishForm] = useState({ qtyPassed: 0, qtyBroken: 0, qtyRejected: 0 })
  const [finishError, setFinishError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!workOrderId || !productId || !qtyIn) { setError('Fill in all fields.'); return }
    try {
      await createJobCard({ workOrderId: Number(workOrderId), productId: Number(productId), qtyIn: Number(qtyIn) }).unwrap()
      setShowForm(false)
      setWorkOrderId(''); setProductId(''); setQtyIn('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not create the job card.')
    }
  }

  async function handleFinish(id: number) {
    setFinishError(null)
    try {
      await finishJobCard({ id, ...finishForm }).unwrap()
      setFinishingId(null)
      setFinishForm({ qtyPassed: 0, qtyBroken: 0, qtyRejected: 0 })
    } catch (err: any) {
      setFinishError(err?.data?.detail ?? 'Quantities must add up to the quantity in.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Job Cards</h1>
          <p className="text-sm text-slate-500 mt-1">Track pieces through a production route: passed, broken, rejected.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Job Card'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Work Order *</label>
            <select required value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select…</option>
              {workOrders?.items.map((w) => <option key={w.workOrderId} value={w.workOrderId}>{w.workOrderNo}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Product *</label>
            <select required value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select…</option>
              {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity In *</label>
            <input type="number" min={0} required value={qtyIn} onChange={(e) => setQtyIn(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Creating…' : 'Create Job Card'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search job card no., work order, product or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('jobCardNo')}>
                  Job Card No. <SortIcon column="jobCardNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('workOrderNo')}>
                  Work Order <SortIcon column="workOrderNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('productCode')}>
                  Product <SortIcon column="productCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('qtyIn')} align="right">
                  Qty In <SortIcon column="qtyIn" sortKey={sortKey} sortDir={sortDir} />
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
                    <LayoutList size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No job cards match your search.' : 'No job cards yet.'}
                  </td>
                </tr>
              )}
              {rows.map((jc) => (
                <Fragment key={jc.jobCardId}>
                <tr className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{jc.jobCardNo}</td>
                  <td className="px-5 py-3 text-slate-500">{jc.workOrderNo}</td>
                  <td className="px-5 py-3 text-slate-700">{jc.productCode}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{jc.qtyIn}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${jc.status === 'Done' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{jc.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {jc.status === 'Pending' && (
                        <button
                          onClick={() => { setFinishingId(finishingId === jc.jobCardId ? null : jc.jobCardId); setFinishForm({ qtyPassed: jc.qtyIn, qtyBroken: 0, qtyRejected: 0 }); setFinishError(null) }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          <CheckCircle2 size={14} /> Finish
                        </button>
                      )}
                      <DeleteRowAction
                        canDelete={jc.canDelete}
                        itemLabel={`Job Card ${jc.jobCardNo}`}
                        onDelete={() => deleteJobCard(jc.jobCardId).unwrap()}
                      />
                    </div>
                  </td>
                </tr>
                {finishingId === jc.jobCardId && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Passed</label>
                          <input type="number" min={0} value={finishForm.qtyPassed} onChange={(e) => setFinishForm((f) => ({ ...f, qtyPassed: Number(e.target.value) }))} className={`${inputClass} w-28`} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Broken</label>
                          <input type="number" min={0} value={finishForm.qtyBroken} onChange={(e) => setFinishForm((f) => ({ ...f, qtyBroken: Number(e.target.value) }))} className={`${inputClass} w-28`} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Rejected</label>
                          <input type="number" min={0} value={finishForm.qtyRejected} onChange={(e) => setFinishForm((f) => ({ ...f, qtyRejected: Number(e.target.value) }))} className={`${inputClass} w-28`} />
                        </div>
                        <button onClick={() => handleFinish(jc.jobCardId)} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">Confirm</button>
                        {finishError && <span className="text-sm text-red-600">{finishError}</span>}
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
