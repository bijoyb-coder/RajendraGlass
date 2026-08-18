import { api } from '../../app/api'
import type { QuotationDto, CreateQuotationRequest, UpdateQuotationRequest, SalesOrderDto, CreateSalesOrderRequest } from '../../lib/types'

export const salesExtraApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listQuotations: builder.query<{ items: QuotationDto[] }, void>({
      query: () => '/quotations',
      providesTags: ['Quotation'],
    }),
    getQuotation: builder.query<QuotationDto, number>({
      query: (id) => `/quotations/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Quotation', id }],
    }),
    createQuotation: builder.mutation<{ quotationId: number; quotationNo: string }, CreateQuotationRequest>({
      query: (body) => ({ url: '/quotations', method: 'POST', body }),
      invalidatesTags: ['Quotation'],
    }),
    updateQuotation: builder.mutation<{ quotationId: number }, { id: number; body: UpdateQuotationRequest }>({
      query: ({ id, body }) => ({ url: `/quotations/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { id }) => ['Quotation', { type: 'Quotation', id }],
    }),
    deleteQuotation: builder.mutation<void, number>({
      query: (id) => ({ url: `/quotations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Quotation'],
    }),

    listSalesOrders: builder.query<{ items: SalesOrderDto[] }, void>({
      query: () => '/sales-orders',
      providesTags: ['SalesOrder'],
    }),
    getSalesOrder: builder.query<SalesOrderDto, number>({
      query: (id) => `/sales-orders/${id}`,
      providesTags: ['SalesOrder'],
    }),
    createSalesOrder: builder.mutation<{ salesOrderId: number; orderNo: string }, CreateSalesOrderRequest>({
      query: (body) => ({ url: '/sales-orders', method: 'POST', body }),
      invalidatesTags: ['SalesOrder', 'Quotation'],
    }),
    deleteSalesOrder: builder.mutation<void, number>({
      query: (id) => ({ url: `/sales-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SalesOrder'],
    }),
  }),
})

export const {
  useListQuotationsQuery,
  useCreateQuotationMutation,
  useUpdateQuotationMutation,
  useDeleteQuotationMutation,
  useGetQuotationQuery,
  useLazyGetQuotationQuery,
  useListSalesOrdersQuery,
  useGetSalesOrderQuery,
  useLazyGetSalesOrderQuery,
  useCreateSalesOrderMutation,
  useDeleteSalesOrderMutation,
} = salesExtraApi
