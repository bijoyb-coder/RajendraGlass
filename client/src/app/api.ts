import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react'
import type { RootState } from './store'
import { setCredentials, logout } from '../features/auth/authSlice'

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
// cookie for a new one and retry the original request once. Concurrent 401s share a single
// in-flight refresh instead of each firing their own (a stampede would rotate the token N times
// and strand N-1 of them).
let refreshPromise: Promise<boolean> | null = null

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions)

  if (result.error?.status === 401) {
    const url = typeof args === 'string' ? args : args.url
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return result // never try to refresh a login/refresh call itself
    }

    refreshPromise ??= (async () => {
      const refreshResult = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions)
      const data = refreshResult.data as { accessToken: string; user: any } | undefined
      if (refreshResult.error || !data?.accessToken) {
        api.dispatch(logout())
        return false
      }
      api.dispatch(setCredentials({ accessToken: data.accessToken, user: data.user }))
      return true
    })().finally(() => { refreshPromise = null })

    const refreshed = await refreshPromise
    if (refreshed) {
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
    'Stock', 'StockAdjustment', 'StockTransfer', 'Offcut', 'Supplier', 'PurchaseOrder', 'Grn',
    'PurchaseInvoice', 'Quotation', 'SalesOrder', 'CuttingPlan', 'WorkOrder', 'JobCard',
    'FurnaceBatch', 'Voucher', 'Expense', 'Complaint', 'Employee', 'Attendance', 'CounterInvoice',
    'Role', 'User', 'Notification', 'Godown', 'Rack', 'RackStock',
  ],
  endpoints: () => ({}),
})
