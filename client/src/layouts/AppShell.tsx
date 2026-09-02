import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { ChevronDown, LogOut, Menu, Lock, X, Wifi, WifiOff, CloudUpload, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { RootState } from '../app/store'
import { logout } from '../features/auth/authSlice'
import { useLogoutApiMutation } from '../features/auth/authApi'
import Logo from '../components/Logo'
import NotificationBell from '../components/NotificationBell'
import ThemeToggle from '../components/ThemeToggle'
import ToastHost from '../components/ToastHost'
import { navSections } from '../lib/nav'
import { usePermission } from '../lib/permissions'
import { useConnectivity } from '../lib/connectivity'
import { useOutboxCount } from '../lib/useOutboxCount'
import { startNotificationHub, stopNotificationHub } from '../lib/signalr'

export default function AppShell() {
  const user = useSelector((s: RootState) => s.auth.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  // Persisted so a collapsed sidebar (chosen to give the right panel full-width room) stays
  // collapsed across reloads/navigation rather than snapping back open every time.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('rgc.sidebarOpen')
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutApi] = useLogoutApiMutation()
  const hasPerm = usePermission()

  const visibleSections = navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.perm || hasPerm(item.perm)) }))
    .filter((section) => section.items.length > 0)

  function toggleSidebar() {
    setSidebarOpen((v) => {
      const next = !v
      try { localStorage.setItem('rgc.sidebarOpen', String(next)) } catch { /* private mode, etc — just skip persisting */ }
      return next
    })
  }

  async function handleLogout() {
    try { await logoutApi().unwrap() } catch { /* best-effort server revoke */ }
    dispatch(logout())
    navigate('/login', { replace: true })
  }

  const initials = (user?.fullName ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const isOnline = useConnectivity()
  const outboxCount = useOutboxCount()

  useEffect(() => {
    startNotificationHub()
    return () => stopNotificationHub()
  }, [])

  return (
    <div className="h-screen flex bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside
        className={`no-print ${sidebarOpen ? 'w-64' : 'w-[76px]'} hidden md:flex flex-col bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 text-white transition-[width] duration-300 ease-in-out shrink-0 relative overflow-hidden`}
      >
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="relative h-16 flex items-center px-4 border-b border-white/10">
          {sidebarOpen ? <Logo variant="light" size="sm" showTagline={false} /> : (
            <svg width="30" height="30" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="44" height="44" rx="10" fill="#1d6699" />
              <path d="M14 24 L24 14 L34 24 L24 34 Z" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="1.2" />
            </svg>
          )}
        </div>

        <nav className="relative flex-1 overflow-y-auto scrollbar-thin py-3">
          {visibleSections.map((section, si) => (
            <div key={section.title} className="mb-2 animate-sidebar-in" style={{ animationDelay: `${si * 0.05}s` }}>
              {sidebarOpen && (
                <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-300/80">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon
                const content = (
                  <>
                    <Icon size={18} className="shrink-0" />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}
                    {sidebarOpen && !item.implemented && (
                      <Lock size={12} className="ml-auto opacity-50" />
                    )}
                  </>
                )
                const baseClass = 'group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-150'

                if (!item.implemented || !item.path) {
                  return (
                    <div
                      key={item.label}
                      title={sidebarOpen ? undefined : item.label}
                      className={`${baseClass} text-brand-200/50 cursor-not-allowed`}
                    >
                      {content}
                    </div>
                  )
                }
                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={sidebarOpen ? undefined : item.label}
                    className={({ isActive }) =>
                      `${baseClass} ${
                        isActive
                          ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/10'
                          : 'text-brand-100/80 hover:bg-white/8 hover:text-white hover:translate-x-0.5'
                      }`
                    }
                  >
                    {content}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="relative h-11 flex items-center justify-center border-t border-white/10 text-brand-200 hover:text-white hover:bg-white/5 transition"
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-gradient-to-b from-brand-950 to-brand-800 text-white flex flex-col animate-sidebar-in">
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
              <Logo variant="light" size="sm" showTagline={false} />
              <button onClick={() => setMobileOpen(false)}><X size={20} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {visibleSections.map((section) => (
                <div key={section.title} className="mb-2">
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-300/80">{section.title}</div>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    if (!item.implemented || !item.path) {
                      return (
                        <div key={item.label} className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm text-brand-200/50">
                          <Icon size={18} /> {item.label} <Lock size={12} className="ml-auto opacity-50" />
                        </div>
                      )
                    }
                    return (
                      <NavLink
                        key={item.label}
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) => `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm ${isActive ? 'bg-white/12 text-white' : 'text-brand-100/80'}`}
                      >
                        <Icon size={18} /> {item.label}
                      </NavLink>
                    )
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="no-print h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-slate-500" onClick={() => setMobileOpen(true)}>
              <Menu size={22} />
            </button>
            {/* Desktop-only sidebar collapse — the sidebar's own toggle sits at its bottom edge
                and is easy to miss; this puts the same control somewhere a user glances at first,
                for the "hide the menu, give the right panel full width" workflow. */}
            <button
              className="hidden md:inline-flex text-slate-500 hover:text-brand-700 transition"
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>

            {/* User identity — extreme left, with logout */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 pl-1 pr-3 py-1.5 rounded-full hover:bg-slate-100 transition"
              >
                <span className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-xs font-bold flex items-center justify-center shadow">
                  {initials}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold text-slate-800">{user?.fullName ?? 'User'}</span>
                  <span className="text-[11px] text-slate-400">{user?.roles?.[0] ?? 'Role'}</span>
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute z-20 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 animate-fade-in">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-800">{user?.fullName}</p>
                      <p className="text-xs text-slate-400">{user?.email ?? user?.username}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      <LogOut size={15} /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            {(outboxCount > 0 || !isOnline) && (
              <div
                title={outboxCount > 0 ? `${outboxCount} counter sale(s) waiting to sync` : 'Working offline — counter sales will queue locally'}
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${isOnline ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}
              >
                {isOnline ? <CloudUpload size={13} /> : <WifiOff size={13} />}
                {isOnline ? `Syncing ${outboxCount}` : 'Offline'}
              </div>
            )}
            {outboxCount === 0 && isOnline && (
              <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                <Wifi size={13} className="text-emerald-500" />
              </div>
            )}

            {/* Logo + company name — always present */}
            <div className="hidden sm:block">
              <Logo variant="dark" size="sm" showTagline={false} />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <ToastHost />
    </div>
  )
}
