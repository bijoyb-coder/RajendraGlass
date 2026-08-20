import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Save } from 'lucide-react'
import { useListProductsQuery } from '../masters/mastersApi'
import { useListGodownsQuery } from '../inventory/inventoryApi'
import { useListSuppliersQuery, useListPurchaseOrdersQuery, useListGrnsQuery, useCreatePurchaseInvoiceMutation } from './purchaseApi'
import type { CreatePurchaseInvoiceLineRequest } from '../../lib/types'

interface LineRow extends CreatePurchaseInvoiceLineRequest {
  key: string
}

function emptyLine(): LineRow {
  return { key: crypto.randomUUID(), productId: 0, rate: 0 }
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/** Mirrors QuotationCalculator's Sheet3 metre convention (server/Data/QuotationCalculator.cs) —
 * rate x thickness gives the effective per-sqm rate, exactly the "per MM" pricing an Inter-State
 * supplier invoice quotes. Local lines are the plain qty x rate a Local invoice states directly. */
function priceLine(line: LineRow, isInterState: boolean, gstPct: number) {
  let area: number, basic: number
  if (isInterState) {
    const t = line.thicknessMm || 0, w = line.widthCm || 0, l = line.lengthCm || 0
    const crates = line.noOfCrates || 0, sheets = line.sheetsPerCrate || 0
    const qty = crates * sheets
    const perPieceArea = (l / 100) * (w / 100)
    area = perPieceArea * qty
    basic = area * t * (line.rate || 0)
  } else {
    area = line.qty || 0
    basic = area * (line.rate || 0)
  }
  const tax = (basic * gstPct) / 100
  return { area, basic, tax }
}

export default function PurchaseInvoiceCreatePage() {
  const navigate = useNavigate()
  const { data: suppliers } = useListSuppliersQuery()
  const { data: godowns } = useListGodownsQuery()
  const { data: purchaseOrders } = useListPurchaseOrdersQuery()
  const { data: grns } = useListGrnsQuery()
  const { data: products } = useListProductsQuery()
  const [createPurchaseInvoice, { isLoading }] = useCreatePurchaseInvoiceMutation()

  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [godownId, setGodownId] = useState<number | ''>('')
  const [purchaseOrderId, setPurchaseOrderId] = useState<number | ''>('')
  const [grnId, setGrnId] = useState<number | ''>('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isInterState, setIsInterState] = useState(false) // Local is the default
  const [insurancePct, setInsurancePct] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  const [lines, setLines] = useState<LineRow[]>([emptyLine()])

  function addLine() { setLines((prev) => [...prev, emptyLine()]) }
  function removeLine(key: string) { setLines((prev) => prev.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<LineRow>) { setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  function onProductChange(key: string, productId: number) {
    const product = products?.items.find((p) => p.productId === productId)
    updateLine(key, { productId, rate: product?.purchaseRate ?? 0 })
  }

  function gstFor(line: LineRow) {
    return line.gstPct ?? products?.items.find((p) => p.productId === line.productId)?.gstRatePct ?? 18
  }

  const totals = useMemo(() => {
    let basic = 0, tax = 0
    for (const l of lines) {
      const p = priceLine(l, isInterState, gstFor(l))
      basic += p.basic
      tax += p.tax
    }
    const insurance = isInterState && insurancePct ? (basic * Number(insurancePct)) / 100 : 0
    const taxable = basic + insurance
    const total = Math.round(taxable + tax)
    return { basic, insurance, taxable, tax, total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, isInterState, insurancePct, products])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supplierId) { setError('Please select a supplier.'); return }
    if (!godownId) { setError('Please select a godown to receive the stock into.'); return }

    const validLines = lines.filter((l) => l.productId && l.rate > 0 && (isInterState
      ? l.thicknessMm && l.widthCm && l.lengthCm && l.noOfCrates && l.sheetsPerCrate
      : l.qty && l.qty > 0))
    if (validLines.length === 0) { setError('Add at least one valid line item — every field for the selected type is required.'); return }

    try {
      const result = await createPurchaseInvoice({
        supplierId: Number(supplierId),
        godownId: Number(godownId),
        isInterState,
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
        grnId: grnId ? Number(grnId) : undefined,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        invoiceDate,
        insurancePct: isInterState && insurancePct ? Number(insurancePct) : undefined,
        lines: validLines.map((l) => (isInterState
          ? { productId: l.productId, description: l.description, thicknessMm: l.thicknessMm, widthCm: l.widthCm, lengthCm: l.lengthCm, noOfCrates: l.noOfCrates, sheetsPerCrate: l.sheetsPerCrate, rate: l.rate, gstPct: l.gstPct }
          : { productId: l.productId, description: l.description, qty: l.qty, rate: l.rate, gstPct: l.gstPct })),
      }).unwrap()
      navigate(`/purchase/invoices/${result.purchaseInvoiceId}`)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not create the purchase invoice. Please check the details and try again.')
    }
  }

  return (
    <div className="max-w-6xl animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">New Purchase Invoice</h1>
        <p className="text-sm text-slate-500 mt-1">Entered directly from the supplier's tax invoice — stock is added on save.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" checked={!isInterState} onChange={() => setIsInterState(false)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
              Local (CGST + SGST)
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input type="checkbox" checked={isInterState} onChange={() => setIsInterState(true)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
              Inter-State (IGST)
            </label>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Supplier *">
              <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select supplier…</option>
                {suppliers?.items.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Godown *">
              <select required value={godownId} onChange={(e) => setGodownId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select godown…</option>
                {godowns?.items.map((g) => <option key={g.godownId} value={g.godownId}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Supplier Invoice No.">
              <input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Invoice Date">
              <input type="date" max={new Date().toISOString().slice(0, 10)} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Purchase Order (optional reference)">
              <select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Not linked to a PO</option>
                {purchaseOrders?.items.map((po) => <option key={po.purchaseOrderId} value={po.purchaseOrderId}>{po.poNo} — {po.supplierName}</option>)}
              </select>
            </Field>
            <Field label="GRN (optional reference)">
              <select value={grnId} onChange={(e) => setGrnId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Not linked to a GRN</option>
                {grns?.items.map((g) => <option key={g.grnId} value={g.grnId}>{g.grnNo} — {g.supplierName}</option>)}
              </select>
            </Field>
            {isInterState && (
              <Field label="Insurance %">
                <input type="number" min={0} step="0.001" value={insurancePct} onChange={(e) => setInsurancePct(e.target.value ? Number(e.target.value) : '')} className={inputClass} placeholder="e.g. 0.323" />
              </Field>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Line Items</h2>
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
              <Plus size={15} /> Add Line
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium min-w-[200px]">Product</th>
                  {isInterState ? (
                    <>
                      <th className="px-4 py-2.5 font-medium w-24">Thick (mm)</th>
                      <th className="px-4 py-2.5 font-medium w-24">Width (cm)</th>
                      <th className="px-4 py-2.5 font-medium w-24">Length (cm)</th>
                      <th className="px-4 py-2.5 font-medium w-24">No. Crates</th>
                      <th className="px-4 py-2.5 font-medium w-24">Sheets/Crate</th>
                      <th className="px-4 py-2.5 font-medium w-28">Rate (per mm)</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2.5 font-medium w-32">Qty (sqm)</th>
                      <th className="px-4 py-2.5 font-medium w-28">Rate</th>
                    </>
                  )}
                  <th className="px-4 py-2.5 font-medium w-32 text-right">Value</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const { basic } = priceLine(line, isInterState, gstFor(line))
                  return (
                    <tr key={line.key}>
                      <td className="px-4 py-2">
                        <select value={line.productId || ''} onChange={(e) => onProductChange(line.key, Number(e.target.value))} className={inputClass}>
                          <option value="">Select product…</option>
                          {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
                        </select>
                      </td>
                      {isInterState ? (
                        <>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.thicknessMm ?? ''} onChange={(e) => updateLine(line.key, { thicknessMm: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.widthCm ?? ''} onChange={(e) => updateLine(line.key, { widthCm: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.lengthCm ?? ''} onChange={(e) => updateLine(line.key, { lengthCm: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="1" value={line.noOfCrates ?? ''} onChange={(e) => updateLine(line.key, { noOfCrates: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="1" value={line.sheetsPerCrate ?? ''} onChange={(e) => updateLine(line.key, { sheetsPerCrate: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.rate || ''} onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })} className={inputClass} /></td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.0001" value={line.qty ?? ''} onChange={(e) => updateLine(line.key, { qty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                          <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.rate || ''} onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })} className={inputClass} /></td>
                        </>
                      )}
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(basic)}</td>
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

          <div className="flex justify-end px-5 py-4 border-t border-slate-100">
            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <Row label="Basic Value" value={money(totals.basic)} />
              {isInterState && <Row label="Insurance" value={money(totals.insurance)} />}
              <Row label="Taxable Value" value={money(totals.taxable)} />
              <Row label={isInterState ? 'IGST' : 'CGST + SGST'} value={money(totals.tax)} />
              <div className="flex justify-between font-bold text-brand-900 border-t border-slate-200 pt-1.5 mt-1.5">
                <span>Total</span><span>{money(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

        <div className="flex justify-end gap-3">
          <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
            <Save size={16} /> {isLoading ? 'Saving…' : 'Save Purchase Invoice'}
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
