import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Save, ImagePlus, X } from 'lucide-react'
import { useListQuotationsQuery, useLazyGetQuotationCuttingProductsQuery } from '../sales/salesExtraApi'
import { useListGodownsQuery, useListRacksQuery, useListRackStockQuery } from '../inventory/inventoryApi'
import { useCreateCuttingEntryMutation, useUploadCuttingEntryDesignMutation } from './cuttingEntryApi'
import SearchableSelect from '../../components/SearchableSelect'
import { parseGlassDimension } from '../../lib/glassDimension'
import { alertError, alertSuccess, alertWarning } from '../../lib/alerts'
import { validateDesignFile } from '../../lib/designUpload'
import type { QuotationCuttingProductDto } from '../../lib/types'

interface LineRow {
  key: string
  quotationLineId: number | ''
  actualHeightText: string
  actualWidthText: string
  pcs: number | ''
  chargeableHeight: number | ''
  chargeableWidth: number | ''
  godownId: number | ''
  rackId: number | ''
}

function emptyLine(): LineRow {
  return {
    key: crypto.randomUUID(), quotationLineId: '', actualHeightText: '', actualWidthText: '',
    pcs: '', chargeableHeight: '', chargeableWidth: '', godownId: '', rackId: '',
  }
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/** SQFT = Chargeable Height x Chargeable Width x PCS / 144. Mirrors the server's own recompute in
 * CuttingEntryController.Create exactly, for a live preview -- the server never trusts this number. */
function priceLine(line: LineRow, quotationProduct: QuotationCuttingProductDto | undefined) {
  const ch = Number(line.chargeableHeight) || 0
  const cw = Number(line.chargeableWidth) || 0
  const pcs = Number(line.pcs) || 0
  const sqft = Math.round((ch * cw * pcs / 144) * 1000) / 1000
  const rate = quotationProduct?.rate ?? 0
  const amount = Math.round(sqft * rate * 100) / 100
  return { sqft, rate, amount }
}

export default function CuttingEntryCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: quotations } = useListQuotationsQuery()
  const { data: godowns } = useListGodownsQuery()
  const { data: allRacks } = useListRacksQuery()
  const { data: allRackStock } = useListRackStockQuery()
  const [fetchCuttingProducts] = useLazyGetQuotationCuttingProductsQuery()
  const [createCuttingEntry, { isLoading }] = useCreateCuttingEntryMutation()
  const [uploadDesign] = useUploadCuttingEntryDesignMutation()

  const [quotationId, setQuotationId] = useState<number | ''>('')
  const [cuttingDate, setCuttingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [vanFair, setVanFair] = useState<number | ''>(0)
  const [products, setProducts] = useState<QuotationCuttingProductDto[]>([])
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [designFile, setDesignFile] = useState<File | null>(null)
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null)
  const designInputRef = useRef<HTMLInputElement>(null)

  async function selectQuotation(id: number | '') {
    setQuotationId(id)
    setLines([emptyLine()]) // switching quotations invalidates every row's product/rate/stock context
    if (!id) { setProducts([]); return }
    try {
      const result = await fetchCuttingProducts(Number(id)).unwrap()
      setProducts(result.items)
    } catch {
      setProducts([])
      void alertError('Could Not Load Products', "This quotation's products could not be loaded. Please try again.")
    }
  }

  // Flow A: arriving straight from "Quotation saved successfully — process Cutting?" preselects
  // the quotation and loads its products automatically, without the user picking it again.
  useEffect(() => {
    const fromQuery = searchParams.get('quotationId')
    if (fromQuery) void selectQuotation(Number(fromQuery))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Revoke the preview's object URL on unmount / whenever it's replaced, so the browser can free it.
  useEffect(() => () => { if (designPreviewUrl) URL.revokeObjectURL(designPreviewUrl) }, [designPreviewUrl])

  function addLine() { setLines((prev) => [...prev, emptyLine()]) }
  function removeLine(key: string) { setLines((prev) => prev.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<LineRow>) { setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  function onProductChange(key: string, quotationLineId: number) {
    // A new product means any Godown/Rack picked for the old one no longer applies.
    updateLine(key, { quotationLineId, godownId: '', rackId: '' })
  }

  function onDesignFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-selected later (e.g. after removing it)
    if (!file) return
    const problem = validateDesignFile(file)
    if (problem) { void alertError('Invalid Design File', problem); return }
    if (designPreviewUrl) URL.revokeObjectURL(designPreviewUrl)
    setDesignFile(file)
    setDesignPreviewUrl(URL.createObjectURL(file))
  }

  function removeDesignFile() {
    if (designPreviewUrl) URL.revokeObjectURL(designPreviewUrl)
    setDesignFile(null)
    setDesignPreviewUrl(null)
  }

  const productByLineId = useMemo(() => new Map(products.map((p) => [p.quotationLineId, p])), [products])

  const totals = useMemo(() => {
    let totalPcs = 0, totalSqft = 0, totalGlassValue = 0
    for (const l of lines) {
      const qp = typeof l.quotationLineId === 'number' ? productByLineId.get(l.quotationLineId) : undefined
      const { sqft, amount } = priceLine(l, qp)
      totalPcs += Number(l.pcs) || 0
      totalSqft += sqft
      totalGlassValue += amount
    }
    totalSqft = Math.round(totalSqft * 1000) / 1000
    totalGlassValue = Math.round(totalGlassValue * 100) / 100
    const totalBillAmount = Math.round((totalGlassValue + (Number(vanFair) || 0)) * 100) / 100
    return { totalPcs, totalSqft, totalGlassValue, totalBillAmount }
  }, [lines, productByLineId, vanFair])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!quotationId) { void alertError('Validation Error', 'Please select a Quotation.'); return }
    if (!cuttingDate) { void alertError('Validation Error', 'Please enter the Cutting Date.'); return }
    if (Number(vanFair) < 0) { void alertError('Validation Error', 'Van Fair cannot be negative.'); return }
    if (lines.length === 0) { void alertError('Validation Error', 'Add at least one cutting row.'); return }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const where = `Row ${i + 1}`
      if (!l.quotationLineId) { void alertError('Validation Error', `${where}: select a product.`); return }
      const actualH = parseGlassDimension(l.actualHeightText)
      if (actualH === null) { void alertError('Invalid Height', `${where}: please enter a valid glass height, e.g. 20¼, 20 1/4 or 20.25.`); return }
      const actualW = parseGlassDimension(l.actualWidthText)
      if (actualW === null) { void alertError('Invalid Width', `${where}: please enter a valid glass width, e.g. 20¼, 20 1/4 or 20.25.`); return }
      if (!l.pcs || Number(l.pcs) <= 0 || !Number.isInteger(Number(l.pcs))) { void alertError('Validation Error', `${where}: PCS must be a whole number greater than zero.`); return }
      if (!l.chargeableHeight || Number(l.chargeableHeight) <= 0) { void alertError('Validation Error', `${where}: Chargeable Height is required.`); return }
      if (!l.chargeableWidth || Number(l.chargeableWidth) <= 0) { void alertError('Validation Error', `${where}: Chargeable Width is required.`); return }
      if (Number(l.chargeableHeight) < actualH) { void alertError('Validation Error', `${where}: Chargeable Height cannot be less than the actual height.`); return }
      if (Number(l.chargeableWidth) < actualW) { void alertError('Validation Error', `${where}: Chargeable Width cannot be less than the actual width.`); return }
      if (!l.godownId) { void alertError('Validation Error', `${where}: select a Godown.`); return }
    }

    try {
      const result = await createCuttingEntry({
        quotationId: Number(quotationId),
        cuttingDate,
        vanFair: Number(vanFair) || 0,
        lines: lines.map((l) => ({
          quotationLineId: Number(l.quotationLineId),
          actualHeightText: l.actualHeightText,
          actualWidthText: l.actualWidthText,
          pcs: Number(l.pcs),
          chargeableHeight: Number(l.chargeableHeight),
          chargeableWidth: Number(l.chargeableWidth),
          godownId: Number(l.godownId),
          rackId: l.rackId ? Number(l.rackId) : undefined,
        })),
      }).unwrap()

      // The Design image is attached as a separate step, deliberately outside the atomic stock
      // transaction -- it's a reference photo, not part of what makes the cutting entry valid, so
      // a failed upload here shouldn't undo an already-successful save.
      if (designFile) {
        try {
          await uploadDesign({ id: result.cuttingEntryId, file: designFile }).unwrap()
        } catch (err: any) {
          void alertWarning('Design Not Attached', err?.data?.detail ?? 'The cutting entry was saved, but the design image could not be uploaded. You can try again from the entry\'s page.')
        }
      }

      await alertSuccess(
        'Cutting Saved Successfully',
        `Cutting No: ${result.cuttingNo}\nTotal PCS: ${result.totalPcs}\nTotal SQFT: ${result.totalSqft.toFixed(2)}\nTotal Bill Amount: ${money(result.totalBillAmount)}`,
        3500,
      )
      navigate(`/sales/cutting/${result.cuttingEntryId}`)
    } catch (err: any) {
      if (err?.data?.errorCode === 'STOCK_INSUFFICIENT') void alertError('Insufficient Stock', err.data.detail)
      else void alertError('Could Not Save', err?.data?.detail ?? 'Could not save the cutting entry. Please check the details and try again.')
    }
  }

  return (
    <div className="max-w-6xl animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">New Cutting Entry</h1>
        <p className="text-sm text-slate-500 mt-1">Glass cut against a quotation — stock is deducted from the selected Godown on save.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Cutting No.">
              <input value="Auto-generated on save" disabled className={`${inputClass} bg-slate-50 text-slate-400`} />
            </Field>
            <Field label="Cutting Date *">
              <input type="date" required max={new Date().toISOString().slice(0, 10)} value={cuttingDate} onChange={(e) => setCuttingDate(e.target.value)} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Quotation *">
                <SearchableSelect
                  value={quotationId}
                  onChange={(id) => void selectQuotation(id)}
                  options={quotations?.items.map((q) => ({ value: q.quotationId, label: `${q.quotationNo} | ${q.customerName ?? '—'}` })) ?? []}
                  placeholder="Select quotation…"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Design (optional)</label>
            {!designPreviewUrl ? (
              <button
                type="button"
                onClick={() => designInputRef.current?.click()}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 border border-dashed border-slate-300 rounded-lg px-4 py-2.5"
              >
                <ImagePlus size={16} /> Upload Design (JPEG, PNG or GIF)
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <img src={designPreviewUrl} alt="Design preview" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                <div className="text-sm text-slate-600">
                  <p className="font-medium">{designFile?.name}</p>
                  <button type="button" onClick={removeDesignFile} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 mt-1">
                    <X size={13} /> Remove
                  </button>
                </div>
              </div>
            )}
            <input ref={designInputRef} type="file" accept="image/jpeg,image/png,image/gif" onChange={onDesignFileChange} className="hidden" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Cutting Details</h2>
            <button type="button" onClick={addLine} disabled={!quotationId} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus size={15} /> Add Cutting Row
            </button>
          </div>
          {!quotationId ? (
            <p className="px-5 py-6 text-sm text-slate-400">Select a quotation above to start entering cutting rows.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-medium w-10">Sl</th>
                    <th className="px-4 py-2.5 font-medium min-w-[220px]">Glass Description</th>
                    <th className="px-4 py-2.5 font-medium w-28">Height</th>
                    <th className="px-4 py-2.5 font-medium w-28">Width</th>
                    <th className="px-4 py-2.5 font-medium w-20">PCS</th>
                    <th className="px-4 py-2.5 font-medium w-24">CH Height</th>
                    <th className="px-4 py-2.5 font-medium w-24">CH Width</th>
                    <th className="px-4 py-2.5 font-medium w-24 text-right">SQFT</th>
                    <th className="px-4 py-2.5 font-medium w-24 text-right">Rate</th>
                    <th className="px-4 py-2.5 font-medium w-28 text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium min-w-[160px]">Godown</th>
                    <th className="px-4 py-2.5 font-medium min-w-[180px]">Rack</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, i) => {
                    const qp = typeof line.quotationLineId === 'number' ? productByLineId.get(line.quotationLineId) : undefined
                    const { sqft, rate, amount } = priceLine(line, qp)
                    const actualH = parseGlassDimension(line.actualHeightText)
                    const actualW = parseGlassDimension(line.actualWidthText)
                    const racksForGodown = allRacks?.items.filter((r) => r.godownId === line.godownId) ?? []
                    return (
                      <tr key={line.key}>
                        <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-2">
                          <SearchableSelect
                            value={line.quotationLineId}
                            onChange={(id) => onProductChange(line.key, id)}
                            options={products.map((p) => ({ value: p.quotationLineId, label: `${p.productCode} — ${p.productDescription}` }))}
                            placeholder="Select product…"
                            className={inputClass}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={line.actualHeightText}
                            onChange={(e) => updateLine(line.key, { actualHeightText: e.target.value })}
                            placeholder={`20¼`}
                            className={`${inputClass} ${line.actualHeightText && actualH === null ? 'border-red-300' : ''}`}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={line.actualWidthText}
                            onChange={(e) => updateLine(line.key, { actualWidthText: e.target.value })}
                            placeholder={`21½`}
                            className={`${inputClass} ${line.actualWidthText && actualW === null ? 'border-red-300' : ''}`}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" min={1} step="1" value={line.pcs} onChange={(e) => updateLine(line.key, { pcs: e.target.value ? Number(e.target.value) : '' })} className={inputClass} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" min={0} step="0.01" value={line.chargeableHeight} onChange={(e) => updateLine(line.key, { chargeableHeight: e.target.value ? Number(e.target.value) : '' })} className={inputClass} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" min={0} step="0.01" value={line.chargeableWidth} onChange={(e) => updateLine(line.key, { chargeableWidth: e.target.value ? Number(e.target.value) : '' })} className={inputClass} />
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{sqft.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{qp ? money(rate) : '—'}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{money(amount)}</td>
                        <td className="px-4 py-2">
                          <select value={line.godownId} onChange={(e) => updateLine(line.key, { godownId: e.target.value ? Number(e.target.value) : '', rackId: '' })} className={inputClass}>
                            <option value="">Select godown…</option>
                            {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={line.rackId} onChange={(e) => updateLine(line.key, { rackId: e.target.value ? Number(e.target.value) : '' })} disabled={!line.godownId} className={`${inputClass} disabled:opacity-50`}>
                            <option value="">No rack (optional)</option>
                            {racksForGodown.map((r) => {
                              const stockQty = allRackStock?.items.find((rs) => rs.rackId === r.rackId && line.quotationLineId && rs.productId === qp?.productId)?.qtyOnHand
                              return (
                                <option key={r.rackId} value={r.rackId}>
                                  {r.name}{stockQty !== undefined ? ` | Available: ${stockQty}` : ''}
                                </option>
                              )
                            })}
                          </select>
                        </td>
                        <td className="px-2">
                          <button type="button" onClick={() => removeLine(line.key)} className="text-slate-400 hover:text-red-500 transition">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-1.5 text-sm">
              <Row label="Total PCS" value={String(totals.totalPcs)} />
              <Row label="Total SQFT" value={totals.totalSqft.toFixed(2)} />
              <Row label="Glass Value" value={money(totals.totalGlassValue)} />
              <div className="flex items-center justify-between gap-2 text-slate-500">
                <span>Van Fair</span>
                <input
                  type="number" min={0} step="0.01" value={vanFair}
                  onChange={(e) => setVanFair(e.target.value ? Number(e.target.value) : '')}
                  className="w-28 text-sm rounded border border-slate-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                />
              </div>
              <div className="flex justify-between font-bold text-brand-900 border-t border-slate-200 pt-1.5 mt-1.5">
                <span>Total Bill Amount</span><span>{money(totals.totalBillAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
            <Save size={16} /> {isLoading ? 'Saving…' : 'Save Cutting'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
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
