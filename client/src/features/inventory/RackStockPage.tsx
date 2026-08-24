import { useState } from 'react'
import { Plus, X, PackageSearch, ClipboardEdit, ArrowLeftRight } from 'lucide-react'
import {
  useListRackStockQuery, useAdjustRackStockMutation, useTransferRackStockMutation, useDeleteRackStockMutation,
  useListRacksQuery,
} from './inventoryApi'
import { useListProductsQuery } from '../masters/mastersApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  ActionTh,
  DeleteRowAction,
} from '../../components/DataGrid'
import type { RackStockDto } from '../../lib/types'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

type SortKey = 'godownName' | 'rackCode' | 'productCode' | 'qtyOnHand'
type Mode = 'Adjust' | 'Transfer'

/**
 * Rack-level physical stock — a second, independent ledger from the godown-level Stock Enquiry
 * screen. It's meant to be reconciled against the godown book quantity by counting (Record
 * Count), not kept in lockstep automatically; see the Godown/Rack detail report for the variance.
 */
export default function RackStockPage() {
  const { data, isLoading } = useListRackStockQuery()
  const { data: racks } = useListRacksQuery()
  const { data: products } = useListProductsQuery()
  const [adjustRackStock, { isLoading: adjusting }] = useAdjustRackStockMutation()
  const [transferRackStock, { isLoading: transferring }] = useTransferRackStockMutation()
  const [deleteRackStock] = useDeleteRackStockMutation()

  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<Mode>('Adjust')
  const [productId, setProductId] = useState<number | ''>('')
  const [rackId, setRackId] = useState<number | ''>('')
  const [fromRackId, setFromRackId] = useState<number | ''>('')
  const [toRackId, setToRackId] = useState<number | ''>('')
  const [qty, setQty] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

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
  } = useDataGrid<RackStockDto, SortKey>(data?.items, {
    defaultSortKey: 'godownName',
    comparators: {
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      rackCode: (a, b) => (a.rackCode ?? '').localeCompare(b.rackCode ?? ''),
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      qtyOnHand: (a, b) => a.qtyOnHand - b.qtyOnHand,
    },
    matches: (r, term) =>
      !!r.godownName?.toLowerCase().includes(term) ||
      !!r.rackCode?.toLowerCase().includes(term) ||
      !!r.productCode?.toLowerCase().includes(term) ||
      !!r.productDescription?.toLowerCase().includes(term),
  })

  function resetForm() {
    setProductId(''); setRackId(''); setFromRackId(''); setToRackId(''); setQty(''); setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!productId) { setError('Select a product.'); return }
    try {
      if (mode === 'Adjust') {
        if (!rackId) { setError('Select a rack.'); return }
        if (qty === '' || qty < 0) { setError('Enter the counted quantity.'); return }
        await adjustRackStock({ rackId: Number(rackId), productId: Number(productId), actualQty: Number(qty) }).unwrap()
      } else {
        if (!fromRackId || !toRackId) { setError('Select both racks.'); return }
        if (fromRackId === toRackId) { setError('Source and destination rack must differ.'); return }
        if (!qty || qty <= 0) { setError('Enter a quantity greater than zero.'); return }
        await transferRackStock({ productId: Number(productId), fromRackId: Number(fromRackId), toRackId: Number(toRackId), qty: Number(qty) }).unwrap()
      }
      resetForm()
      setShowForm(false)
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not save.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Rack Stock</h1>
          <p className="text-sm text-slate-500 mt-1">Physical count per rack. Record a count to correct it, or shift stock between racks — same godown or different.</p>
        </div>
        <button
          onClick={() => { if (showForm) { resetForm() }; setShowForm((v) => !v) }}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Entry'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(['Adjust', 'Transfer'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); resetForm() }}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {m === 'Adjust' ? <ClipboardEdit size={14} /> : <ArrowLeftRight size={14} />}
                {m === 'Adjust' ? 'Record Count' : 'Shift Stock'}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Product *</label>
              <select required value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Select product…</option>
                {products?.items.map((p) => <option key={p.productId} value={p.productId}>{p.code} — {p.description}</option>)}
              </select>
            </div>

            {mode === 'Adjust' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Rack *</label>
                  <select required value={rackId} onChange={(e) => setRackId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">Select rack…</option>
                    {racks?.items.map((r) => <option key={r.rackId} value={r.rackId}>{r.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Counted Qty *</label>
                  <input type="number" min={0} step="0.001" required value={qty} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">From Rack *</label>
                  <select required value={fromRackId} onChange={(e) => setFromRackId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">Select rack…</option>
                    {racks?.items.map((r) => <option key={r.rackId} value={r.rackId}>{r.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">To Rack *</label>
                  <select required value={toRackId} onChange={(e) => setToRackId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                    <option value="">Select rack…</option>
                    {racks?.items.map((r) => <option key={r.rackId} value={r.rackId}>{r.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity *</label>
                  <input type="number" min={0} step="0.001" required value={qty} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : '')} className={inputClass} />
                </div>
              </>
            )}
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={adjusting || transferring} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">
              {adjusting || transferring ? 'Saving…' : mode === 'Adjust' ? 'Save Count' : 'Shift Stock'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search godown, rack or product…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('godownName')}>
                  Godown <SortIcon column="godownName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('rackCode')}>
                  Rack <SortIcon column="rackCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('productCode')}>
                  Product <SortIcon column="productCode" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('qtyOnHand')} align="right">
                  Qty <SortIcon column="qtyOnHand" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <ActionTh />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                    <PackageSearch size={28} className="mx-auto mb-2 text-slate-300" />
                    {search ? 'No rack stock matches your search.' : 'No rack stock recorded yet — record a count to get started.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.rackStockId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 text-slate-700">{r.godownName}</td>
                  <td className="px-5 py-3 font-medium text-brand-700">{r.rackCode}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{r.productCode}</div>
                    <div className="text-xs text-slate-400">{r.productDescription}</div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{r.qtyOnHand.toLocaleString('en-IN')} {r.unit}</td>
                  <td className="px-5 py-3 text-right">
                    <DeleteRowAction
                      canDelete={r.canDelete}
                      itemLabel={`Rack Stock ${r.productCode} @ ${r.rackCode}`}
                      onDelete={() => deleteRackStock(r.rackStockId).unwrap()}
                    />
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
