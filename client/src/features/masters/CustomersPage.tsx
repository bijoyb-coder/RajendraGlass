import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, X, Users, Pencil, ArrowLeftCircle } from 'lucide-react'
import { useCreateCustomerMutation, useListCustomersQuery, useUpdateCustomerMutation, useDeleteCustomerMutation } from './mastersApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from '../../components/DataGrid'
import { alertError, alertSuccess } from '../../lib/alerts'
import type { CustomerDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
const emptyForm: Partial<CustomerDto> = { code: '', name: '', customerType: 'Retail', gstin: '', phone: '', mobile: '', email: '', stateCode: '19', stateName: 'West Bengal', creditLimit: 0, creditPeriodDays: 30 }

type SortKey = 'code' | 'name' | 'customerType' | 'creditLimit'

export default function CustomersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Only set when we arrived here via a "New Customer" trip from Quotation Entry, Sales Order or
  // Sales Invoice -- a direct visit from the main menu never carries this, so it behaves exactly
  // as it always has (see handleSubmit/handleCancel below, and ProductsPage.tsx's identical
  // "+ Add New Product…" round trip, which this mirrors field-for-field).
  type ReturnTo = 'quotation' | 'salesOrder' | 'salesInvoice'
  const RETURN_ROUTES: Record<ReturnTo, string> = {
    quotation: '/sales/quotations',
    salesOrder: '/sales/orders',
    salesInvoice: '/sales/invoices/new',
  }
  const RETURN_LABELS: Record<ReturnTo, string> = {
    quotation: 'quotation',
    salesOrder: 'sales order',
    salesInvoice: 'sales invoice',
  }
  const returnState = location.state as { returnTo?: ReturnTo; draft?: unknown } | null
  const returnRoute = returnState?.returnTo ? RETURN_ROUTES[returnState.returnTo] : null
  const returningToQuotation = !!returnRoute

  /** Cancel while on a round trip: go back to the caller with its draft restored exactly as it
   * was, but no customer selected -- distinct from Save, which also carries the new customer id. */
  function handleCancel() {
    if (returnRoute) {
      navigate(returnRoute, { state: { restoreDraft: returnState!.draft } })
    } else {
      closeForm()
    }
  }

  const { data, isLoading } = useListCustomersQuery()
  const [createCustomer, { isLoading: creating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: updating }] = useUpdateCustomerMutation()
  const [deleteCustomer] = useDeleteCustomerMutation()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<CustomerDto>>(emptyForm)
  const saving = creating || updating

  // Jump straight to the New Customer form -- the whole point of this trip.
  useEffect(() => {
    if (returningToQuotation) openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    rows,
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
  } = useDataGrid<CustomerDto, SortKey>(data?.items, {
    defaultSortKey: 'name',
    comparators: {
      code: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
      name: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
      customerType: (a, b) => (a.customerType ?? '').localeCompare(b.customerType ?? ''),
      creditLimit: (a, b) => a.creditLimit - b.creditLimit,
    },
    matches: (c, term) =>
      !!c.code?.toLowerCase().includes(term) ||
      !!c.name?.toLowerCase().includes(term) ||
      !!c.gstin?.toLowerCase().includes(term) ||
      !!c.mobile?.toLowerCase().includes(term) ||
      !!c.phone?.toLowerCase().includes(term),
  })

  function set<K extends keyof CustomerDto>(key: K, value: CustomerDto[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(c: CustomerDto) {
    setEditingId(c.customerId)
    setForm({
      code: c.code, name: c.name, customerType: c.customerType, gstin: c.gstin ?? '', phone: c.phone ?? '',
      mobile: c.mobile ?? '', email: c.email ?? '', billingAddress: c.billingAddress ?? '',
      stateCode: c.stateCode ?? '', stateName: c.stateName ?? '', creditLimit: c.creditLimit, creditPeriodDays: c.creditPeriodDays,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.mobile?.trim()) {
      void alertError('Phone number required', 'A phone number is mandatory for every customer.')
      return
    }
    try {
      if (editingId) {
        await updateCustomer({ id: editingId, body: form }).unwrap()
        void alertSuccess('Customer updated successfully.')
        setForm(emptyForm)
        closeForm()
      } else {
        const result = await createCustomer(form).unwrap()
        setForm(emptyForm)
        closeForm()
        // Only a "New Customer" round trip carries this -- a customer created from the main menu
        // just stays here, as it always has.
        if (returnRoute) {
          await alertSuccess('Customer has been Saved successfully, Navigating Previous page')
          navigate(returnRoute, {
            state: { restoreDraft: returnState!.draft, newCustomerId: result.customerId },
          })
        } else {
          void alertSuccess('Customer Saved successfully.')
        }
      }
    } catch (err: any) {
      void alertError(err?.data?.title ?? 'Could not save', err?.data?.detail ?? 'The customer could not be saved.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {returningToQuotation && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          <ArrowLeftCircle size={16} />
          Save this customer to return to your {RETURN_LABELS[returnState!.returnTo!]} with it selected, or cancel to go back without one.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">Billing and delivery parties, credit terms.</p>
        </div>
        <button onClick={showForm ? handleCancel : openNew} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Customer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 grid sm:grid-cols-3 gap-4 animate-fade-in">
          <h2 className="sm:col-span-3 text-sm font-semibold text-slate-700 -mb-2">{editingId ? 'Edit Customer' : 'New Customer'}</h2>
          <Field label="Code *"><input required disabled={!!editingId} value={form.code} onChange={(e) => set('code', e.target.value)} className={`${inputClass} ${editingId ? 'bg-slate-100 text-slate-500' : ''}`} /></Field>
          <Field label="Name *" wide><input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} /></Field>
          <Field label="Customer Type *">
            <select required value={form.customerType ?? 'Retail'} onChange={(e) => set('customerType', e.target.value as CustomerDto['customerType'])} className={inputClass}>
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
            </select>
          </Field>
          <Field label="GSTIN"><input value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} maxLength={15} className={inputClass} /></Field>
          <Field label="Phone Number *"><input required value={form.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} className={inputClass} placeholder="10-digit mobile number" /></Field>
          <Field label="Landline (optional)"><input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputClass} /></Field>
          <Field label="Email"><input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputClass} /></Field>
          <Field label="Billing Address" wide><input value={form.billingAddress ?? ''} onChange={(e) => set('billingAddress', e.target.value)} className={inputClass} /></Field>
          <Field label="State"><input value={form.stateName ?? ''} onChange={(e) => set('stateName', e.target.value)} className={inputClass} /></Field>
          <Field label="Credit Limit"><input type="number" value={form.creditLimit ?? 0} onChange={(e) => set('creditLimit', Number(e.target.value))} className={inputClass} /></Field>
          <Field label="Credit Period (days)"><input type="number" value={form.creditPeriodDays ?? 0} onChange={(e) => set('creditPeriodDays', Number(e.target.value))} className={inputClass} /></Field>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Customer'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search code, name, GSTIN or phone number…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('code')}>
                  Code <SortIcon column="code" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('name')}>
                  Name <SortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerType')}>
                  Type <SortIcon column="customerType" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>GSTIN</Th>
                <Th>Contact</Th>
                <SortableTh onClick={() => toggleSort('creditLimit')} align="right">
                  Credit Limit <SortIcon column="creditLimit" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Status</Th>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    <Users size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No customers match your search.' : 'No customers yet.'}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.customerId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{c.code}</td>
                  <td className="px-5 py-3 text-slate-700">{c.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${c.customerType === 'Wholesale' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                      {c.customerType ?? 'Retail'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.gstin ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{c.mobile ?? c.phone ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">₹{c.creditLimit.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3">
                    {c.creditBlocked ? (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200">Credit Blocked</span>
                    ) : (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        title="Edit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700 transition"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <DeleteRowAction
                        canDelete={c.canDelete}
                        itemLabel={`Customer ${c.name}`}
                        onDelete={() => deleteCustomer(c.customerId).unwrap()}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataGridPagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
