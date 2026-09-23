import Icon from './Icon.jsx'

// Education card: a receipt or screenshot is not proof that a payment settled.
function ReceiptWarning({ compact = false }) {
  return (
    <aside className={`fa-edu ${compact ? 'fa-edu--compact' : ''}`} aria-labelledby="edu-title">
      <span className="fa-edu__icon">
        <Icon name="info" size={18} />
      </span>
      <div>
        <h2 id="edu-title" className="fa-edu__title">
          A receipt is not proof of payment
        </h2>
        <p>
          Scammers can create highly realistic payment receipts using screenshots, PDFs and increasingly sophisticated
          tools. A receipt alone does not prove that funds have settled.
        </p>
        {!compact && (
          <p>
            A standing order is a scheduled bank transfer. The authoritative confirmation is the transaction appearing
            as settled in your official online banking transaction history.
          </p>
        )}
      </div>
    </aside>
  )
}

export default ReceiptWarning
