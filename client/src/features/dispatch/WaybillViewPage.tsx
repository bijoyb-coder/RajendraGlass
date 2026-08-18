import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { Printer, ArrowLeft, ShieldCheck, XCircle, Loader2 } from 'lucide-react'
import { useGetWaybillQuery, useGenerateEwayBillMutation, useCancelEwayBillMutation } from './dispatchApi'
import { useGetCompanyQuery } from '../masters/mastersApi'
import Logo from '../../components/Logo'
import { Can } from '../../lib/permissions'

export default function WaybillViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: waybill, isLoading } = useGetWaybillQuery(Number(id))
  const { data: company } = useGetCompanyQuery()
  const [generateEwayBill, { isLoading: generating }] = useGenerateEwayBillMutation()
  const [cancelEwayBill, { isLoading: cancelling }] = useCancelEwayBillMutation()

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (waybill?.ewbQrPayload) {
      QRCode.toDataURL(waybill.ewbQrPayload, { width: 130, margin: 1 }).then(setQrDataUrl)
    } else {
      setQrDataUrl('')
    }
  }, [waybill?.ewbQrPayload])

  async function handleGenerate() {
    if (!waybill) return
    setError(null)
    try {
      await generateEwayBill(waybill.waybillId).unwrap()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not generate the e-Way Bill.')
    }
  }

  async function handleCancel() {
    if (!waybill) return
    const reason = window.prompt('Reason for cancelling this e-Way Bill (mandatory):')
    if (!reason) return
    setError(null)
    try {
      await cancelEwayBill({ id: waybill.waybillId, reason }).unwrap()
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not cancel the e-Way Bill.')
    }
  }

  if (isLoading || !waybill) {
    return <div className="text-center py-20 text-slate-400">Loading waybill…</div>
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          <Can perm="Waybill.EwayBill">
            {waybill.ewayBillStatus === 'Generated' ? (
              <button onClick={handleCancel} disabled={cancelling} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60">
                {cancelling ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Cancel e-Way Bill
              </button>
            ) : (
              <button onClick={handleGenerate} disabled={generating || waybill.status === 'Cancelled'} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {generating ? 'Generating…' : 'Generate e-Way Bill'}
              </button>
            )}
          </Can>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {error && <div className="no-print mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">TRANSPORT DOCUMENT</h2>
            <p className="text-xs text-slate-500">Internal waybill {waybill.waybillNo}</p>
          </div>
        </div>

        {waybill.ewayBillStatus === 'Generated' ? (
          <div className="flex items-start gap-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
            {qrDataUrl && <img src={qrDataUrl} alt="e-Way Bill QR" className="rounded border border-emerald-200 bg-white" />}
            <div className="text-xs space-y-1">
              <p className="flex items-center gap-1.5 text-emerald-800 font-semibold text-sm"><ShieldCheck size={14} /> Government e-Way Bill Generated</p>
              <p className="text-emerald-700"><span className="text-emerald-500">EWB No:</span> {waybill.ewbNo}</p>
              <p className="text-emerald-700"><span className="text-emerald-500">Generated:</span> {waybill.ewbAckDate ? new Date(waybill.ewbAckDate).toLocaleString('en-IN') : '—'}</p>
              <p className="text-emerald-700"><span className="text-emerald-500">Valid Until:</span> {waybill.ewbValidUpto ? new Date(waybill.ewbValidUpto).toLocaleString('en-IN') : '—'}</p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
            No government e-Way Bill generated yet for this transport document.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Waybill No. (internal)" value={waybill.waybillNo ?? '—'} />
          <Detail label="Generated On" value={new Date(waybill.generatedDate).toLocaleString('en-IN')} />
          <Detail label="Supply Type" value={`${waybill.supplyType} — ${waybill.subType}`} />
          <Detail label="Against Invoice" value={waybill.invoiceNo ?? '—'} />
          <Detail label="Status" value={waybill.status} />
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm mb-6">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">From</p>
            <p className="font-semibold text-slate-800">{company?.legalName}</p>
            <p className="text-slate-500">{waybill.fromAddress}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">To</p>
            <p className="font-semibold text-slate-800">{waybill.customerName}</p>
            <p className="text-slate-500">{waybill.toAddress}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs border-t border-slate-200 pt-4 mb-6">
          <Detail label="Transporter" value={waybill.transporterName ?? '—'} />
          <Detail label="Vehicle No." value={waybill.vehicleNo ?? '—'} />
          <Detail label="Mode of Transport" value={waybill.transportMode} />
          <Detail label="Approx. Distance" value={waybill.distanceKm ? `${waybill.distanceKm} km` : '—'} />
          <Detail label="Invoice Value" value={waybill.invoiceTotal ? `₹ ${waybill.invoiceTotal.toLocaleString('en-IN')}` : '—'} />
        </div>

        <div className="text-xs text-slate-400 border-t border-slate-200 pt-4">
          This document is a system-generated transport record accompanying the tax invoice referenced above.
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
