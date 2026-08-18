import { useState } from 'react'
import { Plus, X, UserCog, Lock, ShieldCheck, Unlock as UnlockIcon } from 'lucide-react'
import { useListUsersQuery, useListRolesQuery, useCreateUserMutation, useDeactivateUserMutation, useActivateUserMutation } from './adminApi'
import type { AdminUserDto } from './adminApi'
import { useUnlockUserMutation } from '../auth/authApi'
import PasswordInput from '../../components/PasswordInput'
import {
  useDataGrid,
  SortIcon,
  SortableTh,
  Th,
  DataGridSearchBar,
  DataGridPagination,
  DATA_GRID_HEAD_ROW_CLASS,
  DATA_GRID_ROW_CLASS,
} from '../../components/DataGrid'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition'

type SortKey = 'username' | 'fullName'

export default function UsersPage() {
  const { data: users, isLoading } = useListUsersQuery()
  const { data: roles } = useListRolesQuery()
  const [createUser, { isLoading: saving }] = useCreateUserMutation()
  const [deactivateUser] = useDeactivateUserMutation()
  const [activateUser] = useActivateUserMutation()
  const [unlockUser] = useUnlockUserMutation()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', fullName: '', email: '', password: '' })
  const [roleIds, setRoleIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    rows,
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    totalCount,
    startIndex,
    endIndex,
  } = useDataGrid<AdminUserDto, SortKey>(users?.items, {
    defaultSortKey: 'username',
    comparators: {
      username: (a, b) => a.username.localeCompare(b.username),
      fullName: (a, b) => a.fullName.localeCompare(b.fullName),
    },
    matches: (u, term) =>
      u.username.toLowerCase().includes(term) ||
      u.fullName.toLowerCase().includes(term) ||
      !!u.email?.toLowerCase().includes(term) ||
      u.roles.some((r) => r.toLowerCase().includes(term)),
  })

  function toggleRole(id: number) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (roleIds.length === 0) { setError('Assign at least one role.'); return }
    try {
      await createUser({ ...form, roleIds }).unwrap()
      setShowForm(false)
      setForm({ username: '', fullName: '', email: '', password: '' })
      setRoleIds([])
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Could not create the user.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900 flex items-center gap-2"><UserCog size={22} /> Users</h1>
          <p className="text-sm text-slate-500 mt-1">Deactivating a user disables their login immediately and revokes any active session.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow transition shrink-0">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 animate-fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label><input required value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className={inputClass} /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label><input required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputClass} /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Email</label><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClass} /></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Temporary Password *</label><PasswordInput required minLength={8} value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} className={inputClass} /></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Roles *</label>
            <div className="flex flex-wrap gap-2">
              {roles?.items.map((r) => (
                <label key={r.roleId} className={`text-xs font-medium px-3 py-1.5 rounded-full ring-1 cursor-pointer transition ${roleIds.includes(r.roleId) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                  <input type="checkbox" className="hidden" checked={roleIds.includes(r.roleId)} onChange={() => toggleRole(r.roleId)} />
                  {r.name} {r.isMfaRequired && '🔒'}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow transition disabled:opacity-60">{saving ? 'Creating…' : 'Create User'}</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataGridSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search username, name, email or role…"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={DATA_GRID_HEAD_ROW_CLASS}>
                <SortableTh onClick={() => toggleSort('username')}>
                  Username <SortIcon column="username" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <SortableTh onClick={() => toggleSort('fullName')}>
                  Name <SortIcon column="fullName" sortKey={sortKey} sortDir={sortDir} />
                </SortableTh>
                <Th>Roles</Th>
                <Th>MFA</Th>
                <Th>Status</Th>
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    {search ? 'No users match your search.' : 'No users yet.'}
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.userId} className={DATA_GRID_ROW_CLASS}>
                  <td className="px-5 py-3 font-medium text-brand-700">{u.username}</td>
                  <td className="px-5 py-3 text-slate-700">{u.fullName}</td>
                  <td className="px-5 py-3 text-slate-500">{u.roles.join(', ') || '—'}</td>
                  <td className="px-5 py-3">
                    {u.mfaEnabled ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck size={13} /> On</span> : <span className="text-xs text-slate-400">Off</span>}
                  </td>
                  <td className="px-5 py-3">
                    {u.isLocked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200"><Lock size={11} /> Locked</span>
                    ) : u.isActive ? (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Active</span>
                    ) : (
                      <span className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">Inactive</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right space-x-3">
                    {u.isLocked && (
                      <button onClick={() => unlockUser(u.userId)} className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700">
                        <UnlockIcon size={13} /> Unlock
                      </button>
                    )}
                    {u.isActive ? (
                      <button onClick={() => deactivateUser(u.userId)} className="text-xs font-medium text-red-500 hover:text-red-600">Deactivate</button>
                    ) : (
                      <button onClick={() => activateUser(u.userId)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DataGridPagination
          page={page}
          pageCount={pageCount}
          totalCount={totalCount}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
