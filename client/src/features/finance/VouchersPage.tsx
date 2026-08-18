import { useState } from 'react'
import { Plus, X, Wallet } from 'lucide-react'
import { useListVouchersQuery, useCreateVoucherMutation } from './financeApi'
import { useListCustomersQuery } from '../masters/mastersApi'
import { useListSuppliersQuery } from '../purchase/purchaseApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'
import type { VoucherDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

type SortKey = 'voucherNo' | 'voucherType' | 'party' | 'mode' | 'amount'

export default function VouchersPage() {
  const { data, isLoading } = useListVouchersQuery()
  const { data: customers } = useListCustomersQuery()
  const { data: suppliers } = useListSuppliersQuery()
  const [createVoucher, { isLoading: saving }] = useCreateVoucherMutation()

  const [showForm, setShowForm] = useState(false)
  const [voucherType, setVoucherType] = useState('Receipt')
  const [partyId, setPartyId] = useState<number | ''>('')
  const [amount, setAmount] = useState<number | ''>('')
  const [mode, setMode] = useState('Cash')
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
  } = useDataGrid<VoucherDto, SortKey>(data?.items, {
    defaultSortKey: 'voucherNo',
    comparators: {
      voucherNo: (a, b) => (a.voucherNo ?? '').localeCompare(b.voucherNo ?? ''),
      voucherType: (a, b) => a.voucherType.localeCompare(b.voucherType),
      party: (a, b) => (a.customerName ?? a.supplierName ?? '').localeCompare(b.customerName ?? b.supplierName ?? ''),
      mode: (a, b) => a.mode.localeCompare(b.mode),
      amount: (a, b) => a.amount - b.amount,
    },
    matches: (v, term) =>
      !!v.voucherNo?.toLowerCase().includes(term) ||
      !!v.customerName?.toLowerCase().includes(term) ||
      !!v.supplierName?.toLowerCase().includes(term) ||
      v.mode.toLowerCase().includes(term),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!partyId || !amount) { setError('Select a party and enter an amount.'); return }
    try {
      await createVoucher({
        voucherType,
        customerId: voucherType === 'Receipt' ? Number(partyId) : undefined,
        supplierId: voucherType === 'Payment' ? Number(partyId) : undefined,
        amount: Number(amount), mode, narration,
      }).unwrap()
      setShowForm(false)
      setPartyId(''); setAmount(''); setNarration('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the voucher.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Receipt / Payment Vouchers</h1>
          <p className="text-sm text-slate-500 mt-1">Money received from customers or paid to suppliers.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Voucher'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type *</label>
            <select value={voucherType} onChange={(e) => { setVoucherType(e.target.value); setPartyId('') }} className={inputClass}>
              <option value="Receipt">Receipt (from Customer)</option>
              <option value="Payment">Payment (to Supplier)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{voucherType === 'Receipt' ? 'Customer' : 'Supplier'} *</label>
            <select required value={partyId} onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select…</option>
              {(voucherType === 'Receipt' ? customers?.items : suppliers?.items)?.map((p: any) => (
                <option key={p.customerId ?? p.supplierId} value={p.customerId ?? p.supplierId}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Amount *</label>
            <input type="number" min={0} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
              <option>Cash</option><option>Bank</option><option>Cheque</option><option>UPI</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Narration</label>
            <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Voucher'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search voucher no., party or mode…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('voucherNo')}>
                  Voucher No. <SortIcon column="voucherNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('voucherType')}>
                  Type <SortIcon column="voucherType" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('party')}>
                  Party <SortIcon column="party" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('mode')}>
                  Mode <SortIcon column="mode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('amount')} align="right">
                  Amount <SortIcon column="amount" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <Wallet size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No vouchers match your search.' : 'No vouchers yet.'}
                  </td>
                </tr>
              )}
              {rows.map((v) => (
                <tr key={v.voucherId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{v.voucherNo}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${v.voucherType === 'Receipt' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-orange-50 text-orange-700 ring-orange-200'}`}>{v.voucherType}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{v.customerName ?? v.supplierName}</td>
                  <td className="px-5 py-3 text-slate-500">{v.mode}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(v.amount)}</td>
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
