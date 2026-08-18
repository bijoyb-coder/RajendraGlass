import { api } from '../../app/api'

export interface PermissionDto {
  permissionId: number
  code: string
  module: string
  description?: string | null
}

export interface RoleDto {
  roleId: number
  name: string
  description?: string | null
  isActive: boolean
  isMfaRequired: boolean
  permissions: string[]
}

export interface AdminUserDto {
  userId: number
  username: string
  fullName: string
  email?: string | null
  isActive: boolean
  mfaEnabled: boolean
  failedAttempts: number
  isLocked: boolean
  lastLoginOn?: string | null
  roles: string[]
}

export interface CreateUserRequest {
  username: string
  fullName: string
  email?: string
  password: string
  roleIds: number[]
}

export const adminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listPermissions: builder.query<{ items: PermissionDto[] }, void>({
      query: () => '/permissions',
    }),
    listRoles: builder.query<{ items: RoleDto[] }, void>({
      query: () => '/roles',
      providesTags: ['Role'],
    }),
    updateRolePermissions: builder.mutation<void, { roleId: number; permissionCodes: string[] }>({
      query: ({ roleId, permissionCodes }) => ({ url: `/roles/${roleId}/permissions`, method: 'PUT', body: { permissionCodes } }),
      invalidatesTags: ['Role'],
    }),

    listUsers: builder.query<{ items: AdminUserDto[] }, void>({
      query: () => '/users',
      providesTags: ['User'],
    }),
    createUser: builder.mutation<{ userId: number }, CreateUserRequest>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    updateUserRoles: builder.mutation<void, { userId: number; roleIds: number[] }>({
      query: ({ userId, roleIds }) => ({ url: `/users/${userId}/roles`, method: 'PUT', body: roleIds }),
      invalidatesTags: ['User'],
    }),
    deactivateUser: builder.mutation<void, number>({
      query: (id) => ({ url: `/users/${id}/deactivate`, method: 'POST' }),
      invalidatesTags: ['User'],
    }),
    activateUser: builder.mutation<void, number>({
      query: (id) => ({ url: `/users/${id}/activate`, method: 'POST' }),
      invalidatesTags: ['User'],
    }),
  }),
})

export const {
  useListPermissionsQuery,
  useListRolesQuery,
  useUpdateRolePermissionsMutation,
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserRolesMutation,
  useDeactivateUserMutation,
  useActivateUserMutation,
} = adminApi
