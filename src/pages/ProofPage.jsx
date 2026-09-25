import { useState } from 'react'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import Logo from '../components/Logo.jsx'
import { Alert } from '../components/Feedback.jsx'
import { Link } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { getBank } from '../data/banks.js'
import { receiptFor } from '../transactions/receipt.js'
import QrReceiptModal from '../verification/QrReceiptModal.jsx'
import { FREQUENCY_LABELS, formatDate, formatMoney, formatTime, maskAccountNumber } from '../utils/format.js'

// Printable, clearly-simulated confirmation for an approved standing order.
function ProofPage({ txId }) {
  const { user, getTransaction } = useApp()
  const tx = getTransaction(txId)
  const [qrOpen, setQrOpen] = useState(false)

  if (!tx || !tx.proof) {
    return (
      <div className="fa-page">
        <Alert tone="danger" title="No proof available">
          This transaction has not been approved. <Link to="/history">Back to transaction history</Link>.
        </Alert>
      </div>
    )
  }

  const bank = getBank(user.bank.code)
  // Approvals made before QR receipts existed have none and show no QR action.
  const receipt = receiptFor(tx)
  const rows = [
    ['Transaction ID', tx.id.replace('txn_', '').toUpperCase()],
    ['Reference', tx.proof.reference],
    ['Date', formatDate(tx.proof.issuedAt, { long: true })],
    ['Time', formatTime(tx.proof.issuedAt)],
    ['Recipient', tx.recipient],
    ['Recipient account', `•••• ${tx.recipientAccount}`],
    ['From account', `${bank?.name} ${maskAccountNumber(user.bank.accountNumber)}`],
    ['Amount', formatMoney(tx.amount)],
    ['Frequency', FREQUENCY_LABELS[tx.frequency]],
    ['First payment', formatDate(tx.date, { long: true })],
  ]

  return (
    <div className="fa-page fa-page--narrow">
      <Button href="#/review" variant="ghost" icon="arrowLeft" className="fa-back fa-no-print">
        Back to approvals
      </Button>
      <article className="fa-receipt">
        <header className="fa-receipt__header">
          <Logo size={26} />
          <span className="fa-receipt__sim">Simulated</span>
        </header>
        <div className="fa-receipt__status">
          <span className="fa-receipt__tick">
            <Icon name="check" size={24} strokeWidth={2.4} />
          </span>
          <h1>Standing order approved</h1>
          <p className="fa-receipt__amount">{formatMoney(tx.amount)}</p>
          <p className="fa-receipt__to">
            {FREQUENCY_LABELS[tx.frequency].toLowerCase()} to {tx.recipient}
          </p>
        </div>
        <dl className="fa-receipt__rows">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>Status</dt>
            <dd className="fa-text--success">Approved</dd>
          </div>
        </dl>
        <Alert tone="info" title="A screenshot or PDF is not proof that funds have settled.">
          Always verify the transaction in your official banking transaction history. A standing order is a scheduled
          bank transfer — the authoritative confirmation is the payment appearing as settled in your bank&apos;s own
          records.
        </Alert>
        <p className="fa-receipt__footer">Issued by fraud.auth for demonstration purposes. No funds have moved.</p>
      </article>
      <QrReceiptModal open={qrOpen} tx={tx} onClose={() => setQrOpen(false)} />
      <div className="fa-inline-actions fa-no-print">
        <Button href="#/review">Back to approvals</Button>
        <Button href="#/history" variant="secondary">
          View transaction history
        </Button>
        {receipt && (
          <Button variant="secondary" icon="qr" onClick={() => setQrOpen(true)}>
            View QR Receipt
          </Button>
        )}
        <Button variant="ghost" icon="printer" onClick={() => window.print()}>
          Print
        </Button>
      </div>
    </div>
  )
}

export default ProofPage
