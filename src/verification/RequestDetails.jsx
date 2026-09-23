import { StatusBadge } from '../components/Feedback.jsx'
import { getBank } from '../data/banks.js'
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  maskAccountNumber,
} from '../utils/format.js'

// The standing-order request as received, including its free-text message.
function RequestDetails({ tx, user }) {
  const bank = getBank(user.bank.code)
  const channel = CHANNEL_LABELS[tx.context?.channel] ?? 'Online banking'
  const rows = [
    ['Recipient', tx.recipient],
    ['Recipient account', `•••• ${tx.recipientAccount} (${tx.recipientBank})`],
    ['Amount', formatMoney(tx.amount)],
    ['Frequency', FREQUENCY_LABELS[tx.frequency]],
    ['Requested date', formatDate(tx.date, { long: true })],
    ['From account', `${bank?.name} ${maskAccountNumber(user.bank.accountNumber)} (${user.bank.accountHolder})`],
    [
      'Received',
      `${formatDateTime(tx.context?.initiatedAt ?? tx.createdAt)} via ${channel.charAt(0).toLowerCase() + channel.slice(1)}`,
    ],
    ['Reference', tx.reference],
  ]

  return (
    <section className="fa-card fa-request" aria-labelledby="request-title">
      <div className="fa-card__header">
        <h2 id="request-title">Standing order request</h2>
        <StatusBadge status={tx.status} />
      </div>
      <p className="fa-request__amount">{formatMoney(tx.amount)}</p>
      <p className="fa-request__to">
        to <strong>{tx.recipient}</strong>, {FREQUENCY_LABELS[tx.frequency].toLowerCase()}
      </p>
      <dl className="fa-request__grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="fa-request__text">
        <p className="fa-request__text-label">Request text</p>
        <blockquote>{tx.requestText}</blockquote>
      </div>
    </section>
  )
}

export default RequestDetails
