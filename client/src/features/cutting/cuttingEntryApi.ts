import { api } from '../../app/api'
import type { CuttingEntryDto, CreateCuttingEntryRequest } from '../../lib/types'

export const cuttingEntryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listCuttingEntries: builder.query<{ items: CuttingEntryDto[] }, void>({
      query: () => '/cutting-entries',
      providesTags: ['CuttingEntry'],
    }),
    getCuttingEntry: builder.query<CuttingEntryDto, number>({
      query: (id) => `/cutting-entries/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'CuttingEntry', id }],
    }),
    createCuttingEntry: builder.mutation<
      { cuttingEntryId: number; cuttingNo: string; totalPcs: number; totalSqft: number; totalGlassValue: number; totalBillAmount: number },
      CreateCuttingEntryRequest
    >({
      query: (body) => ({ url: '/cutting-entries', method: 'POST', body }),
      invalidatesTags: ['CuttingEntry', 'Stock'],
    }),
    /** Cancel, not a hard delete -- reverses the stock it deducted (see server-side
     * CuttingStockConsumption.Reverse). */
    deleteCuttingEntry: builder.mutation<void, number>({
      query: (id) => ({ url: `/cutting-entries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CuttingEntry', 'Stock'],
    }),
    /** `file` is sent as-is inside a FormData body -- fetchBaseQuery passes FormData through
     * untouched (no JSON.stringify, no Content-Type override), so the browser sets the correct
     * multipart boundary itself. Server re-validates the file's real bytes regardless of what this
     * File object's `.type` claims. */
    uploadCuttingEntryDesign: builder.mutation<void, { id: number; file: File }>({
      query: ({ id, file }) => {
        const body = new FormData()
        body.append('file', file)
        return { url: `/cutting-entries/${id}/design`, method: 'POST', body }
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CuttingEntry', id }],
    }),
    deleteCuttingEntryDesign: builder.mutation<void, number>({
      query: (id) => ({ url: `/cutting-entries/${id}/design`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'CuttingEntry', id }],
    }),
  }),
})

export const {
  useListCuttingEntriesQuery,
  useGetCuttingEntryQuery,
  useCreateCuttingEntryMutation,
  useDeleteCuttingEntryMutation,
  useUploadCuttingEntryDesignMutation,
  useDeleteCuttingEntryDesignMutation,
} = cuttingEntryApi
