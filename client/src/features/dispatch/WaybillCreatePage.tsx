import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { useListInvoicesQuery } from '../sales/salesApi'
import { useListTransportersQuery, useListVehiclesQuery } from '../masters/mastersApi'
import { useCreateWaybillMutation } from './dispatchApi'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

export default function WaybillCreatePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const preselectedInvoiceId = params.get('invoiceId')

  const { data: invoices } = useListInvoicesQuery()
  const { data: transporters } = useListTransportersQuery()
  const [createWaybill, { isLoading }] = useCreateWaybillMutation()

  const [invoiceId, setInvoiceId] = useState<number | ''>(preselectedInvoiceId ? Number(preselectedInvoiceId) : '')
  const [toAddress, setToAddress] = useState('')
  const [transporterId, setTransporterId] = useState<number | ''>('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [distanceKm, setDistanceKm] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  const { data: vehicles } = useListVehiclesQuery(transporterId as number, { skip: !transporterId })
  const selectedInvoice = invoices?.items.find((i) => i.invoiceId === invoiceId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!invoiceId) { setError('Please select an approved invoice.'); return }

    try {
      const result = await createWaybill({
        invoiceId: Number(invoiceId),
        toAddress: toAddress || selectedInvoice?.destination || undefined,
        transporterId: transporterId ? Number(transporterId) : undefined,
        vehicleNo: vehicleNo || undefined,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
      }).unwrap()
      navigate(`/dispatch/waybills/${result.waybillId}`)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not generate the waybill. Please check the details and try again.')
    }
  }

  return (
    <div className="max-w-2xl animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Generate Waybill</h1>
        <p className="text-sm text-slate-500 mt-1">Create an e-Way Bill / transport document against an approved invoice.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <Field label="Invoice *">
          <select required value={invoiceId} onChange={(e) => setInvoiceId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
            <option value="">Select an approved invoice…</option>
            {invoices?.items.filter((i) => i.status === 'Approved').map((i) => (
              <option key={i.invoiceId} value={i.invoiceId}>{i.invoiceNo} — {i.customerName} — ₹{i.totalValue.toLocaleString('en-IN')}</option>
            ))}
          </select>
        </Field>

        <Field label="Deliver To (Address)">
          <input value={toAddress} onChange={(e) => setToAddress(e.target.value)} className={inputClass} placeholder={selectedInvoice?.destination ?? 'Delivery address'} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Transporter">
            <select value={transporterId} onChange={(e) => { setTransporterId(e.target.value ? Number(e.target.value) : ''); setVehicleNo('') }} className={inputClass}>
              <option value="">Select transporter…</option>
              {transporters?.items.map((t) => <option key={t.transporterId} value={t.transporterId}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Vehicle No.">
            <select value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={inputClass} disabled={!transporterId}>
              <option value="">Select vehicle…</option>
              {vehicles?.items.map((v) => <option key={v.vehicleId} value={v.vehicleNo}>{v.vehicleNo}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Approx. Distance (km)">
          <input type="number" min={0} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
        </Field>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
            <Save size={16} /> {isLoading ? 'Generating…' : 'Generate Waybill'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
