import { api } from '../../app/api'
import type { CuttingPlanDto, CreateCuttingPlanRequest } from '../../lib/types'

export const cuttingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listCuttingPlans: builder.query<{ items: CuttingPlanDto[] }, void>({
      query: () => '/cutting-plans',
      providesTags: ['CuttingPlan'],
    }),
    createCuttingPlan: builder.mutation<{ cuttingPlanId: number; planNo: string; estimatedSheets: number; yieldPct: number; wasteAreaSqft: number; totalPieces: number }, CreateCuttingPlanRequest>({
      query: (body) => ({ url: '/cutting-plans', method: 'POST', body }),
      invalidatesTags: ['CuttingPlan'],
    }),
    deleteCuttingPlan: builder.mutation<void, number>({
      query: (id) => ({ url: `/cutting-plans/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CuttingPlan', 'SalesOrder'],
    }),
  }),
})

export const { useListCuttingPlansQuery, useCreateCuttingPlanMutation, useDeleteCuttingPlanMutation } = cuttingApi
