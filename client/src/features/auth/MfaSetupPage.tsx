import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import QRCode from 'qrcode'
import { ShieldCheck, Copy, Check } from 'lucide-react'
import type { RootState } from '../../app/store'
import { useMfaSetupMutation, useMfaEnableMutation } from './authApi'
import { setCredentials, logout } from './authSlice'
import Logo from '../../components/Logo'
import GlassBuildingScene from '../../components/GlassBuildingScene'

export default function MfaSetupPage() {
  const pendingToken = useSelector((s: RootState) => s.auth.mfaPendingToken)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const [mfaSetup] = useMfaSetupMutation()
  const [mfaEnable, { isLoading: enabling }] = useMfaEnableMutation()

  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false);
  const started = useRef(false)

  useEffect(() => {
    // Runs once on entry only — deliberately not re-run when pendingToken later flips to null
    // on a successful enable (setCredentials clears it), which would otherwise race the
    // navigate('/') below and bounce the user back to /login right after they signed in.
    if (!pendingToken) { navigate('/login', { replace: true }); return }
    if (started.current) return // guards React StrictMode's dev-only double-invoke
    started.current = true
    mfaSetup({ pendingToken }).unwrap().then(async (res) => {
      setSecret(res.secret)
      setQrDataUrl(await QRCode.toDataURL(res.otpAuthUri, { width: 220, margin: 1 }))
    }).catch(() => setError('Could not start MFA setup. Please log in again.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingToken) return
    setError(null)
    try {
      const res = await mfaEnable({ pendingToken, code }).unwrap()
      dispatch(setCredentials({ accessToken: res.accessToken, user: res.user }))
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err?.data?.detail ?? 'That code did not match. Try the next one your app generates.')
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen w-full flex bg-brand-950 relative overflow-hidden">
      <div className="hidden lg:block lg:w-1/2 relative">
        <GlassBuildingScene />
        <div className="absolute inset-0 flex flex-col justify-between p-10 pointer-events-none">
          <div className="animate-drift-up"><Logo variant="light" size="lg" /></div>
          <div className="animate-drift-up max-w-md" style={{ animationDelay: '0.15s' }}>
            <p className="text-brand-100 text-2xl font-semibold leading-snug drop-shadow">Your role requires two-factor sign-in.</p>
            <p className="text-brand-300 mt-2 text-sm">Owner, Administrator and Accountant accounts must enrol an authenticator app before they can access the system (FRS 12.2).</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <div className="absolute inset-0 lg:hidden">
          <GlassBuildingScene />
          <div className="absolute inset-0 bg-brand-950/70" />
        </div>

        <div className="relative w-full max-w-sm animate-drift-up">
          <div className="lg:hidden mb-8 flex justify-center"><Logo variant="light" size="md" /></div>

          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 border border-white/40">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-brand-600" />
              <h1 className="text-xl font-bold text-brand-900">Set up two-factor authentication</h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">Scan with Google Authenticator, Authy, or any TOTP app.</p>

            {qrDataUrl ? (
              <div className="mt-5 flex flex-col items-center">
                <img src={qrDataUrl} alt="MFA QR code" className="rounded-lg border border-slate-200" />
                <button onClick={copySecret} className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 transition">
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  {secret}
                </button>
                <p className="text-[11px] text-slate-400 mt-1">Can't scan? Enter this key manually.</p>
              </div>
            ) : (
              <div className="mt-5 h-[220px] flex items-center justify-center text-sm text-slate-400">Generating…</div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="code">Enter the 6-digit code to confirm</label>
                <input
                  id="code"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </div>

              {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

              <button
                type="submit"
                disabled={enabling || code.length !== 6}
                className="w-full rounded-lg bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-semibold py-2.5 text-sm shadow-lg shadow-brand-900/20 transition disabled:opacity-60"
              >
                {enabling ? 'Verifying…' : 'Enable & Sign in'}
              </button>
              <button type="button" onClick={() => { dispatch(logout()); navigate('/login', { replace: true }) }} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">
                Cancel and sign in as someone else
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
