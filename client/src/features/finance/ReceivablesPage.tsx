import { Wallet2 } from 'lucide-react'
import { useReceivablesQuery } from './financeApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { CustomerOutstandingDto } from '../../lib/types'

function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) }

type SortKey = 'customerName' | 'totalInvoiced' | 'totalReceived' | 'outstanding' | 'creditLimit'

export default function ReceivablesPage() {
  const { data, isLoading } = useReceivablesQuery()

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
  } = useDataGrid<CustomerOutstandingDto, SortKey>(data?.items, {
    defaultSortKey: 'outstanding',
    defaultSortDir: 'desc',
    comparators: {
      customerName: (a, b) => a.customerName.localeCompare(b.customerName),
      totalInvoiced: (a, b) => a.totalInvoiced - b.totalInvoiced,
      totalReceived: (a, b) => a.totalReceived - b.totalReceived,
      outstanding: (a, b) => a.outstanding - b.outstanding,
      creditLimit: (a, b) => a.creditLimit - b.creditLimit,
    },
    matches: (r, term) => r.customerName.toLowerCase().includes(term),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Receivables</h1>
        <p className="text-sm text-slate-500 mt-1">Customer-wise outstanding against credit limit.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search customer…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('totalInvoiced')} align="right">
                  Invoiced <SortIcon column="totalInvoiced" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('totalReceived')} align="right">
                  Received <SortIcon column="totalReceived" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('outstanding')} align="right">
                  Outstanding <SortIcon column="outstanding" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('creditLimit')} align="right">
                  Credit Limit <SortIcon column="creditLimit" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Utilisation</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <Wallet2 size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No customers match your search.' : 'No receivables data.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const pct = r.creditLimit > 0 ? Math.min(100, Math.round((r.outstanding / r.creditLimit) * 100)) : 0
                return (
                  <tr key={r.customerId} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3 font-medium text-slate-800">{r.customerName}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(r.totalInvoiced)}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(r.totalReceived)}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${r.outstanding > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(r.outstanding)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{money(r.creditLimit)}</td>
                    <td className="px-5 py-3 w-40">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(0, pct)}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
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
