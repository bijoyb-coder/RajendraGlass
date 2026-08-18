import { api } from '../../app/api'
import type { ComplaintDto, CreateComplaintRequest } from '../../lib/types'

export const crmApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listComplaints: builder.query<{ items: ComplaintDto[] }, void>({
      query: () => '/complaints',
      providesTags: ['Complaint'],
    }),
    createComplaint: builder.mutation<{ complaintId: number; complaintNo: string }, CreateComplaintRequest>({
      query: (body) => ({ url: '/complaints', method: 'POST', body }),
      invalidatesTags: ['Complaint'],
    }),
    resolveComplaint: builder.mutation<void, { id: number; resolution: string }>({
      query: ({ id, resolution }) => ({ url: `/complaints/${id}/resolve`, method: 'POST', body: { resolution } }),
      invalidatesTags: ['Complaint'],
    }),
    deleteComplaint: builder.mutation<void, number>({
      query: (id) => ({ url: `/complaints/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Complaint'],
    }),
  }),
})

export const { useListComplaintsQuery, useCreateComplaintMutation, useResolveComplaintMutation, useDeleteComplaintMutation } = crmApi
