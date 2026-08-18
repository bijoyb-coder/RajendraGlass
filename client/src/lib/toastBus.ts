// Minimal pub-sub for transient toast popups, in the same style as syncEngine's onSyncCompleted —
// no extra state-management dependency needed for something this small.
export interface Toast {
  id: string
  title: string
  message?: string
  link?: string
}

const listeners = new Set<(toast: Toast) => void>()

export function pushToast(toast: Omit<Toast, 'id'>) {
  const full: Toast = { ...toast, id: crypto.randomUUID() }
  listeners.forEach((l) => l(full))
}

export function onToast(listener: (toast: Toast) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
