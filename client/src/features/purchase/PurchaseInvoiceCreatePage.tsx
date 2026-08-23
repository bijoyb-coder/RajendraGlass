import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Trash2, Save } from 'lucide-react'
import { useListProductsQuery } from '../masters/mastersApi'
import { useListSuppliersQuery, useListPurchaseOrdersQuery, useListGrnsQuery, useListEwayBillsQuery, useCreatePurchaseInvoiceMutation } from './purchaseApi'
import type { CreatePurchaseInvoiceLineRequest, CreatePurchaseInvoiceChargeRequest } from '../../lib/types'

interface LineRow extends CreatePurchaseInvoiceLineRequest {
  key: string
}
interface ChargeRow extends CreatePurchaseInvoiceChargeRequest {
  key: string
}

function emptyLine(): LineRow {
  return { key: crypto.randomUUID(), productId: 0, area: 0, rate: 0 }
}
function emptyCharge(): ChargeRow {
  return { key: crypto.randomUUID(), label: '', basis: 'Flat', value: 0 }
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/** Same shape for Local and Inter-State — Area is typed straight off the paper, BasicValue =
 * Area x Rate, plus optional per-piece Holes/Cutout charges. Mirrors
 * PurchaseController.PriceInsertLinesAndMoveStock exactly, for a live client-side preview. */
function priceLine(line: LineRow) {
  const basic = (line.area || 0) * (line.rate || 0)
  const holesAmount = (line.holesQty || 0) * (line.holesRate || 0)
  const cutoutAmount = (line.cutoutQty || 0) * (line.cutoutRate || 0)
  const lineTotal = basic + holesAmount + cutoutAmount
  return { basic, holesAmount, cutoutAmount, lineTotal }
}

/** Mirrors PurchaseController.ApplyChargesAndTax's sequential-charge algorithm exactly: each
 * 'Percent' charge is computed against the running subtotal at that point (Basic Amount plus every
 * charge entered before it), not the raw Basic Amount — matching how real supplier invoices
 * (Dhandhania Industries) actually cascade Admin Charge → Installation → Freight → Insurance. */
function computeTotals(lines: LineRow[], charges: ChargeRow[], gstPct: number, isInterState: boolean) {
  const basicAmountTotal = lines.reduce((sum, l) => sum + priceLine(l).lineTotal, 0)
  let runningSubtotal = basicAmountTotal
  const chargeAmounts = charges.map((c) => {
    const amount = c.basis === 'Percent' ? Math.round(runningSubtotal * (c.value || 0) / 100 * 100) / 100 : (c.value || 0)
    runningSubtotal += amount
    return amount
  })
  const chargesTotal = runningSubtotal - basicAmountTotal
  const assessableValue = runningSubtotal
  const tax = Math.round(assessableValue * (gstPct || 0) / 100 * 100) / 100
  const cgst = isInterState ? 0 : Math.round(tax / 2 * 100) / 100
  const sgst = isInterState ? 0 : tax - cgst
  const igst = isInterState ? tax : 0
  const totalBeforeRound = assessableValue + tax
  const total = Math.round(totalBeforeRound)
  const roundOff = total - totalBeforeRound
  return { basicAmountTotal, chargeAmounts, chargesTotal, assessableValue, cgst, sgst, igst, roundOff, total }
}

export default function PurchaseInvoiceCreatePage() {
  const navigate = useNavigate()
  const { data: suppliers } = useListSuppliersQuery()
  const { data: purchaseOrders } = useListPurchaseOrdersQuery()
  const { data: grns } = useListGrnsQuery()
  const { data: products } = useListProductsQuery()
  const [createPurchaseInvoice, { isLoading }] = useCreatePurchaseInvoiceMutation()

  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [purchaseOrderId, setPurchaseOrderId] = useState<number | ''>('')
  const [grnId, setGrnId] = useState<number | ''>('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [ewayBillId, setEwayBillId] = useState<number | ''>('')
  // Only entries for the chosen supplier, not already linked to another invoice.
  const { data: ewayBills } = useListEwayBillsQuery(supplierId ? { supplierId: Number(supplierId), availableOnly: true } : { availableOnly: true })
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isInterState, setIsInterState] = useState(false) // Local is the default — drives only the header CGST+SGST-vs-IGST split
  const [gstPct, setGstPct] = useState<number | ''>(18)
  const [error, setError] = useState<string | null>(null)

  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [charges, setCharges] = useState<ChargeRow[]>([])

  function addLine() { setLines((prev) => [...prev, emptyLine()]) }
  function removeLine(key: string) { setLines((prev) => prev.filter((l) => l.key !== key)) }
  function updateLine(key: string, patch: Partial<LineRow>) { setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  function addCharge() { setCharges((prev) => [...prev, emptyCharge()]) }
  function removeCharge(key: string) { setCharges((prev) => prev.filter((c) => c.key !== key)) }
  function updateCharge(key: string, patch: Partial<ChargeRow>) { setCharges((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c))) }

  function onProductChange(key: string, productId: number) {
    const product = products?.items.find((p) => p.productId === productId)
    updateLine(key, { productId, rate: product?.purchaseRate ?? 0 })
  }

  const totals = useMemo(() => computeTotals(lines, charges, Number(gstPct) || 0, isInterState), [lines, charges, gstPct, isInterState])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supplierId) { setError('Please select a supplier.'); return }

    const validLines = lines.filter((l) => l.productId && l.area > 0 && l.rate > 0)
    if (validLines.length === 0) { setError('Add at least one valid line item — Product, Area and Rate are required.'); return }
    const invalidCharge = charges.find((c) => !c.label.trim())
    if (invalidCharge) { setError('Every charge needs a label.'); return }

    try {
      const result = await createPurchaseInvoice({
        supplierId: Number(supplierId),
        isInterState,
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
        grnId: grnId ? Number(grnId) : undefined,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        ewayBillId: ewayBillId ? Number(ewayBillId) : undefined,
        invoiceDate,
        gstPct: Number(gstPct) || 0,
        charges: charges.map((c) => ({ label: c.label, basis: c.basis, value: c.value || 0 })),
        lines: validLines.map((l) => ({
          productId: l.productId, description: l.description, qty: l.qty, area: l.area, rate: l.rate,
          holesQty: l.holesQty, holesRate: l.holesRate, cutoutQty: l.cutoutQty, cutoutRate: l.cutoutRate,
        })),
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
              <select required value={supplierId} onChange={(e) => { setSupplierId(e.target.value ? Number(e.target.value) : ''); setEwayBillId('') }} className={inputClass}>
                <option value="">Select supplier…</option>
                {suppliers?.items.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Supplier Invoice No.">
              <input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} className={inputClass} />
            </Field>
            <Field label="e-Way Bill No.">
              <select value={ewayBillId} onChange={(e) => setEwayBillId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">No e-Way Bill</option>
                {ewayBills?.items.map((eb) => <option key={eb.ewayBillId} value={eb.ewayBillId}>{eb.ewayBillNo} {eb.vehicleNo ? `— ${eb.vehicleNo}` : ''}</option>)}
              </select>
              <Link to="/purchase/eway-bills" target="_blank" className="text-xs text-brand-600 hover:text-brand-700 mt-1 inline-block">+ Enter a new e-Way Bill</Link>
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
            <Field label="GST % *">
              <input type="number" required min={0} step="0.01" value={gstPct} onChange={(e) => setGstPct(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
            </Field>
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
                  <th className="px-4 py-2.5 font-medium w-20">Qty</th>
                  <th className="px-4 py-2.5 font-medium w-24">Area (sqm)</th>
                  <th className="px-4 py-2.5 font-medium w-24">Rate</th>
                  <th className="px-4 py-2.5 font-medium w-20">Holes Qty</th>
                  <th className="px-4 py-2.5 font-medium w-24">Holes Rate</th>
                  <th className="px-4 py-2.5 font-medium w-20">Cutout Qty</th>
                  <th className="px-4 py-2.5 font-medium w-24">Cutout Rate</th>
                  <th className="px-4 py-2.5 font-medium w-32 text-right">Line Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const { lineTotal } = priceLine(line)
                  return (
                    <tr key={line.key}>
                      <td className="px-4 py-2">
                        <select value={line.productId || ''} onChange={(e) => onProductChange(line.key, Number(e.target.value))} className={inputClass}>
                          <option value="">Select product…</option>
                          {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2"><input type="number" min={0} step="1" value={line.qty ?? ''} onChange={(e) => updateLine(line.key, { qty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="0.001" value={line.area || ''} onChange={(e) => updateLine(line.key, { area: Number(e.target.value) })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.rate || ''} onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="1" value={line.holesQty ?? ''} onChange={(e) => updateLine(line.key, { holesQty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.holesRate ?? ''} onChange={(e) => updateLine(line.key, { holesRate: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="1" value={line.cutoutQty ?? ''} onChange={(e) => updateLine(line.key, { cutoutQty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                      <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.cutoutRate ?? ''} onChange={(e) => updateLine(line.key, { cutoutRate: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(lineTotal)}</td>
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
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Charges</h2>
            <button type="button" onClick={addCharge} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
              <Plus size={15} /> Add Charge
            </button>
          </div>
          {charges.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">No charges — Admin Charge, Insurance, Freight, Energy, etc. can be added here, each as a % of the running total so far or a flat amount.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-medium min-w-[200px]">Label</th>
                    <th className="px-4 py-2.5 font-medium w-32">Basis</th>
                    <th className="px-4 py-2.5 font-medium w-28">Value</th>
                    <th className="px-4 py-2.5 font-medium w-32 text-right">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {charges.map((c, i) => (
                    <tr key={c.key}>
                      <td className="px-4 py-2"><input value={c.label} onChange={(e) => updateCharge(c.key, { label: e.target.value })} className={inputClass} placeholder="e.g. Admin Charge" /></td>
                      <td className="px-4 py-2">
                        <select value={c.basis} onChange={(e) => updateCharge(c.key, { basis: e.target.value as 'Percent' | 'Flat' })} className={inputClass}>
                          <option value="Flat">Flat ₹</option>
                          <option value="Percent">% of running total</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input type="number" step="0.01" value={c.value || ''} onChange={(e) => updateCharge(c.key, { value: Number(e.target.value) })} className={inputClass} /></td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(totals.chargeAmounts[i] ?? 0)}</td>
                      <td className="px-2">
                        <button type="button" onClick={() => removeCharge(c.key)} className="text-slate-400 hover:text-red-500 transition">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end px-5 py-4 border-t border-slate-100">
            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <Row label="Basic Amount" value={money(totals.basicAmountTotal)} />
              {charges.map((c, i) => <Row key={c.key} label={c.label || `Charge ${i + 1}`} value={money(totals.chargeAmounts[i] ?? 0)} />)}
              <Row label="Assessable Value" value={money(totals.assessableValue)} />
              {isInterState ? <Row label="IGST" value={money(totals.igst)} /> : (
                <>
                  <Row label="CGST" value={money(totals.cgst)} />
                  <Row label="SGST" value={money(totals.sgst)} />
                </>
              )}
              <Row label="Round Off" value={money(totals.roundOff)} />
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
