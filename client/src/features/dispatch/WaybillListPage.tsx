import { Link } from 'react-router-dom'
import { Plus, Truck, Eye } from 'lucide-react'
import { useListWaybillsQuery, useDeleteWaybillMutation } from './dispatchApi'
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
import type { WaybillDto } from '../../lib/types'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

const statusStyles: Record<string, string> = {
  Generated: 'bg-blue-50 text-blue-700 ring-blue-200',
  InTransit: 'bg-amber-50 text-amber-700 ring-amber-200',
  Delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

type SortKey = 'waybillNo' | 'invoiceNo' | 'customerName' | 'generatedDate' | 'invoiceTotal' | 'status'

export default function WaybillListPage() {
  const { data, isLoading } = useListWaybillsQuery()
  const [deleteWaybill] = useDeleteWaybillMutation()

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
  } = useDataGrid<WaybillDto, SortKey>(
    data?.items,
    {
      defaultSortKey: 'generatedDate',
      defaultSortDir: 'desc',
      comparators: {
        waybillNo: (a, b) => (a.waybillNo ?? '').localeCompare(b.waybillNo ?? ''),
        invoiceNo: (a, b) => (a.invoiceNo ?? '').localeCompare(b.invoiceNo ?? ''),
        customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
        generatedDate: (a, b) => new Date(a.generatedDate).getTime() - new Date(b.generatedDate).getTime(),
        invoiceTotal: (a, b) => (a.invoiceTotal ?? 0) - (b.invoiceTotal ?? 0),
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (w, term) =>
        !!w.waybillNo?.toLowerCase().includes(term) ||
        !!w.invoiceNo?.toLowerCase().includes(term) ||
        !!w.customerName?.toLowerCase().includes(term) ||
        !!w.vehicleNo?.toLowerCase().includes(term) ||
        w.status.toLowerCase().includes(term),
    },
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Waybills / e-Way Bills</h1>
          <p className="text-sm text-slate-500 mt-1">Transport documents generated against approved sales invoices.</p>
        </div>
        <Link to="/dispatch/waybills/new" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          <Plus size={16} /> New Waybill
        </Link>
      </div>

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search waybill no., invoice, customer, vehicle or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('waybillNo')}>
                  Waybill No. <SortIcon column="waybillNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('invoiceNo')}>
                  Invoice <SortIcon column="invoiceNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('generatedDate')}>
                  Date <SortIcon column="generatedDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Vehicle</Th>
                <SortableTh onClick={() => toggleSort('invoiceTotal')} align="right">
                  Invoice Value <SortIcon column="invoiceTotal" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    <Truck size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? (
                      'No waybills match your search.'
                    ) : (
                      <>No waybills yet. <Link to="/dispatch/waybills/new" className="text-brand-600 font-medium">Generate one</Link>.</>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((w) => (
                <tr key={w.waybillId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{w.waybillNo}</td>
                  <td className="px-5 py-3 text-slate-600">{w.invoiceNo}</td>
                  <td className="px-5 py-3 text-slate-700">{w.customerName}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(w.generatedDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-500">{w.vehicleNo ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(w.invoiceTotal ?? 0)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[w.status] ?? statusStyles.Generated}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/dispatch/waybills/${w.waybillId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Eye size={14} /> View
                      </Link>
                      <DeleteRowAction
                        canDelete={w.canDelete}
                        itemLabel={`Waybill ${w.waybillNo}`}
                        onDelete={() => deleteWaybill(w.waybillId).unwrap()}
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
