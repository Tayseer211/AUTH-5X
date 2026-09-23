import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronRightIcon } from './icons.jsx'
import './TransactionRow.css'

const STATUS_BADGES = {
  pending: { label: 'Needs review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  denied: { label: 'Denied', tone: 'danger' },
  flagged: { label: 'Flagged', tone: 'danger' },
  completed: { label: 'Completed', tone: 'neutral' },
}

function formatAmount(tx) {
  const value = tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${tx.direction === 'in' ? '+' : '-'}$${value}`
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// A single row in the dashboard's recent-activity list. Pending transactions
// are clickable and route into the verification flow; everything else is
// already settled and just informational.
function TransactionRow({ tx, onSelect }) {
  const badge = STATUS_BADGES[tx.status]
  const clickable = tx.status === 'pending' && Boolean(onSelect)

  const content = (
    <>
      <span className={`tx-row__icon${tx.direction === 'in' ? ' tx-row__icon--in' : ''}`}>
        {tx.direction === 'in' ? <ArrowDownLeftIcon /> : <ArrowUpRightIcon />}
      </span>
      <span className="tx-row__main">
        <span className="tx-row__recipient">{tx.recipient}</span>
        <span className="tx-row__meta">
          {tx.channel} · {formatDate(tx.date)}
        </span>
      </span>
      <span className="tx-row__side">
        <span className={`tx-row__amount${tx.direction === 'in' ? ' is-in' : ''}`}>{formatAmount(tx)}</span>
        <span className={`badge badge--${badge.tone}`}>{badge.label}</span>
      </span>
      {clickable && <ChevronRightIcon className="tx-row__chevron" />}
    </>
  )

  if (clickable) {
    return (
      <li>
        <button type="button" className="tx-row tx-row--link" onClick={() => onSelect(tx.id)}>
          {content}
        </button>
      </li>
    )
  }

  return (
    <li>
      <div className="tx-row">{content}</div>
    </li>
  )
}

export default TransactionRow
