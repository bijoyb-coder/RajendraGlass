import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { ShieldCheck } from 'lucide-react'
import { useLoginMutation } from './authApi'
import { setCredentials, setMfaPendingToken } from './authSlice'
import Logo from '../../components/Logo'
import GlassBuildingScene from '../../components/GlassBuildingScene'
import PasswordInput from '../../components/PasswordInput'

export default function LoginPage() {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [login, { isLoading }] = useLoginMutation()
  const [error, setError] = useState<string | null>(null)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await login({ username, password, mfaCode: mfaCode || undefined }).unwrap()

      if (res.mfaSetupRequired) {
        dispatch(setMfaPendingToken(res.accessToken))
        navigate('/mfa-setup', { replace: true })
        return
      }
      if (res.mfaRequired) {
        setMfaRequired(true)
        return
      }

      dispatch(setCredentials({ accessToken: res.accessToken, user: res.user }))
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err: any) {
      setError(err?.data?.detail ?? 'Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-brand-950 relative overflow-hidden">
      {/* Left: animated corporate glass-building visual */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <GlassBuildingScene />
        <div className="absolute inset-0 flex flex-col justify-between p-10 pointer-events-none">
          <div className="animate-drift-up">
            <Logo variant="light" size="lg" />
          </div>
          <div className="animate-drift-up max-w-md" style={{ animationDelay: '0.15s' }}>
            <p className="text-brand-100 text-2xl font-semibold leading-snug drop-shadow">
              Precision glass. Engineered systems.
            </p>
            <p className="text-brand-300 mt-2 text-sm">
              One platform for inventory, sales, cutting, production and dispatch — built for the way Rajendra Glass Centre works.
            </p>
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <div className="absolute inset-0 lg:hidden">
          <GlassBuildingScene />
          <div className="absolute inset-0 bg-brand-950/70" />
        </div>

        <div className="relative w-full max-w-sm animate-drift-up">
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo variant="light" size="md" />
          </div>

          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 border border-white/40">
            {mfaRequired ? (
              <>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-brand-600" />
                  <h1 className="text-xl font-bold text-brand-900">Verification code</h1>
                </div>
                <p className="text-sm text-slate-500 mt-1">Enter the 6-digit code from your authenticator app.</p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-brand-900">Sign in</h1>
                <p className="text-sm text-slate-500 mt-1">Enter your credentials to access the Inventory Management System.</p>
              </>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {!mfaRequired && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="username">Username</label>
                    <input
                      id="username"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="password">Password</label>
                    <PasswordInput
                      id="password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"
                      value={password}
                      onChange={setPassword}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </>
              )}

              {mfaRequired && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="mfaCode">Authenticator code</label>
                  <input
                    id="mfaCode"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    required
                  />
                  <button type="button" onClick={() => { setMfaRequired(false); setMfaCode('') }} className="mt-2 text-xs text-slate-400 hover:text-slate-600">
                    ← Use a different account
                  </button>
                </div>
              )}

              {!mfaRequired && (
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-slate-500">
                    <input type="checkbox" className="rounded border-slate-300" />
                    Remember this device
                  </label>
                  <a href="#" className="text-brand-600 hover:text-brand-700 font-medium">Forgot password?</a>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-semibold py-2.5 text-sm shadow-lg shadow-brand-900/20 transition disabled:opacity-60"
              >
                {isLoading ? 'Verifying…' : mfaRequired ? 'Verify & Sign in' : 'Login'}
              </button>
            </form>

            {!mfaRequired && (
              <p className="mt-5 text-[11px] text-slate-400 text-center leading-relaxed">
                Demo credentials — admin / Admin@123 (Owner, MFA) &middot; sales / Admin@123 (Sales Executive)<br />
                manager / accountant / production / auditor — same password
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-[11px] text-brand-300">
            &copy; {new Date().getFullYear()} Rajendra Glass Centre. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
