import { useState } from 'react'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import { Alert, EmptyState, StatusBadge } from '../components/Feedback.jsx'
import { navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { FREQUENCY_LABELS, formatDate, formatMoney } from '../utils/format.js'

// Standing orders waiting for a decision, in queue order.
function ApprovalQueuePage() {
  const { queue, replayDemo } = useApp()
  const [error, setError] = useState('')

  function handleReplay() {
    try {
      replayDemo()
      setError('')
    } catch (replayError) {
      setError(replayError.message)
    }
  }

  return (
    <div className="fa-page">
      <header className="fa-page__header">
        <div>
          <h1 className="fa-page__title">Transactions requiring your approval</h1>
          <p className="fa-page__subtitle">Each standing order is checked against your normal activity before you decide.</p>
        </div>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {queue.length === 0 ? (
        <section className="fa-card">
          <EmptyState
            title="You're all caught up."
            action={
              <div className="fa-inline-actions">
                <Button variant="secondary" href="#/history">
                  View transaction history
                </Button>
                <Button variant="ghost" icon="refresh" onClick={handleReplay}>
                  Replay demo requests
                </Button>
              </div>
            }
          >
            There are no transactions waiting for your approval.
          </EmptyState>
        </section>
      ) : (
        <ol className="fa-queue">
          {queue.map((tx, index) => (
            <li key={tx.id} className="fa-queue__item">
              <span className="fa-queue__index" aria-label={`Request ${index + 1} of ${queue.length}`}>
                {index + 1}
              </span>
              <div className="fa-queue__main">
                <div className="fa-queue__top">
                  <p className="fa-queue__recipient">{tx.recipient}</p>
                  <StatusBadge status={tx.status} />
                </div>
                <p className="fa-queue__meta">
                  <Icon name="repeat" size={15} />
                  {' Standing order, '}
                  {FREQUENCY_LABELS[tx.frequency].toLowerCase()}
                  {', first payment'} {formatDate(tx.date, { long: true })}
                </p>
                <p className="fa-queue__ref">Reference {tx.reference}</p>
              </div>
              <div className="fa-queue__side">
                <p className="fa-queue__amount">{formatMoney(tx.amount)}</p>
                <Button onClick={() => navigate(`/verify/${tx.id}`)}>Review transaction</Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default ApprovalQueuePage
