import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, PackageCheck, Printer } from 'lucide-react'
import { useListGrnsQuery, useCreateGrnMutation, useDeleteGrnMutation, useListPurchaseOrdersQuery, useLazyGetPurchaseOrderQuery } from './purchaseApi'
import { useDataGrid, SortIcon, SortableTh, DataGridSearchBar, DataGridPagination, DATA_GRID_HEAD_ROW_CLASS, DATA_GRID_ROW_CLASS, ActionTh, DeleteRowAction } from '../../components/DataGrid'
import type { GrnDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

interface Line { key: string; productId: number; productCode: string; receivedQty: number; acceptedQty: number; rejectedQty: number; brokenQty: number; batchNo: string }

type SortKey = 'grnNo' | 'grnDate' | 'poNo' | 'supplierName' | 'status'

export default function GrnPage() {
  const { data, isLoading } = useListGrnsQuery()
  const { data: purchaseOrders } = useListPurchaseOrdersQuery()
  const [createGrn, { isLoading: saving }] = useCreateGrnMutation()
  const [deleteGrn] = useDeleteGrnMutation()
  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()

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
  } = useDataGrid<GrnDto, SortKey>(data?.items, {
    defaultSortKey: 'grnDate',
    defaultSortDir: 'desc',
    comparators: {
      grnNo: (a, b) => (a.grnNo ?? '').localeCompare(b.grnNo ?? ''),
      grnDate: (a, b) => new Date(a.grnDate).getTime() - new Date(b.grnDate).getTime(),
      poNo: (a, b) => (a.poNo ?? '').localeCompare(b.poNo ?? ''),
      supplierName: (a, b) => (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
      status: (a, b) => a.status.localeCompare(b.status),
    },
    matches: (g, term) =>
      !!g.grnNo?.toLowerCase().includes(term) ||
      !!g.poNo?.toLowerCase().includes(term) ||
      !!g.supplierName?.toLowerCase().includes(term) ||
      g.status.toLowerCase().includes(term),
  })

  const [showForm, setShowForm] = useState(false)
  const [purchaseOrderId, setPurchaseOrderId] = useState<number | ''>('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)

  async function onSelectPo(id: number) {
    setPurchaseOrderId(id)
    const po = await fetchPurchaseOrder(id).unwrap()
    setLines((po.lines ?? []).map((l) => ({
      key: crypto.randomUUID(), productId: l.productId, productCode: l.productCode ?? '', receivedQty: l.qty, acceptedQty: l.qty, rejectedQty: 0, brokenQty: 0, batchNo: '',
    })))
  }

  function updateLine(key: string, patch: Partial<Line>) { setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l))) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!purchaseOrderId || lines.length === 0) { setError('Select a purchase order.'); return }
    for (const l of lines) {
      if (l.acceptedQty + l.rejectedQty + l.brokenQty > l.receivedQty) { setError(`Accepted + rejected + broken cannot exceed received for ${l.productCode}.`); return }
    }
    try {
      await createGrn({
        purchaseOrderId: Number(purchaseOrderId),
        lines: lines.map(({ productId, receivedQty, acceptedQty, rejectedQty, brokenQty, batchNo }) => ({ productId, receivedQty, acceptedQty, rejectedQty, brokenQty, batchNo })),
      }).unwrap()
      setShowForm(false)
      setPurchaseOrderId('')
      setLines([])
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save the GRN.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Goods Receipt (GRN)</h1>
          <p className="text-sm text-slate-500 mt-1">Record material received against a purchase order; stock updates on acceptance.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New GRN'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="max-w-sm">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Purchase Order *</label>
            <select required value={purchaseOrderId} onChange={(e) => onSelectPo(Number(e.target.value))} className={inputClass}>
              <option value="">Select approved PO…</option>
              {purchaseOrders?.items.filter((p) => p.status === 'Approved').map((p) => (
                <option key={p.purchaseOrderId} value={p.purchaseOrderId}>{p.poNo} — {p.supplierName}</option>
              ))}
            </select>
          </div>

          {lines.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium w-24">Received</th>
                  <th className="py-2 font-medium w-24">Accepted</th>
                  <th className="py-2 font-medium w-24">Rejected</th>
                  <th className="py-2 font-medium w-24">Broken</th>
                  <th className="py-2 font-medium w-28">Batch No.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="py-2 pr-2 font-medium text-slate-700">{l.productCode}</td>
                    <td className="py-2 pr-2"><input type="number" min={0} step="0.001" value={l.receivedQty} onChange={(e) => updateLine(l.key, { receivedQty: Number(e.target.value) })} className={inputClass} /></td>
                    <td className="py-2 pr-2"><input type="number" min={0} step="0.001" value={l.acceptedQty} onChange={(e) => updateLine(l.key, { acceptedQty: Number(e.target.value) })} className={inputClass} /></td>
                    <td className="py-2 pr-2"><input type="number" min={0} step="0.001" value={l.rejectedQty} onChange={(e) => updateLine(l.key, { rejectedQty: Number(e.target.value) })} className={inputClass} /></td>
                    <td className="py-2 pr-2"><input type="number" min={0} step="0.001" value={l.brokenQty} onChange={(e) => updateLine(l.key, { brokenQty: Number(e.target.value) })} className={inputClass} /></td>
                    <td className="py-2"><input value={l.batchNo} onChange={(e) => updateLine(l.key, { batchNo: e.target.value })} className={inputClass} placeholder="B-001" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving || lines.length === 0} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Saving…' : 'Post GRN'}</button>
          </div>
        </form>
      )}

      {/* ---------- Data grid ---------- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search GRN no., PO no., supplier or status…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('grnNo')}>
                  GRN No. <SortIcon column="grnNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('grnDate')}>
                  Date <SortIcon column="grnDate" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('poNo')}>
                  Against PO <SortIcon column="poNo" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('supplierName')}>
                  Supplier <SortIcon column="supplierName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('status')}>
                  Status <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <PackageCheck size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No GRNs match your search.' : 'No GRNs yet.'}
                  </td>
                </tr>
              )}
              {rows.map((g) => (
                <tr key={g.grnId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{g.grnNo}</td>
                  <td className="px-5 py-3 text-slate-600">{new Date(g.grnDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-slate-500">{g.poNo}</td>
                  <td className="px-5 py-3 text-slate-700">{g.supplierName}</td>
                  <td className="px-5 py-3"><span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{g.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        to={`/purchase/grn/${g.grnId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
                      >
                        <Printer size={14} /> View / Print
                      </Link>
                      <DeleteRowAction
                        canDelete={g.canDelete}
                        itemLabel={`GRN ${g.grnNo}`}
                        onDelete={() => deleteGrn(g.grnId).unwrap()}
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
