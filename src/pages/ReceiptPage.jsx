import AppShell from '../components/AppShell.jsx'
import { CheckCircleIcon, XCircleIcon, FlagIcon } from '../components/icons.jsx'
import './ReceiptPage.css'

const OUTCOME = {
  approved: {
    icon: CheckCircleIcon,
    tone: 'success',
    heading: 'Payment approved',
    detail: 'This payment has been simulated as sent. In a real deployment, it would now move to your bank.',
    statusLabel: 'Approved',
  },
  denied: {
    icon: XCircleIcon,
    tone: 'danger',
    heading: 'Payment denied',
    detail: "This payment was blocked before it could go anywhere. No money moved.",
    statusLabel: 'Denied',
  },
  flagged: {
    icon: FlagIcon,
    tone: 'warning',
    heading: 'Transaction flagged',
    detail: "This request has been set aside for further review and won't be sent automatically.",
    statusLabel: 'Flagged for review',
  },
}

function formatCurrency(amount) {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Confirmation screen shown after a decision is made in VerifyPage.
// Purely a simulated receipt — no real payment is sent or blocked.
function ReceiptPage({ user, decision, pendingCount, onNavigate, onSignOut, onResetDemo }) {
  const outcome = OUTCOME[decision.status]
  const Icon = outcome.icon
  const reference = `FA-${decision.transactionId.replace('tx-', '').padStart(4, '0')}`

  return (
    <AppShell
      user={user}
      activeView="dashboard"
      pendingCount={pendingCount}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onResetDemo={onResetDemo}
    >
      <div className="page page--narrow">
        <div className="receipt">
          <div className="receipt__header">
            <span className="receipt__sim">Simulated</span>
          </div>

          <div className="receipt__status">
            <span className={`receipt__icon text--${outcome.tone}`}>
              <Icon />
            </span>
            <h1>{outcome.heading}</h1>
            <p className="receipt__amount">{formatCurrency(decision.amount)}</p>
            <p className="receipt__to">to {decision.recipient}</p>
          </div>

          <dl className="receipt__rows">
            <div>
              <dt>Status</dt>
              <dd>{outcome.statusLabel}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono">{reference}</dd>
            </div>
            <div>
              <dt>Safety score at decision</dt>
              <dd>{decision.score} / 100</dd>
            </div>
            {decision.reason && (
              <div>
                <dt>Reason flagged</dt>
                <dd>{decision.reason}</dd>
              </div>
            )}
          </dl>

          <p className="receipt__detail">{outcome.detail}</p>

          <button type="button" className="btn btn--primary btn--block" onClick={() => onNavigate('dashboard')}>
            Back to dashboard
          </button>

          <p className="receipt__footer">
            fraud.auth is a simulated hackathon prototype. No real bank accounts or payments are involved.
          </p>
        </div>
      </div>
    </AppShell>
  )
}

export default ReceiptPage
