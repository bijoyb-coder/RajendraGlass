import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * A password `<input>` with a show/hide eye icon docked at its right edge, so the user can check
 * what they typed before submitting. Shared by every password field in the app (login, user
 * creation, …) instead of each screen reimplementing the toggle.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  className,
  autoComplete,
  required,
  minLength,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  className: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-10`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-0 h-full px-3 flex items-center text-slate-400 hover:text-slate-600 transition"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
