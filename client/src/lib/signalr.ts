// Live notification push (SDD 10.1) — connects to NotificationHub, joins are handled server-side
// (per-user and per-role groups from JWT claims), so the client just needs to hold the connection
// open and react to whatever arrives.
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr'
import { store } from '../app/store'
import { api } from '../app/api'
import { pushToast } from './toastBus'
import type { NotificationDto } from '../features/notifications/notificationsApi'

let connection: HubConnection | null = null

export function startNotificationHub() {
  if (connection) return

  connection = new HubConnectionBuilder()
    .withUrl('/hubs/notifications', {
      // Browsers can't set a custom header on the WebSocket handshake — the token travels as a
      // query param instead (server only honours it on the /hubs/* path; see Program.cs).
      accessTokenFactory: () => store.getState().auth.accessToken ?? '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(LogLevel.Warning)
    .build()

  connection.on('notification', (dto: NotificationDto) => {
    store.dispatch(api.util.invalidateTags(['Notification']))
    pushToast({ title: dto.title, message: dto.message ?? undefined, link: dto.link ?? undefined })
  })

  connection.start().catch(() => {
    // Silent — the topbar shows connectivity state already for the REST API; a dropped hub
    // connection isn't worth its own UI noise, and withAutomaticReconnect will keep retrying.
  })
}

export function stopNotificationHub() {
  if (!connection) return
  const toStop = connection
  connection = null
  if (toStop.state !== HubConnectionState.Disconnected) {
    void toStop.stop()
  }
}
