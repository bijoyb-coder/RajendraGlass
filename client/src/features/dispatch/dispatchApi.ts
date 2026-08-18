import { api } from '../../app/api'
import type { CreateWaybillRequest, WaybillDto } from '../../lib/types'

export interface EwayBillResult {
  ewbNo: string
  ewbDate: string
  validUpto: string
  qrPayload: string
  provider: string
}

export const dispatchApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listWaybills: builder.query<{ items: WaybillDto[]; total: number }, { page?: number } | void>({
      query: (args) => ({ url: '/waybills', params: args ?? {} }),
      providesTags: ['Waybill'],
    }),
    getWaybill: builder.query<WaybillDto, number>({
      query: (id) => `/waybills/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Waybill', id }],
    }),
    createWaybill: builder.mutation<WaybillDto, CreateWaybillRequest>({
      query: (body) => ({ url: '/waybills', method: 'POST', body }),
      invalidatesTags: ['Waybill', 'Dashboard'],
    }),
    cancelWaybill: builder.mutation<void, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `/waybills/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Waybill'],
    }),
    generateEwayBill: builder.mutation<EwayBillResult, number>({
      query: (id) => ({ url: `/waybills/${id}/e-way-bill`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Waybill', id }],
    }),
    cancelEwayBill: builder.mutation<void, { id: number; reason: string }>({
      query: ({ id, reason }) => ({ url: `/waybills/${id}/e-way-bill/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Waybill', id }],
    }),
    deleteWaybill: builder.mutation<void, number>({
      query: (id) => ({ url: `/waybills/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Waybill'],
    }),
  }),
})

export const {
  useListWaybillsQuery,
  useGetWaybillQuery,
  useCreateWaybillMutation,
  useCancelWaybillMutation,
  useGenerateEwayBillMutation,
  useCancelEwayBillMutation,
  useDeleteWaybillMutation,
} = dispatchApi
