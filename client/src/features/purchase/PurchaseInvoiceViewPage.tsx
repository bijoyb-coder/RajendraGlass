import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Printer, ArrowLeft, Pencil, X } from 'lucide-react'
import { useGetPurchaseInvoiceQuery, useUpdatePurchaseInvoiceMutation } from './purchaseApi'
import Logo from '../../components/Logo'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Purchase Invoice — the one document in the PO -> GRN -> Invoice chain that can always be
 * edited, so a wrong entry can be fixed here rather than reversed. */
export default function PurchaseInvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: pi, isLoading } = useGetPurchaseInvoiceQuery(Number(id))
  const [updateInvoice, { isLoading: saving }] = useUpdatePurchaseInvoiceMutation()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ supplierInvoiceNo: '', invoiceDate: '', totalValue: 0 })
  const [error, setError] = useState<string | null>(null)

  function openEdit() {
    if (!pi) return
    setForm({
      supplierInvoiceNo: pi.supplierInvoiceNo ?? '',
      invoiceDate: pi.invoiceDate.slice(0, 10),
      totalValue: pi.totalValue,
    })
    setError(null)
    setEditing(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.totalValue || form.totalValue <= 0) {
      setError('Invoice value must be greater than zero.')
      return
    }
    try {
      await updateInvoice({
        id: Number(id),
        body: { supplierInvoiceNo: form.supplierInvoiceNo || undefined, invoiceDate: form.invoiceDate, totalValue: form.totalValue },
      }).unwrap()
      setEditing(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the changes.')
    }
  }

  if (isLoading || !pi) {
    return <div className="text-center py-20 text-slate-400">Loading purchase invoice…</div>
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          <Link
            to={`/purchase/grn/${pi.grnId}`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            View GRN
          </Link>
          <button
            onClick={editing ? () => setEditing(false) : openEdit}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            {editing ? <X size={15} /> : <Pencil size={15} />} {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={handleSubmit} className="no-print bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier Invoice No.</label>
            <input value={form.supplierInvoiceNo} onChange={(e) => setForm((f) => ({ ...f, supplierInvoiceNo: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date *</label>
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Value *</label>
            <input type="number" min={0} step="0.01" required value={form.totalValue} onChange={(e) => setForm((f) => ({ ...f, totalValue: Number(e.target.value) }))} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-3 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" showTagline />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">PURCHASE INVOICE</h2>
            <p className="text-xs text-slate-500">Supplier bill booked against a posted GRN.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Invoice No." value={pi.invoiceNo ?? '—'} />
          <Detail label="Invoice Date" value={new Date(pi.invoiceDate).toLocaleDateString('en-IN')} />
          <Detail label="Against GRN" value={pi.grnNo ?? '—'} />
          <Detail label="Supplier" value={pi.supplierName ?? '—'} />
          <Detail label="Supplier Invoice No." value={pi.supplierInvoiceNo ?? '—'} />
          <Detail label="Status" value={pi.status} />
        </div>

        <div className="flex justify-end">
          <div className="w-64 flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 text-base">
            <span>Invoice Value</span><span>₹ {money(pi.totalValue)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  )
}
