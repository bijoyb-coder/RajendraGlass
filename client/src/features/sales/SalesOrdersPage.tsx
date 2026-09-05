import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Plus, X, ClipboardList, Printer, ArrowRightCircle, Receipt, UserPlus } from 'lucide-react'
import { useListSalesOrdersQuery, useCreateSalesOrderMutation, useDeleteSalesOrderMutation, useLazyGetSalesOrderQuery } from './salesExtraApi'
import { useCreateInvoiceMutation } from './salesApi'
import { useListCustomersQuery, useListProductsQuery } from '../masters/mastersApi'
import SalesLineGrid, { emptyLine, isComplete, toCreateLine } from './SalesLineGrid'
import type { SalesLine } from './SalesLineGrid'
import { useDataGrid, SortIcon, SortableTh, Th, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh, DeleteRowAction } from '../../components/DataGrid'
import type { SalesOrderDto, CreateInvoiceLineRequest } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'
function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n) }

const statusStyles: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  InProduction: 'bg-amber-50 text-amber-700 ring-amber-200',
  Completed: 'bg-blue-50 text-blue-700 ring-blue-200',
  Cancelled: 'bg-red-50 text-red-700 ring-red-200',
}

type SortKey = 'orderNo' | 'orderDate' | 'customerName' | 'totalValue' | 'status'

/** What's carried across the "+ Add New Product…" round trip to Product Master and back --
 * mirrors QuotationsPage's own QuotationDraft, one level simpler since Sales Order has no
 * document-level rates/discount of its own to preserve. */
interface SalesOrderDraft {
  customerId: number | '';
  lines: SalesLine[];
}

