import { useParams, useNavigate, Link } from 'react-router-dom'
import { Printer, ArrowLeft, PackageCheck } from 'lucide-react'
import { useGetPurchaseOrderQuery } from './purchaseApi'
import Logo from '../../components/Logo'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const grnStatusStyles: Record<string, string> = {
  Posted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Draft: 'bg-slate-100 text-slate-600 ring-slate-200',
}

/** Purchase Order — view/print only. There is no edit screen for a purchase order at all, so once
 * a GRN has been posted against it (shown below), that's purely informational, not a lock. */
export default function PurchaseOrderViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: po, isLoading } = useGetPurchaseOrderQuery(Number(id))

  if (isLoading || !po) {
    return <div className="text-center py-20 text-slate-400">Loading purchase order…</div>
  }

  const total = po.lines.reduce((s, l) => s + l.value, 0)

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
          <Printer size={15} /> Print
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" showTagline />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">PURCHASE ORDER</h2>
            <p className="text-xs text-slate-500">View / print only — this document cannot be edited.</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="PO No." value={po.poNo ?? '—'} />
          <Detail label="PO Date" value={new Date(po.poDate).toLocaleDateString('en-IN')} />
          <Detail label="Supplier" value={po.supplierName ?? '—'} />
          <Detail label="Status" value={po.status} />
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 font-medium text-right">Qty</th>
              <th className="py-2 font-medium text-right">Rate</th>
              <th className="py-2 font-medium text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2.5 font-medium text-slate-800">{l.productCode}</td>
                <td className="py-2.5 text-right text-slate-700">{l.qty}</td>
                <td className="py-2.5 text-right text-slate-700">{money(l.rate)}</td>
                <td className="py-2.5 text-right font-medium text-slate-800">{money(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-64 flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 text-base">
            <span>Total</span><span>₹ {money(total)}</span>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 no-print">
          <p className="text-xs font-semibold text-slate-600 mb-2">Goods Receipts (GRN) against this order</p>
          {po.grns && po.grns.length > 0 ? (
            <div className="space-y-1.5">
              {po.grns.map((g) => (
                <Link
                  key={g.grnId}
                  to={`/purchase/grn/${g.grnId}`}
                  className="flex items-center justify-between text-sm rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-brand-700">
                    <PackageCheck size={14} /> {g.grnNo}
                  </span>
                  <span className="text-slate-500">{new Date(g.grnDate).toLocaleDateString('en-IN')}</span>
                  <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${grnStatusStyles[g.status] ?? grnStatusStyles.Draft}`}>{g.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No GRN posted against this order yet.</p>
          )}
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
