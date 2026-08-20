import { useParams, useNavigate } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { useGetQuotationQuery } from './salesExtraApi'
import { useGetCompanyQuery } from '../masters/mastersApi'
import Logo from '../../components/Logo'
import { CALC_METHOD_LABEL, RATE_UNIT_LABEL } from '../../lib/quotationCalc'
import type { QuotationLineDto } from '../../lib/types'

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function num(n: number | null | undefined, dp: number) {
  return n == null ? '—' : n.toFixed(dp)
}

/** Chargeable size, shown only when the line was actually rounded up. */
function chargeNote(l: QuotationLineDto) {
  if (!l.chargeRoundingInch || l.chargeRoundingInch <= 0) return null
  return `${l.chargeLengthInch.toFixed(2)}" × ${l.chargeWidthInch.toFixed(2)}"`
}

export default function QuotationViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: q, isLoading } = useGetQuotationQuery(Number(id))
  const { data: company } = useGetCompanyQuery()

  if (isLoading || !q) {
    return <div className="text-center py-20 text-slate-400">Loading quotation…</div>
  }

  // Summed from the stored per-line figures, which the server produced with the one
  // calculation engine — the print can never disagree with the saved quotation. The Grand Total
  // itself, though, comes from q.totalValue (already rounded to the nearest rupee server-side),
  // not this raw line sum — q.roundOff is exactly the gap between the two.
  const basic = q.lines.reduce((s, l) => s + l.basicAmount, 0)
  const discount = q.lines.reduce((s, l) => s + l.discountAmount, 0)
  const gst = q.lines.reduce((s, l) => s + l.gstAmount, 0)
  const anyOverride = q.lines.some((l) => l.isAreaManualOverride || l.isAmountManualOverride)

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4 no-print">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Back
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition">
          <Printer size={15} /> Print
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between border-b-2 border-brand-800 pb-4 mb-4">
          <Logo variant="dark" size="md" showTagline />
          <div className="text-right">
            <h2 className="text-lg font-bold text-brand-900">QUOTATION</h2>
            <p className="text-xs text-slate-500">This is a quotation, not a tax invoice.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">From</p>
            <p className="font-semibold text-slate-800">{company?.legalName}</p>
            <p className="text-slate-500">{company?.businessAddress}</p>
            <p className="text-slate-500">GSTIN: {company?.gstin} &nbsp; PAN: {company?.pan}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Quotation For</p>
            <p className="font-semibold text-slate-800">
              {q.customerName}
              {q.customerType && (
                <span className="ml-2 align-middle inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ring-brand-200 text-brand-700 bg-brand-50">
                  {q.customerType}
                </span>
              )}
            </p>
            <p className="text-slate-500">{q.customerAddress ?? '—'}</p>
            <p className="text-slate-500">GSTIN: {q.customerGstin ?? '—'}</p>
            {q.customerMobile && <p className="text-slate-500">Mobile: {q.customerMobile}</p>}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-xs bg-slate-50 rounded-lg p-4 mb-6">
          <Detail label="Quotation No." value={q.quotationNo ?? '—'} />
          <Detail label="Date" value={new Date(q.quotationDate).toLocaleDateString('en-IN')} />
          <Detail label="Valid Until" value={q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : '—'} />
          <Detail label="Status" value={q.status} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="py-2 font-medium">Product / Description</th>
                <th className="py-2 font-medium text-right">Thick.<br /><span className="normal-case font-normal">(mm)</span></th>
                <th className="py-2 font-medium text-right">Length</th>
                <th className="py-2 font-medium text-right">Width</th>
                <th className="py-2 font-medium">Unit</th>
                <th className="py-2 font-medium text-right">Qty</th>
                <th className="py-2 font-medium text-right">Area</th>
                <th className="py-2 font-medium text-right">Rate</th>
                <th className="py-2 font-medium text-right">Basic</th>
                <th className="py-2 font-medium text-right">GST</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.lines.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-800">
                      {l.description || l.productDescription || l.productCode || '—'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {l.productCode ? `${l.productCode} · ` : ''}
                      {CALC_METHOD_LABEL[l.calculationMethod] ?? l.calculationMethod}
                      {chargeNote(l) ? ` · chargeable ${chargeNote(l)}` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{num(l.thicknessMm, 2)}</td>
                  <td className="py-2.5 text-right text-slate-700">{l.rateUnit === 'PER_PIECE' ? '—' : num(l.length, 4)}</td>
                  <td className="py-2.5 text-right text-slate-700">{l.rateUnit === 'PER_PIECE' ? '—' : num(l.width, 4)}</td>
                  <td className="py-2.5 text-slate-500">{l.rateUnit === 'PER_PIECE' ? '—' : l.dimensionUnit}</td>
                  <td className="py-2.5 text-right text-slate-700">{num(l.qty, 2)}</td>
                  <td className="py-2.5 text-right text-slate-700">
                    {l.rateUnit === 'PER_PIECE' ? '—' : num(l.area, 4)}
                    {l.rateUnit !== 'PER_PIECE' && (
                      <div className="text-[11px] text-slate-400">
                        {l.areaUnit}{l.isAreaManualOverride ? ' · manual' : ''}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-slate-700">
                    {money(l.rate)}
                    <div className="text-[11px] text-slate-400">{RATE_UNIT_LABEL[l.rateUnit] ?? l.rateUnit}</div>
                  </td>
                  <td className="py-2.5 text-right text-slate-700">
                    {money(l.basicAmount)}
                    {l.isAmountManualOverride && <div className="text-[11px] text-amber-600">manual</div>}
                    {l.discountAmount > 0 && <div className="text-[11px] text-slate-400">− {money(l.discountAmount)} disc</div>}
                  </td>
                  <td className="py-2.5 text-right text-slate-700">
                    {money(l.gstAmount)}
                    <div className="text-[11px] text-slate-400">@ {num(l.gstPct, 0)}%</div>
                  </td>
                  <td className="py-2.5 text-right font-medium text-slate-800">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1.5 text-sm">
            <Row label="Basic Amount" value={money(basic)} />
            {discount > 0 && <Row label="Discount" value={`− ${money(discount)}`} />}
            <Row label="GST" value={money(gst)} />
            <Row label="Round Off" value={money(q.roundOff)} />
            <div className="flex justify-between font-bold text-brand-900 border-t-2 border-brand-800 pt-2 mt-2 text-base">
              <span>Total</span><span>₹ {money(q.totalValue)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-xs text-slate-500 border-t border-slate-200 pt-4">
          <div>
            <p className="font-semibold text-slate-600 mb-1">Terms &amp; Conditions</p>
            <p>Cut-to-size items are billed at the chargeable size shown against the line.</p>
            {anyOverride && <p>Lines marked &ldquo;manual&rdquo; were priced by agreement rather than by the standard rate.</p>}
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