export default function SalesOrdersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { data, isLoading } = useListSalesOrdersQuery()
  const { data: customers } = useListCustomersQuery()
  const { data: products } = useListProductsQuery()
  const [createSalesOrder, { isLoading: saving }] = useCreateSalesOrderMutation()
  const [deleteSalesOrder] = useDeleteSalesOrderMutation()
  const [fetchSalesOrder] = useLazyGetSalesOrderQuery()
  const [createInvoice, { isLoading: invoicing }] = useCreateInvoiceMutation()

  const [showForm, setShowForm] = useState(false)
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [lines, setLines] = useState<SalesLine[]>([emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)

  // Coming back from Product Master after "+ Add New Product…", or from Customer Entry after
  // "New Customer" -- restore the form exactly as it was, and drop the new product/customer into
  // place (Cancel there carries the same draft back with no newProductId/newCustomerId, so the
  // form still restores but nothing extra gets selected).
  useEffect(() => {
    const state = location.state as { restoreDraft?: SalesOrderDraft; targetLineKey?: string; newProductId?: number; newCustomerId?: number } | null
    if (!state?.restoreDraft) return
    const draft = state.restoreDraft
    setCustomerId(state.newCustomerId ?? draft.customerId)
    let restoredLines = draft.lines
    if (state.newProductId && state.targetLineKey) {
      const product = products?.items.find((p) => p.productId === state.newProductId)
      restoredLines = restoredLines.map((l) =>
        l.key === state.targetLineKey
          ? { ...l, productId: state.newProductId!, rate: product?.sellingRate ?? l.rate, thicknessMm: product?.thicknessMm ?? l.thicknessMm }
          : l,
      )
    }
    setLines(restoredLines)
    setShowForm(true)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  /** "+ Add New Product…" from a line's Product dropdown: stash the in-progress form and go to
   * Product Master. Saving there returns here (see the restore effect above) with the same data
   * restored and the new product selected into the line that asked for it; cancelling there
   * returns here with the same data restored and nothing selected. Navigating to Product Master
   * any other way (the main menu) never carries this state, so it behaves exactly as it always has. */
  function handleAddNewProduct(lineKey: string) {
    const draft: SalesOrderDraft = { customerId, lines }
    navigate('/masters/products', { state: { returnTo: 'salesOrder', targetLineKey: lineKey, draft } })
  }

  /** "New Customer": same round trip as handleAddNewProduct above, just to Customer Entry and
   * without a per-line target since a sales order only ever has one customer. */
  function handleAddNewCustomer() {
    const draft: SalesOrderDraft = { customerId, lines }
    navigate('/masters/customers', { state: { returnTo: 'salesOrder', draft } })
  }

  // Shared with the Quotations screen so the search/sort behaviour is identical everywhere.
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
  } = useDataGrid<SalesOrderDto, SortKey>(
    data?.items,
    {
      defaultSortKey: 'orderDate',
      defaultSortDir: 'desc',
      comparators: {
        orderNo: (a, b) => (a.orderNo ?? '').localeCompare(b.orderNo ?? ''),
        orderDate: (a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime(),
        customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
        totalValue: (a, b) => a.totalValue - b.totalValue,
        status: (a, b) => a.status.localeCompare(b.status),
      },
      matches: (o, term) =>
        !!o.orderNo?.toLowerCase().includes(term) ||
        !!o.customerName?.toLowerCase().includes(term) ||
        o.status.toLowerCase().includes(term),
    },
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerId) { setError('Select a customer.'); return }
    const valid = lines.filter(isComplete)
    if (valid.length === 0) {
      setError('Add at least one complete line — a size with quantity and rate, or an amount entered directly.')
      return
    }
    try {
      await createSalesOrder({
        customerId: Number(customerId),
        lines: valid.map(toCreateLine),
      }).unwrap()
      setShowForm(false)
      setLines([emptyLine()])
      setCustomerId('')
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the sales order.')
    }
  }

  async function convertToInvoice(order: SalesOrderDto) {
    setConvertError(null)
    try {
      const full = await fetchSalesOrder(order.salesOrderId).unwrap()
      // The invoice model prices by quantity x rate, not area — carry each order line across as
      // a single unit whose rate reproduces the order's own basic amount exactly, so the invoice
      // total matches the order it came from.
      const invoiceLines: CreateInvoiceLineRequest[] = full.lines
        .filter((l) => l.productId != null)
        .map((l) => ({
          productId: l.productId!,
          quantity: 1,
          ratePerUnit: l.basicAmount + l.discountAmount,
          discountValue: l.discountAmount,
        }))
      if (invoiceLines.length === 0) {
        setConvertError('This order has no product-linked lines to invoice.')
        return
      }
      await createInvoice({
        customerId: order.customerId,
        salesOrderId: order.salesOrderId,
        customerOrderRef: order.orderNo ?? undefined,
        lines: invoiceLines,
      }).unwrap()
    } catch (err: any) {
      setConvertError(err?.data?.detail ?? 'Could not generate an invoice for this order.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Sales Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Confirmed orders that feed cutting and production.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Sales Order'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-sm">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
              <select required value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select customer…</option>
                {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name} ({c.customerType ?? 'Retail'})</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddNewCustomer}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 pb-2.5"
            >
              <UserPlus size={15} /> New Customer
            </button>
          </div>

          {/* Shared with the Quotation screen so the two can never drift apart. */}
          <SalesLineGrid lines={lines} products={products} onChange={setLines} onAddNewProduct={handleAddNewProduct} />

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Save Sales Order'}</button>
          </div>
        </form>
      )}

      {convertError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{convertError}</div>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search order no., customer or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('orderNo')}>
                  Order No. <SortIcon column="orderNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('orderDate')}>
                  Date <SortIcon column="orderDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('customerName')}>
                  Customer <SortIcon column="customerName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th align="right">Basic</Th>
                <Th align="right">GST</Th>
                <SortableTh onClick={() => toggleSort('totalValue')} align="right">
                  Total <SortIcon column="totalValue" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No sales orders match your search.' : 'No sales orders yet.'}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr key={o.salesOrderId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{o.orderNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(o.orderDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-700">{o.customerName}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{money(o.basicValue)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{money(o.gstValue)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(o.totalValue)}</td>
                  <td className="px-5 py-3"><span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${statusStyles[o.status] ?? statusStyles.Approved}`}>{o.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {o.invoiceId ? (
                        <Link
                          to={`/sales/invoices/${o.invoiceId}`}
                          title="Already invoiced — the order can no longer be invoiced again"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          <Receipt size={14} /> {o.invoiceNo ?? 'View Invoice'}
                        </Link>
                      ) : (
                        o.status !== 'Cancelled' && (
                          <button
                            disabled={invoicing}
                            onClick={() => convertToInvoice(o)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                          >
                            <ArrowRightCircle size={14} /> Convert to Invoice
                          </button>
                        )
                      )}
                      <Link
                        to={`/sales/orders/${o.salesOrderId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Printer size={14} /> View / Print
                      </Link>
                      <DeleteRowAction
                        canDelete={o.canDelete}
                        itemLabel={`sales order ${o.orderNo ?? o.salesOrderId}`}
                        onDelete={() => deleteSalesOrder(o.salesOrderId).unwrap()}
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
