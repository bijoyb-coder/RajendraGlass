import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useGetCompanyQuery, useUpdateCompanyMutation } from './mastersApi'
import type { CompanyDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

export default function CompanyProfilePage() {
  const { data: company, isLoading } = useGetCompanyQuery()
  const [updateCompany, { isLoading: saving }] = useUpdateCompanyMutation()
  const [form, setForm] = useState<CompanyDto | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (company) setForm(company) }, [company])

  if (isLoading || !form) return <div className="text-center py-20 text-slate-400">Loading…</div>

  function set<K extends keyof CompanyDto>(key: K, value: CompanyDto[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    await updateCompany(form).unwrap()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-3xl animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Company Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Identity of the business, used on every printed document.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Legal Name"><input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} className={inputClass} /></Field>
          <Field label="Trade Name"><input value={form.tradeName ?? ''} onChange={(e) => set('tradeName', e.target.value)} className={inputClass} /></Field>
          <Field label="GSTIN"><input value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} maxLength={15} className={inputClass} /></Field>
          <Field label="PAN"><input value={form.pan ?? ''} onChange={(e) => set('pan', e.target.value)} maxLength={10} className={inputClass} /></Field>
          <Field label="Phone"><input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputClass} /></Field>
          <Field label="Mobile"><input value={form.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} className={inputClass} /></Field>
          <Field label="Email"><input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputClass} /></Field>
          <Field label="Website"><input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Registered Address"><textarea value={form.registeredAddress ?? ''} onChange={(e) => set('registeredAddress', e.target.value)} rows={2} className={inputClass} /></Field>
        <Field label="Business Address"><textarea value={form.businessAddress ?? ''} onChange={(e) => set('businessAddress', e.target.value)} rows={2} className={inputClass} /></Field>

        <div className="grid sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <Field label="Bank Name"><input value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} className={inputClass} /></Field>
          <Field label="Account Number"><input value={form.accountNumber ?? ''} onChange={(e) => set('accountNumber', e.target.value)} className={inputClass} /></Field>
          <Field label="IFSC"><input value={form.ifsc ?? ''} onChange={(e) => set('ifsc', e.target.value)} className={inputClass} /></Field>
          <Field label="Bank Branch"><input value={form.bankBranch ?? ''} onChange={(e) => set('bankBranch', e.target.value)} className={inputClass} /></Field>
          <Field label="Authorised Signatory"><input value={form.authSignatoryName ?? ''} onChange={(e) => set('authSignatoryName', e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Invoice Footer Note"><textarea value={form.invoiceFooterNote ?? ''} onChange={(e) => set('invoiceFooterNote', e.target.value)} rows={2} className={inputClass} /></Field>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
            <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
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
