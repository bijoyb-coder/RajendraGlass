import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Lock } from 'lucide-react'
import { useListRolesQuery, useListPermissionsQuery, useUpdateRolePermissionsMutation } from './adminApi'

export default function RolesPage() {
  const { data: roles, isLoading: loadingRoles } = useListRolesQuery()
  const { data: permissions, isLoading: loadingPerms } = useListPermissionsQuery()
  const [updatePermissions, { isLoading: saving }] = useUpdateRolePermissionsMutation()

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState(false)

  const selectedRole = roles?.items.find((r) => r.roleId === selectedRoleId)

  useEffect(() => {
    if (roles?.items.length && selectedRoleId === null) setSelectedRoleId(roles.items[0].roleId)
  }, [roles, selectedRoleId])

  useEffect(() => {
    if (selectedRole) setSelectedCodes(new Set(selectedRole.permissions))
  }, [selectedRole?.roleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const map = new Map<string, { code: string; description?: string | null }[]>()
    for (const p of permissions?.items ?? []) {
      const list = map.get(p.module) ?? []
      list.push(p)
      map.set(p.module, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [permissions])

  function toggle(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function toggleModule(codes: string[], checked: boolean) {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      codes.forEach((c) => (checked ? next.add(c) : next.delete(c)))
      return next
    })
  }

  async function handleSave() {
    if (!selectedRoleId) return
    await updatePermissions({ roleId: selectedRoleId, permissionCodes: [...selectedCodes] }).unwrap()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isOwner = selectedRole?.name === 'Owner'

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-brand-900 flex items-center gap-2"><ShieldCheck size={22} /> Roles &amp; Permissions</h1>
        <p className="text-sm text-slate-500 mt-1">Screen and action-level access control (FRS 12.3). Changes apply on each user's next login or token refresh.</p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 h-fit">
          {loadingRoles && <div className="p-4 text-sm text-slate-400">Loading…</div>}
          {roles?.items.map((r) => (
            <button
              key={r.roleId}
              onClick={() => setSelectedRoleId(r.roleId)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${selectedRoleId === r.roleId ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="flex items-center justify-between">
                <span>{r.name}</span>
                {r.isMfaRequired && <Lock size={12} className="text-amber-500" aria-label="MFA mandatory" />}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{r.permissions.length} permissions</div>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          {!selectedRole || loadingPerms ? (
            <div className="text-sm text-slate-400">Select a role…</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800">{selectedRole.name}</h2>
                  <p className="text-xs text-slate-400">{selectedRole.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  {saved && <span className="text-sm text-emerald-600">Saved.</span>}
                  <button
                    onClick={handleSave}
                    disabled={saving || isOwner}
                    title={isOwner ? "Owner's permissions cannot be restricted" : undefined}
                    className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Permissions'}
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {grouped.map(([module, perms]) => {
                  const codes = perms.map((p) => p.code)
                  const allChecked = codes.every((c) => selectedCodes.has(c))
                  return (
                    <div key={module} className="border border-slate-100 rounded-lg p-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 cursor-pointer">
                        <input type="checkbox" checked={allChecked} disabled={isOwner} onChange={(e) => toggleModule(codes, e.target.checked)} className="rounded border-slate-300" />
                        {module}
                      </label>
                      <div className="space-y-1.5">
                        {perms.map((p) => (
                          <label key={p.code} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={selectedCodes.has(p.code)} disabled={isOwner} onChange={() => toggle(p.code)} className="rounded border-slate-300" />
                            <span>{p.code}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
