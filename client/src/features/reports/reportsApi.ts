import { api } from '../../app/api'
import type { StockSummaryReportRow, SalesRegisterRow, CustomerTransactionReport, GodownStockSummaryRow, RackStockDetailRow, InventoryStatusRow } from '../../lib/types'

export const reportsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    stockSummary: builder.query<{ items: StockSummaryReportRow[] }, void>({
      query: () => '/reports/stock-summary',
    }),
    stockGodownSummary: builder.query<{ items: GodownStockSummaryRow[] }, void>({
      query: () => '/reports/stock-godown-summary',
    }),
    stockRackDetail: builder.query<{ items: RackStockDetailRow[] }, void>({
      query: () => '/reports/stock-rack-detail',
    }),
    inventoryStatus: builder.query<{ items: InventoryStatusRow[] }, void>({
      query: () => '/reports/inventory-status',
    }),
    salesRegister: builder.query<{ items: SalesRegisterRow[]; total: number }, void>({
      query: () => '/reports/sales-register',
    }),
    receivablesAgeing: builder.query<{ items: any[] }, void>({
      query: () => '/reports/receivables-ageing',
    }),
    customerTransactions: builder.query<CustomerTransactionReport, number>({
      query: (customerId) => ({ url: '/reports/customer-transactions', params: { customerId } }),
    }),
  }),
})

export const {
  useStockSummaryQuery,
  useStockGodownSummaryQuery,
  useStockRackDetailQuery,
  useInventoryStatusQuery,
  useSalesRegisterQuery,
  useReceivablesAgeingQuery,
  useCustomerTransactionsQuery,
} = reportsApi
