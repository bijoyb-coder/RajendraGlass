import { api } from '../../app/api'
import type { CompanyDto, CustomerDto, ProductDto, TransporterDto, VehicleDto } from '../../lib/types'

export const mastersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getCompany: builder.query<CompanyDto, void>({
      query: () => '/company',
      providesTags: ['Company'],
    }),
    updateCompany: builder.mutation<void, CompanyDto>({
      query: (body) => ({ url: '/company', method: 'PUT', body }),
      invalidatesTags: ['Company'],
    }),

    listProducts: builder.query<{ items: ProductDto[]; total: number }, { search?: string } | void>({
      query: (args) => ({ url: '/products', params: args ?? {} }),
      providesTags: ['Product'],
    }),
    createProduct: builder.mutation<ProductDto, Partial<ProductDto>>({
      query: (body) => ({ url: '/products', method: 'POST', body }),
      invalidatesTags: ['Product'],
    }),

    listCustomers: builder.query<{ items: CustomerDto[]; total: number }, { search?: string } | void>({
      query: (args) => ({ url: '/customers', params: args ?? {} }),
      providesTags: ['Customer'],
    }),
    createCustomer: builder.mutation<CustomerDto, Partial<CustomerDto>>({
      query: (body) => ({ url: '/customers', method: 'POST', body }),
      invalidatesTags: ['Customer'],
    }),

    listTransporters: builder.query<{ items: TransporterDto[] }, void>({
      query: () => '/transporters',
      providesTags: ['Transporter'],
    }),
    listVehicles: builder.query<{ items: VehicleDto[] }, number>({
      query: (transporterId) => `/transporters/${transporterId}/vehicles`,
    }),
  }),
})

export const {
  useGetCompanyQuery,
  useUpdateCompanyMutation,
  useListProductsQuery,
  useCreateProductMutation,
  useListCustomersQuery,
  useCreateCustomerMutation,
  useListTransportersQuery,
  useListVehiclesQuery,
} = mastersApi
