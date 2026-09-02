// Live notification push (SDD 10.1) — connects to NotificationHub, joins are handled server-side
// (per-user and per-role groups from JWT claims), so the client just needs to hold the connection
// open and react to whatever arrives.
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { store } from '../app/store'
import { api } from '../app/api'
import { refreshAccessToken } from './authRefresh'
import { pushToast } from './toastBus'
import type { NotificationDto } from '../features/notifications/notificationsApi'

let connection: HubConnection | null = null

/** Reads a JWT's `exp` claim (seconds since epoch) without validating the signature — only used
 * client-side to decide whether to proactively refresh; the server still verifies every token for
 * real. Returns null for anything unparseable rather than throwing. */
function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * SignalR calls accessTokenFactory before the very first connection AND before every
 * automatic-reconnect attempt (withAutomaticReconnect below) — unlike REST calls, a negotiate 401
 * never routes through app/api.ts's own silent-refresh flow (that only fires from an RTK Query
 * 401), so a tab left open past the access token's 30-minute lifetime (see server appsettings.json
 * Jwt:AccessTokenMinutes) would otherwise have every reconnect attempt hand the server the same
 * expired token forever, with no REST call ever happening to refresh it. This proactively
 * exchanges the refresh cookie for a new access token whenever the current one is missing or
 * expiring within the next 10s, via the shared lib/authRefresh — the same in-flight refresh a
 * concurrent REST 401 would use, since the refresh cookie is single-use/rotating and two
 * concurrent refreshes would otherwise race each other out.
 */
async function getFreshAccessToken(): Promise<string> {
  const current = store.getState().auth.accessToken
  const expiryMs = current ? jwtExpiryMs(current) : null
  if (current && expiryMs !== null && expiryMs > Date.now() + 10_000) {
    return current
  }

  const refreshed = await refreshAccessToken()
  // A network hiccup during refresh isn't a real auth rejection — fall back to whatever's still in
  // the store (even if stale) rather than negotiating with an empty token; the next reconnect
  // attempt will try again. A genuine rejection already logged the user out via authRefresh.
  return refreshed || store.getState().auth.accessToken || ''
}

const RECONNECT_DELAYS_MS = [0, 2000, 5000, 10000, 30000]

/**
 * withAutomaticReconnect only retries a connection that was once successfully Connected and later
 * dropped — a failed *initial* start() (a transient network blip, or the auth race
 * getFreshAccessToken already guards against but can't eliminate entirely) is never retried by the
 * library itself, silently leaving the hub dead until a full page reload. This drives the same
 * backoff schedule by hand for that first connection only; once start() succeeds even once,
 * withAutomaticReconnect takes over for every later drop.
 */
async function startWithRetry(hub: HubConnection) {
  for (const delay of RECONNECT_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    if (connection !== hub) return // stopNotificationHub() ran while we were waiting
    try {
      await hub.start()
      return
    } catch {
      // Try the next delay in the schedule; the last attempt's failure is simply swallowed —
      // see the comment on connection.start() usage below for why this is silent.
    }
  }
}

export function startNotificationHub() {
  if (connection) return

  connection = new HubConnectionBuilder()
    .withUrl('/hubs/notifications', {
      // Browsers can't set a custom header on the WebSocket handshake — the token travels as a
      // query param instead (server only honours it on the /hubs/* path; see Program.cs).
      accessTokenFactory: getFreshAccessToken,
    })
    .withAutomaticReconnect(RECONNECT_DELAYS_MS)
    .configureLogging(LogLevel.Warning)
    .build()

  connection.on('notification', (dto: NotificationDto) => {
    store.dispatch(api.util.invalidateTags(['Notification']))
    pushToast({ title: dto.title, message: dto.message ?? undefined, link: dto.link ?? undefined })
  })

  // Silent — the topbar shows connectivity state already for the REST API; a dropped hub
  // connection isn't worth its own UI noise, and startWithRetry/withAutomaticReconnect keep trying.
  void startWithRetry(connection)
}

export function stopNotificationHub() {
  if (!connection) return
  const toStop = connection
  connection = null
  if (toStop.state !== HubConnectionState.Disconnected) {
    void toStop.stop()
  }
}
