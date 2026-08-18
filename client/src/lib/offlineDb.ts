// IndexedDB layer for offline Counter Billing (SDD 4.7 / FRS 9.3).
//
// Two jobs:
//  1. Cache reference data (products, customers) whenever the app is online, so the
//     Counter Billing screen can still look up prices and parties with no network.
//  2. Hold an "outbox" of invoices billed while offline (or while a save request failed),
//     each tagged with a client-generated Idempotency-Key so a retried sync can never
//     double-bill — the server de-dupes on that key (see CounterInvoicesController).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ProductDto, CustomerDto } from './types'
import type { CreateCounterInvoiceLineRequest, CounterInvoicePaymentRequest } from '../features/counter/counterBillingApi'

/** Same fields the server prices a counter line from — kept so an offline sale re-prices
 * identically to the Quotation engine once it syncs, exactly like it would have online. */
export type OfflineCounterLine = CreateCounterInvoiceLineRequest

export type OutboxStatus = 'pending' | 'syncing' | 'error'

export interface OutboxItem {
  localId: string
  idempotencyKey: string
  provisionalNo: string
  capturedOn: string
  customerId?: number | null
  walkInCustomerName?: string | null
  lines: OfflineCounterLine[]
  payments: CounterInvoicePaymentRequest[]
  totalEstimate: number
  status: OutboxStatus
  errorMessage?: string | null
  attempts: number
}

interface RgcOfflineSchema extends DBSchema {
  products: { key: number; value: ProductDto }
  customers: { key: number; value: CustomerDto }
  outbox: { key: string; value: OutboxItem; indexes: { byStatus: OutboxStatus } }
}

let dbPromise: Promise<IDBPDatabase<RgcOfflineSchema>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RgcOfflineSchema>('rgc-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'productId' })
        }
        if (!db.objectStoreNames.contains('customers')) {
          db.createObjectStore('customers', { keyPath: 'customerId' })
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'localId' })
          store.createIndex('byStatus', 'status')
        }
      },
    })
  }
  return dbPromise
}

// ---------- Reference data cache ----------

export async function cacheProducts(products: ProductDto[]) {
  const db = await getDb()
  const tx = db.transaction('products', 'readwrite')
  await Promise.all(products.map((p) => tx.store.put(p)))
  await tx.done
}

export async function cacheCustomers(customers: CustomerDto[]) {
  const db = await getDb()
  const tx = db.transaction('customers', 'readwrite')
  await Promise.all(customers.map((c) => tx.store.put(c)))
  await tx.done
}

export async function getCachedProducts(): Promise<ProductDto[]> {
  const db = await getDb()
  return db.getAll('products')
}

export async function getCachedCustomers(): Promise<CustomerDto[]> {
  const db = await getDb()
  return db.getAll('customers')
}

// ---------- Outbox (offline sales queue) ----------

let provisionalCounter = 0

export function newProvisionalNo() {
  provisionalCounter += 1
  const stamp = Date.now().toString(36).toUpperCase().slice(-5)
  return `OFFLINE-${stamp}-${provisionalCounter}`
}

export async function enqueueOutboxItem(item: Omit<OutboxItem, 'localId' | 'status' | 'attempts'>) {
  const db = await getDb()
  const record: OutboxItem = { ...item, localId: crypto.randomUUID(), status: 'pending', attempts: 0 }
  await db.put('outbox', record)
  return record
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getDb()
  const items = await db.getAll('outbox')
  return items.sort((a, b) => a.capturedOn.localeCompare(b.capturedOn))
}

export async function updateOutboxItem(localId: string, patch: Partial<OutboxItem>) {
  const db = await getDb()
  const existing = await db.get('outbox', localId)
  if (!existing) return
  await db.put('outbox', { ...existing, ...patch })
}

export async function removeOutboxItem(localId: string) {
  const db = await getDb()
  await db.delete('outbox', localId)
}

export async function countPendingOutbox(): Promise<number> {
  const items = await listOutbox()
  return items.filter((i) => i.status !== 'error').length + items.filter((i) => i.status === 'error').length
}
