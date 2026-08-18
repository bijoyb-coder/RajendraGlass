import { api } from '../../app/api'

export interface GatewayLogDto {
  gatewayLogId: number
  gatewayType: string
  operation: string
  provider: string
  docType: string
  docId: number
  status: string
  errorMessage?: string | null
  durationMs: number
  createdOn: string
}

export const integrationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listGatewayLogs: builder.query<{ items: GatewayLogDto[]; total: number; eInvoiceProvider: string; ewayBillProvider: string }, { docType?: string } | void>({
      query: (args) => ({ url: '/integration/logs', params: args ?? {} }),
    }),
  }),
})

export const { useListGatewayLogsQuery } = integrationApi
