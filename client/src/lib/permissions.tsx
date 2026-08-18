import type { ReactNode } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../app/store'

/** Field/action-level RBAC on the client (SDD 8.2 level 1/2) — mirrors, never replaces, the
 * server-side checks (RequirePermissionAttribute, cost-field omission) which remain authoritative. */
export function usePermission() {
  const permissions = useSelector((s: RootState) => s.auth.user?.permissions ?? [])
  return (code: string) => permissions.includes(code)
}

export function Can({ perm, children }: { perm: string; children: ReactNode }) {
  const has = usePermission()
  return has(perm) ? <>{children}</> : null
}
