import { api } from '../../app/api'
import type { UserProfile } from './authSlice'

export interface LoginRequest {
  username: string
  password: string
  mfaCode?: string
}

export interface LoginResponse {
  accessToken: string
  expiresOn: string
  user: UserProfile
  mfaSetupRequired: boolean
  mfaRequired: boolean
}

export interface MfaSetupResponse {
  secret: string
  otpAuthUri: string
}

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    me: builder.query<UserProfile, void>({
      query: () => '/auth/me',
    }),
    logoutApi: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
    // MFA setup/enable run against a short-lived pending token, not the normal session token,
    // so they take it explicitly and override the Authorization header per-call.
    mfaSetup: builder.mutation<MfaSetupResponse, { pendingToken: string }>({
      query: ({ pendingToken }) => ({ url: '/auth/mfa/setup', method: 'POST', headers: { Authorization: `Bearer ${pendingToken}` } }),
    }),
    mfaEnable: builder.mutation<LoginResponse, { pendingToken: string; code: string }>({
      query: ({ pendingToken, code }) => ({ url: '/auth/mfa/enable', method: 'POST', body: { code }, headers: { Authorization: `Bearer ${pendingToken}` } }),
    }),
    mfaDisable: builder.mutation<void, void>({
      query: () => ({ url: '/auth/mfa/disable', method: 'POST' }),
    }),
    changePassword: builder.mutation<void, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),
    unlockUser: builder.mutation<void, number>({
      query: (userId) => ({ url: `/auth/unlock/${userId}`, method: 'POST' }),
      invalidatesTags: ['User'],
    }),
  }),
})

export const {
  useLoginMutation,
  useMeQuery,
  useLogoutApiMutation,
  useMfaSetupMutation,
  useMfaEnableMutation,
  useMfaDisableMutation,
  useChangePasswordMutation,
  useUnlockUserMutation,
} = authApi
