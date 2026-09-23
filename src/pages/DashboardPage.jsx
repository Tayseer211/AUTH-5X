import { useState } from 'react'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import TransactionList from '../components/TransactionList.jsx'
import ReceiptWarning from '../components/ReceiptWarning.jsx'
import { Alert } from '../components/Feedback.jsx'
import { Link, navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { sortNewestFirst } from '../transactions/ledger.js'

// Each tile links to the history page pre-filtered to what it counts.
const STAT_TILES = [
  { key: 'total', label: 'Total transactions', filter: 'all', tone: 'navy' },
  { key: 'approved', label: 'Approved', filter: 'approved', tone: 'success' },
  { key: 'pending', label: 'Pending', filter: 'pending', tone: 'info' },
  { key: 'flagged', label: 'Flagged', filter: 'flagged', tone: 'warning' },
]

// TIMEZONE: uses the runtime's local hour.
function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function DashboardPage() {
  const { user, stats, transactions, replayDemo } = useApp()
  const [error, setError] = useState('')
  const recent = sortNewestFirst(transactions).slice(0, 6)
  const awaiting = stats.awaitingApproval

  function handleReplay() {
    try {
      replayDemo()
      setError('')
      navigate('/review')
    } catch (replayError) {
      setError(replayError.message)
    }
  }

  return (
    <div className="fa-page">
      <header className="fa-page__header">
        <div>
          <p className="fa-page__eyebrow">{greeting()}</p>
          <h1 className="fa-page__title">Welcome back, {user.fullName.split(' ')[0]}</h1>
        </div>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {awaiting > 0 ? (
        <section className="fa-approval-banner" aria-labelledby="approval-title">
          <div className="fa-approval-banner__count" aria-hidden="true">
            {awaiting}
          </div>
          <div className="fa-approval-banner__text">
            <h2 id="approval-title">
              {awaiting} {awaiting === 1 ? 'transaction requires' : 'transactions require'} your approval
            </h2>
            <p>Review suspicious or unusual transactions before approving them.</p>
          </div>
          <Button href="#/review" size="lg" className="fa-approval-banner__cta">
            Review transactions
          </Button>
        </section>
      ) : (
        <section className="fa-approval-banner fa-approval-banner--clear" aria-labelledby="approval-title">
          <div className="fa-approval-banner__count" aria-hidden="true">
            <Icon name="check" size={26} strokeWidth={2.2} />
          </div>
          <div className="fa-approval-banner__text">
            <h2 id="approval-title">You&apos;re all caught up</h2>
            <p>There are no transactions waiting for your approval.</p>
          </div>
          <Button variant="secondary" icon="refresh" onClick={handleReplay} className="fa-approval-banner__cta">
            Replay demo requests
          </Button>
        </section>
      )}

      <section className="fa-stats" aria-label="Transaction overview">
        {STAT_TILES.map((tile) => (
          <Link key={tile.key} to={`/history?filter=${tile.filter}`} className={`fa-stat fa-stat--${tile.tone}`}>
            <span className="fa-stat__label">{tile.label}</span>
            <span className="fa-stat__value">{stats[tile.key]}</span>
          </Link>
        ))}
      </section>

      <div className="fa-dashboard-grid">
        <section className="fa-card" aria-labelledby="recent-title">
          <div className="fa-card__header">
            <h2 id="recent-title">Recent activity</h2>
            <Link to="/history" className="fa-card__link">
              View all
            </Link>
          </div>
          <TransactionList transactions={recent} />
        </section>
        <ReceiptWarning />
      </div>
    </div>
  )
}

export default DashboardPage
