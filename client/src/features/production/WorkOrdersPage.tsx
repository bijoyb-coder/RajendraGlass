import { useState } from 'react'
import { Plus, X, Wrench } from 'lucide-react'
import { useListWorkOrdersQuery, useCreateWorkOrderMutation, useDeleteWorkOrderMutation } from './productionApi'
import { useListSalesOrdersQuery } from '../sales/salesExtraApi'
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
import type { WorkOrderDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const statusStyles: Record<string, string> = {
  Open: 'bg-blue-50 text-blue-700 ring-blue-200',
  InProgress: 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

type SortKey = 'workOrderNo' | 'orderNo' | 'createdOn' | 'jobCardCount' | 'status'

export default function WorkOrdersPage() {
  const { data, isLoading } = useListWorkOrdersQuery()
  const { data: orders } = useListSalesOrdersQuery()
  const [createWorkOrder, { isLoading: saving }] = useCreateWorkOrderMutation()
  const [deleteWorkOrder] = useDeleteWorkOrderMutation()

  const [showForm, setShowForm] = useState(false)
  const [salesOrderId, setSalesOrderId] = useState<number | ''>('')

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
  } = useDataGrid<WorkOrderDto, SortKey>(data?.items, {
    defaultSortKey: 'createdOn',
    defaultSortDir: 'desc',
    comparators: {
      workOrderNo: (a, b) => (a.workOrderNo ?? '').localeCompare(b.workOrderNo ?? ''),
      orderNo: (a, b) => (a.orderNo ?? '').localeCompare(b.orderNo ?? ''),
      createdOn: (a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime(),
      jobCardCount: (a, b) => a.jobCardCount - b.jobCardCount,
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (w, term) =>
      !!w.workOrderNo?.toLowerCase().includes(term) ||
      !!w.orderNo?.toLowerCase().includes(term) ||
      w.status.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await createWorkOrder({ salesOrderId: salesOrderId ? Number(salesOrderId) : undefined }).unwrap()
    setShowForm(false)
    setSalesOrderId('')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Work Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Production runs, optionally linked to a sales order.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Work Order'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-end gap-4 animate-fade-in">
          <div className="max-w-sm w-full">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sales Order (optional)</label>
            <select value={salesOrderId} onChange={(e) => setSalesOrderId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Not linked to an order</option>
              {orders?.items.map((o) => <option key={o.salesOrderId} value={o.salesOrderId}>{o.orderNo} — {o.customerName}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Creating…' : 'Create Work Order'}</button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search work order no., sales order or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('workOrderNo')}>
                  Work Order No. <SortIcon column="workOrderNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('orderNo')}>
                  Sales Order <SortIcon column="orderNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('createdOn')}>
                  Created <SortIcon column="createdOn" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('jobCardCount')} align="right">
                  Job Cards <SortIcon column="jobCardCount" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <Wrench size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No work orders match your search.' : 'No work orders yet.'}
                  </td>
                </tr>
              )}
              {rows.map((w) => (
                <tr key={w.workOrderId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{w.workOrderNo}</td>
                  <td className="px-5 py-3 text-slate-500">{w.orderNo ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(w.createdOn).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{w.jobCardCount}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[w.status] ?? statusStyles.Open}`}>{w.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={w.canDelete}
                      itemLabel={`Work Order ${w.workOrderNo}`}
                      onDelete={() => deleteWorkOrder(w.workOrderId).unwrap()}
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
