import { Radio, CheckCircle2, XCircle } from 'lucide-react'
import { useListGatewayLogsQuery } from './integrationApi'
import type { GatewayLogDto } from './integrationApi'
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

type SortKey = 'createdOn' | 'gatewayType' | 'operation' | 'provider' | 'durationMs' | 'status'

export default function IntegrationLogPage() {
  const { data, isLoading } = useListGatewayLogsQuery()

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
  } = useDataGrid<GatewayLogDto, SortKey>(data?.items, {
    defaultSortKey: 'createdOn',
    defaultSortDir: 'desc',
    comparators: {
      createdOn: (a, b) => new Date(a.createdOn).getTime() - new Date(b.createdOn).getTime(),
      gatewayType: (a, b) => a.gatewayType.localeCompare(b.gatewayType),
      operation: (a, b) => a.operation.localeCompare(b.operation),
      provider: (a, b) => a.provider.localeCompare(b.provider),
      durationMs: (a, b) => a.durationMs - b.durationMs,
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (l, term) =>
      l.gatewayType.toLowerCase().includes(term) ||
      l.operation.toLowerCase().includes(term) ||
      l.provider.toLowerCase().includes(term) ||
      l.docType.toLowerCase().includes(term) ||
      l.status.toLowerCase().includes(term),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900 flex items-center gap-2"><Radio size={22} /> Integration Log</h1>
          <p className="text-sm text-slate-500 mt-1">Every call to the government e-Invoice (IRP) and e-Way Bill gateways.</p>
        </div>
        {data && (
          <div className="flex gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">e-Invoice provider: <strong>{data.eInvoiceProvider}</strong></span>
            <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">e-Way Bill provider: <strong>{data.ewayBillProvider}</strong></span>
          </div>
        )}
      </div>

      {data?.eInvoiceProvider === 'Mock' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
          Running against the <strong>Mock</strong> gateway — no calls leave this server. Configure <code className="bg-white/60 px-1 rounded">GstIntegration:Provider=Real</code> with GSP credentials in <code className="bg-white/60 px-1 rounded">appsettings.json</code> to switch to production.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search gateway, operation, provider, document or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('createdOn')}>
                  Time <SortIcon column="createdOn" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('gatewayType')}>
                  Gateway <SortIcon column="gatewayType" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('operation')}>
                  Operation <SortIcon column="operation" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('provider')}>
                  Provider <SortIcon column="provider" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Document</Th>
                <SortableTh onClick={() => toggleSort('durationMs')} align="right">
                  Duration <SortIcon column="durationMs" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    <Radio size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No gateway calls match your search.' : 'No gateway calls yet.'}
                  </td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.gatewayLogId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 text-slate-500">{new Date(l.createdOn).toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 font-medium text-slate-700">{l.gatewayType}</td>
                  <td className="px-5 py-3 text-slate-500">{l.operation}</td>
                  <td className="px-5 py-3 text-slate-500">{l.provider}</td>
                  <td className="px-5 py-3 text-slate-500">{l.docType} #{l.docId}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{l.durationMs} ms</td>
                  <td className="px-5 py-3">
                    {l.status === 'Success' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 size={12} /> Success</span>
                    ) : (
                      <span title={l.errorMessage ?? ''} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200"><XCircle size={12} /> Failed</span>
                    )}
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
