// Shared token-refresh logic for BOTH the REST layer's silent 401 retry (app/api.ts) and
// SignalR's own reconnect loop (lib/signalr.ts) — a single in-flight promise, so a token that goes
// stale while both paths are active concurrently only ever triggers one call to /auth/refresh.
// This matters because the refresh cookie is single-use/rotating (see
// AuthController.Refresh -- "Rotate: revoke the used token, issue a new one"): two concurrent
// refresh calls would otherwise race, and whichever lands second gets rejected because the first
// already revoked the cookie out from under it.
import { store } from '../app/store'
import { setCredentials, logout } from '../features/auth/authSlice'

let refreshPromise: Promise<string> | null = null

/** Exchanges the refresh cookie for a new access token, updating the store on success (or logging
 * out on a genuine rejection). Returns the new access token, or '' if the refresh failed. Safe to
 * call from multiple places concurrently — they all share the one in-flight request. */
export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        store.dispatch(logout())
        return ''
      }
      const data = (await res.json()) as { accessToken: string; user: any }
      store.dispatch(setCredentials({ accessToken: data.accessToken, user: data.user }))
      return data.accessToken
    } catch {
      // Network hiccup, not a real auth rejection — don't log the user out over a blip.
      return ''
    }
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}
