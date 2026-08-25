import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Printer, ArrowLeft, Pencil, X, Plus, Trash2 } from 'lucide-react'
import { useGetPurchaseInvoiceQuery, useUpdatePurchaseInvoiceMutation, useListEwayBillsQuery } from './purchaseApi'
import { useListProductsQuery } from '../masters/mastersApi'
import Logo from '../../components/Logo'
import type { CreatePurchaseInvoiceLineRequest, CreatePurchaseInvoiceChargeRequest } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
/** Area carries up to 9 decimal places (DB: DECIMAL(18,9)) — a plain quantity, not currency, so it
 * gets its own formatter rather than money()'s fixed 2 decimals. */
function areaFmt(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 9 }).format(n)
}
/** Rate carries up to 5 decimal places (DB: DECIMAL(18,5)). */
function rateFmt(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(n)
}

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

/** Same shape for Local and Inter-State — mirrors PurchaseController.PriceInsertLinesAndMoveStock
 * exactly, for a live client-side preview while editing. */
function priceLine(line: LineRow) {
  const basic = (line.area || 0) * (line.rate || 0)
  const holesAmount = (line.holesQty || 0) * (line.holesRate || 0)
  const cutoutAmount = (line.cutoutQty || 0) * (line.cutoutRate || 0)
  return { basic, holesAmount, cutoutAmount, lineTotal: basic + holesAmount + cutoutAmount }
}

/** Purchase Invoice — entered directly from the supplier's paper tax invoice, stock added on save.
 * Editing the lines reverses the stock this invoice added and re-applies it for the new lines
 * (refused if any of it has already moved on elsewhere) — the Local/Inter-State mode itself is
 * fixed and can't be changed here, only which tax split it drives. */
