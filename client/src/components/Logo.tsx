interface LogoProps {
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
}

const sizes = {
  sm: { mark: 28, title: 'text-sm', sub: 'text-[10px]' },
  md: { mark: 36, title: 'text-lg', sub: 'text-xs' },
  lg: { mark: 52, title: 'text-2xl', sub: 'text-sm' },
}

export default function Logo({ variant = 'light', size = 'md', showTagline = true }: LogoProps) {
  const s = sizes[size]
  const titleColor = variant === 'light' ? 'text-white' : 'text-brand-900'
  const subColor = variant === 'light' ? 'text-brand-200' : 'text-brand-600'

  return (
    <div className="flex items-center gap-3 select-none">
      <svg width={s.mark} height={s.mark} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <defs>
          <linearGradient id="rgcPane" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6fb6d6" />
            <stop offset="55%" stopColor="#1d6699" />
            <stop offset="100%" stopColor="#0b2942" />
          </linearGradient>
          <linearGradient id="rgcGold" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f0d18f" />
            <stop offset="100%" stopColor="#c99633" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#rgcPane)" />
        <path d="M24 6 L42 24 L24 42 L6 24 Z" fill="none" stroke="url(#rgcGold)" strokeWidth="2" opacity="0.85" />
        <path d="M14 24 L24 14 L34 24 L24 34 Z" fill="rgba(255,255,255,0.16)" stroke="white" strokeWidth="1.2" />
        <path d="M24 14 L24 34 M14 24 L34 24" stroke="white" strokeWidth="0.6" opacity="0.5" />
      </svg>
      <div className="leading-tight">
        <div className={`font-bold tracking-wide ${s.title} ${titleColor}`}>RAJENDRA GLASS CENTRE</div>
        {showTagline && <div className={`uppercase tracking-[0.2em] ${s.sub} ${subColor}`}>Glass Processing Company</div>}
      </div>
    </div>
  )
}
