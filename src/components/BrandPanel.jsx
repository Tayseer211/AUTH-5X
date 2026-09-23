import { ShieldCheckIcon, CheckCircleIcon } from './icons.jsx'
import './BrandPanel.css'

const BENEFITS = [
  'Detect suspicious requests before you act',
  'Protect financial transactions from fraud',
  'Make safer, more confident payment decisions',
]

// Left-hand branding panel: product identity, tagline, and value proposition.
function BrandPanel() {
  return (
    <aside className="brand-panel">
      <div className="brand-panel__glow" aria-hidden="true" />
      <div className="brand-panel__content">
        <div className="brand-panel__logo">
          <ShieldCheckIcon className="brand-panel__logo-icon" />
          <span className="brand-panel__logo-text">
            fraud<span className="brand-panel__logo-dot">.</span>auth
          </span>
        </div>

        <h1 className="brand-panel__tagline">Smarter protection for every transaction.</h1>
        <p className="brand-panel__description">
          fraud.auth helps you spot suspicious financial messages, payment requests, and
          potential scams before money ever leaves your account.
        </p>

        <ul className="brand-panel__benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit}>
              <CheckCircleIcon className="brand-panel__benefit-icon" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="brand-panel__illustration" aria-hidden="true">
          <ShieldCheckIcon className="brand-panel__illustration-icon" />
        </div>
      </div>
    </aside>
  )
}

export default BrandPanel
