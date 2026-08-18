import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, X } from 'lucide-react'
import { onToast, type Toast } from '../lib/toastBus'

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    return onToast((toast) => {
      setToasts((prev) => [...prev, toast])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 6000)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80 no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => { if (t.link) navigate(t.link); setToasts((prev) => prev.filter((x) => x.id !== t.id)) }}
          className="bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 flex gap-3 animate-drift-up cursor-pointer hover:shadow-2xl transition"
        >
          <span className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <BellRing size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{t.title}</p>
            {t.message && <p className="text-xs text-slate-500 truncate">{t.message}</p>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setToasts((prev) => prev.filter((x) => x.id !== t.id)) }}
            className="text-slate-300 hover:text-slate-500 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
