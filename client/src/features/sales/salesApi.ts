import { api } from '../../app/api'
import type { CreateInvoiceRequest, InvoiceDto } from '../../lib/types'

export interface EInvoiceResult {
  irn: string
  ackNo: string
  ackDate: string
  qrPayload: string
  provider: string
}

export const salesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listInvoices: builder.query<{ items: InvoiceDto[]; total: number }, { search?: string; page?: number } | void>({
      query: (args) => ({ url: '/invoices', params: args ?? {} }),
      providesTags: ['Invoice'],
    }),
    getInvoice: builder.query<InvoiceDto, number>({
      query: (id) => `/invoices/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Invoice', id }],
    }),
    createInvoice: builder.mutation<InvoiceDto, CreateInvoiceRequest>({
      query: (body) => ({ url: '/invoices', method: 'POST', body }),
      // Invalidate SalesOrder too — converting an order to an invoice locks that order from
      // being invoiced again, and the Sales Orders list needs to reflect that immediately.
      invalidatesTags: ['Invoice', 'Dashboard', 'SalesOrder'],
    }),
    cancelInvoice: builder.mutation<void, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `/invoices/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Invoice', 'Dashboard'],
    }),
    deleteInvoice: builder.mutation<void, number>({
      query: (id) => ({ url: `/invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invoice', 'Dashboard'],
    }),
    generateEInvoice: builder.mutation<EInvoiceResult, number>({
      query: (id) => ({ url: `/invoices/${id}/e-invoice`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Invoice', id }],
    }),
    cancelEInvoice: builder.mutation<void, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `/invoices/${id}/e-invoice/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Invoice', id }],
    }),
  }),
})

export const {
  useListInvoicesQuery,
  useGetInvoiceQuery,
  useCreateInvoiceMutation,
  useCancelInvoiceMutation,
  useDeleteInvoiceMutation,
  useGenerateEInvoiceMutation,
  useCancelEInvoiceMutation,
} = salesApi
