// fraud.auth shield mark + wordmark. `tone="light"` is for the navy auth panel.

function LogoMark({ size = 32, tone = 'teal' }) {
  const stroke = tone === 'light' ? '#ffffff' : 'var(--fa-teal)'

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M20 3.5 L33.5 8.5 V19 C33.5 27.3 28 33.7 20 36.5 C12 33.7 6.5 27.3 6.5 19 V8.5 L20 3.5 Z"
        fill={tone === 'light' ? 'rgba(255,255,255,0.08)' : 'var(--fa-teal-tint)'}
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="19.2" r="7.1" stroke={stroke} strokeWidth="1.5" />
      <circle cx="20" cy="19.2" r="3.4" stroke={stroke} strokeWidth="1.5" />
      <circle cx="20" cy="19.2" r="0.9" fill={stroke} />
    </svg>
  )
}

function Logo({ size = 30, tone = 'teal' }) {
  return (
    <span className={`fa-logo fa-logo--${tone}`}>
      <LogoMark size={size} tone={tone} />
      <span className="fa-logo__word">
        fraud<span className="fa-logo__dot">.</span>auth
      </span>
    </span>
  )
}

export default Logo
