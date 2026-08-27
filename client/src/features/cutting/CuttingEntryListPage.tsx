import { Link } from 'react-router-dom'
import { Plus, Ruler, Eye } from 'lucide-react'
import { useListCuttingEntriesQuery } from './cuttingEntryApi'
import { useDataGrid, SortIcon, SortableTh, Th, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh } from '../../components/DataGrid'
import type { CuttingEntryDto } from '../../lib/types'

function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

type SortKey = 'cuttingNo' | 'quotationNo' | 'cuttingDate' | 'totalBillAmount' | 'status'

export default function CuttingEntryListPage() {
  const { data, isLoading } = useListCuttingEntriesQuery()

  const {
    rows, search, setSearch, sortKey, sortDir, toggleSort,
    page, setPage, pageSize, setPageSize, pageCount, totalCount, startIndex, endIndex,
  } = useDataGrid<CuttingEntryDto, SortKey>(
    data?.items,
    {
      defaultSortKey: 'cuttingDate',
      defaultSortDir: 'desc',
      comparators: {
        cuttingNo: (a, b) => a.cuttingNo.localeCompare(b.cuttingNo),
        quotationNo: (a, b) => (a.quotationNo ?? '').localeCompare(b.quotationNo ?? ''),
        cuttingDate: (a, b) => new Date(a.cuttingDate).getTime() - new Date(b.cuttingDate).getTime(),
        totalBillAmount: (a, b) => a.totalBillAmount - b.totalBillAmount,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (c, term) =>
        c.cuttingNo.toLowerCase().includes(term) ||
        !!c.quotationNo?.toLowerCase().includes(term) ||
        !!c.customerName?.toLowerCase().includes(term) ||
        c.status.toLowerCase().includes(term),
    },
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Cutting</h1>
          <p className="text-sm text-slate-500 mt-1">Glass pieces cut and billed against a quotation — stock is deducted on save.</p>
        </div>
        <Link to="/sales/cutting/new" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          <Plus size={16} /> New Cutting Entry
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search cutting no., quotation no., customer or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('cuttingNo')}>
                  Cutting No. <SortIcon column="cuttingNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('quotationNo')}>
                  Quotation <SortIcon column="quotationNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Customer</Th>
                <SortableTh onClick={() => toggleSort('cuttingDate')}>
                  Date <SortIcon column="cuttingDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th align="right">Total SQFT</Th>
                <SortableTh onClick={() => toggleSort('totalBillAmount')} align="right">
                  Bill Amount <SortIcon column="totalBillAmount" sortKey={sortKey} sortDir={sortDir} />
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
                    <Ruler size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No cutting entries match your search.' : (
                      <>No cutting entries yet. <Link to="/sales/cutting/new" className="text-brand-600 font-medium">Create one</Link>.</>
                    )}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.cuttingEntryId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{c.cuttingNo}</td>
                  <td className="px-5 py-3 text-slate-700">{c.quotationNo ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{c.customerName ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(c.cuttingDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{c.totalSqft.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(c.totalBillAmount)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${c.status === 'Cancelled' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link to={`/sales/cutting/${c.cuttingEntryId}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700">
                      <Eye size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataGridPagination page={page} pageCount={pageCount} totalCount={totalCount} startIndex={startIndex} endIndex={endIndex} onPageChange={setPage} />
      </div>
    </div>
  )
}
