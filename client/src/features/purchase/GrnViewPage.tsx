import { useParams, useNavigate, Link } from 'react-router-dom'
import { Printer, ArrowLeft, FileStack } from 'lucide-react'
import { useGetGrnQuery } from './purchaseApi'
import Logo from '../../components/Logo'

/** GRN — view/print only. There is no edit screen for a GRN at all, so once a purchase invoice
 * has been booked against it (shown below), that's purely informational, not a lock. */
export default function GrnViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: grn, isLoading } = useGetGrnQuery(Number(id))

  if (isLoading || !grn) {
    return <div className="text-center py-20 text-slate-400">Loading GRN…</div>
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          {grn.purchaseInvoiceId && (
            <Link
              to={`/purchase/invoices/${grn.purchaseInvoiceId}`}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              View Purchase Invoice
            </Link>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" showTagline />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">GOODS RECEIPT NOTE</h2>
            <p className="text-xs text-slate-500">View / print only — this document cannot be edited.</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="GRN No." value={grn.grnNo ?? '—'} />
          <Detail label="GRN Date" value={new Date(grn.grnDate).toLocaleDateString('en-IN')} />
          <Detail label="Against PO" value={grn.poNo ?? '—'} />
          <Detail label="Supplier" value={grn.supplierName ?? '—'} />
          <Detail label="Status" value={grn.status} />
          <Detail label="Invoiced As" value={grn.purchaseInvoiceNo ?? 'Not yet invoiced'} />
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="py-2 font-medium">Product</th>
              <th className="py-2 font-medium text-right">Received</th>
              <th className="py-2 font-medium text-right">Accepted</th>
              <th className="py-2 font-medium text-right">Rejected</th>
              <th className="py-2 font-medium text-right">Broken</th>
              <th className="py-2 font-medium">Batch No.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grn.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2.5 font-medium text-slate-800">{l.productCode}</td>
                <td className="py-2.5 text-right text-slate-700">{l.receivedQty}</td>
                <td className="py-2.5 text-right text-emerald-700 font-medium">{l.acceptedQty}</td>
                <td className="py-2.5 text-right text-red-600">{l.rejectedQty}</td>
                <td className="py-2.5 text-right text-amber-600">{l.brokenQty}</td>
                <td className="py-2.5 text-slate-500">{l.batchNo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-slate-200 pt-4 no-print">
          <p className="text-xs font-semibold text-slate-600 mb-2">Purchase invoice against this GRN</p>
          {grn.purchaseInvoiceNo ? (
            <Link
              to={`/purchase/invoices/${grn.purchaseInvoiceId}`}
              className="inline-flex items-center justify-between w-full text-sm rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition"
            >
              <span className="inline-flex items-center gap-2 font-medium text-brand-700">
                <FileStack size={14} /> {grn.purchaseInvoiceNo}
              </span>
            </Link>
          ) : (
            <p className="text-sm text-slate-400">No purchase invoice booked against this GRN yet.</p>
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
