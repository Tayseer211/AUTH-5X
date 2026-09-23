import TransactionList from '../components/TransactionList.jsx'
import { EmptyState } from '../components/Feedback.jsx'
import { navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { HISTORY_FILTERS, sortNewestFirst } from '../transactions/ledger.js'

const EMPTY_MESSAGES = {
  ALL: { title: 'No transactions yet', text: 'Transactions will appear here as they happen.' },
  APPROVED: { title: 'No approved transactions', text: 'Transactions you approve will appear here.' },
  PENDING: { title: 'No pending transactions', text: 'Nothing is waiting for action right now.' },
  FLAGGED: { title: 'No flagged transactions', text: 'Transactions held for review or rejected will appear here.' },
}

// Full ledger with filter tabs; the active filter lives in ?filter=.
function HistoryPage({ query }) {
  const { transactions } = useApp()
  const requested = (query.get('filter') ?? 'all').toUpperCase()
  const activeFilter = HISTORY_FILTERS[requested] ? requested : 'ALL'
  const visible = sortNewestFirst(transactions.filter(HISTORY_FILTERS[activeFilter].test))

  return (
    <div className="fa-page">
      <header className="fa-page__header">
        <div>
          <h1 className="fa-page__title">Transaction history</h1>
          <p className="fa-page__subtitle">Every transaction on your simulated account, including verification decisions.</p>
        </div>
      </header>

      <div className="fa-tabs" role="tablist" aria-label="Filter transactions">
        {Object.entries(HISTORY_FILTERS).map(([key, filter]) => {
          const count = transactions.filter(filter.test).length
          const selected = key === activeFilter
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`fa-tab ${selected ? 'is-active' : ''}`}
              onClick={() => navigate(`/history?filter=${key.toLowerCase()}`, { replace: true })}
            >
              {filter.label}
              <span className="fa-tab__count">{count}</span>
            </button>
          )
        })}
      </div>

      <section className="fa-card" role="tabpanel" aria-label={`${HISTORY_FILTERS[activeFilter].label} transactions`}>
        {visible.length > 0 ? (
          <TransactionList transactions={visible} />
        ) : (
          <EmptyState icon={activeFilter === 'FLAGGED' ? 'shield' : 'check'} title={EMPTY_MESSAGES[activeFilter].title}>
            {EMPTY_MESSAGES[activeFilter].text}
          </EmptyState>
        )}
      </section>
    </div>
  )
}

export default HistoryPage
