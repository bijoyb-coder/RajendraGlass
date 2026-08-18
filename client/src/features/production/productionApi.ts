import { api } from '../../app/api'
import type {
  WorkOrderDto, CreateWorkOrderRequest, JobCardDto, CreateJobCardRequest, FinishJobCardRequest, FurnaceBatchDto, CreateFurnaceBatchRequest,
} from '../../lib/types'

export const productionApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listWorkOrders: builder.query<{ items: WorkOrderDto[] }, void>({
      query: () => '/work-orders',
      providesTags: ['WorkOrder'],
    }),
    createWorkOrder: builder.mutation<{ workOrderId: number; workOrderNo: string }, CreateWorkOrderRequest>({
      query: (body) => ({ url: '/work-orders', method: 'POST', body }),
      invalidatesTags: ['WorkOrder', 'SalesOrder'],
    }),
    deleteWorkOrder: builder.mutation<void, number>({
      query: (id) => ({ url: `/work-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['WorkOrder', 'SalesOrder'],
    }),

    listJobCards: builder.query<{ items: JobCardDto[] }, { workOrderId?: number } | void>({
      query: (args) => ({ url: '/job-cards', params: args ?? {} }),
      providesTags: ['JobCard'],
    }),
    createJobCard: builder.mutation<{ jobCardId: number; jobCardNo: string }, CreateJobCardRequest>({
      query: (body) => ({ url: '/job-cards', method: 'POST', body }),
      invalidatesTags: ['JobCard', 'WorkOrder'],
    }),
    finishJobCard: builder.mutation<void, { id: number } & FinishJobCardRequest>({
      query: ({ id, ...body }) => ({ url: `/job-cards/${id}/finish`, method: 'POST', body }),
      invalidatesTags: ['JobCard'],
    }),
    deleteJobCard: builder.mutation<void, number>({
      query: (id) => ({ url: `/job-cards/${id}`, method: 'DELETE' }),
      invalidatesTags: ['JobCard', 'WorkOrder'],
    }),

    listFurnaceBatches: builder.query<{ items: FurnaceBatchDto[] }, void>({
      query: () => '/furnace-batches',
      providesTags: ['FurnaceBatch'],
    }),
    createFurnaceBatch: builder.mutation<{ furnaceBatchId: number; batchNo: string; estCost: number }, CreateFurnaceBatchRequest>({
      query: (body) => ({ url: '/furnace-batches', method: 'POST', body }),
      invalidatesTags: ['FurnaceBatch'],
    }),
    deleteFurnaceBatch: builder.mutation<void, number>({
      query: (id) => ({ url: `/furnace-batches/${id}`, method: 'DELETE' }),
      invalidatesTags: ['FurnaceBatch'],
    }),
  }),
})

export const {
  useListWorkOrdersQuery,
  useCreateWorkOrderMutation,
  useDeleteWorkOrderMutation,
  useListJobCardsQuery,
  useCreateJobCardMutation,
  useFinishJobCardMutation,
  useDeleteJobCardMutation,
  useListFurnaceBatchesQuery,
  useCreateFurnaceBatchMutation,
  useDeleteFurnaceBatchMutation,
} = productionApi
