import { api } from '../../app/api'
import type {
  GodownDto, CreateGodownRequest, UpdateGodownRequest, GodownDetailDto,
  RackDto, CreateRackRequest, UpdateRackRequest,
  RackStockDto, AdjustRackStockRequest, TransferRackStockRequest,
  StockBalanceDto, StockOpeningDto, CreateStockOpeningRequest, StockAdjustmentDto, CreateStockAdjustmentRequest,
  StockTransferDto, CreateStockTransferRequest, OffcutDto, CreateOffcutRequest,
} from '../../lib/types'

export const inventoryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listGodowns: builder.query<{ items: GodownDto[] }, void>({
      query: () => '/godowns',
      providesTags: ['Godown'],
    }),
    getGodown: builder.query<GodownDetailDto, number>({
      query: (id) => `/godowns/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Godown', id }, 'Rack'],
    }),
    createGodown: builder.mutation<{ godownId: number; code: string }, CreateGodownRequest>({
      query: (body) => ({ url: '/godowns', method: 'POST', body }),
      invalidatesTags: ['Godown'],
    }),
    updateGodown: builder.mutation<void, { id: number; body: UpdateGodownRequest }>({
      query: ({ id, body }) => ({ url: `/godowns/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Godown'],
    }),

    listRacks: builder.query<{ items: RackDto[] }, { godownId?: number } | void>({
      query: (args) => ({ url: '/racks', params: args ?? {} }),
      providesTags: ['Rack'],
    }),
    createRack: builder.mutation<{ rackId: number; code: string }, CreateRackRequest>({
      query: (body) => ({ url: '/racks', method: 'POST', body }),
      invalidatesTags: ['Rack', 'Godown'],
    }),
    updateRack: builder.mutation<void, { id: number; body: UpdateRackRequest }>({
      query: ({ id, body }) => ({ url: `/racks/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Rack', 'Godown'],
    }),

    listRackStock: builder.query<{ items: RackStockDto[] }, { godownId?: number; rackId?: number; productId?: number } | void>({
      query: (args) => ({ url: '/rack-stock', params: args ?? {} }),
      providesTags: ['RackStock'],
    }),
    adjustRackStock: builder.mutation<void, AdjustRackStockRequest>({
      query: (body) => ({ url: '/rack-stock/adjust', method: 'POST', body }),
      invalidatesTags: ['RackStock'],
    }),
    transferRackStock: builder.mutation<void, TransferRackStockRequest>({
      query: (body) => ({ url: '/rack-stock/transfer', method: 'POST', body }),
      invalidatesTags: ['RackStock', 'Stock'],
    }),
    deleteRackStock: builder.mutation<void, number>({
      query: (id) => ({ url: `/rack-stock/${id}`, method: 'DELETE' }),
      invalidatesTags: ['RackStock', 'Product'],
    }),

    stockEnquiry: builder.query<{ items: StockBalanceDto[]; total: number }, { godownId?: number; search?: string } | void>({
      query: (args) => ({ url: '/stock', params: args ?? {} }),
      providesTags: ['Stock'],
    }),
    listStockOpenings: builder.query<{ items: StockOpeningDto[] }, void>({
      query: () => '/stock-openings',
      providesTags: ['StockOpening'],
    }),
    createStockOpening: builder.mutation<{ stockOpeningId: number; openingNo: string }, CreateStockOpeningRequest>({
      query: (body) => ({ url: '/stock-openings', method: 'POST', body }),
      invalidatesTags: ['StockOpening', 'Stock'],
    }),
    deleteStockOpening: builder.mutation<void, number>({
      query: (id) => ({ url: `/stock-openings/${id}`, method: 'DELETE' }),
      invalidatesTags: ['StockOpening', 'Stock'],
    }),
    listAdjustments: builder.query<{ items: StockAdjustmentDto[] }, void>({
      query: () => '/stock-adjustments',
      providesTags: ['StockAdjustment'],
    }),
    createAdjustment: builder.mutation<{ stockAdjustmentId: number }, CreateStockAdjustmentRequest>({
      query: (body) => ({ url: '/stock-adjustments', method: 'POST', body }),
      invalidatesTags: ['StockAdjustment', 'Stock'],
    }),
    deleteAdjustment: builder.mutation<void, number>({
      query: (id) => ({ url: `/stock-adjustments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['StockAdjustment', 'Stock'],
    }),
    listTransfers: builder.query<{ items: StockTransferDto[] }, void>({
      query: () => '/stock-transfers',
      providesTags: ['StockTransfer'],
    }),
    createTransfer: builder.mutation<{ stockTransferId: number }, CreateStockTransferRequest>({
      query: (body) => ({ url: '/stock-transfers', method: 'POST', body }),
      invalidatesTags: ['StockTransfer', 'Stock'],
    }),
    listOffcuts: builder.query<{ items: OffcutDto[] }, { productId?: number; status?: string } | void>({
      query: (args) => ({ url: '/offcuts', params: args ?? {} }),
      providesTags: ['Offcut'],
    }),
    createOffcut: builder.mutation<{ offcutId: number }, CreateOffcutRequest>({
      query: (body) => ({ url: '/offcuts', method: 'POST', body }),
      invalidatesTags: ['Offcut'],
    }),
    deleteOffcut: builder.mutation<void, number>({
      query: (id) => ({ url: `/offcuts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Offcut'],
    }),
  }),
})

export const {
  useListGodownsQuery,
  useGetGodownQuery,
  useCreateGodownMutation,
  useUpdateGodownMutation,
  useListRacksQuery,
  useCreateRackMutation,
  useUpdateRackMutation,
  useListRackStockQuery,
  useAdjustRackStockMutation,
  useTransferRackStockMutation,
  useDeleteRackStockMutation,
  useStockEnquiryQuery,
  useListStockOpeningsQuery,
  useCreateStockOpeningMutation,
  useDeleteStockOpeningMutation,
  useListAdjustmentsQuery,
  useCreateAdjustmentMutation,
  useDeleteAdjustmentMutation,
  useListTransfersQuery,
  useCreateTransferMutation,
  useListOffcutsQuery,
  useCreateOffcutMutation,
  useDeleteOffcutMutation,
} = inventoryApi
