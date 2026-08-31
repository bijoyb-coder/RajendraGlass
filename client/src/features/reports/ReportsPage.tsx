import { useMemo, useState } from 'react'
import { BarChart3, Printer, Wallet2, Warehouse, LayoutGrid, Layers, Banknote } from 'lucide-react'
import {
  useStockSummaryQuery, useStockGodownSummaryQuery, useStockRackDetailQuery, useInventoryStatusQuery,
  useSalesRegisterQuery, useCollectionRegisterQuery, useReceivablesAgeingQuery, useCustomerTransactionsQuery,
} from './reportsApi'
import { useListCustomersQuery } from '../masters/mastersApi'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridButton,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
  printReport,
} from '../../components/DataGrid'
import { alertError } from '../../lib/alerts'
import type { StockSummaryReportRow, SalesRegisterRow, CollectionRegisterRow, CustomerTransactionRow, GodownStockSummaryRow, RackStockDetailRow, InventoryStatusRow } from '../../lib/types'

function money(n: number) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) }
function qty(n: number) { return n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) }

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

/** Shared by every date-range report filter: rejects a From/To combination where From is after
 * To, via SweetAlert, and never lets the invalid value land in state -- so the underlying report
 * query is never even asked to run with a backwards range. */
function makeDateRangeSetters(from: string, to: string, setFrom: (v: string) => void, setTo: (v: string) => void) {
  return {
    onFromChange: (value: string) => {
      if (value && to && value > to) {
        void alertError('Invalid Date Range', 'From Date cannot be greater than To Date.')
        return
      }
      setFrom(value)
    },
    onToChange: (value: string) => {
      if (value && from && value < from) {
        void alertError('Invalid Date Range', 'To Date cannot be earlier than From Date.')
        return
      }
      setTo(value)
    },
  }
}

const tabs = ['Stock Summary', 'Godown Stock Summary', 'Godown/Rack Stock Detail', 'Inventory Status', 'Sales Register', 'Collection Register', 'Receivables Ageing', 'Customer Transactions'] as const
type Tab = (typeof tabs)[number]

interface AgeingRow { customerName: string; invoiceNo: string; invoiceDate: string; totalValue: number; ageDays: number }

