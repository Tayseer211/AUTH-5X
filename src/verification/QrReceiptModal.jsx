import BankMark from '../components/BankMark.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import QrCode from '../components/QrCode.jsx'
import { describeReceiptDate, receiptFor } from '../transactions/receipt.js'

const formatAmount = (amount) => amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })

// The QR receipt of an approved transaction: the QR code and the details it
// carries, read back from the receipt itself (transactions/receipt.js), so
// the screen shows what the code says. Shown only for transactions that have
// a receipt; anything else renders nothing.
function QrReceiptModal({ open, tx, onClose }) {
  const receipt = tx ? receiptFor(tx) : null
  const details = receipt?.details
  const rows = details && [
    ['Transaction reference', details.reference],
    ['Customer', details.customer],
    ['Amount', formatAmount(details.amount)],
    ['Currency', details.currency],
    ['Recipient', details.recipient],
    ['Date / time', describeReceiptDate(details.date)],
    ['Status', 'Approved — completed in fraud.auth'],
  ]

  return (
    <Modal
      open={open && Boolean(receipt)}
      title="Transaction receipt"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {receipt && (
        <>
          <div className="fa-qr-receipt__bank">
            <BankMark code={details.bank} />
          </div>
          <div className="fa-qr-receipt__code">
            <QrCode value={receipt.payload} label={`QR code for transaction ${receipt.reference}`} />
          </div>
          <p className="fa-qr-receipt__verified">
            <Icon name="check" size={16} strokeWidth={2.4} />
            Verified transaction reference
          </p>
          <dl className="fa-receipt__rows">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="fa-qr-receipt__note">
            The code identifies this transaction in fraud.auth, for example to look it up later. It does not by itself show
            that the payment is free of fraud, and it is not proof that funds have settled. Simulation only: no funds have
            moved.
          </p>
        </>
      )}
    </Modal>
  )
}

export default QrReceiptModal
