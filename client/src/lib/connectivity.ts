// Connectivity watcher (SDD 4.7): navigator.onLine only reflects the local network
// adapter, so we back it with a real reachability probe against the API's anonymous
// /ping endpoint. Consumers get a live boolean plus a way to force a re-check.
import { useSyncExternalStore } from 'react'

const PING_URL = '/api/v1/ping'
const POLL_MS = 15000
const FETCH_TIMEOUT_MS = 4000

let online = navigator.onLine
const listeners = new Set<() => void>()

function setOnline(value: boolean) {
  if (value !== online) {
    online = value
    listeners.forEach((l) => l())
  }
}

export async function probeConnectivity(): Promise<boolean> {
  if (!navigator.onLine) {
    setOnline(false)
    return false
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(PING_URL, { method: 'GET', signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    setOnline(res.ok)
    return res.ok
  } catch {
    setOnline(false)
    return false
  }
}

window.addEventListener('online', () => { void probeConnectivity() })
window.addEventListener('offline', () => setOnline(false))
setInterval(() => { void probeConnectivity() }, POLL_MS)
void probeConnectivity()

export function subscribeConnectivity(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getConnectivitySnapshot() {
  return online
}

export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribeConnectivity, getConnectivitySnapshot)
}
