import { useState } from 'react'
import { Plus, X, Receipt } from 'lucide-react'
import { useListExpensesQuery, useCreateExpenseMutation } from './financeApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { ExpenseDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

type SortKey = 'expenseNo' | 'category' | 'paidTo' | 'amount' | 'status'

export default function ExpensesPage() {
  const { data, isLoading } = useListExpensesQuery()
  const [createExpense, { isLoading: saving }] = useCreateExpenseMutation()
  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [paidTo, setPaidTo] = useState('')
  const [narration, setNarration] = useState('')
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
  } = useDataGrid<ExpenseDto, SortKey>(data?.items, {
    defaultSortKey: 'expenseNo',
    comparators: {
      expenseNo: (a, b) => (a.expenseNo ?? '').localeCompare(b.expenseNo ?? ''),
      category: (a, b) => a.category.localeCompare(b.category),
      paidTo: (a, b) => (a.paidTo ?? '').localeCompare(b.paidTo ?? ''),
      amount: (a, b) => a.amount - b.amount,
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (ex, term) =>
      !!ex.expenseNo?.toLowerCase().includes(term) ||
      ex.category.toLowerCase().includes(term) ||
      !!ex.paidTo?.toLowerCase().includes(term) ||
      ex.status.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!category || !amount) { setError('Category and amount are required.'); return }
    try {
      await createExpense({ category, amount: Number(amount), paidTo, narration }).unwrap()
      setShowForm(false)
      setCategory(''); setAmount(''); setPaidTo(''); setNarration('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the expense.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Expenses</h1>
          <p className="text-sm text-slate-500 mt-1">Operating expenses. Above ₹25,000 routes to approval.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Expense'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-4 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category *</label>
            <input required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} placeholder="Freight, Utilities…" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Amount *</label>
            <input type="number" min={0} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Paid To</label>
            <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Narration</label>
            <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-4 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Expense'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search expense no., category, paid to or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('expenseNo')}>
                  Expense No. <SortIcon column="expenseNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('category')}>
                  Category <SortIcon column="category" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('paidTo')}>
                  Paid To <SortIcon column="paidTo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('amount')} align="right">
                  Amount <SortIcon column="amount" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <Receipt size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No expenses match your search.' : 'No expenses yet.'}
                  </td>
                </tr>
              )}
              {rows.map((ex) => (
                <tr key={ex.expenseId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{ex.expenseNo}</td>
                  <td className="px-5 py-3 text-slate-700">{ex.category}</td>
                  <td className="px-5 py-3 text-slate-500">{ex.paidTo ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(ex.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${ex.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{ex.status}</span>
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
