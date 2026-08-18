import { api } from '../../app/api'
import type { CreateQuotationLine } from '../../lib/types'

export type PaymentType = 'Cash' | 'Cheque' | 'UPI'
/** Includes the header-level summary value the server returns when more than one method was used. */
export type PaymentTypeOrSplit = PaymentType | 'Split'

/** Same shape as CreateQuotationLine — the server prices a counter sale through the identical
 * Quotation calculation engine, so a line here must carry the same fields. */
export type CreateCounterInvoiceLineRequest = CreateQuotationLine

/** One method's share of the bill — Cash, Cheque and UPI can be combined freely as long as
 * every share together adds up to the invoice total exactly. */
export interface CounterInvoicePaymentRequest {
  paymentType: PaymentType
  amount: number
  referenceNo?: string | null
}

export interface CreateCounterInvoiceRequest {
  customerId?: number | null
  walkInCustomerName?: string | null
  lines: CreateCounterInvoiceLineRequest[]
  payments: CounterInvoicePaymentRequest[]
  originalCapturedOn?: string | null
}

export interface CounterInvoicePaymentDto {
  paymentType: PaymentType
  amount: number
  referenceNo?: string | null
}

export interface CounterInvoiceDto {
  invoiceId: number
  invoiceNo: string | null
  customerId?: number | null
  customerName?: string | null
  invoiceDate: string
  taxableValue: number
  taxValue: number
  totalValue: number
  paymentType: PaymentTypeOrSplit
  referenceNo?: string | null
  payments: CounterInvoicePaymentDto[]
  status: string
  syncedFromOffline: boolean
}

export const counterBillingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listCounterInvoices: builder.query<{ items: CounterInvoiceDto[]; total: number }, void>({
      query: () => '/counter-invoices',
      providesTags: ['CounterInvoice'],
    }),
    createCounterInvoice: builder.mutation<CounterInvoiceDto, { body: CreateCounterInvoiceRequest; idempotencyKey: string }>({
      query: ({ body, idempotencyKey }) => ({
        url: '/counter-invoices',
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
      invalidatesTags: ['CounterInvoice', 'Stock', 'Dashboard'],
    }),
  }),
})

export const { useListCounterInvoicesQuery, useCreateCounterInvoiceMutation } = counterBillingApi
