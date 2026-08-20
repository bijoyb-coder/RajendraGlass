import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Printer, ArrowLeft, Pencil, X } from 'lucide-react'
import { useGetPurchaseInvoiceQuery, useUpdatePurchaseInvoiceMutation } from './purchaseApi'
import Logo from '../../components/Logo'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Purchase Invoice — entered directly from the supplier's paper tax invoice (Local or
 * Inter-State), stock added on save. Quantities/rates aren't editable after the fact (they'd need
 * their own stock reconciliation); only the supplier reference number and date can be fixed here. */
export default function PurchaseInvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: pi, isLoading } = useGetPurchaseInvoiceQuery(Number(id))
  const [updateInvoice, { isLoading: saving }] = useUpdatePurchaseInvoiceMutation()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ supplierInvoiceNo: '', invoiceDate: '' })
  const [error, setError] = useState<string | null>(null)

  function openEdit() {
    if (!pi) return
    setForm({ supplierInvoiceNo: pi.supplierInvoiceNo ?? '', invoiceDate: pi.invoiceDate.slice(0, 10) })
    setError(null)
    setEditing(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await updateInvoice({
        id: Number(id),
        body: { supplierInvoiceNo: form.supplierInvoiceNo || undefined, invoiceDate: form.invoiceDate },
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
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          {pi.grnId && (
            <Link to={`/purchase/grn/${pi.grnId}`} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition">
              View GRN
            </Link>
          )}
          {pi.purchaseOrderId && (
            <Link to={`/purchase/orders/${pi.purchaseOrderId}`} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition">
              View PO
            </Link>
          )}
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
        <form onSubmit={handleSubmit} className="no-print bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4 grid sm:grid-cols-2 gap-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier Invoice No.</label>
            <input value={form.supplierInvoiceNo} onChange={(e) => setForm((f) => ({ ...f, supplierInvoiceNo: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date *</label>
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} className={inputClass} />
          </div>
          {error && <div className="sm:col-span-2 text-sm text-red-600">{error}</div>}
          <div className="sm:col-span-2 flex justify-end">
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
            <p className="text-xs text-slate-500">{pi.isInterState ? 'Inter-State (IGST)' : 'Local (CGST + SGST)'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Invoice No." value={pi.invoiceNo ?? '—'} />
          <Detail label="Invoice Date" value={new Date(pi.invoiceDate).toLocaleDateString('en-IN')} />
          <Detail label="Supplier" value={pi.supplierName ?? '—'} />
          <Detail label="Supplier Invoice No." value={pi.supplierInvoiceNo ?? '—'} />
          <Detail label="Godown" value={pi.godownName ?? '—'} />
          <Detail label="Type" value={pi.isInterState ? 'Inter-State' : 'Local'} />
          <Detail label="Against PO" value={pi.poNo ?? '—'} />
          <Detail label="Against GRN" value={pi.grnNo ?? '—'} />
          <Detail label="Status" value={pi.status} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="py-2 font-medium">Product</th>
                {pi.isInterState ? (
                  <>
                    <th className="py-2 font-medium text-right">Thick (mm)</th>
                    <th className="py-2 font-medium text-right">W × L (cm)</th>
                    <th className="py-2 font-medium text-right">Crates × Sheets</th>
                    <th className="py-2 font-medium text-right">Area (sqm)</th>
                    <th className="py-2 font-medium text-right">Rate (per mm)</th>
                  </>
                ) : (
                  <>
                    <th className="py-2 font-medium text-right">Qty (sqm)</th>
                    <th className="py-2 font-medium text-right">Rate</th>
                  </>
                )}
                <th className="py-2 font-medium text-right">Basic Value</th>
                <th className="py-2 font-medium text-right">Net Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pi.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2.5">
                    <div className="font-medium text-slate-800">{l.description ?? l.productDescription}</div>
                    <div className="text-xs text-slate-400">{l.productCode}</div>
                  </td>
                  {pi.isInterState ? (
                    <>
                      <td className="py-2.5 text-right">{l.thicknessMm ?? '—'}</td>
                      <td className="py-2.5 text-right">{l.widthCm ?? '—'} × {l.lengthCm ?? '—'}</td>
                      <td className="py-2.5 text-right">{l.noOfCrates ?? '—'} × {l.sheetsPerCrate ?? '—'}</td>
                      <td className="py-2.5 text-right">{money(l.area)}</td>
                      <td className="py-2.5 text-right">{money(l.rate)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 text-right">{money(l.qty)}</td>
                      <td className="py-2.5 text-right">{money(l.rate)}</td>
                    </>
                  )}
                  <td className="py-2.5 text-right">{money(l.basicValue)}</td>
                  <td className="py-2.5 text-right font-medium">{money(l.netValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1.5 text-sm">
            <Row label="Basic Value" value={money(pi.basicValue)} />
            {pi.isInterState && pi.insuranceValue > 0 && <Row label="Insurance" value={money(pi.insuranceValue)} />}
            <Row label="Taxable Value" value={money(pi.taxableValue)} />
            {pi.cgstValue > 0 && <Row label="CGST" value={money(pi.cgstValue)} />}
            {pi.sgstValue > 0 && <Row label="SGST" value={money(pi.sgstValue)} />}
            {pi.igstValue > 0 && <Row label="IGST" value={money(pi.igstValue)} />}
            <Row label="Round Off" value={money(pi.roundOff)} />
            <div className="flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 mt-2 text-base">
              <span>Total</span><span>₹ {money(pi.totalValue)}</span>
            </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-500">
      <span>{label}</span><span className="text-slate-700 font-medium">{value}</span>
    </div>
  )
}
