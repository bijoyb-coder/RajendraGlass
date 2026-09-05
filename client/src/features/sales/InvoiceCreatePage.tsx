import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Save } from 'lucide-react'
import { useListCustomersQuery, useListProductsQuery, useListTransportersQuery, useListVehiclesQuery } from '../masters/mastersApi'
import { useCreateInvoiceMutation } from './salesApi'
import type { CreateInvoiceLineRequest } from '../../lib/types'

interface LineRow extends CreateInvoiceLineRequest {
  key: string
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/** What's carried across the "+ Add New Product…" round trip to Product Master and back. */
interface InvoiceDraft {
  customerId: number | '';
  invoiceDate: string;
  customerOrderRef: string;
  transporterId: number | '';
  vehicleNo: string;
  destination: string;
  remarks: string;
  lines: LineRow[];
}

export default function InvoiceCreatePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: customers } = useListCustomersQuery()
  const { data: products } = useListProductsQuery()
  const { data: transporters } = useListTransportersQuery()
  const [createInvoice, { isLoading }] = useCreateInvoiceMutation()

  const [customerId, setCustomerId] = useState<number | ''>('')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [customerOrderRef, setCustomerOrderRef] = useState('')
  const [transporterId, setTransporterId] = useState<number | ''>('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [destination, setDestination] = useState('')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: vehicles } = useListVehiclesQuery(transporterId as number, { skip: !transporterId })

  const [lines, setLines] = useState<LineRow[]>([
    { key: crypto.randomUUID(), productId: 0, noOfSheets: undefined, quantity: 0, ratePerUnit: 0, discountValue: 0 },
  ])

  function addLine() {
    setLines((prev) => [...prev, { key: crypto.randomUUID(), productId: 0, noOfSheets: undefined, quantity: 0, ratePerUnit: 0, discountValue: 0 }])
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }
  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function onProductChange(key: string, productId: number) {
    const product = products?.items.find((p) => p.productId === productId)
    updateLine(key, { productId, ratePerUnit: product?.sellingRate ?? 0 })
  }

  // Coming back from Product Master after "+ Add New Product…" -- restore the form exactly as it
  // was, and drop the new product into whichever line sent us there (Cancel there carries the same
  // draft back with no newProductId, so the form still restores but nothing extra gets selected).
  useEffect(() => {
    const state = location.state as { restoreDraft?: InvoiceDraft; targetLineKey?: string; newProductId?: number } | null
    if (!state?.restoreDraft) return
    const draft = state.restoreDraft
    setCustomerId(draft.customerId)
    setInvoiceDate(draft.invoiceDate)
    setCustomerOrderRef(draft.customerOrderRef)
    setTransporterId(draft.transporterId)
    setVehicleNo(draft.vehicleNo)
    setDestination(draft.destination)
    setRemarks(draft.remarks)
    let restoredLines = draft.lines
    if (state.newProductId && state.targetLineKey) {
      const product = products?.items.find((p) => p.productId === state.newProductId)
      restoredLines = restoredLines.map((l) =>
        l.key === state.targetLineKey ? { ...l, productId: state.newProductId!, ratePerUnit: product?.sellingRate ?? l.ratePerUnit } : l,
      )
    }
    setLines(restoredLines)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  /** "+ Add New Product…" from a line's Product dropdown: stash the in-progress form and go to
   * Product Master. Saving there returns here with the same data restored and the new product
   * selected into the line that asked for it; cancelling there returns here with the same data
   * restored and nothing selected. Navigating to Product Master any other way (the main menu)
   * never carries this state, so it behaves exactly as it always has. */
  function handleAddNewProduct(lineKey: string) {
    const draft: InvoiceDraft = { customerId, invoiceDate, customerOrderRef, transporterId, vehicleNo, destination, remarks, lines }
    navigate('/masters/products', { state: { returnTo: 'salesInvoice', targetLineKey: lineKey, draft } })
  }

  const totals = useMemo(() => {
    let basic = 0, discount = 0, tax = 0
    for (const l of lines) {
      const product = products?.items.find((p) => p.productId === l.productId)
      const gst = product?.gstRatePct ?? 18
      const lineBasic = (l.quantity || 0) * (l.ratePerUnit || 0)
      const lineNet = lineBasic - (l.discountValue || 0)
      basic += lineBasic
      discount += l.discountValue || 0
      tax += (lineNet * gst) / 100
    }
    const taxable = basic - discount
    const total = Math.round(taxable + tax)
    return { basic, discount, taxable, tax, total }
  }, [lines, products])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerId) { setError('Please select a customer.'); return }
    const validLines = lines.filter((l) => l.productId && l.quantity > 0 && l.ratePerUnit > 0)
    if (validLines.length === 0) { setError('Add at least one valid line item.'); return }

    try {
      const result = await createInvoice({
        customerId: Number(customerId),
        invoiceDate,
        customerOrderRef: customerOrderRef || undefined,
        transporterId: transporterId ? Number(transporterId) : undefined,
        vehicleNo: vehicleNo || undefined,
        destination: destination || undefined,
        remarks: remarks || undefined,
        lines: validLines.map(({ productId, noOfSheets, quantity, ratePerUnit, discountValue }) => ({
          productId, noOfSheets: noOfSheets || undefined, quantity, ratePerUnit, discountValue: discountValue || 0,
        })),
      }).unwrap()
      navigate(`/sales/invoices/${result.invoiceId}`)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not create the invoice. Please check the details and try again.')
    }
  }

  return (
    <div className="max-w-5xl animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">New Sales Invoice</h1>
        <p className="text-sm text-slate-500 mt-1">Tax computed automatically from HSN and place of supply.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Customer *">
            <select required value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
              <option value="">Select customer…</option>
              {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice Date">
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Customer Order Ref.">
            <input value={customerOrderRef} onChange={(e) => setCustomerOrderRef(e.target.value)} className={inputClass} placeholder="OR-0000" />
          </Field>
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
          <Field label="Destination">
            <input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputClass} placeholder="Delivery city" />
          </Field>
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
                  <th className="px-4 py-2.5 font-medium min-w-[220px]">Product</th>
                  <th className="px-4 py-2.5 font-medium w-24">Sheets</th>
                  <th className="px-4 py-2.5 font-medium w-32">Qty (sqm/sqft)</th>
                  <th className="px-4 py-2.5 font-medium w-32">Rate</th>
                  <th className="px-4 py-2.5 font-medium w-28">Discount</th>
                  <th className="px-4 py-2.5 font-medium w-32 text-right">Net Value</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line) => {
                  const net = (line.quantity || 0) * (line.ratePerUnit || 0) - (line.discountValue || 0)
                  return (
                    <tr key={line.key}>
                      <td className="px-4 py-2">
                        <select
                          value={line.productId || ''}
                          onChange={(e) => {
                            if (e.target.value === '__new__') { handleAddNewProduct(line.key); return }
                            onProductChange(line.key, Number(e.target.value))
                          }}
                          className={inputClass}
                        >
                          <option value="">Select product…</option>
                          {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
                          <option value="__new__">+ Add New Product…</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} step="0.01" value={line.noOfSheets ?? ''} onChange={(e) => updateLine(line.key, { noOfSheets: e.target.value ? Number(e.target.value) : undefined })} className={inputClass} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} step="0.001" value={line.quantity || ''} onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })} className={inputClass} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} step="0.01" value={line.ratePerUnit || ''} onChange={(e) => updateLine(line.key, { ratePerUnit: Number(e.target.value) })} className={inputClass} />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min={0} step="0.01" value={line.discountValue || ''} onChange={(e) => updateLine(line.key, { discountValue: Number(e.target.value) })} className={inputClass} />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(net)}</td>
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

          <div className="flex flex-col sm:flex-row justify-between gap-4 px-5 py-4 border-t border-slate-100">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={inputClass} />
            </div>
            <div className="w-full sm:w-64 space-y-1.5 text-sm">
              <Row label="Basic Value" value={money(totals.basic)} />
              <Row label="Discount" value={`− ${money(totals.discount)}`} />
              <Row label="Taxable Value" value={money(totals.taxable)} />
              <Row label="GST" value={money(totals.tax)} />
              <div className="flex justify-between font-bold text-brand-900 border-t border-slate-200 pt-1.5 mt-1.5">
                <span>Total</span><span>{money(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}

        <div className="flex justify-end gap-3">
          <button type="submit" disabled={isLoading} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
            <Save size={16} /> {isLoading ? 'Saving…' : 'Save Invoice'}
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
