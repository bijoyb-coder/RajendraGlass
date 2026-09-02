import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { RootState } from './store'
import { refreshAccessToken } from '../lib/authRefresh'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api/v1',
  credentials: 'include', // send/receive the HttpOnly refresh cookie
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

// Silent token refresh (SDD 8.1): on a 401 from an expired access token, exchange the refresh
// cookie for a new one (via the shared lib/authRefresh — SignalR's reconnect loop shares the same
// in-flight refresh, since the refresh cookie is single-use/rotating and two concurrent refreshes
// would otherwise race) and retry the original request once.
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions)

  if (result.error?.status === 401) {
    const url = typeof args === 'string' ? args : args.url
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return result // never try to refresh a login/refresh call itself
    }

    const newToken = await refreshAccessToken()
    if (newToken) {
      result = await rawBaseQuery(args, api, extraOptions)
    }
  }

  return result
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Company', 'Product', 'Customer', 'Invoice', 'Waybill', 'Transporter', 'Dashboard',
    'Stock', 'StockOpening', 'StockAdjustment', 'StockTransfer', 'Offcut', 'Supplier', 'PurchaseOrder', 'Grn',
    'PurchaseInvoice', 'EwayBill', 'Quotation', 'SalesOrder', 'CuttingPlan', 'CuttingEntry', 'WorkOrder', 'JobCard',
    'FurnaceBatch', 'Voucher', 'Expense', 'Complaint', 'Employee', 'Attendance', 'CounterInvoice',
    'Role', 'User', 'Notification', 'Godown', 'Rack', 'RackStock', 'SubCategory', 'Category', 'Type',
  ],
  endpoints: () => ({}),
})
