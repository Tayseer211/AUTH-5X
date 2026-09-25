import Button from './Button.jsx'
import Icon from './Icon.jsx'
import { RiskBadge, StatusBadge } from './Feedback.jsx'
import { receiptFor } from '../transactions/receipt.js'
import {
  FREQUENCY_LABELS,
  TRANSACTION_TYPE_LABELS,
  formatDate,
  formatMoney,
  formatTime,
} from '../utils/format.js'

const TYPE_ICONS = {
  STANDING_ORDER: 'repeat',
  CARD_PAYMENT: 'card',
  TRANSFER: 'transfer',
  INCOMING: 'incoming',
  BILL_PAYMENT: 'bill',
}

// One ledger row. Demo standing orders link to their verification page. When
// `onViewReceipt` is given, an approved transaction that has a QR receipt also
// gets a "View QR" action, placed beside the row (a link cannot contain a
// button). Transactions without a receipt render exactly as before.
function TransactionRow({ tx, onViewReceipt }) {
  // Requests from a demo run (the controlled cases and generated batches) open their verification page.
  const linksToVerification = Boolean(tx.verificationCase) || tx.demoRun != null
  const typeLabel = TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type
  const meta = [
    tx.frequency && tx.frequency !== 'ONE_OFF' ? `${typeLabel}, ${FREQUENCY_LABELS[tx.frequency].toLowerCase()}` : typeLabel,
    `${formatDate(tx.createdAt)}, ${formatTime(tx.createdAt)}`,
  ].join(' — ')

  const content = (
    <>
      <span className={`fa-tx__icon fa-tx__icon--${tx.direction === 'IN' ? 'in' : 'out'}`}>
        <Icon name={TYPE_ICONS[tx.type] ?? 'transfer'} size={18} />
      </span>
      <span className="fa-tx__main">
        <span className="fa-tx__recipient">{tx.recipient}</span>
        <span className="fa-tx__meta">{meta}</span>
      </span>
      <span className="fa-tx__side">
        <span className={`fa-tx__amount ${tx.direction === 'IN' ? 'is-in' : ''}`}>
          {formatMoney(tx.amount, { direction: tx.direction })}
        </span>
        <span className="fa-tx__badges">
          {tx.status !== 'APPROVED' && tx.riskLevel && <RiskBadge level={tx.riskLevel} />}
          <StatusBadge status={tx.status} />
        </span>
      </span>
      {linksToVerification && <Icon name="chevronRight" size={18} className="fa-tx__chevron" />}
    </>
  )

  const receipt = onViewReceipt ? receiptFor(tx) : null
  const qrAction = receipt && (
    <div className="fa-tx__actions">
      <Button variant="ghost" size="sm" icon="qr" onClick={() => onViewReceipt(tx)} aria-label={`View QR receipt for the payment to ${tx.recipient}`}>
        View QR
      </Button>
    </div>
  )

  if (linksToVerification) {
    return (
      <li className={receipt ? 'fa-tx-item' : undefined}>
        <a className="fa-tx fa-tx--link" href={`#/verify/${tx.id}`}>
          {content}
        </a>
        {qrAction}
      </li>
    )
  }
  if (receipt) {
    return (
      <li className="fa-tx-item">
        <div className="fa-tx">{content}</div>
        {qrAction}
      </li>
    )
  }
  return <li className="fa-tx">{content}</li>
}

function TransactionList({ transactions, onViewReceipt }) {
  return (
    <ul className="fa-tx-list">
      {transactions.map((tx) => (
        <TransactionRow key={tx.id} tx={tx} onViewReceipt={onViewReceipt} />
      ))}
    </ul>
  )
}

export default TransactionList
