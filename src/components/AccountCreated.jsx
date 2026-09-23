import { CheckCircleIcon } from './icons.jsx'
import './AccountCreated.css'

// Step 3 of signup: confirmation summary before entering the dashboard.
function AccountCreated({ user, onContinue }) {
  return (
    <div>
      <div className="account-created">
        <div className="account-created__icon">
          <CheckCircleIcon />
        </div>
        <h2 className="login-form-card__title account-created__title">Account created</h2>
        <p className="account-created__note">
          Your fraud.auth account is ready. We&apos;ll watch payment requests from your linked bank
          and flag anything that looks suspicious before money moves.
        </p>
      </div>

      <dl className="summary">
        <div>
          <dt>Name</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Linked bank</dt>
          <dd>{user.bankName}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className="mono">•••• {user.accountLast4}</dd>
        </div>
      </dl>

      <button type="button" className="primary-button" onClick={onContinue}>
        Go to dashboard
      </button>
    </div>
  )
}

export default AccountCreated
