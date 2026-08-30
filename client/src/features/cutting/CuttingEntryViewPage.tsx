import { useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Printer, ImagePlus, X } from 'lucide-react'
import { useGetCuttingEntryQuery, useDeleteCuttingEntryMutation, useUploadCuttingEntryDesignMutation, useDeleteCuttingEntryDesignMutation } from './cuttingEntryApi'
import { confirmAction, alertError, alertSuccess } from '../../lib/alerts'
import { validateDesignFile } from '../../lib/designUpload'
import ImageLightbox from '../../components/ImageLightbox'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Read-only -- a saved Cutting Entry's stock effect is immutable, matching the rest of the app's
 * inventory conventions (see PurchaseInvoice's own Cancel/reverse pattern). Correcting a mistake
 * means Cancel (reverses the stock deduction) and re-entering, not editing rows in place. */
export default function CuttingEntryViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: c, isLoading } = useGetCuttingEntryQuery(Number(id))
  const [cancelEntry, { isLoading: cancelling }] = useDeleteCuttingEntryMutation()
  const [uploadDesign, { isLoading: uploadingDesign }] = useUploadCuttingEntryDesignMutation()
  const [deleteDesign] = useDeleteCuttingEntryDesignMutation()
  const designInputRef = useRef<HTMLInputElement>(null)

  function onDesignFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !c) return
    const problem = validateDesignFile(file)
    if (problem) { void alertError('Invalid Design File', problem); return }
    uploadDesign({ id: c.cuttingEntryId, file })
      .unwrap()
      .then(() => alertSuccess('Design Uploaded', 'The design image has been attached to this cutting entry.'))
      .catch((err: any) => alertError('Upload Failed', err?.data?.detail ?? 'Could not upload the design image. Please try again.'))
  }

  async function handleRemoveDesign() {
    if (!c) return
    const ok = await confirmAction('Remove this design image?', 'You can upload a new one afterwards.', 'Yes, remove', 'No')
    if (!ok) return
    try {
      await deleteDesign(c.cuttingEntryId).unwrap()
      await alertSuccess('Design Removed')
    } catch (err: any) {
      void alertError('Could Not Remove', err?.data?.detail ?? 'Please try again.')
    }
  }

  async function handleCancel() {
    if (!c) return
    const ok = await confirmAction('Cancel this Cutting Entry?', `This reverses the stock deducted by ${c.cuttingNo}. This cannot be undone.`, 'Yes, cancel', 'No')
    if (!ok) return
    try {
      await cancelEntry(c.cuttingEntryId).unwrap()
      await alertSuccess('Cutting Entry Cancelled', `${c.cuttingNo} has been cancelled and its stock reversed.`)
    } catch (err: any) {
      if (err?.data?.errorCode === 'CUTTINGENTRY_STOCK_CONSUMED') {
        void alertError('Cannot Cancel', err.data.detail ?? 'Some of the stock this entry deducted has already moved on elsewhere.')
      } else {
        void alertError('Could Not Cancel', err?.data?.detail ?? 'Please try again.')
      }
    }
  }

  if (isLoading || !c) {
    return <div className="text-center py-20 text-slate-400">Loading cutting entry…</div>
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          {c.status !== 'Cancelled' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-60"
            >
              <Ban size={15} /> {cancelling ? 'Cancelling…' : 'Cancel Entry'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition"
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-brand-900">CUTTING ENTRY</h2>
            <p className="text-xs text-slate-500">Against Quotation {c.quotationNo ?? '—'}</p>
          </div>
          <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 h-fit ${c.status === 'Cancelled' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
            {c.status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Cutting No." value={c.cuttingNo} />
          <Detail label="Cutting Date" value={new Date(c.cuttingDate).toLocaleDateString('en-IN')} />
          <Detail label="Quotation" value={c.quotationNo ?? '—'} />
          <Detail label="Customer" value={c.customerName ?? '—'} />
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Design</p>
          {c.designDataUrl ? (
            <div className="flex items-start gap-4">
              <ImageLightbox src={c.designDataUrl} alt={c.designFileName ?? 'Design'} thumbnailClassName="h-32 w-32 object-cover rounded-lg border border-slate-200 cursor-zoom-in" />
              <div className="no-print text-xs text-slate-500 space-y-2">
                <p>Click the image to view it full size.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => designInputRef.current?.click()} disabled={uploadingDesign} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium disabled:opacity-60">
                    <ImagePlus size={13} /> Replace
                  </button>
                  <button type="button" onClick={handleRemoveDesign} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium">
                    <X size={13} /> Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => designInputRef.current?.click()}
              disabled={uploadingDesign}
              className="no-print inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 disabled:opacity-60"
            >
              <ImagePlus size={16} /> {uploadingDesign ? 'Uploading…' : 'Upload Design (JPEG, PNG or GIF)'}
            </button>
          )}
          <input ref={designInputRef} type="file" accept="image/jpeg,image/png,image/gif" onChange={onDesignFileChange} className="hidden" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="py-2 font-medium">Sl</th>
                <th className="py-2 font-medium">Glass Description</th>
                <th className="py-2 font-medium text-right">Height</th>
                <th className="py-2 font-medium text-right">Width</th>
                <th className="py-2 font-medium text-right">PCS</th>
                <th className="py-2 font-medium text-right">CH Height</th>
                <th className="py-2 font-medium text-right">CH Width</th>
                <th className="py-2 font-medium text-right">SQFT</th>
                <th className="py-2 font-medium text-right">Rate</th>
                <th className="py-2 font-medium text-right">Amount</th>
                <th className="py-2 font-medium">Godown / Rack</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.lines.map((l) => (
                <tr key={l.cuttingEntryLineId}>
                  <td className="py-2.5 text-slate-500">{l.serialNo}</td>
                  <td className="py-2.5">
                    <div className="font-medium text-slate-800">{l.productDescription}</div>
                    <div className="text-xs text-slate-400">{l.productCode}</div>
                  </td>
                  <td className="py-2.5 text-right">{l.actualHeightText ?? l.actualHeight}</td>
                  <td className="py-2.5 text-right">{l.actualWidthText ?? l.actualWidth}</td>
                  <td className="py-2.5 text-right">{l.pcs}</td>
                  <td className="py-2.5 text-right">{l.chargeableHeight}</td>
                  <td className="py-2.5 text-right">{l.chargeableWidth}</td>
                  <td className="py-2.5 text-right font-medium">{l.sqft.toFixed(2)}</td>
                  <td className="py-2.5 text-right">{money(l.rate)}</td>
                  <td className="py-2.5 text-right font-medium">{money(l.amount)}</td>
                  <td className="py-2.5 text-slate-500">{l.godownName}{l.rackName ? ` / ${l.rackName}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <Row label="Total PCS" value={String(c.totalPcs)} />
            <Row label="Total SQFT" value={c.totalSqft.toFixed(2)} />
            <Row label="Glass Value" value={money(c.totalGlassValue)} />
            <Row label="Van Fair" value={money(c.vanFair)} />
            <div className="flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 mt-2 text-base">
              <span>Total Bill Amount</span><span>₹ {money(c.totalBillAmount)}</span>
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
