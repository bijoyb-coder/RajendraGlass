import { api } from '../../app/api'
import type { EmployeeDto, CreateEmployeeRequest, AttendanceDto, MarkAttendanceRequest } from '../../lib/types'

export const hrApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listEmployees: builder.query<{ items: EmployeeDto[] }, void>({
      query: () => '/employees',
      providesTags: ['Employee'],
    }),
    createEmployee: builder.mutation<{ employeeId: number }, CreateEmployeeRequest>({
      query: (body) => ({ url: '/employees', method: 'POST', body }),
      invalidatesTags: ['Employee'],
    }),
    deactivateEmployee: builder.mutation<void, number>({
      query: (id) => ({ url: `/employees/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: ['Employee'],
    }),

    listAttendance: builder.query<{ items: AttendanceDto[] }, { date?: string } | void>({
      query: (args) => ({ url: '/attendance', params: args ?? {} }),
      providesTags: ['Attendance'],
    }),
    markAttendance: builder.mutation<{ attendanceId: number }, MarkAttendanceRequest>({
      query: (body) => ({ url: '/attendance', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),
    deleteAttendance: builder.mutation<void, number>({
      query: (id) => ({ url: `/attendance/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Attendance'],
    }),
  }),
})

export const {
  useListEmployeesQuery,
  useCreateEmployeeMutation,
  useDeactivateEmployeeMutation,
  useListAttendanceQuery,
  useMarkAttendanceMutation,
  useDeleteAttendanceMutation,
} = hrApi
