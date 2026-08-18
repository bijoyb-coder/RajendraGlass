import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Printer, Truck, ArrowLeft, ShieldCheck, XCircle, Loader2 } from 'lucide-react'
import { useGetInvoiceQuery, useGenerateEInvoiceMutation, useCancelEInvoiceMutation } from './salesApi'
import { useGetCompanyQuery } from '../masters/mastersApi'
import Logo from '../../components/Logo'
import { Can } from '../../lib/permissions'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function InvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useGetInvoiceQuery(Number(id))
  const { data: company } = useGetCompanyQuery()
  const [generateEInvoice, { isLoading: generating }] = useGenerateEInvoiceMutation()
  const [cancelEInvoice, { isLoading: cancelling }] = useCancelEInvoiceMutation()

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (invoice?.irnQrPayload) {
      QRCode.toDataURL(invoice.irnQrPayload, { width: 130, margin: 1 }).then(setQrDataUrl)
    } else {
      setQrDataUrl('')
    }
  }, [invoice?.irnQrPayload])

  async function handleGenerate() {
    if (!invoice) return
    setError(null)
    try {
      await generateEInvoice(invoice.invoiceId).unwrap()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not generate the e-Invoice.')
    }
  }

  async function handleCancel() {
    if (!invoice) return
    const reason = window.prompt('Reason for cancelling this e-Invoice (mandatory):')
    if (!reason) return
    setError(null)
    try {
      await cancelEInvoice({ id: invoice.invoiceId, reason }).unwrap()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not cancel the e-Invoice.')
    }
  }

  if (isLoading || !invoice) {
    return <div className="text-center py-20 text-slate-400">Loading invoice…</div>
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          {invoice.salesOrderId && (
            <Link
              to={`/sales/orders/${invoice.salesOrderId}`}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
            >
              View Sales Order
            </Link>
          )}
          <Can perm="Invoice.EInvoice">
            {invoice.eInvoiceStatus === 'Generated' ? (
              <button onClick={handleCancel} disabled={cancelling} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                {cancelling ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Cancel e-Invoice
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={generating || invoice.status === 'Cancelled'} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {generating ? 'Generating…' : 'Generate e-Invoice'}
              </button>
            )}
          </Can>
          <Link
            to={`/dispatch/waybills/new?invoiceId=${invoice.invoiceId}`}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
          >
            <Truck size={15} /> Generate Waybill
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {error && <div className="no-print mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" showTagline />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">TAX INVOICE</h2>
            <p className="text-xs text-slate-500">(See Section 31 of the GST Act, 2017 &amp; Rule 46 of CGST Rules, 2017)</p>
          </div>
        </div>

        {invoice.eInvoiceStatus === 'Generated' && (
          <div className="flex items-start gap-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
            {qrDataUrl && <img src={qrDataUrl} alt="e-Invoice QR" className="rounded border border-emerald-200 bg-white" />}
            <div className="text-xs space-y-1">
              <p className="flex items-center gap-1.5 text-emerald-800 font-semibold text-sm"><ShieldCheck size={14} /> e-Invoice Generated (IRN)</p>
              <p className="text-emerald-700 break-all"><span className="text-emerald-500">IRN:</span> {invoice.irnNo}</p>
              <p className="text-emerald-700"><span className="text-emerald-500">Ack No:</span> {invoice.irnAckNo} &nbsp; <span className="text-emerald-500">Ack Date:</span> {invoice.irnAckDate ? new Date(invoice.irnAckDate).toLocaleString('en-IN') : '—'}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 text-sm mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Seller</p>
            <p className="font-semibold text-slate-800">{company?.legalName}</p>
            <p className="text-slate-500">{company?.businessAddress}</p>
            <p className="text-slate-500">GSTIN: {company?.gstin} &nbsp; PAN: {company?.pan}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Buyer / Recipient</p>
            <p className="font-semibold text-slate-800">{invoice.customerName}</p>
            <p className="text-slate-500">{invoice.customerAddress}</p>
            <p className="text-slate-500">GSTIN: {invoice.customerGstin ?? '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Invoice No." value={invoice.invoiceNo ?? '—'} />
          <Detail label="Invoice Date" value={new Date(invoice.invoiceDate).toLocaleDateString('en-IN')} />
          <Detail label="Against Sales Order" value={invoice.orderNo ?? '—'} />
          <Detail label="Place of Supply" value={invoice.placeOfSupply ?? '—'} />
          <Detail label="Customer Order Ref." value={invoice.customerOrderRef ?? '—'} />
          <Detail label="Transporter" value={invoice.transporterName ?? '—'} />
          <Detail label="Vehicle No." value={invoice.vehicleNo ?? '—'} />
          <Detail label="Destination" value={invoice.destination ?? '—'} />
          <Detail label="Status" value={invoice.status} />
          <Detail label="e-Way Bill No." value={invoice.ewayBillNo ?? 'Not generated'} />
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="py-2 font-medium">Product / HSN</th>
              <th className="py-2 font-medium text-right">Sheets</th>
              <th className="py-2 font-medium text-right">Quantity</th>
              <th className="py-2 font-medium text-right">Rate</th>
              <th className="py-2 font-medium text-right">Basic Value</th>
              <th className="py-2 font-medium text-right">Discount</th>
              <th className="py-2 font-medium text-right">Net Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((l) => (
              <tr key={l.invoiceLineId}>
                <td className="py-2.5">
                  <div className="font-medium text-slate-800">{l.description ?? l.productCode}</div>
                  <div className="text-xs text-slate-400">{l.productCode}</div>
                </td>
                <td className="py-2.5 text-right">{l.noOfSheets ?? '—'}</td>
                <td className="py-2.5 text-right">{money(l.quantity)}</td>
                <td className="py-2.5 text-right">{money(l.ratePerUnit)}</td>
                <td className="py-2.5 text-right">{money(l.basicValue)}</td>
                <td className="py-2.5 text-right">{money(l.discountValue)}</td>
                <td className="py-2.5 text-right font-medium">{money(l.netValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1.5 text-sm">
            <Row label="Basic Value" value={money(invoice.basicValue)} />
            <Row label="Discount" value={`− ${money(invoice.discountValue)}`} />
            <Row label="Taxable Value" value={money(invoice.taxableValue)} />
            {invoice.cgstValue > 0 && <Row label="CGST" value={money(invoice.cgstValue)} />}
            {invoice.sgstValue > 0 && <Row label="SGST" value={money(invoice.sgstValue)} />}
            {invoice.igstValue > 0 && <Row label="IGST" value={money(invoice.igstValue)} />}
            <Row label="Round Off" value={money(invoice.roundOff)} />
            <div className="flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 mt-2 text-base">
              <span>Total</span><span>₹ {money(invoice.totalValue)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-xs text-slate-500 border-t border-slate-200 pt-4">
          <div>
            <p className="font-semibold text-slate-600 mb-1">Terms &amp; Conditions</p>
            <p>{company?.invoiceFooterNote}</p>
          </div>
          <div className="text-right">
            <p className="mb-8">For {company?.legalName}</p>
            <p className="font-medium text-slate-700">{company?.authSignatoryName}</p>
            <p>Authorised Signatory</p>
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