type StockSortKey = 'productCode' | 'qtyOnHand' | 'qtyFree' | 'avgRate' | 'stockValue'
type GodownSortKey = 'godownName' | 'productCode' | 'qtyOnHand' | 'qtyFree'
type InventoryStatusSortKey = 'productCode' | 'godownName' | 'qtyOnHand' | 'qtyFree' | 'sheetEquivalent' | 'offcutCount' | 'offcutAreaInStockUnit'
type RackSortKey = 'godownName' | 'rackCode' | 'productCode' | 'rackQty' | 'godownBookQty' | 'variance'
type SalesSortKey = 'invoiceNo' | 'invoiceDate' | 'customerName' | 'taxableValue' | 'taxValue' | 'totalValue'
type CollectionSortKey = 'voucherNo' | 'voucherDate' | 'customerName' | 'mode' | 'amount'
type AgeingSortKey = 'customerName' | 'invoiceNo' | 'invoiceDate' | 'totalValue' | 'ageDays'
type TxnSortKey = 'txnDate' | 'type' | 'docNo' | 'debit' | 'credit' | 'balance'

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('Stock Summary')
  const { data: stock, isLoading: loadingStock } = useStockSummaryQuery(undefined, { skip: tab !== 'Stock Summary' })
  const { data: godownSummary, isLoading: loadingGodownSummary } = useStockGodownSummaryQuery(undefined, { skip: tab !== 'Godown Stock Summary' })
  const { data: rackDetail, isLoading: loadingRackDetail } = useStockRackDetailQuery(undefined, { skip: tab !== 'Godown/Rack Stock Detail' })
  const { data: inventoryStatus, isLoading: loadingInventoryStatus } = useInventoryStatusQuery(undefined, { skip: tab !== 'Inventory Status' })
  // ---------- Sales Register: From/To Date + optional Customer ----------
  const [salesFrom, setSalesFrom] = useState('')
  const [salesTo, setSalesTo] = useState('')
  const [salesCustomerId, setSalesCustomerId] = useState<number | ''>('')
  const salesDateSetters = makeDateRangeSetters(salesFrom, salesTo, setSalesFrom, setSalesTo)
  const { data: sales, isLoading: loadingSales } = useSalesRegisterQuery(
    { from: salesFrom || undefined, to: salesTo || undefined, customerId: salesCustomerId || undefined },
    { skip: tab !== 'Sales Register' },
  )

  // ---------- Collection Register: From/To Date, Collection Type, optional Customer ----------
  const [collFrom, setCollFrom] = useState('')
  const [collTo, setCollTo] = useState('')
  const [collMode, setCollMode] = useState('')
  const [collCustomerId, setCollCustomerId] = useState<number | ''>('')
  const collDateSetters = makeDateRangeSetters(collFrom, collTo, setCollFrom, setCollTo)
  const { data: collections, isLoading: loadingCollections } = useCollectionRegisterQuery(
    { from: collFrom || undefined, to: collTo || undefined, mode: collMode || undefined, customerId: collCustomerId || undefined },
    { skip: tab !== 'Collection Register' },
  )

  const { data: ageing, isLoading: loadingAgeing } = useReceivablesAgeingQuery(undefined, { skip: tab !== 'Receivables Ageing' })
  const { data: customers } = useListCustomersQuery(undefined, { skip: tab !== 'Customer Transactions' && tab !== 'Sales Register' && tab !== 'Collection Register' })
  const [txnCustomerId, setTxnCustomerId] = useState<number | ''>('')
  const [txnPhoneSearch, setTxnPhoneSearch] = useState('')
  const { data: txnReport, isLoading: loadingTxn } = useCustomerTransactionsQuery(txnCustomerId as number, { skip: tab !== 'Customer Transactions' || !txnCustomerId })

  // Optional search criteria: narrows the customer dropdown to those whose mobile/phone contains
  // the typed digits, so a phone number can be used to find the right customer as easily as a name.
  const txnCustomerOptions = useMemo(() => {
    const term = txnPhoneSearch.trim().toLowerCase()
    if (!term) return customers?.items ?? []
    return (customers?.items ?? []).filter((c) => c.mobile?.toLowerCase().includes(term) || c.phone?.toLowerCase().includes(term))
  }, [customers, txnPhoneSearch])

  const stockGrid = useDataGrid<StockSummaryReportRow, StockSortKey>(stock?.items, {
    defaultSortKey: 'productCode',
    comparators: {
      productCode: (a, b) => a.productCode.localeCompare(b.productCode),
      qtyOnHand: (a, b) => a.qtyOnHand - b.qtyOnHand,
      qtyFree: (a, b) => a.qtyFree - b.qtyFree,
      avgRate: (a, b) => (a.avgRate ?? 0) - (b.avgRate ?? 0),
      stockValue: (a, b) => a.stockValue - b.stockValue,
    },
    matches: (r, term) => r.productCode.toLowerCase().includes(term) || r.description.toLowerCase().includes(term),
  })

  const godownGrid = useDataGrid<GodownStockSummaryRow, GodownSortKey>(godownSummary?.items, {
    defaultSortKey: 'godownName',
    comparators: {
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      qtyOnHand: (a, b) => a.qtyOnHand - b.qtyOnHand,
      qtyFree: (a, b) => a.qtyFree - b.qtyFree,
    },
    matches: (r, term) => !!r.godownName?.toLowerCase().includes(term) || !!r.productCode?.toLowerCase().includes(term) || !!r.productDescription?.toLowerCase().includes(term),
  })

  const rackGrid = useDataGrid<RackStockDetailRow, RackSortKey>(rackDetail?.items, {
    defaultSortKey: 'godownName',
    comparators: {
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      rackCode: (a, b) => (a.rackCode ?? '').localeCompare(b.rackCode ?? ''),
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      rackQty: (a, b) => a.rackQty - b.rackQty,
      godownBookQty: (a, b) => a.godownBookQty - b.godownBookQty,
      variance: (a, b) => (a.rackQty - a.godownBookQty) - (b.rackQty - b.godownBookQty),
    },
    matches: (r, term) => !!r.godownName?.toLowerCase().includes(term) || !!r.rackCode?.toLowerCase().includes(term) || !!r.productCode?.toLowerCase().includes(term),
  })

  const inventoryStatusGrid = useDataGrid<InventoryStatusRow, InventoryStatusSortKey>(inventoryStatus?.items, {
    defaultSortKey: 'productCode',
    comparators: {
      productCode: (a, b) => (a.productCode ?? '').localeCompare(b.productCode ?? ''),
      godownName: (a, b) => (a.godownName ?? '').localeCompare(b.godownName ?? ''),
      qtyOnHand: (a, b) => a.qtyOnHand - b.qtyOnHand,
      qtyFree: (a, b) => a.qtyFree - b.qtyFree,
      sheetEquivalent: (a, b) => (a.sheetEquivalent ?? 0) - (b.sheetEquivalent ?? 0),
      offcutCount: (a, b) => a.offcutCount - b.offcutCount,
      offcutAreaInStockUnit: (a, b) => a.offcutAreaInStockUnit - b.offcutAreaInStockUnit,
    },
    matches: (r, term) => !!r.productCode?.toLowerCase().includes(term) || !!r.productDescription?.toLowerCase().includes(term) || !!r.godownName?.toLowerCase().includes(term),
  })

  const salesGrid = useDataGrid<SalesRegisterRow, SalesSortKey>(sales?.items, {
    defaultSortKey: 'invoiceDate',
    defaultSortDir: 'desc',
    comparators: {
      invoiceNo: (a, b) => a.invoiceNo.localeCompare(b.invoiceNo),
      invoiceDate: (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
      customerName: (a, b) => a.customerName.localeCompare(b.customerName),
      taxableValue: (a, b) => a.taxableValue - b.taxableValue,
      taxValue: (a, b) => a.taxValue - b.taxValue,
      totalValue: (a, b) => a.totalValue - b.totalValue,
    },
    matches: (s, term) => s.invoiceNo.toLowerCase().includes(term) || s.customerName.toLowerCase().includes(term),
  })

  const collectionGrid = useDataGrid<CollectionRegisterRow, CollectionSortKey>(collections?.items, {
    defaultSortKey: 'voucherDate',
    defaultSortDir: 'desc',
    comparators: {
      voucherNo: (a, b) => (a.voucherNo ?? '').localeCompare(b.voucherNo ?? ''),
      voucherDate: (a, b) => new Date(a.voucherDate).getTime() - new Date(b.voucherDate).getTime(),
      customerName: (a, b) => (a.customerName ?? '').localeCompare(b.customerName ?? ''),
      mode: (a, b) => a.mode.localeCompare(b.mode),
      amount: (a, b) => a.amount - b.amount,
    },
    matches: (r, term) =>
      !!r.voucherNo?.toLowerCase().includes(term) ||
      !!r.customerName?.toLowerCase().includes(term) ||
      r.mode.toLowerCase().includes(term) ||
      !!r.referenceNo?.toLowerCase().includes(term),
  })

  const ageingGrid = useDataGrid<AgeingRow, AgeingSortKey>(ageing?.items, {
    defaultSortKey: 'ageDays',
    defaultSortDir: 'desc',
    comparators: {
      customerName: (a, b) => a.customerName.localeCompare(b.customerName),
      invoiceNo: (a, b) => a.invoiceNo.localeCompare(b.invoiceNo),
      invoiceDate: (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
      totalValue: (a, b) => a.totalValue - b.totalValue,
      ageDays: (a, b) => a.ageDays - b.ageDays,
    },
    matches: (r, term) => r.customerName.toLowerCase().includes(term) || r.invoiceNo.toLowerCase().includes(term),
  })

  const txnGrid = useDataGrid<CustomerTransactionRow, TxnSortKey>(txnReport?.items, {
    defaultSortKey: 'txnDate',
    comparators: {
      txnDate: (a, b) => new Date(a.txnDate).getTime() - new Date(b.txnDate).getTime(),
      type: (a, b) => a.type.localeCompare(b.type),
      docNo: (a, b) => (a.docNo ?? '').localeCompare(b.docNo ?? ''),
      debit: (a, b) => a.debit - b.debit,
      credit: (a, b) => a.credit - b.credit,
      balance: (a, b) => a.balance - b.balance,
    },
    matches: (r, term) => r.type.toLowerCase().includes(term) || !!r.docNo?.toLowerCase().includes(term),
  })

  function printStock() {
    printReport({
      title: 'Stock Summary',
      columns: [
        { label: 'Product' }, { label: 'On Hand', align: 'right' }, { label: 'Free', align: 'right' },
        { label: 'Avg Rate', align: 'right' }, { label: 'Stock Value', align: 'right' },
      ],
      rows: stockGrid.allRows.map((r) => [
        `${r.productCode} — ${r.description}`,
        r.qtyOnHand.toLocaleString('en-IN'),
        r.qtyFree.toLocaleString('en-IN'),
        r.avgRate ? money(r.avgRate) : '—',
        money(r.stockValue),
      ]),
    })
  }

  function printGodownSummary() {
    printReport({
      title: 'Godown Stock Summary',
      columns: [
        { label: 'Godown' }, { label: 'Product' }, { label: 'On Hand', align: 'right' }, { label: 'Free', align: 'right' },
      ],
      rows: godownGrid.allRows.map((r) => [
        r.godownName ?? '—',
        `${r.productCode} — ${r.productDescription}`,
        `${qty(r.qtyOnHand)} ${r.unit ?? ''}`,
        `${qty(r.qtyFree)} ${r.unit ?? ''}`,
      ]),
    })
  }

  function printInventoryStatus() {
    printReport({
      title: 'Inventory Status',
      columns: [
        { label: 'Product' }, { label: 'Godown' }, { label: 'On Hand', align: 'right' }, { label: 'Free', align: 'right' },
        { label: '≈ Sheets', align: 'right' }, { label: 'Offcuts', align: 'right' }, { label: 'Offcut Area', align: 'right' },
      ],
      rows: inventoryStatusGrid.allRows.map((r) => [
        `${r.productCode} — ${r.productDescription}`,
        r.godownName ?? '—',
        `${qty(r.qtyOnHand)} ${r.stockUnit}`,
        `${qty(r.qtyFree)} ${r.stockUnit}`,
        r.sheetEquivalent != null ? qty(r.sheetEquivalent) : '—',
        r.offcutCount ? String(r.offcutCount) : '—',
        r.offcutCount ? `${qty(r.offcutAreaInStockUnit)} ${r.stockUnit}` : '—',
      ]),
    })
  }

  function printRackDetail() {
    printReport({
      title: 'Godown/Rack Stock Detail',
      columns: [
        { label: 'Godown' }, { label: 'Rack' }, { label: 'Product' },
        { label: 'Rack Qty', align: 'right' }, { label: 'Godown Book Qty', align: 'right' }, { label: 'Variance', align: 'right' },
      ],
      rows: rackGrid.allRows.map((r) => [
        r.godownName ?? '—',
        r.rackCode ?? '—',
        `${r.productCode} — ${r.productDescription}`,
        `${qty(r.rackQty)} ${r.unit ?? ''}`,
        `${qty(r.godownBookQty)} ${r.unit ?? ''}`,
        `${qty(r.rackQty - r.godownBookQty)} ${r.unit ?? ''}`,
      ]),
    })
  }

  function printSales() {
    printReport({
      title: 'Sales Register',
      columns: [
        { label: 'Invoice No.' }, { label: 'Date' }, { label: 'Customer' },
        { label: 'Taxable', align: 'right' }, { label: 'Tax', align: 'right' }, { label: 'Total', align: 'right' },
      ],
      rows: salesGrid.allRows.map((s) => [
        s.invoiceNo,
        new Date(s.invoiceDate).toLocaleDateString('en-IN'),
        s.customerName,
        money(s.taxableValue),
        money(s.taxValue),
        money(s.totalValue),
      ]),
      totalRow: sales && sales.items.length > 0 ? [null, null, null, null, 'Total', money(sales.total)] : undefined,
    })
  }

  function printCollections() {
    printReport({
      title: 'Collection Register',
      columns: [
        { label: 'Voucher No.' }, { label: 'Date' }, { label: 'Customer' },
        { label: 'Mode' }, { label: 'Reference' }, { label: 'Amount', align: 'right' },
      ],
      rows: collectionGrid.allRows.map((r) => [
        r.voucherNo ?? '—',
        new Date(r.voucherDate).toLocaleDateString('en-IN'),
        r.customerName ?? '—',
        r.mode,
        r.referenceNo ?? '—',
        money(r.amount),
      ]),
      totalRow: collections && collections.items.length > 0 ? [null, null, null, null, 'Total', money(collections.total)] : undefined,
    })
  }

  function printAgeing() {
    printReport({
      title: 'Receivables Ageing',
      columns: [
        { label: 'Customer' }, { label: 'Invoice No.' }, { label: 'Date' },
        { label: 'Value', align: 'right' }, { label: 'Age (days)', align: 'right' },
      ],
      rows: ageingGrid.allRows.map((r) => [
        r.customerName,
        r.invoiceNo,
        new Date(r.invoiceDate).toLocaleDateString('en-IN'),
        money(r.totalValue),
        r.ageDays,
      ]),
    })
  }

  function printTxn() {
    if (!txnReport) return
    printReport({
      title: 'Customer Transaction Details',
      subtitle: txnReport.customer.name,
      columns: [
        { label: 'Date' }, { label: 'Type' }, { label: 'Doc No.' },
        { label: 'Sale (Dr)', align: 'right' }, { label: 'Payment (Cr)', align: 'right' }, { label: 'Balance', align: 'right' },
      ],
      rows: txnGrid.allRows.map((r) => [
        new Date(r.txnDate).toLocaleDateString('en-IN'),
        r.type,
        r.docNo ?? '—',
        r.debit > 0 ? money(r.debit) : '—',
        r.credit > 0 ? money(r.credit) : '—',
        money(r.balance),
      ]),
      totalRow: [null, null, 'Total', money(txnReport.totalSales), money(txnReport.totalPayments), money(txnReport.balance)],
    })
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">Stock, sales and receivables — the reporting essentials.</p>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Stock Summary' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={stockGrid.search}
            onChange={stockGrid.setSearch}
            placeholder="Search product code or description…"
            pageSize={stockGrid.pageSize}
            onPageSizeChange={stockGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printStock} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => stockGrid.toggleSort('productCode')}>
                    Product <SortIcon column="productCode" sortKey={stockGrid.sortKey} sortDir={stockGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => stockGrid.toggleSort('qtyOnHand')} align="right">
                    On Hand <SortIcon column="qtyOnHand" sortKey={stockGrid.sortKey} sortDir={stockGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => stockGrid.toggleSort('qtyFree')} align="right">
                    Free <SortIcon column="qtyFree" sortKey={stockGrid.sortKey} sortDir={stockGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => stockGrid.toggleSort('avgRate')} align="right">
                    Avg Rate <SortIcon column="avgRate" sortKey={stockGrid.sortKey} sortDir={stockGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => stockGrid.toggleSort('stockValue')} align="right">
                    Stock Value <SortIcon column="stockValue" sortKey={stockGrid.sortKey} sortDir={stockGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingStock && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingStock && stockGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                      <BarChart3 size={28} className="mx-auto mb-2 text-slate-300" />
                      {stockGrid.search ? 'No products match your search.' : 'No stock records.'}
                    </td>
                  </tr>
                )}
                {stockGrid.rows.map((r) => (
                  <tr key={r.productCode} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3"><div className="font-medium text-slate-800">{r.productCode}</div><div className="text-xs text-slate-400">{r.description}</div></td>
                    <td className="px-5 py-3 text-right text-slate-700">{r.qtyOnHand.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right text-emerald-700 font-medium">{r.qtyFree.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.avgRate ? money(r.avgRate) : '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(r.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataGridPagination
            page={stockGrid.page}
            pageCount={stockGrid.pageCount}
            totalCount={stockGrid.totalCount}
            startIndex={stockGrid.startIndex}
            endIndex={stockGrid.endIndex}
            onPageChange={stockGrid.setPage}
          />
        </div>
      )}

      {tab === 'Godown Stock Summary' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={godownGrid.search}
            onChange={godownGrid.setSearch}
            placeholder="Search godown or product…"
            pageSize={godownGrid.pageSize}
            onPageSizeChange={godownGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printGodownSummary} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => godownGrid.toggleSort('godownName')}>
                    Godown <SortIcon column="godownName" sortKey={godownGrid.sortKey} sortDir={godownGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => godownGrid.toggleSort('productCode')}>
                    Product <SortIcon column="productCode" sortKey={godownGrid.sortKey} sortDir={godownGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => godownGrid.toggleSort('qtyOnHand')} align="right">
                    On Hand <SortIcon column="qtyOnHand" sortKey={godownGrid.sortKey} sortDir={godownGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => godownGrid.toggleSort('qtyFree')} align="right">
                    Free <SortIcon column="qtyFree" sortKey={godownGrid.sortKey} sortDir={godownGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingGodownSummary && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingGodownSummary && godownGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-14 text-center text-slate-400">
                      <Warehouse size={28} className="mx-auto mb-2 text-slate-300" />
                      {godownGrid.search ? 'No stock matches your search.' : 'No stock records.'}
                    </td>
                  </tr>
                )}
                {godownGrid.rows.map((r, i) => (
                  <tr key={`${r.godownId}-${r.productCode}-${i}`} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3 text-slate-700">{r.godownName}</td>
                    <td className="px-5 py-3"><div className="font-medium text-slate-800">{r.productCode}</div><div className="text-xs text-slate-400">{r.productDescription}</div></td>
                    <td className="px-5 py-3 text-right text-slate-700">{qty(r.qtyOnHand)} {r.unit}</td>
                    <td className="px-5 py-3 text-right text-emerald-700 font-medium">{qty(r.qtyFree)} {r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataGridPagination
            page={godownGrid.page}
            pageCount={godownGrid.pageCount}
            totalCount={godownGrid.totalCount}
            startIndex={godownGrid.startIndex}
            endIndex={godownGrid.endIndex}
            onPageChange={godownGrid.setPage}
          />
        </div>
      )}

      {tab === 'Godown/Rack Stock Detail' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={rackGrid.search}
            onChange={rackGrid.setSearch}
            placeholder="Search godown, rack or product…"
            pageSize={rackGrid.pageSize}
            onPageSizeChange={rackGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printRackDetail} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => rackGrid.toggleSort('godownName')}>
                    Godown <SortIcon column="godownName" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => rackGrid.toggleSort('rackCode')}>
                    Rack <SortIcon column="rackCode" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => rackGrid.toggleSort('productCode')}>
                    Product <SortIcon column="productCode" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => rackGrid.toggleSort('rackQty')} align="right">
                    Rack Qty <SortIcon column="rackQty" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => rackGrid.toggleSort('godownBookQty')} align="right">
                    Godown Book Qty <SortIcon column="godownBookQty" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => rackGrid.toggleSort('variance')} align="right">
                    Variance <SortIcon column="variance" sortKey={rackGrid.sortKey} sortDir={rackGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingRackDetail && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingRackDetail && rackGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                      <LayoutGrid size={28} className="mx-auto mb-2 text-slate-300" />
                      {rackGrid.search ? 'No rack stock matches your search.' : 'No rack stock recorded yet.'}
                    </td>
                  </tr>
                )}
                {rackGrid.rows.map((r, i) => {
                  const variance = r.rackQty - r.godownBookQty
                  return (
                    <tr key={`${r.rackId}-${r.productCode}-${i}`} className={DATA_GRID_ROW_CLASS}>
                      <td className="px-5 py-3 text-slate-700">{r.godownName}</td>
                      <td className="px-5 py-3 font-medium text-brand-700">{r.rackCode}</td>
                      <td className="px-5 py-3"><div className="font-medium text-slate-800">{r.productCode}</div><div className="text-xs text-slate-400">{r.productDescription}</div></td>
                      <td className="px-5 py-3 text-right text-slate-700">{qty(r.rackQty)} {r.unit}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{qty(r.godownBookQty)} {r.unit}</td>
                      <td className={`px-5 py-3 text-right font-medium ${variance === 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                        {variance > 0 ? '+' : ''}{qty(variance)} {r.unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <DataGridPagination
            page={rackGrid.page}
            pageCount={rackGrid.pageCount}
            totalCount={rackGrid.totalCount}
            startIndex={rackGrid.startIndex}
            endIndex={rackGrid.endIndex}
            onPageChange={rackGrid.setPage}
          />
        </div>
      )}

      {tab === 'Inventory Status' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={inventoryStatusGrid.search}
            onChange={inventoryStatusGrid.setSearch}
            placeholder="Search product or godown…"
            pageSize={inventoryStatusGrid.pageSize}
            onPageSizeChange={inventoryStatusGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printInventoryStatus} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('productCode')}>
                    Product <SortIcon column="productCode" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('godownName')}>
                    Godown <SortIcon column="godownName" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('qtyOnHand')} align="right">
                    On Hand <SortIcon column="qtyOnHand" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('qtyFree')} align="right">
                    Free <SortIcon column="qtyFree" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('sheetEquivalent')} align="right">
                    ≈ Sheets <SortIcon column="sheetEquivalent" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('offcutCount')} align="right">
                    Offcuts <SortIcon column="offcutCount" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => inventoryStatusGrid.toggleSort('offcutAreaInStockUnit')} align="right">
                    Offcut Area <SortIcon column="offcutAreaInStockUnit" sortKey={inventoryStatusGrid.sortKey} sortDir={inventoryStatusGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingInventoryStatus && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingInventoryStatus && inventoryStatusGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                      <Layers size={28} className="mx-auto mb-2 text-slate-300" />
                      {inventoryStatusGrid.search ? 'No stock matches your search.' : 'No stock records.'}
                    </td>
                  </tr>
                )}
                {inventoryStatusGrid.rows.map((r, i) => (
                  <tr key={`${r.godownId}-${r.productCode}-${i}`} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3"><div className="font-medium text-slate-800">{r.productCode}</div><div className="text-xs text-slate-400">{r.productDescription}</div></td>
                    <td className="px-5 py-3 text-slate-700">{r.godownName}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{qty(r.qtyOnHand)} {r.stockUnit}</td>
                    <td className="px-5 py-3 text-right text-emerald-700 font-medium">{qty(r.qtyFree)} {r.stockUnit}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.sheetEquivalent != null ? qty(r.sheetEquivalent) : '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.offcutCount || '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.offcutCount ? `${qty(r.offcutAreaInStockUnit)} ${r.stockUnit}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataGridPagination
            page={inventoryStatusGrid.page}
            pageCount={inventoryStatusGrid.pageCount}
            totalCount={inventoryStatusGrid.totalCount}
            startIndex={inventoryStatusGrid.startIndex}
            endIndex={inventoryStatusGrid.endIndex}
            onPageChange={inventoryStatusGrid.setPage}
          />
        </div>
      )}

      {tab === 'Sales Register' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">From Date</label>
              <input type="date" value={salesFrom} max={salesTo || undefined} onChange={(e) => salesDateSetters.onFromChange(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To Date</label>
              <input type="date" value={salesTo} min={salesFrom || undefined} onChange={(e) => salesDateSetters.onToChange(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer (optional)</label>
              <select value={salesCustomerId} onChange={(e) => setSalesCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All customers</option>
                {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={salesGrid.search}
            onChange={salesGrid.setSearch}
            placeholder="Search invoice no. or customer…"
            pageSize={salesGrid.pageSize}
            onPageSizeChange={salesGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printSales} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => salesGrid.toggleSort('invoiceNo')}>
                    Invoice No. <SortIcon column="invoiceNo" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => salesGrid.toggleSort('invoiceDate')}>
                    Date <SortIcon column="invoiceDate" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => salesGrid.toggleSort('customerName')}>
                    Customer <SortIcon column="customerName" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => salesGrid.toggleSort('taxableValue')} align="right">
                    Taxable <SortIcon column="taxableValue" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => salesGrid.toggleSort('taxValue')} align="right">
                    Tax <SortIcon column="taxValue" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => salesGrid.toggleSort('totalValue')} align="right">
                    Total <SortIcon column="totalValue" sortKey={salesGrid.sortKey} sortDir={salesGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingSales && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingSales && salesGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                      <BarChart3 size={28} className="mx-auto mb-2 text-slate-300" />
                      {salesGrid.search ? 'No sales match your search.' : 'No sales in the register yet.'}
                    </td>
                  </tr>
                )}
                {salesGrid.rows.map((s) => (
                  <tr key={s.invoiceNo} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3 font-medium text-brand-700">{s.invoiceNo}</td>
                    <td className="px-5 py-3 text-slate-600">{new Date(s.invoiceDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3 text-slate-700">{s.customerName}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(s.taxableValue)}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{money(s.taxValue)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(s.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
              {sales && sales.items.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-slate-600">Total (all matching rows)</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-brand-900">{money(sales.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <DataGridPagination
            page={salesGrid.page}
            pageCount={salesGrid.pageCount}
            totalCount={salesGrid.totalCount}
            startIndex={salesGrid.startIndex}
            endIndex={salesGrid.endIndex}
            onPageChange={salesGrid.setPage}
          />
          </div>
        </div>
      )}

      {tab === 'Collection Register' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">From Date</label>
              <input type="date" value={collFrom} max={collTo || undefined} onChange={(e) => collDateSetters.onFromChange(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">To Date</label>
              <input type="date" value={collTo} min={collFrom || undefined} onChange={(e) => collDateSetters.onToChange(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Collection Type</label>
              <select value={collMode} onChange={(e) => setCollMode(e.target.value)} className={inputClass}>
                <option value="">All types</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer (optional)</label>
              <select value={collCustomerId} onChange={(e) => setCollCustomerId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">All customers</option>
                {customers?.items.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <DataGridSearchBar
              value={collectionGrid.search}
              onChange={collectionGrid.setSearch}
              placeholder="Search voucher no., customer, mode or reference…"
              pageSize={collectionGrid.pageSize}
              onPageSizeChange={collectionGrid.setPageSize}
              rightSlot={<DataGridButton onClick={printCollections} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                    <SortableTh onClick={() => collectionGrid.toggleSort('voucherNo')}>
                      Voucher No. <SortIcon column="voucherNo" sortKey={collectionGrid.sortKey} sortDir={collectionGrid.sortDir} />
                    </SortableTh>
                    <SortableTh onClick={() => collectionGrid.toggleSort('voucherDate')}>
                      Date <SortIcon column="voucherDate" sortKey={collectionGrid.sortKey} sortDir={collectionGrid.sortDir} />
                    </SortableTh>
                    <SortableTh onClick={() => collectionGrid.toggleSort('customerName')}>
                      Customer <SortIcon column="customerName" sortKey={collectionGrid.sortKey} sortDir={collectionGrid.sortDir} />
                    </SortableTh>
                    <SortableTh onClick={() => collectionGrid.toggleSort('mode')}>
                      Mode <SortIcon column="mode" sortKey={collectionGrid.sortKey} sortDir={collectionGrid.sortDir} />
                    </SortableTh>
                    <Th>Reference</Th>
                    <SortableTh onClick={() => collectionGrid.toggleSort('amount')} align="right">
                      Amount <SortIcon column="amount" sortKey={collectionGrid.sortKey} sortDir={collectionGrid.sortDir} />
                    </SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingCollections && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                  {!loadingCollections && collectionGrid.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                        <Banknote size={28} className="mx-auto mb-2 text-slate-300" />
                        {collectionGrid.search ? 'No collections match your search.' : 'No collections recorded yet.'}
                      </td>
                    </tr>
                  )}
                  {collectionGrid.rows.map((r) => (
                    <tr key={r.voucherId} className={DATA_GRID_ROW_CLASS}>
                      <td className="px-5 py-3 font-medium text-brand-700">{r.voucherNo ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{new Date(r.voucherDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3 text-slate-700">{r.customerName ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{r.mode}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{r.referenceNo ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                {collections && collections.items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200">
                      <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-slate-600">Total (all matching rows)</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-brand-900">{money(collections.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <DataGridPagination
              page={collectionGrid.page}
              pageCount={collectionGrid.pageCount}
              totalCount={collectionGrid.totalCount}
              startIndex={collectionGrid.startIndex}
              endIndex={collectionGrid.endIndex}
              onPageChange={collectionGrid.setPage}
            />
          </div>
        </div>
      )}

      {tab === 'Receivables Ageing' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <DataGridSearchBar
            value={ageingGrid.search}
            onChange={ageingGrid.setSearch}
            placeholder="Search customer or invoice no…"
            pageSize={ageingGrid.pageSize}
            onPageSizeChange={ageingGrid.setPageSize}
            rightSlot={<DataGridButton onClick={printAgeing} title="Print this report"><Printer size={15} /> Print</DataGridButton>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                  <SortableTh onClick={() => ageingGrid.toggleSort('customerName')}>
                    Customer <SortIcon column="customerName" sortKey={ageingGrid.sortKey} sortDir={ageingGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => ageingGrid.toggleSort('invoiceNo')}>
                    Invoice No. <SortIcon column="invoiceNo" sortKey={ageingGrid.sortKey} sortDir={ageingGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => ageingGrid.toggleSort('invoiceDate')}>
                    Date <SortIcon column="invoiceDate" sortKey={ageingGrid.sortKey} sortDir={ageingGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => ageingGrid.toggleSort('totalValue')} align="right">
                    Value <SortIcon column="totalValue" sortKey={ageingGrid.sortKey} sortDir={ageingGrid.sortDir} />
                  </SortableTh>
                  <SortableTh onClick={() => ageingGrid.toggleSort('ageDays')} align="right">
                    Age (days) <SortIcon column="ageDays" sortKey={ageingGrid.sortKey} sortDir={ageingGrid.sortDir} />
                  </SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingAgeing && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loadingAgeing && ageingGrid.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-14 text-center text-slate-400">
                      <BarChart3 size={28} className="mx-auto mb-2 text-slate-300" />
                      {ageingGrid.search ? 'No records match your search.' : 'Nothing outstanding.'}
                    </td>
                  </tr>
                )}
                {ageingGrid.rows.map((r, i) => (
                  <tr key={`${r.invoiceNo}-${i}`} className={DATA_GRID_ROW_CLASS}>
                    <td className="px-5 py-3 text-slate-800">{r.customerName}</td>
                    <td className="px-5 py-3 text-slate-600">{r.invoiceNo}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(r.invoiceDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(r.totalValue)}</td>
                    <td className={`px-5 py-3 text-right font-medium ${r.ageDays > 45 ? 'text-red-600' : r.ageDays > 20 ? 'text-amber-600' : 'text-emerald-700'}`}>{r.ageDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataGridPagination
            page={ageingGrid.page}
            pageCount={ageingGrid.pageCount}
            totalCount={ageingGrid.totalCount}
            startIndex={ageingGrid.startIndex}
            endIndex={ageingGrid.endIndex}
            onPageChange={ageingGrid.setPage}
          />
        </div>
      )}

      {tab === 'Customer Transactions' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Search by Phone Number (optional)</label>
              <input
                value={txnPhoneSearch}
                onChange={(e) => {
                  const term = e.target.value
                  setTxnPhoneSearch(term)
                  // Narrowing the list away from the currently selected customer clears the
                  // selection, rather than leaving a stale report on screen for a hidden option.
                  const stillVisible = customers?.items.some(
                    (c) => c.customerId === txnCustomerId && (c.mobile?.toLowerCase().includes(term.trim().toLowerCase()) || c.phone?.toLowerCase().includes(term.trim().toLowerCase())),
                  )
                  if (term.trim() && !stillVisible) setTxnCustomerId('')
                }}
                placeholder="Search customers by phone…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer *</label>
              <select
                value={txnCustomerId}
                onChange={(e) => setTxnCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
              >
                <option value="">{txnPhoneSearch.trim() ? `Select customer… (${txnCustomerOptions.length} match${txnCustomerOptions.length === 1 ? '' : 'es'})` : 'Select customer…'}</option>
                {txnCustomerOptions.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name}{c.mobile ? ` — ${c.mobile}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!txnCustomerId && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-14 text-center text-slate-400">
              <Wallet2 size={28} className="mx-auto mb-2 text-slate-300" />
              Select a customer to see their sales, payments and running balance.
            </div>
          )}

          {txnCustomerId && txnReport && (
            <div className="grid sm:grid-cols-3 gap-4">
              <SummaryCard label="Total Sales" value={money(txnReport.totalSales)} tone="slate" />
              <SummaryCard label="Total Payments" value={money(txnReport.totalPayments)} tone="emerald" />
              <SummaryCard
                label="Balance Outstanding"
                value={money(txnReport.balance)}
                tone={txnReport.balance > 0 ? 'red' : 'emerald'}
              />
            </div>
          )}

          {txnCustomerId && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <DataGridSearchBar
                value={txnGrid.search}
                onChange={txnGrid.setSearch}
                placeholder="Search type or document no…"
                pageSize={txnGrid.pageSize}
                onPageSizeChange={txnGrid.setPageSize}
                rightSlot={
                  <DataGridButton onClick={printTxn} title="Print this statement">
                    <Printer size={15} /> Print
                  </DataGridButton>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                      <SortableTh onClick={() => txnGrid.toggleSort('txnDate')}>
                        Date <SortIcon column="txnDate" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                      <SortableTh onClick={() => txnGrid.toggleSort('type')}>
                        Type <SortIcon column="type" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                      <SortableTh onClick={() => txnGrid.toggleSort('docNo')}>
                        Doc No. <SortIcon column="docNo" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                      <SortableTh onClick={() => txnGrid.toggleSort('debit')} align="right">
                        Sale (Dr) <SortIcon column="debit" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                      <SortableTh onClick={() => txnGrid.toggleSort('credit')} align="right">
                        Payment (Cr) <SortIcon column="credit" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                      <SortableTh onClick={() => txnGrid.toggleSort('balance')} align="right">
                        Balance <SortIcon column="balance" sortKey={txnGrid.sortKey} sortDir={txnGrid.sortDir} />
                      </SortableTh>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingTxn && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
                    {!loadingTxn && txnGrid.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                          <Wallet2 size={28} className="mx-auto mb-2 text-slate-300" />
                          {txnGrid.search ? 'No transactions match your search.' : 'No sales or payments recorded for this customer yet.'}
                        </td>
                      </tr>
                    )}
                    {txnGrid.rows.map((r) => (
                      <tr key={`${r.type}-${r.docId}`} className={DATA_GRID_ROW_CLASS}>
                        <td className="px-5 py-3 text-slate-600">{new Date(r.txnDate).toLocaleDateString('en-IN')}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${r.type === 'Sale' ? 'bg-slate-100 text-slate-600 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                            {r.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-brand-700">{r.docNo ?? '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{r.debit > 0 ? money(r.debit) : '—'}</td>
                        <td className="px-5 py-3 text-right text-emerald-700">{r.credit > 0 ? money(r.credit) : '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataGridPagination
                page={txnGrid.page}
                pageCount={txnGrid.pageCount}
                totalCount={txnGrid.totalCount}
                startIndex={txnGrid.startIndex}
                endIndex={txnGrid.endIndex}
                onPageChange={txnGrid.setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'emerald' | 'red' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-600' : 'text-slate-800'
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase mb-1">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
