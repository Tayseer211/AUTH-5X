import AppShell from '../components/AppShell.jsx'
import TransactionRow from '../components/TransactionRow.jsx'
import { ShieldCheckIcon, CheckCircleIcon, AlertTriangleIcon } from '../components/icons.jsx'
import './DashboardPage.css'

const MOCK_BALANCE = 18420.55

function formatCurrency(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Landing screen after login: account balance, pending-review count, an
// approval banner CTA, a short tips card, and the recent-activity list.
function DashboardPage({ user, transactions, pendingCount, onNavigate, onSelectTransaction, onSignOut, onResetDemo }) {
  const flaggedCount = transactions.filter((tx) => tx.status === 'flagged').length
  const protectedAmount = transactions
    .filter((tx) => tx.status === 'denied')
    .reduce((sum, tx) => sum + tx.amount, 0)

  return (
    <AppShell
      user={user}
      activeView="dashboard"
      pendingCount={pendingCount}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onResetDemo={onResetDemo}
    >
      <div className="page">
        <div className="page__header">
          <div>
            <p className="page__eyebrow">Welcome back</p>
            <h1 className="page__title">{user.name.split(' ')[0]}&apos;s dashboard</h1>
          </div>
        </div>

        <div className="stats">
          <div className="stat stat--primary">
            <span className="stat__label">Account balance</span>
            <span className="stat__value">{formatCurrency(MOCK_BALANCE)}</span>
          </div>
          <button type="button" className="stat stat--warning" onClick={() => onNavigate('approvals')}>
            <span className="stat__label">Pending approvals</span>
            <span className="stat__value">{pendingCount}</span>
          </button>
          <div className="stat stat--danger">
            <span className="stat__label">Flagged this month</span>
            <span className="stat__value">{flaggedCount}</span>
          </div>
          <div className="stat stat--success">
            <span className="stat__label">Protected from fraud</span>
            <span className="stat__value">{formatCurrency(protectedAmount)}</span>
          </div>
        </div>

        {pendingCount > 0 ? (
          <div className="approval-banner">
            <span className="approval-banner__count">{pendingCount}</span>
            <div className="approval-banner__text">
              <h2>You have {pendingCount} payment{pendingCount === 1 ? '' : 's'} waiting for review</h2>
              <p>Verify these requests before any money leaves your account.</p>
            </div>
            <button type="button" className="btn btn--primary approval-banner__cta" onClick={() => onNavigate('approvals')}>
              Review now
            </button>
          </div>
        ) : (
          <div className="approval-banner approval-banner--clear">
            <span className="approval-banner__count">
              <CheckCircleIcon />
            </span>
            <div className="approval-banner__text">
              <h2>You&apos;re all caught up</h2>
              <p>No payment requests are waiting for review right now.</p>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="card">
            <div className="card__header">
              <h2>Recent activity</h2>
            </div>
            <ul className="tx-list">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onSelect={onSelectTransaction} />
              ))}
            </ul>
          </div>

          <div className="edu-card">
            <span className="edu-card__icon">
              <ShieldCheckIcon />
            </span>
            <div>
              <h3 className="edu-card__title">Spot a payment redirect scam</h3>
              <p>
                Be wary of any request that suddenly asks you to send money to a &quot;new&quot; account,
                especially if it comes with urgency ( &quot;before end of day&quot;) or claims the usual
                account is unavailable.
              </p>
              <p>
                <AlertTriangleIcon className="edu-card__inline-icon" /> When in doubt, confirm the
                request with the recipient through a separate, trusted channel before approving.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default DashboardPage
