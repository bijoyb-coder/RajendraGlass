import { api } from '../../app/api'
import type { DashboardSummaryDto } from '../../lib/types'

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSummary: builder.query<DashboardSummaryDto, void>({
      query: () => '/dashboard/summary',
      providesTags: ['Dashboard'],
    }),
  }),
})

export const { useGetSummaryQuery } = dashboardApi
