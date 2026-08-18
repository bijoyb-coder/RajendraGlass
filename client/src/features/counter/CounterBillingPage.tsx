import { useEffect, useMemo, useState } from 'react'
import { WifiOff, Wifi, CloudUpload, RefreshCw, AlertTriangle, CheckCircle2, Zap, Trash2 } from 'lucide-react'
import { useListProductsQuery, useListCustomersQuery } from '../masters/mastersApi'
import { useCreateCounterInvoiceMutation, type CounterInvoicePaymentRequest } from './counterBillingApi'
import { useConnectivity } from '../../lib/connectivity'
import {
  cacheProducts, cacheCustomers, getCachedProducts, getCachedCustomers,
  enqueueOutboxItem, listOutbox, removeOutboxItem, newProvisionalNo, type OutboxItem,
} from '../../lib/offlineDb'
import { flushOutbox, onSyncCompleted } from '../../lib/syncEngine'
import type { ProductDto, CustomerDto } from '../../lib/types'
import SalesLineGrid, { emptyLine, isComplete, lineTotals, toCreateLine, type SalesLine } from '../sales/SalesLineGrid'
import PaymentSplitEditor, { emptySplitRow, splitAppliedTotal, validateSplits, type PaymentSplitRow } from '../../components/PaymentSplitEditor'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

