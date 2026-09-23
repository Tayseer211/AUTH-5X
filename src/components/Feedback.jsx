import Icon from './Icon.jsx'
import { STATUS_LABELS } from '../utils/format.js'
import { RISK_LEVELS } from '../fraud/engine.js'

// Small presentational pieces: divider, alert, empty state, status/risk badges.

export function Divider({ label }) {
  return (
    <div className="fa-divider" role="separator">
      <span className="fa-divider__line" />
      {label && <span className="fa-divider__label">{label}</span>}
      <span className="fa-divider__line" />
    </div>
  )
}

const ALERT_ICONS = { info: 'info', success: 'check', warning: 'warning', danger: 'warning' }

export function Alert({ tone = 'info', title, children, role }) {
  return (
    <div className={`fa-alert fa-alert--${tone}`} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
      <Icon name={ALERT_ICONS[tone]} size={18} className="fa-alert__icon" />
      <div>
        {title && <p className="fa-alert__title">{title}</p>}
        {children && <div className="fa-alert__body">{children}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'check', title, children, action }) {
  return (
    <div className="fa-empty">
      <span className="fa-empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="fa-empty__title">{title}</p>
      {children && <p className="fa-empty__text">{children}</p>}
      {action}
    </div>
  )
}

const STATUS_TONES = { PENDING: 'info', APPROVED: 'success', FLAGGED: 'warning', REJECTED: 'danger' }

export function StatusBadge({ status }) {
  return <span className={`fa-badge fa-badge--${STATUS_TONES[status] ?? 'neutral'}`}>{STATUS_LABELS[status] ?? status}</span>
}

const RISK_TONES = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' }

export function RiskBadge({ level }) {
  if (!level) return null
  return <span className={`fa-badge fa-badge--${RISK_TONES[level]}`}>{RISK_LEVELS[level].label}</span>
}
