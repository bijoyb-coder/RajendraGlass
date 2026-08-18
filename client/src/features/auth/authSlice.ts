import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface UserProfile {
  userId: number
  username: string
  fullName: string
  email?: string | null
  roles: string[]
  permissions: string[]
  mfaEnabled: boolean
}

interface AuthState {
  accessToken: string | null
  user: UserProfile | null
  /** Short-lived token issued after a correct password but before MFA is satisfied. Deliberately
   * kept separate from accessToken so RequireAuth never treats a pending session as logged in. */
  mfaPendingToken: string | null
}

const persisted = sessionStorage.getItem('rgc.auth')
const initialState: AuthState = persisted
  ? JSON.parse(persisted)
  : { accessToken: null, user: null, mfaPendingToken: null }

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ accessToken: string; user: UserProfile }>) {
      state.accessToken = action.payload.accessToken
      state.user = action.payload.user
      state.mfaPendingToken = null
      sessionStorage.setItem('rgc.auth', JSON.stringify(state))
    },
    setMfaPendingToken(state, action: PayloadAction<string>) {
      state.mfaPendingToken = action.payload
      sessionStorage.setItem('rgc.auth', JSON.stringify(state))
    },
    logout(state) {
      state.accessToken = null
      state.user = null
      state.mfaPendingToken = null
      sessionStorage.removeItem('rgc.auth')
    },
  },
})

export const { setCredentials, setMfaPendingToken, logout } = authSlice.actions
export default authSlice.reducer

export function hasPermission(user: UserProfile | null, code: string): boolean {
  return !!user?.permissions?.includes(code)
}