export default function CounterBillingPage() {
  const isOnline = useConnectivity()
  const { data: liveProducts } = useListProductsQuery()
  const { data: liveCustomers } = useListCustomersQuery()
  const [createCounterInvoice] = useCreateCounterInvoiceMutation()

  const [cachedProducts, setCachedProducts] = useState<ProductDto[]>([])
  const [cachedCustomers, setCachedCustomers] = useState<CustomerDto[]>([])
  const [outbox, setOutbox] = useState<OutboxItem[]>([])

  // Cache reference data whenever it's freshly fetched, so the screen keeps working offline.
  useEffect(() => {
    if (liveProducts?.items?.length) void cacheProducts(liveProducts.items)
  }, [liveProducts])
  useEffect(() => {
    if (liveCustomers?.items?.length) void cacheCustomers(liveCustomers.items)
  }, [liveCustomers])

  useEffect(() => {
    void getCachedProducts().then(setCachedProducts)
    void getCachedCustomers().then(setCachedCustomers)
  }, [])

  const refreshOutbox = () => { void listOutbox().then(setOutbox) }
  useEffect(() => {
    refreshOutbox()
    const unsub = onSyncCompleted(() => refreshOutbox())
    const interval = setInterval(refreshOutbox, 4000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  const productList = (liveProducts?.items?.length ? liveProducts.items : cachedProducts)
  const customers = (liveCustomers?.items?.length ? liveCustomers.items : cachedCustomers)
  const products = useMemo(() => ({ items: productList }), [productList])

  const [customerId, setCustomerId] = useState<number | ''>('')
  const [walkInName, setWalkInName] = useState('')
  // Same line shape, same grid, same calculation engine as the Quotation screen — a walk-in
  // sale must never total differently than a quotation would for the same size/rate/thickness.
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()])
  // The customer may split the bill across Cash/Cheque/UPI in any combination — every row's
  // amount together must add up to the total exactly (see PaymentSplitEditor).
  const [payments, setPayments] = useState<PaymentSplitRow[]>([emptySplitRow('Cash', '')])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ invoiceNo: string; queued: boolean; summary: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const totals = lineTotals(lines)
  // Whole-rupee round-off, same as the server (Math.Round(total, 0, AwayFromZero)) — the figure
  // the cashier is actually asked to collect.
  const payable = Math.round(totals.amount)
  const roundOff = payable - totals.amount
  const applied = splitAppliedTotal(payments)

  // A single payment row tracks the bill total automatically — the common case needs no manual
  // entry. Once a second method is added, amounts are left alone so a manual split isn't clobbered.
  useEffect(() => {
    if (payments.length === 1 && payments[0].amount !== payable) {
      setPayments([{ ...payments[0], amount: payable }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payable])

  function resetForm() {
    setCustomerId(''); setWalkInName('')
    setLines([emptyLine()])
    setPayments([emptySplitRow('Cash', '')])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const validLines = lines.filter(isComplete)
    if (validLines.length === 0) { setError('Add at least one product with a size or amount.'); return }

    const splitError = validateSplits(payments, payable)
    if (splitError) { setError(splitError); return }

    setSaving(true)
    const idempotencyKey = crypto.randomUUID()
    const paymentPayload: CounterInvoicePaymentRequest[] = payments.map((p) => ({
      paymentType: p.method,
      amount: Number(p.amount),
      referenceNo: p.method === 'Cash' ? undefined : (p.referenceNo || undefined),
    }))
    const body = {
      customerId: customerId ? Number(customerId) : undefined,
      walkInCustomerName: customerId ? undefined : (walkInName || 'Walk-in Customer'),
      lines: validLines.map(toCreateLine),
      payments: paymentPayload,
    }
    const summary = paymentPayload.map((p) => `${p.paymentType} ${money(p.amount)}`).join(' + ')

    if (isOnline) {
      try {
        const dto = await createCounterInvoice({ body, idempotencyKey }).unwrap()
        setSuccess({ invoiceNo: dto.invoiceNo ?? '—', queued: false, summary })
        resetForm()
        setSaving(false)
        return
      } catch (err: any) {
        // A real server-side rejection (stock conflict, amount mismatch) — surface it, don't silently queue.
        if (typeof err?.status === 'number') {
          setError(err?.data?.detail ?? 'Could not complete this sale.')
          setSaving(false)
          return
        }
        // else fall through to offline queueing — the network dropped mid-submit.
      }
    }

    // Offline path (SDD 4.7): write to the local queue with a provisional number.
    const provisionalNo = newProvisionalNo()
    await enqueueOutboxItem({
      idempotencyKey,
      provisionalNo,
      capturedOn: new Date().toISOString(),
      customerId: customerId ? Number(customerId) : null,
      walkInCustomerName: customerId ? null : (walkInName || 'Walk-in Customer'),
      lines: validLines.map(toCreateLine),
      payments: paymentPayload,
      totalEstimate: payable,
    })
    refreshOutbox()
    setSuccess({ invoiceNo: provisionalNo, queued: true, summary })
    resetForm()
    setSaving(false)
  }

  const pending = outbox.filter((o) => o.status !== 'error')
  const conflicted = outbox.filter((o) => o.status === 'error')

  return (
    <div className="max-w-6xl space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900 flex items-center gap-2"><Zap size={22} className="text-gold-500" /> Counter Billing</h1>
          <p className="text-sm text-slate-500 mt-1">Fast walk-in sales, priced exactly like a Quotation. Split payment across Cash, Cheque and UPI as needed. Keeps working through an internet outage — sales queue locally and sync automatically.</p>
        </div>
        <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ring-1 ${isOnline ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />} {isOnline ? 'Online' : 'Offline — billing locally'}
        </div>
      </div>

      {(pending.length > 0 || conflicted.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CloudUpload size={15} /> Pending Sync ({pending.length + conflicted.length})</h2>
            <button
              onClick={() => flushOutbox()}
              disabled={!isOnline}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={13} /> Sync now
            </button>
          </div>
          <div className="space-y-1.5">
            {outbox.map((o) => (
              <div key={o.localId} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${o.status === 'error' ? 'bg-red-50' : o.status === 'syncing' ? 'bg-blue-50' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {o.status === 'error' ? <AlertTriangle size={13} className="text-red-500 shrink-0" /> : <CloudUpload size={13} className="text-slate-400 shrink-0" />}
                  <span className="font-medium text-slate-700">{o.provisionalNo}</span>
                  <span className="text-slate-400 truncate">{o.walkInCustomerName ?? 'Registered customer'} · {money(o.totalEstimate)} · {o.payments.map((p) => p.paymentType).join(' + ')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {o.status === 'error' && <span className="text-red-600">{o.errorMessage}</span>}
                  {o.status === 'syncing' && <span className="text-blue-600">Syncing…</span>}
                  {o.status === 'error' && (
                    <button onClick={() => removeOutboxItem(o.localId).then(refreshOutbox)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {success && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${success.queued ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
          <CheckCircle2 size={16} className="shrink-0" />
          {success.queued ? (
            <span>Billed offline as <strong>{success.invoiceNo}</strong> ({success.summary}) — it will sync and receive a final invoice number once connectivity returns.</span>
          ) : (
            <span>Invoice <strong>{success.invoiceNo}</strong> saved — paid via {success.summary}.</span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Registered Customer (optional)</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Walk-in / cash customer</option>
              {customers.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
            </select>
          </div>
          {!customerId && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Walk-in Name</label>
              <input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} className={inputClass} placeholder="Optional" />
            </div>
          )}
        </div>

        <SalesLineGrid lines={lines} products={products} onChange={setLines} />

        <div className="flex flex-col lg:flex-row justify-between gap-4 border-t border-slate-100 pt-4">
          <div className="w-full lg:w-96">
            <PaymentSplitEditor rows={payments} target={payable} onChange={setPayments} />
          </div>

          <div className="w-full sm:w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500"><span>Basic Value</span><span className="text-slate-700 font-medium">{money(totals.basic)}</span></div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-slate-500"><span>Discount</span><span className="text-slate-700 font-medium">− {money(totals.discount)}</span></div>
            )}
            <div className="flex justify-between text-slate-500"><span>GST</span><span className="text-slate-700 font-medium">{money(totals.gst)}</span></div>
            {Math.abs(roundOff) >= 0.005 && (
              <div className="flex justify-between text-slate-500"><span>Round Off</span><span className="text-slate-700 font-medium">{roundOff >= 0 ? '+' : ''}{money(roundOff)}</span></div>
            )}
            <div className="flex justify-between font-bold text-brand-900 border-t border-slate-200 pt-1.5"><span>Total Payable</span><span>{money(payable)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Applied</span><span className="font-medium text-slate-700">{money(applied)}</span></div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-6 py-3 rounded-lg shadow transition disabled:opacity-60">
            {saving ? 'Processing…' : isOnline ? 'Complete Sale' : 'Bill Offline'}
          </button>
        </div>
      </form>
    </div>
  )
}
