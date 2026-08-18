import { useState } from 'react'
import { Search, Boxes } from 'lucide-react'
import { useListGodownsQuery, useStockEnquiryQuery } from './inventoryApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { StockBalanceDto } from '../../lib/types'

type SortKey = 'productCode' | 'godownName' | 'qtyOnHand' | 'qtyReserved' | 'qtyFree'

export default function StockPage() {
  const [godownId, setGodownId] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const { data: godowns } = useListGodownsQuery()
  const { data, isLoading } = useStockEnquiryQuery({ godownId: godownId || undefined, search: search || undefined })

  const {
    rows,
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
  } = useDataGrid<StockBalanceDto, SortKey>(data?.items, {
    defaultSortKey: 'productCode',
    comparators: {
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      qtyOnHand: (a, b) => a.qtyOnHand - b.qtyOnHand,
      qtyReserved: (a, b) => a.qtyReserved - b.qtyReserved,
      qtyFree: (a, b) => a.qtyFree - b.qtyFree,
    },
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Stock Enquiry</h1>
        <p className="text-sm text-slate-500 mt-1">Live stock position by godown. Free stock excludes reserved, blocked and damaged quantity.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-slate-300 pl-2 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            entries per page
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative max-w-xs flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product…" className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-300" />
            </div>
            <select value={godownId} onChange={(e) => setGodownId(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              <option value="">All godowns</option>
              {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('productCode')}>
                  Product <SortIcon column="productCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Spec</Th>
                <SortableTh onClick={() => toggleSort('godownName')}>
                  Godown <SortIcon column="godownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('qtyOnHand')} align="right">
                  On Hand <SortIcon column="qtyOnHand" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('qtyReserved')} align="right">
                  Reserved <SortIcon column="qtyReserved" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('qtyFree')} align="right">
                  Free <SortIcon column="qtyFree" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Unit</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <Boxes size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No stock records match your search.' : 'No stock records.'}
                  </td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.stockBalanceId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{s.productCode}</div>
                    <div className="text-xs text-slate-400">{s.productDescription}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.thicknessAndColour}</td>
                  <td className="px-5 py-3 text-slate-500">{s.godownName}</td>
                  <td className="px-5 py-3 text-right text-slate-700">{s.qtyOnHand.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{s.qtyReserved.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right font-semibold text-emerald-700">{s.qtyFree.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-500">{s.unit}</td>
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
