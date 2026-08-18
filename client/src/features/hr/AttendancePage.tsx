import { useState } from 'react'
import { CalendarCheck2 } from 'lucide-react'
import { useListAttendanceQuery, useMarkAttendanceMutation, useDeleteAttendanceMutation, useListEmployeesQuery } from './hrApi'
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
import type { AttendanceDto } from '../../lib/types'

const inputClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const statusStyles: Record<string, string> = {
  Present: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Absent: 'bg-red-50 text-red-700 ring-red-200',
  HalfDay: 'bg-amber-50 text-amber-700 ring-amber-200',
  Leave: 'bg-slate-100 text-slate-600 ring-slate-200',
}

type SortKey = 'employeeName' | 'status'

export default function AttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { data, isLoading } = useListAttendanceQuery({ date })
  const { data: employees } = useListEmployeesQuery()
  const [markAttendance] = useMarkAttendanceMutation()
  const [deleteAttendance] = useDeleteAttendanceMutation()
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
  } = useDataGrid<AttendanceDto, SortKey>(data?.items, {
    defaultSortKey: 'employeeName',
    comparators: {
      employeeName: (a, b) => (a.employeeName ?? '').localeCompare(b.employeeName ?? ''),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (a, term) =>
      !!a.employeeName?.toLowerCase().includes(term) ||
      a.status.toLowerCase().includes(term),
  })

  const markedIds = new Set((data?.items ?? []).map((a) => a.employeeId))
  const unmarked = employees?.items.filter((e) => !markedIds.has(e.employeeId)) ?? []

  async function mark(employeeId: number, status: string) {
    setError(null)
    try {
      await markAttendance({ employeeId, attendanceDate: date, status }).unwrap()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not mark attendance.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">Daily attendance by employee. One entry per employee per day.</p>
        </div>
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      {unmarked.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3 text-sm">Mark attendance for {date}</h2>
          <div className="space-y-2">
            {unmarked.map((e) => (
              <div key={e.employeeId} className="flex items-center justify-between border border-slate-100 rounded-lg px-4 py-2.5">
                <span className="text-sm font-medium text-slate-700">{e.fullName}</span>
                <div className="flex gap-2">
                  {['Present', 'Absent', 'HalfDay', 'Leave'].map((s) => (
                    <button key={s} onClick={() => mark(e.employeeId, s)} className="text-xs font-medium px-3 py-1.5 rounded-full ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">{s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search employee or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('employeeName')}>
                  Employee <SortIcon column="employeeName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-14 text-center text-slate-400">
                    <CalendarCheck2 size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No attendance records match your search.' : 'No attendance marked for this date yet.'}
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={a.attendanceId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 text-slate-800">{a.employeeName}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[a.status] ?? statusStyles.Present}`}>{a.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={a.canDelete}
                      itemLabel={`${a.employeeName ?? 'this'} attendance for ${a.attendanceDate.slice(0, 10)}`}
                      onDelete={() => deleteAttendance(a.attendanceId).unwrap()}
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
