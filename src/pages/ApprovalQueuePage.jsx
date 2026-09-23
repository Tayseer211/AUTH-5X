import AppShell from '../components/AppShell.jsx'
import { CheckCircleIcon } from '../components/icons.jsx'
import './ApprovalQueuePage.css'

function formatCurrency(tx) {
  return `$${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Full list of payment requests waiting for review. The dashboard's
// approval banner and "Pending approvals" stat both link here.
function ApprovalQueuePage({ user, transactions, pendingCount, onNavigate, onSelectTransaction, onSignOut, onResetDemo }) {
  return (
    <AppShell
      user={user}
      activeView="approvals"
      pendingCount={pendingCount}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      onResetDemo={onResetDemo}
    >
      <div className="page">
        <div className="page__header">
          <div>
            <p className="page__eyebrow">Review queue</p>
            <h1 className="page__title">Approvals</h1>
            <p className="page__subtitle">
              These payment requests haven&apos;t left your account yet. Verify each one before it goes through.
            </p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <CheckCircleIcon />
            </span>
            <p className="empty-state__title">Nothing waiting for review</p>
            <p className="empty-state__text">New payment requests will show up here before any money moves.</p>
          </div>
        ) : (
          <ul className="queue">
            {transactions.map((tx, index) => (
              <li key={tx.id} className="queue__item">
                <span className="queue__index">{index + 1}</span>
                <div className="queue__main">
                  <div className="queue__top">
                    <span className="queue__recipient">{tx.recipient}</span>
                    <span className="badge badge--warning">Needs review</span>
                  </div>
                  <p className="queue__meta">
                    {tx.channel} · Requested via {tx.requestedVia} · {formatDate(tx.date)}
                  </p>
                  {tx.reference !== '—' && <p className="queue__ref">Ref: {tx.reference}</p>}
                </div>
                <div className="queue__side">
                  <span className="queue__amount">{formatCurrency(tx)}</span>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => onSelectTransaction(tx.id)}>
                    Review
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}

export default ApprovalQueuePage
