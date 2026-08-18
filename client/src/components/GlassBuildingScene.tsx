// Decorative animated corporate glass-building skyline used on the login screen.
// Pure inline SVG + CSS animations (see index.css) — no external assets.
export default function GlassBuildingScene() {
  const windowRows = (cols: number, rows: number, x0: number, y0: number, w: number, h: number, gap: number) => {
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (w + gap)
        const y = y0 + r * (h + gap)
        const delay = ((r * cols + c) * 0.15) % 3
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={w}
            height={h}
            rx="0.6"
            fill="#f0d18f"
            className="animate-twinkle"
            style={{ animationDelay: `${delay}s` }}
          />
        )
      }
    }
    return cells
  }

  return (
    <svg viewBox="0 0 640 480" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#05131f" />
          <stop offset="60%" stopColor="#0b2942" />
          <stop offset="100%" stopColor="#103a5c" />
        </linearGradient>
        <linearGradient id="towerA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f8ab8" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0b2942" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="towerB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6fb6d6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#103a5c" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="doorGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b3dced" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#164e78" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#2f8ab8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2f8ab8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="480" fill="url(#sky)" />
      <circle cx="320" cy="150" r="220" fill="url(#glow)" />

      {/* stars */}
      {Array.from({ length: 26 }).map((_, i) => (
        <circle
          key={i}
          cx={(i * 53) % 620 + 10}
          cy={(i * 37) % 140 + 12}
          r={i % 3 === 0 ? 1.6 : 1}
          fill="#e2f3f9"
          className="animate-twinkle"
          style={{ animationDelay: `${(i % 5) * 0.6}s` }}
        />
      ))}

      {/* background towers */}
      <g className="animate-float-slow" style={{ animationDelay: '0.5s' }}>
        <rect x="40" y="180" width="70" height="260" fill="url(#towerA)" />
        {windowRows(3, 9, 48, 190, 12, 12, 6)}
      </g>
      <g className="animate-float-slow" style={{ animationDelay: '1.2s' }}>
        <rect x="530" y="150" width="80" height="290" fill="url(#towerB)" />
        {windowRows(3, 10, 540, 162, 13, 13, 6)}
      </g>
      <g className="animate-float-slow">
        <rect x="130" y="120" width="90" height="320" fill="url(#towerA)" />
        {windowRows(4, 12, 140, 132, 12, 12, 6)}
      </g>
      <g className="animate-float-slow" style={{ animationDelay: '0.8s' }}>
        <rect x="430" y="90" width="100" height="350" fill="url(#towerB)" />
        {windowRows(4, 13, 440, 102, 13, 13, 6)}
      </g>

      {/* centre-piece headquarters tower with reflective shine sweep */}
      <g>
        <rect x="235" y="60" width="170" height="380" fill="url(#towerA)" stroke="#6fb6d6" strokeOpacity="0.4" />
        {windowRows(7, 15, 245, 72, 15, 15, 6)}
        <clipPath id="hqClip">
          <rect x="235" y="60" width="170" height="380" />
        </clipPath>
        <g clipPath="url(#hqClip)">
          <rect x="150" y="0" width="60" height="480" fill="#ffffff" opacity="0.08" className="animate-glass-shine" />
        </g>
        {/* rooftop beacon */}
        <circle cx="320" cy="55" r="3" fill="#e0b45a" className="animate-twinkle" />
      </g>

      {/* revolving glass entrance doors */}
      <g transform="translate(255, 400)">
        <rect x="-4" y="0" width="140" height="40" fill="#071c2e" />
        <g style={{ perspective: '300px' as any }}>
          <rect x="0" y="4" width="34" height="32" fill="url(#doorGlass)" stroke="#e0b45a" strokeWidth="1" className="animate-door-left" />
          <rect x="35" y="4" width="34" height="32" fill="url(#doorGlass)" stroke="#e0b45a" strokeWidth="1" className="animate-door-right" style={{ animationDelay: '0.15s' }} />
          <rect x="70" y="4" width="34" height="32" fill="url(#doorGlass)" stroke="#e0b45a" strokeWidth="1" className="animate-door-left" style={{ animationDelay: '0.3s' }} />
        </g>
        <rect x="-4" y="0" width="140" height="4" fill="#e0b45a" opacity="0.7" />
      </g>

      {/* ground reflection */}
      <rect x="0" y="440" width="640" height="40" fill="#05131f" />
      <rect x="0" y="440" width="640" height="6" fill="#164e78" opacity="0.5" />
    </svg>
  )
}