export default function PurchaseInvoiceViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: pi, isLoading } = useGetPurchaseInvoiceQuery(Number(id))
  const [updateInvoice, { isLoading: saving }] = useUpdatePurchaseInvoiceMutation()
  const { data: products } = useListProductsQuery()
  // This invoice's own supplier's e-Way Bills — including the one already linked to it (which is
  // otherwise "used" and would be hidden by an availableOnly filter).
  const { data: ewayBills } = useListEwayBillsQuery(pi ? { supplierId: pi.supplierId } : undefined, { skip: !pi })
  const selectableEwayBills = ewayBills?.items.filter((eb) => !eb.isUsed || eb.ewayBillId === pi?.ewayBillId) ?? []

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<{ supplierInvoiceNo: string; ewayBillId: number | ''; invoiceDate: string; gstPct: number | '' }>({ supplierInvoiceNo: '', ewayBillId: '', invoiceDate: '', gstPct: '' })
  const [roundOffEnabled, setRoundOffEnabled] = useState(true)
  const [lines, setLines] = useState<LineRow[]>([])
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [error, setError] = useState<string | null>(null)

  function openEdit() {
    if (!pi) return
    setForm({
      supplierInvoiceNo: pi.supplierInvoiceNo ?? '',
      ewayBillId: pi.ewayBillId ?? '',
      invoiceDate: pi.invoiceDate.slice(0, 10),
      gstPct: pi.gstPct ?? 18,
    })
    setRoundOffEnabled(pi.roundOffEnabled)
    setLines(pi.lines.map((l) => ({
      key: crypto.randomUUID(), productId: l.productId, description: l.description ?? undefined,
      qty: l.qty, area: l.area, rate: l.rate,
      holesQty: l.holesQty ?? undefined, holesRate: l.holesRate ?? undefined,
      cutoutQty: l.cutoutQty ?? undefined, cutoutRate: l.cutoutRate ?? undefined,
    })))
    setCharges(pi.charges.map((c) => ({ key: crypto.randomUUID(), label: c.label, basis: c.basis, value: c.value })))
    setError(null)
    setEditing(true)
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!pi) return

    const validLines = lines.filter((l) => l.productId && l.area > 0 && l.rate > 0)
    if (validLines.length === 0) { setError('Add at least one valid line item — Product, Area and Rate are required.'); return }
    const invalidCharge = charges.find((c) => !c.label.trim())
    if (invalidCharge) { setError('Every charge needs a label.'); return }

    try {
      await updateInvoice({
        id: Number(id),
        body: {
          supplierInvoiceNo: form.supplierInvoiceNo || undefined,
          ewayBillId: form.ewayBillId ? Number(form.ewayBillId) : undefined,
          clearEwayBill: !form.ewayBillId,
          invoiceDate: form.invoiceDate,
          gstPct: Number(form.gstPct) || 0,
          charges: charges.map((c) => ({ label: c.label, basis: c.basis, value: c.value || 0 })),
          lines: validLines.map((l) => ({
            productId: l.productId, description: l.description, qty: l.qty, area: l.area, rate: l.rate,
            holesQty: l.holesQty, holesRate: l.holesRate, cutoutQty: l.cutoutQty, cutoutRate: l.cutoutRate,
          })),
          roundOffEnabled,
        },
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
        <form onSubmit={handleSubmit} className="no-print bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4 space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier Invoice No.</label>
              <input value={form.supplierInvoiceNo} onChange={(e) => setForm((f) => ({ ...f, supplierInvoiceNo: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">e-Way Bill No.</label>
              <select value={form.ewayBillId} onChange={(e) => setForm((f) => ({ ...f, ewayBillId: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}>
                <option value="">No e-Way Bill</option>
                {selectableEwayBills.map((eb) => <option key={eb.ewayBillId} value={eb.ewayBillId}>{eb.ewayBillNo} {eb.vehicleNo ? `— ${eb.vehicleNo}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Invoice Date *</label>
              <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">GST % *</label>
              <input type="number" required min={0} step="0.01" value={form.gstPct} onChange={(e) => setForm((f) => ({ ...f, gstPct: e.target.value ? Number(e.target.value) : '' }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rounding</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer h-[42px]">
                <input type="checkbox" checked={roundOffEnabled} onChange={(e) => setRoundOffEnabled(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                Round off to nearest ₹1
              </label>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
              <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Plus size={15} /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-medium min-w-[200px]">Product</th>
                    <th className="px-4 py-2.5 font-medium w-24">Qty</th>
                    <th className="px-4 py-2.5 font-medium w-40">Area (sqm)</th>
                    <th className="px-4 py-2.5 font-medium w-40">Rate</th>
                    <th className="px-4 py-2.5 font-medium w-32">Holes Qty</th>
                    <th className="px-4 py-2.5 font-medium w-24">Holes Rate</th>
                    <th className="px-4 py-2.5 font-medium w-32">Cutout Qty</th>
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
                        <td className="px-4 py-2"><input type="number" min={0} step="0.001" value={line.qty ?? ''} onChange={(e) => updateLine(line.key, { qty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} step="0.000000001" value={line.area || ''} onChange={(e) => updateLine(line.key, { area: Number(e.target.value) })} className={inputClass} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} step="0.00001" value={line.rate || ''} onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })} className={inputClass} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.holesQty ?? ''} onChange={(e) => updateLine(line.key, { holesQty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.holesRate ?? ''} onChange={(e) => updateLine(line.key, { holesRate: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
                        <td className="px-4 py-2"><input type="number" min={0} step="0.01" value={line.cutoutQty ?? ''} onChange={(e) => updateLine(line.key, { cutoutQty: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} /></td>
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

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Charges</h3>
              <button type="button" onClick={addCharge} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
                <Plus size={15} /> Add Charge
              </button>
            </div>
            {charges.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2.5 font-medium min-w-[200px]">Label</th>
                      <th className="px-4 py-2.5 font-medium w-32">Basis</th>
                      <th className="px-4 py-2.5 font-medium w-28">Value</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {charges.map((c) => (
                      <tr key={c.key}>
                        <td className="px-4 py-2"><input value={c.label} onChange={(e) => updateCharge(c.key, { label: e.target.value })} className={inputClass} placeholder="e.g. Admin Charge" /></td>
                        <td className="px-4 py-2">
                          <select value={c.basis} onChange={(e) => updateCharge(c.key, { basis: e.target.value as 'Percent' | 'Flat' })} className={inputClass}>
                            <option value="Flat">Flat ₹</option>
                            <option value="Percent">% of running total</option>
                          </select>
                        </td>
                        <td className="px-4 py-2"><input type="number" step="0.01" value={c.value || ''} onChange={(e) => updateCharge(c.key, { value: Number(e.target.value) })} className={inputClass} /></td>
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
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end">
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
          <Detail label="e-Way Bill No." value={pi.ewayBillNo ?? '—'} />
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
                <th className="py-2 font-medium text-right">Qty</th>
                <th className="py-2 font-medium text-right">Area (sqm)</th>
                <th className="py-2 font-medium text-right">Rate</th>
                <th className="py-2 font-medium text-right">Holes</th>
                <th className="py-2 font-medium text-right">Cutout</th>
                <th className="py-2 font-medium text-right">Basic Value</th>
                {pi.chargesTotal > 0 && <th className="py-2 font-medium text-right print:hidden">Charges</th>}
                <th className="py-2 font-medium text-right print:hidden">{pi.isInterState ? 'IGST' : 'CGST+SGST'}</th>
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
                  <td className="py-2.5 text-right">{l.qty || '—'}</td>
                  <td className="py-2.5 text-right">{areaFmt(l.area)}</td>
                  <td className="py-2.5 text-right">{rateFmt(l.rate)}</td>
                  <td className="py-2.5 text-right">{l.holesAmount > 0 ? money(l.holesAmount) : '—'}</td>
                  <td className="py-2.5 text-right">{l.cutoutAmount > 0 ? money(l.cutoutAmount) : '—'}</td>
                  <td className="py-2.5 text-right">{money(l.basicValue)}</td>
                  {pi.chargesTotal > 0 && <td className="py-2.5 text-right text-slate-500 print:hidden">{money(l.taxableValue - l.basicValue - l.holesAmount - l.cutoutAmount)}</td>}
                  <td className="py-2.5 text-right text-slate-500 print:hidden">{money(pi.isInterState ? l.igstAmount : l.cgstAmount + l.sgstAmount)}</td>
                  <td className="py-2.5 text-right font-medium">{money(l.netValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1.5 text-sm">
            <Row label="Basic Amount" value={money(pi.basicValue)} />
            {pi.charges.map((c, i) => <Row key={i} label={c.label} value={money(c.amount)} />)}
            <Row label="Assessable Value" value={money(pi.taxableValue)} />
            {pi.cgstValue > 0 && <Row label="CGST" value={money(pi.cgstValue)} />}
            {pi.sgstValue > 0 && <Row label="SGST" value={money(pi.sgstValue)} />}
            {pi.igstValue > 0 && <Row label="IGST" value={money(pi.igstValue)} />}
            {pi.roundOffEnabled && <Row label="Round Off" value={money(pi.roundOff)} />}
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
