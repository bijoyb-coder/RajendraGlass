import { useEffect, useState } from 'react'
import { listOutbox } from './offlineDb'
import { onSyncCompleted } from './syncEngine'

/** Live count of counter-billing sales still waiting to sync — used for the topbar badge. */
export function useOutboxCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const refresh = () => { void listOutbox().then((items) => setCount(items.length)) }
    refresh()
    const unsub = onSyncCompleted(refresh)
    const interval = setInterval(refresh, 5000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  return count
}
