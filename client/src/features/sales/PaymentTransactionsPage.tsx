import { useMemo, useState } from 'react'
import { Plus, X, Wallet2, Pencil, Layers } from 'lucide-react'
import { useListVouchersQuery, useCreateVoucherSplitMutation, useUpdateVoucherMutation, useDeleteVoucherMutation } from '../finance/financeApi'
import { useListCustomersQuery } from '../masters/mastersApi'
import { useListInvoicesQuery } from './salesApi'
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
import PaymentSplitEditor, { emptySplitRow, validateSplits, type PaymentSplitRow } from '../../components/PaymentSplitEditor'
import type { VoucherDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

const modeStyles: Record<string, string> = {
  Cash: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Cheque: 'bg-amber-50 text-amber-700 ring-amber-200',
  UPI: 'bg-blue-50 text-blue-700 ring-blue-200',
}

const emptyHeader = {
  customerId: '' as number | '',
  invoiceId: '' as number | '',
  paymentType: 'Advance',
  totalAmount: '' as number | '',
  paymentDate: new Date().toISOString().slice(0, 10),
  narration: '',
}

// Single-voucher edit form — editing one row of a split payment edits just that row, same as
// editing an ordinary voucher; there is no "re-split" flow.
const emptyEditForm = {
  customerId: '' as number | '',
  invoiceId: '' as number | '',
  paymentType: 'Advance',
  amount: '' as number | '',
  mode: 'Cash',
  referenceNo: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  narration: '',
}

type SortKey = 'voucherNo' | 'voucherDate' | 'customerName' | 'invoiceNo' | 'amount' | 'mode'

/**
 * Customer payment entries — advance or against a specific invoice, in Cash/Cheque/UPI, and
 * payable across more than one method in the same transaction (e.g. Cash 20 + UPI 50 + Cheque 30
 * for a ₹100 receipt — see PaymentSplitEditor). Backed by Finance.Voucher (Receipt type) so the
 * Finance Receivables total never disagrees with what this screen shows; each split becomes its
 * own voucher row, tied together by SplitGroupId only for display. Unlike Quotations, Sales
 * Orders and Invoices, a payment entry can always be edited — this screen exists precisely so a
 * wrong entry can be fixed rather than reversed.
 */
export default function PaymentTransactionsPage() {
  const { data, isLoading } = useListVouchersQuery({ voucherType: 'Receipt' })
  const { data: customers } = useListCustomersQuery()
  const { data: invoices } = useListInvoicesQuery()
  const [createVoucherSplit, { isLoading: saving }] = useCreateVoucherSplitMutation()
  const [updateVoucher, { isLoading: updating }] = useUpdateVoucherMutation()
  const [deleteVoucher] = useDeleteVoucherMutation()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [header, setHeader] = useState(emptyHeader)
  const [splits, setSplits] = useState<PaymentSplitRow[]>([emptySplitRow('Cash', '')])
  const [editForm, setEditForm] = useState(emptyEditForm)
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
    defaultSortKey: 'voucherDate',
    defaultSortDir: 'desc',
    comparators: {
      voucherNo: (a, b) => (a.voucherNo ?? '').localeCompare(b.voucherNo ?? ''),
      voucherDate: (a, b) => new Date(a.voucherDate).getTime() - new Date(b.voucherDate).getTime(),
      customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
      invoiceNo: (a, b) => (a.invoiceNo ?? '').localeCompare(b.invoiceNo ?? ''),
      amount: (a, b) => a.amount - b.amount,
      mode: (a, b) => a.mode.localeCompare(b.mode),
    },
    matches: (v, term) =>
      !!v.voucherNo?.toLowerCase().includes(term) ||
      !!v.customerName?.toLowerCase().includes(term) ||
      !!v.invoiceNo?.toLowerCase().includes(term) ||
      !!v.referenceNo?.toLowerCase().includes(term) ||
      v.mode.toLowerCase().includes(term),
  })

  // Only this customer's invoices belong in the dropdown — an advance payment (no invoice) is
  // always allowed regardless of customer selection.
  const customerInvoices = useMemo(
    () => invoices?.items.filter((inv) => inv.customerId === header.customerId && inv.status !== 'Cancelled') ?? [],
    [invoices, header.customerId],
  )
  const editCustomerInvoices = useMemo(
    () => invoices?.items.filter((inv) => inv.customerId === editForm.customerId && inv.status !== 'Cancelled') ?? [],
    [invoices, editForm.customerId],
  )

  function resetForm() {
    setEditingId(null)
    setHeader(emptyHeader)
    setSplits([emptySplitRow('Cash', '')])
    setEditForm(emptyEditForm)
    setError(null)
  }

  function openNewForm() {
    resetForm()
    setShowForm(true)
  }

  function toggleForm() {
    if (showForm) {
      setShowForm(false)
      resetForm()
    } else {
      openNewForm()
    }
  }

  function openEditForm(v: VoucherDto) {
    setError(null)
    setEditingId(v.voucherId)
    setEditForm({
      customerId: v.customerId ?? '',
      invoiceId: v.invoiceId ?? '',
      paymentType: v.paymentType ?? 'Advance',
      amount: v.amount,
      mode: v.mode,
      referenceNo: v.referenceNo ?? '',
      paymentDate: v.voucherDate.slice(0, 10),
      narration: v.narration ?? '',
    })
    setShowForm(true)
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!header.customerId) { setError('Select a customer.'); return }
    const total = typeof header.totalAmount === 'number' ? header.totalAmount : 0
    if (total <= 0) { setError('Enter a total amount greater than zero.'); return }
    const splitError = validateSplits(splits, total)
    if (splitError) { setError(splitError); return }

    try {
      await createVoucherSplit({
        voucherType: 'Receipt',
        customerId: Number(header.customerId),
        invoiceId: header.invoiceId ? Number(header.invoiceId) : undefined,
        paymentType: header.paymentType,
        voucherDate: header.paymentDate,
        narration: header.narration || undefined,
        splits: splits.map((s) => ({ mode: s.method, amount: Number(s.amount), referenceNo: s.method === 'Cash' ? undefined : (s.referenceNo || undefined) })),
      }).unwrap()
      setShowForm(false)
      resetForm()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the payment.')
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!editForm.customerId) { setError('Select a customer.'); return }
    if (!editForm.amount || editForm.amount <= 0) { setError('Enter an amount greater than zero.'); return }
    if ((editForm.mode === 'Cheque' || editForm.mode === 'UPI') && !editForm.referenceNo.trim()) {
      setError(`Enter the ${editForm.mode === 'Cheque' ? 'cheque number' : 'UPI transaction reference'}.`)
      return
    }

    const payload = {
      customerId: Number(editForm.customerId),
      invoiceId: editForm.invoiceId ? Number(editForm.invoiceId) : undefined,
      paymentType: editForm.paymentType,
      referenceNo: editForm.referenceNo || undefined,
      voucherDate: editForm.paymentDate,
      amount: Number(editForm.amount),
      mode: editForm.mode,
      narration: editForm.narration || undefined,
    }

    try {
      await updateVoucher({ id: editingId!, body: payload }).unwrap()
      setShowForm(false)
      resetForm()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the changes.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Payment Transactions</h1>
          <p className="text-sm text-slate-500 mt-1">Customer payments — advance or against an invoice, split across Cash, Cheque and UPI as needed. Wrong entries can be edited.</p>
        </div>
        <button
          onClick={toggleForm}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Payment'}
        </button>
      </div>

      {showForm && editingId === null && (
        <form onSubmit={handleNewSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <h2 className="text-sm font-semibold text-brand-800">New Payment</h2>
          <div className="grid sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
              <select
                required
                value={header.customerId}
                onChange={(e) => setHeader((f) => ({ ...f, customerId: e.target.value ? Number(e.target.value) : '', invoiceId: '' }))}
                className={inputClass}
              >
                <option value="">Select customer…</option>
                {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Against Invoice (optional)</label>
              <select
                value={header.invoiceId}
                onChange={(e) => setHeader((f) => ({ ...f, invoiceId: e.target.value ? Number(e.target.value) : '' }))}
                disabled={!header.customerId}
                className={inputClass}
              >
                <option value="">Advance — not tied to an invoice</option>
                {customerInvoices.map((inv) => (
                  <option key={inv.invoiceId} value={inv.invoiceId}>{inv.invoiceNo} — {money(inv.totalValue)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Type</label>
              <select value={header.paymentType} onChange={(e) => setHeader((f) => ({ ...f, paymentType: e.target.value }))} className={inputClass}>
                <option value="Advance">Advance</option>
                <option value="Full">Full</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Total Amount *</label>
              <input type="number" min={0} step="0.01" required value={header.totalAmount} onChange={(e) => setHeader((f) => ({ ...f, totalAmount: e.target.value ? Number(e.target.value) : '' }))} className={`${inputClass} font-semibold`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date *</label>
              <input type="date" required max={new Date().toISOString().slice(0, 10)} value={header.paymentDate} onChange={(e) => setHeader((f) => ({ ...f, paymentDate: e.target.value }))} className={inputClass} />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Narration</label>
              <input value={header.narration} onChange={(e) => setHeader((f) => ({ ...f, narration: e.target.value }))} className={inputClass} placeholder="Optional note" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <PaymentSplitEditor rows={splits} target={typeof header.totalAmount === 'number' ? header.totalAmount : 0} onChange={setSplits} />
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Payment'}
            </button>
          </div>
        </form>
      )}

      {showForm && editingId !== null && (
        <form onSubmit={handleEditSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <h2 className="text-sm font-semibold text-brand-800">Edit Payment</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
              <select
                required
                value={editForm.customerId}
                onChange={(e) => setEditForm((f) => ({ ...f, customerId: e.target.value ? Number(e.target.value) : '', invoiceId: '' }))}
                className={inputClass}
              >
                <option value="">Select customer…</option>
                {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Against Invoice (optional)</label>
              <select
                value={editForm.invoiceId}
                onChange={(e) => setEditForm((f) => ({ ...f, invoiceId: e.target.value ? Number(e.target.value) : '' }))}
                disabled={!editForm.customerId}
                className={inputClass}
              >
                <option value="">Advance — not tied to an invoice</option>
                {editCustomerInvoices.map((inv) => (
                  <option key={inv.invoiceId} value={inv.invoiceId}>{inv.invoiceNo} — {money(inv.totalValue)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Type</label>
              <select value={editForm.paymentType} onChange={(e) => setEditForm((f) => ({ ...f, paymentType: e.target.value }))} className={inputClass}>
                <option value="Advance">Advance</option>
                <option value="Full">Full</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Amount *</label>
              <input type="number" min={0} step="0.01" required value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value ? Number(e.target.value) : '' }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mode *</label>
              <select value={editForm.mode} onChange={(e) => setEditForm((f) => ({ ...f, mode: e.target.value }))} className={inputClass}>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
            {(editForm.mode === 'Cheque' || editForm.mode === 'UPI') && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editForm.mode === 'Cheque' ? 'Cheque No. *' : 'UPI Transaction Ref. *'}
                </label>
                <input required value={editForm.referenceNo} onChange={(e) => setEditForm((f) => ({ ...f, referenceNo: e.target.value }))} className={inputClass} />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date *</label>
              <input type="date" required max={new Date().toISOString().slice(0, 10)} value={editForm.paymentDate} onChange={(e) => setEditForm((f) => ({ ...f, paymentDate: e.target.value }))} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Narration</label>
              <input value={editForm.narration} onChange={(e) => setEditForm((f) => ({ ...f, narration: e.target.value }))} className={inputClass} placeholder="Optional note" />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="text-sm font-semibold px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={updating} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {updating ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search payment no., customer, invoice or reference…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('voucherNo')}>
                  Payment No. <SortIcon column="voucherNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('voucherDate')}>
                  Date <SortIcon column="voucherDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('invoiceNo')}>
                  Against Invoice <SortIcon column="invoiceNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Type</Th>
                <SortableTh onClick={() => toggleSort('mode')}>
                  Mode <SortIcon column="mode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Reference</Th>
                <SortableTh onClick={() => toggleSort('amount')} align="right">
                  Amount <SortIcon column="amount" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-slate-400">
                    <Wallet2 size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No payments match your search.' : 'No payments recorded yet.'}
                  </td>
                </tr>
              )}
              {rows.map((v) => (
                <tr key={v.voucherId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">
                    {v.voucherNo}
                    {v.splitGroupId && (
                      <span title="Part of a split payment" className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-600 bg-violet-50 ring-1 ring-violet-200 rounded-full px-1.5 py-0.5 align-middle">
                        <Layers size={10} /> Split
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{new Date(v.voucherDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{v.customerName}</td>
                  <td className="px-5 py-3 text-slate-500">{v.invoiceNo ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{v.paymentType ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${modeStyles[v.mode] ?? modeStyles.Cash}`}>{v.mode}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{v.referenceNo ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(v.amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button onClick={() => openEditForm(v)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700">
                        <Pencil size={14} /> Edit
                      </button>
                      <DeleteRowAction
                        canDelete={v.canDelete}
                        itemLabel={`payment ${v.voucherNo ?? v.voucherId}`}
                        onDelete={() => deleteVoucher(v.voucherId).unwrap()}
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
