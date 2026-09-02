import { api } from '../../app/api'
import type { CompanyDto, CustomerDto, ProductDto, TransporterDto, VehicleDto, SubCategoryDto, CategoryDto, TypeDto } from '../../lib/types'

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
      // A nonzero Opening Balance posts a real Inventory.StockOpening document — see
      // ProductsController.Create — so Stock-related caches need invalidating too.
      invalidatesTags: ['Product', 'Stock', 'StockOpening'],
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

    // Category Master — the parent side of Category → Sub-Category.
    listCategories: builder.query<{ items: CategoryDto[] }, { search?: string } | void>({
      query: (args) => ({ url: '/categories', params: args ?? {} }),
      providesTags: ['Category'],
    }),
    createCategory: builder.mutation<CategoryDto, Partial<CategoryDto>>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation<void, { id: number; body: Partial<CategoryDto> }>({
      query: ({ id, body }) => ({ url: `/categories/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Category', 'SubCategory'],
    }),
    deleteCategory: builder.mutation<void, number>({
      query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Category'],
    }),

    // Sub-Category Master — the child side. Also reused by Product Master's cascading dropdown via
    // the optional categoryId filter — one list, no separate "/categories/{id}/subcategories" route
    // (see server/Controllers/CategoryController.cs).
    listSubCategories: builder.query<{ items: SubCategoryDto[] }, { search?: string; categoryId?: number } | void>({
      query: (args) => ({ url: '/subcategories', params: args ?? {} }),
      providesTags: ['SubCategory'],
    }),
    createSubCategory: builder.mutation<SubCategoryDto, Partial<SubCategoryDto>>({
      query: (body) => ({ url: '/subcategories', method: 'POST', body }),
      // A new Sub-Category changes what its parent Category's canDelete looks like too.
      invalidatesTags: ['SubCategory', 'Category'],
    }),
    updateSubCategory: builder.mutation<void, { id: number; body: Partial<SubCategoryDto> }>({
      query: ({ id, body }) => ({ url: `/subcategories/${id}`, method: 'PUT', body }),
      invalidatesTags: ['SubCategory', 'Category'],
    }),
    deleteSubCategory: builder.mutation<void, number>({
      query: (id) => ({ url: `/subcategories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SubCategory', 'Category'],
    }),

    // Type Master. Deliberately just typeId + name (see server/Controllers/TypeController.cs) --
    // no Code column, unlike Category/SubCategory. Never physically deletable once a Product
    // references it, so lifecycle is Activate/Deactivate, not Delete.
    listTypes: builder.query<{ items: TypeDto[] }, { search?: string } | void>({
      query: (args) => ({ url: '/types', params: args ?? {} }),
      providesTags: ['Type'],
    }),
    listActiveTypes: builder.query<{ items: TypeDto[] }, void>({
      query: () => '/types/active',
      providesTags: ['Type'],
    }),
    createType: builder.mutation<TypeDto, Partial<TypeDto>>({
      query: (body) => ({ url: '/types', method: 'POST', body }),
      invalidatesTags: ['Type'],
    }),
    updateType: builder.mutation<void, { id: number; body: Partial<TypeDto> }>({
      query: ({ id, body }) => ({ url: `/types/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Type'],
    }),
    deactivateType: builder.mutation<void, number>({
      query: (id) => ({ url: `/types/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: ['Type'],
    }),
    activateType: builder.mutation<void, number>({
      query: (id) => ({ url: `/types/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['Type'],
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
  useListTypesQuery,
  useListActiveTypesQuery,
  useCreateTypeMutation,
  useUpdateTypeMutation,
  useDeactivateTypeMutation,
  useActivateTypeMutation,
} = mastersApi
