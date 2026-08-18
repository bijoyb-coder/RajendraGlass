import { api } from '../../app/api'
import type { VoucherDto, CreateVoucherRequest, UpdateVoucherRequest, CreateVoucherSplitRequest, ExpenseDto, CreateExpenseRequest, CustomerOutstandingDto } from '../../lib/types'

export const financeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listVouchers: builder.query<{ items: VoucherDto[] }, { voucherType?: string } | void>({
      query: (args) => ({ url: '/vouchers', params: args ?? {} }),
      providesTags: ['Voucher'],
    }),
    getVoucher: builder.query<VoucherDto, number>({
      query: (id) => `/vouchers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Voucher', id }],
    }),
    createVoucher: builder.mutation<{ voucherId: number; voucherNo: string }, CreateVoucherRequest>({
      query: (body) => ({ url: '/vouchers', method: 'POST', body }),
      invalidatesTags: ['Voucher'],
    }),
    createVoucherSplit: builder.mutation<{ splitGroupId: string | null; vouchers: { voucherId: number; voucherNo: string }[] }, CreateVoucherSplitRequest>({
      query: (body) => ({ url: '/vouchers/split', method: 'POST', body }),
      invalidatesTags: ['Voucher'],
    }),
    updateVoucher: builder.mutation<void, { id: number; body: UpdateVoucherRequest }>({
      query: ({ id, body }) => ({ url: `/vouchers/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => ['Voucher', { type: 'Voucher', id }],
    }),
    deleteVoucher: builder.mutation<void, number>({
      query: (id) => ({ url: `/vouchers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Voucher'],
    }),

    listExpenses: builder.query<{ items: ExpenseDto[] }, void>({
      query: () => '/expenses',
      providesTags: ['Expense'],
    }),
    createExpense: builder.mutation<{ expenseId: number; expenseNo: string; needsApproval: boolean }, CreateExpenseRequest>({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expense'],
    }),

    receivables: builder.query<{ items: CustomerOutstandingDto[] }, void>({
      query: () => '/ledgers/receivables',
    }),
  }),
})

export const {
  useListVouchersQuery,
  useGetVoucherQuery,
  useCreateVoucherMutation,
  useCreateVoucherSplitMutation,
  useUpdateVoucherMutation,
  useDeleteVoucherMutation,
  useListExpensesQuery,
  useCreateExpenseMutation,
  useReceivablesQuery,
} = financeApi
