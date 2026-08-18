import { api } from '../../app/api'
import type {
  SupplierDto, PurchaseOrderDto, CreatePurchaseOrderRequest,
  GrnDto, CreateGrnRequest, PurchaseInvoiceDto, CreatePurchaseInvoiceRequest, UpdatePurchaseInvoiceRequest,
} from '../../lib/types'

export const purchaseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listSuppliers: builder.query<{ items: SupplierDto[] }, { search?: string } | void>({
      query: (args) => ({ url: '/suppliers', params: args ?? {} }),
      providesTags: ['Supplier'],
    }),
    createSupplier: builder.mutation<SupplierDto, Partial<SupplierDto>>({
      query: (body) => ({ url: '/suppliers', method: 'POST', body }),
      invalidatesTags: ['Supplier'],
    }),

    listPurchaseOrders: builder.query<{ items: PurchaseOrderDto[] }, void>({
      query: () => '/purchase-orders',
      providesTags: ['PurchaseOrder'],
    }),
    getPurchaseOrder: builder.query<PurchaseOrderDto, number>({
      query: (id) => `/purchase-orders/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PurchaseOrder', id }],
    }),
    createPurchaseOrder: builder.mutation<{ purchaseOrderId: number; poNo: string }, CreatePurchaseOrderRequest>({
      query: (body) => ({ url: '/purchase-orders', method: 'POST', body }),
      invalidatesTags: ['PurchaseOrder'],
    }),
    deletePurchaseOrder: builder.mutation<void, number>({
      query: (id) => ({ url: `/purchase-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PurchaseOrder'],
    }),

    listGrns: builder.query<{ items: GrnDto[] }, void>({
      query: () => '/grns',
      providesTags: ['Grn'],
    }),
    getGrn: builder.query<GrnDto, number>({
      query: (id) => `/grns/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Grn', id }],
    }),
    createGrn: builder.mutation<{ grnId: number; grnNo: string }, CreateGrnRequest>({
      query: (body) => ({ url: '/grns', method: 'POST', body }),
      invalidatesTags: ['Grn', 'Stock', 'PurchaseOrder'],
    }),
    deleteGrn: builder.mutation<void, number>({
      query: (id) => ({ url: `/grns/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Grn', 'Stock', 'PurchaseOrder'],
    }),

    listPurchaseInvoices: builder.query<{ items: PurchaseInvoiceDto[] }, void>({
      query: () => '/purchase-invoices',
      providesTags: ['PurchaseInvoice'],
    }),
    getPurchaseInvoice: builder.query<PurchaseInvoiceDto, number>({
      query: (id) => `/purchase-invoices/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PurchaseInvoice', id }],
    }),
    createPurchaseInvoice: builder.mutation<{ purchaseInvoiceId: number }, CreatePurchaseInvoiceRequest>({
      query: (body) => ({ url: '/purchase-invoices', method: 'POST', body }),
      invalidatesTags: ['PurchaseInvoice', 'Grn'],
    }),
    updatePurchaseInvoice: builder.mutation<void, { id: number; body: UpdatePurchaseInvoiceRequest }>({
      query: ({ id, body }) => ({ url: `/purchase-invoices/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => ['PurchaseInvoice', { type: 'PurchaseInvoice', id }],
    }),
    deletePurchaseInvoice: builder.mutation<void, number>({
      query: (id) => ({ url: `/purchase-invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PurchaseInvoice', 'Grn'],
    }),
  }),
})

export const {
  useListSuppliersQuery,
  useCreateSupplierMutation,
  useListPurchaseOrdersQuery,
  useGetPurchaseOrderQuery,
  useLazyGetPurchaseOrderQuery,
  useCreatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useListGrnsQuery,
  useGetGrnQuery,
  useCreateGrnMutation,
  useDeleteGrnMutation,
  useListPurchaseInvoicesQuery,
  useGetPurchaseInvoiceQuery,
  useCreatePurchaseInvoiceMutation,
  useUpdatePurchaseInvoiceMutation,
  useDeletePurchaseInvoiceMutation,
} = purchaseApi
