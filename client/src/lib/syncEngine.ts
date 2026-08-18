// Flushes the offline Counter Billing outbox once connectivity returns (SDD 4.7).
// Each item carries the Idempotency-Key it was queued with, so a flush that gets
// interrupted mid-way (app closed, connection drops again) can safely resume —
// the server returns the original result instead of billing twice.
import { store } from '../app/store'
import { counterBillingApi } from '../features/counter/counterBillingApi'
import { listOutbox, updateOutboxItem, removeOutboxItem, type OutboxItem } from './offlineDb'
import { probeConnectivity, subscribeConnectivity, getConnectivitySnapshot } from './connectivity'

export type SyncResultKind = 'synced' | 'conflict' | 'network-retry'

export interface SyncResult {
  item: OutboxItem
  kind: SyncResultKind
  invoiceNo?: string
  message?: string
}

let flushing = false
const resultListeners = new Set<(results: SyncResult[]) => void>()

export function onSyncCompleted(listener: (results: SyncResult[]) => void) {
  resultListeners.add(listener)
  return () => resultListeners.delete(listener)
}

export async function flushOutbox(): Promise<SyncResult[]> {
  if (flushing) return []
  const reachable = await probeConnectivity()
  if (!reachable) return []

  flushing = true
  const results: SyncResult[] = []
  try {
    const items = (await listOutbox()).filter((i) => i.status === 'pending')
    for (const item of items) {
      await updateOutboxItem(item.localId, { status: 'syncing' })
      try {
        const dto = await store
          .dispatch(
            counterBillingApi.endpoints.createCounterInvoice.initiate({
              idempotencyKey: item.idempotencyKey,
              body: {
                customerId: item.customerId ?? undefined,
                walkInCustomerName: item.walkInCustomerName ?? undefined,
                lines: item.lines,
                payments: item.payments,
                originalCapturedOn: item.capturedOn,
              },
            })
          )
          .unwrap()

        await removeOutboxItem(item.localId)
        results.push({ item, kind: 'synced', invoiceNo: dto.invoiceNo ?? undefined })
      } catch (err: any) {
        const status = err?.status
        if (status === 409 || status === 422) {
          // A real conflict (stock moved from under this sale, etc.) — needs a human, not a retry.
          const detail = err?.data?.detail ?? 'This sale could not be synced automatically.'
          await updateOutboxItem(item.localId, { status: 'error', errorMessage: detail })
          results.push({ item, kind: 'conflict', message: detail })
        } else {
          // Network/server hiccup — leave it queued and try again on the next flush.
          await updateOutboxItem(item.localId, { status: 'pending' })
          results.push({ item, kind: 'network-retry' })
          break // stop this pass; connectivity likely dropped again mid-flush
        }
      }
    }
  } finally {
    flushing = false
  }

  if (results.length > 0) resultListeners.forEach((l) => l(results))
  return results
}

// Fires on any transition to reachable — whether the local adapter came back
// (browser 'online') or the API itself became reachable again (periodic probe).
let wasOnline = getConnectivitySnapshot()
subscribeConnectivity(() => {
  const nowOnline = getConnectivitySnapshot()
  if (nowOnline && !wasOnline) void flushOutbox()
  wasOnline = nowOnline
})
