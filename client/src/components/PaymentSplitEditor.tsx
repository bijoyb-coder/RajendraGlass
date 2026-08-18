import { Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * Shared split-payment editor — a bill or receipt total may be settled across several methods at
 * once (e.g. Cash 20 + UPI 50 + Cheque 30 = 100). Used by both Counter Billing and Payment
 * Transactions so the two screens validate and look identical rather than drifting apart.
 */

export type PaymentMethod = 'Cash' | 'Cheque' | 'UPI'
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Cheque', 'UPI']

export interface PaymentSplitRow {
  key: string
  method: PaymentMethod
  amount: number | ''
  referenceNo: string
}

export function emptySplitRow(method: PaymentMethod = 'Cash', amount: number | '' = ''): PaymentSplitRow {
  return { key: crypto.randomUUID(), method, amount, referenceNo: '' }
}

export function splitAppliedTotal(rows: PaymentSplitRow[]) {
  return rows.reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0)
}

function money(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

/** Null when the rows are ready to submit; otherwise the reason they aren't. `target` is the
 * amount every row's amount must sum to exactly (a 1-paisa rounding slack is allowed). */
export function validateSplits(rows: PaymentSplitRow[], target: number): string | null {
  if (rows.length === 0) return 'Add at least one payment method.'
  for (const r of rows) {
    if (typeof r.amount !== 'number' || r.amount <= 0) return 'Every payment method needs an amount greater than zero.'
    if (r.method !== 'Cash' && !r.referenceNo.trim())
      return `Enter the ${r.method === 'Cheque' ? 'cheque number' : 'UPI transaction reference'} for the ${r.method} payment.`
  }
  const applied = splitAppliedTotal(rows)
  if (Math.abs(applied - target) > 0.01) {
    return applied < target
      ? `Payments total ${money(applied)}, short of ${money(target)} by ${money(target - applied)}.`
      : `Payments total ${money(applied)}, which is ${money(applied - target)} more than ${money(target)}.`
  }
  return null
}

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

export default function PaymentSplitEditor({
  rows,
  target,
  onChange,
}: {
  rows: PaymentSplitRow[]
  /** The amount the rows must sum to — the invoice total, or whatever total the operator typed. */
  target: number
  onChange: (rows: PaymentSplitRow[]) => void
}) {
  const applied = splitAppliedTotal(rows)
  const remaining = target - applied
  const balanced = Math.abs(remaining) <= 0.01

  function update(key: string, patch: Partial<PaymentSplitRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function remove(key: string) {
    onChange(rows.filter((r) => r.key !== key))
  }
  function add() {
    // Prefill the new row with whatever balance is left, and default to a method not already used
    // when there's an obvious next choice — saves a click in the common two-way split.
    const used = new Set(rows.map((r) => r.method))
    const nextMethod = PAYMENT_METHODS.find((m) => !used.has(m)) ?? 'Cash'
    const prefill = remaining > 0 ? Math.round(remaining * 100) / 100 : ''
    onChange([...rows, emptySplitRow(nextMethod, prefill)])
  }

  return (
    <div className="space-y-2.5">
      <label className="block text-xs font-semibold text-slate-600">Payment *</label>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2">
            <select
              value={r.method}
              onChange={(e) => update(r.key, { method: e.target.value as PaymentMethod, referenceNo: e.target.value === 'Cash' ? '' : r.referenceNo })}
              className={`${inputClass} w-28 shrink-0`}
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Amount"
              value={r.amount}
              onChange={(e) => update(r.key, { amount: e.target.value ? Number(e.target.value) : '' })}
              className={`${inputClass} w-32 shrink-0`}
            />
            {r.method !== 'Cash' && (
              <input
                value={r.referenceNo}
                onChange={(e) => update(r.key, { referenceNo: e.target.value })}
                placeholder={r.method === 'Cheque' ? 'Cheque number' : 'UPI transaction ID'}
                className={`${inputClass} flex-1 min-w-[10rem]`}
              />
            )}
            {rows.length > 1 && (
              <button type="button" onClick={() => remove(r.key)} className="text-slate-400 hover:text-red-500 transition shrink-0">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <Plus size={15} /> Add Payment Method
        </button>
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${
          balanced ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'
        }`}>
          {balanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {balanced
            ? `Balanced — ${money(applied)} of ${money(target)}`
            : remaining > 0
              ? `${money(remaining)} remaining of ${money(target)}`
              : `${money(-remaining)} over ${money(target)}`}
        </div>
      </div>
    </div>
  )
}
