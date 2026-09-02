import { api } from '../../app/api'
import type { CompanyDto, CustomerDto, ProductDto, TransporterDto, VehicleDto, SubCategoryDto, CategoryDto } from '../../lib/types'

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
    updateProduct: builder.mutation<void, { id: number; body: Partial<ProductDto> }>({
      query: ({ id, body }) => ({ url: `/products/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Product'],
    }),
    deleteProduct: builder.mutation<void, number>({
      query: (id) => ({ url: `/products/${id}`, method: 'DELETE' }),
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
    updateCustomer: builder.mutation<void, { id: number; body: Partial<CustomerDto> }>({
      query: ({ id, body }) => ({ url: `/customers/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Customer'],
    }),
    deleteCustomer: builder.mutation<void, number>({
      query: (id) => ({ url: `/customers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Customer'],
    }),

    listTransporters: builder.query<{ items: TransporterDto[] }, void>({
      query: () => '/transporters',
      providesTags: ['Transporter'],
    }),
    listVehicles: builder.query<{ items: VehicleDto[] }, number>({
      query: (transporterId) => `/transporters/${transporterId}/vehicles`,
    }),

    // Sub-Category Master. Also reused by the Category page's Sub-Category dropdown — one list,
    // no separate "/active" endpoint (see server/Controllers/CategoryController.cs).
    listSubCategories: builder.query<{ items: SubCategoryDto[] }, { search?: string } | void>({
      query: (args) => ({ url: '/subcategories', params: args ?? {} }),
      providesTags: ['SubCategory'],
    }),
    createSubCategory: builder.mutation<SubCategoryDto, Partial<SubCategoryDto>>({
      query: (body) => ({ url: '/subcategories', method: 'POST', body }),
      invalidatesTags: ['SubCategory'],
    }),
    updateSubCategory: builder.mutation<void, { id: number; body: Partial<SubCategoryDto> }>({
      query: ({ id, body }) => ({ url: `/subcategories/${id}`, method: 'PUT', body }),
      invalidatesTags: ['SubCategory'],
    }),
    deleteSubCategory: builder.mutation<void, number>({
      query: (id) => ({ url: `/subcategories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SubCategory'],
    }),

    // Category Master.
    listCategories: builder.query<{ items: CategoryDto[] }, { search?: string } | void>({
      query: (args) => ({ url: '/categories', params: args ?? {} }),
      providesTags: ['Category'],
    }),
    createCategory: builder.mutation<CategoryDto, Partial<CategoryDto>>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      // A new Category never changes what any Sub-Category dropdown option looks like, but it
      // does change canDelete on its own Sub-Category's row in the SubCategories grid.
      invalidatesTags: ['Category', 'SubCategory'],
    }),
    updateCategory: builder.mutation<void, { id: number; body: Partial<CategoryDto> }>({
      query: ({ id, body }) => ({ url: `/categories/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Category', 'SubCategory'],
    }),
    deleteCategory: builder.mutation<void, number>({
      query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Category', 'SubCategory'],
    }),
  }),
})

export const {
  useGetCompanyQuery,
  useUpdateCompanyMutation,
  useListProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useListCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useListTransportersQuery,
  useListVehiclesQuery,
  useListSubCategoriesQuery,
  useCreateSubCategoryMutation,
  useUpdateSubCategoryMutation,
  useDeleteSubCategoryMutation,
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = mastersApi
