import AuthLayout from '../components/AuthLayout.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { getBank } from '../data/banks.js'
import { maskAccountNumber } from '../utils/format.js'

// Sign-up confirmation.
function AccountCreatedPage() {
  const { user, stats } = useApp()
  const bank = getBank(user.bank.code)

  return (
    <AuthLayout>
      <div className="fa-created">
        <span className="fa-created__icon">
          <Icon name="check" size={26} strokeWidth={2.2} />
        </span>
        <h1 className="fa-auth__title">Account created</h1>
        <p className="fa-auth__subtitle">
          Welcome, {user.fullName.split(' ')[0]}. Your {bank?.name} account ending {user.bank.accountNumber.slice(-4)} is
          now protected.
        </p>
      </div>
      <dl className="fa-summary">
        <div>
          <dt>Name</dt>
          <dd>{user.fullName}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Bank</dt>
          <dd>{bank?.name}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className="fa-mono">{maskAccountNumber(user.bank.accountNumber)}</dd>
        </div>
      </dl>
      {stats.awaitingApproval > 0 && (
        <p className="fa-created__note">
          {stats.awaitingApproval} standing order {stats.awaitingApproval === 1 ? 'request is' : 'requests are'} already
          waiting for your approval.
        </p>
      )}
      <Button href="#/dashboard" block size="lg">
        Go to dashboard
      </Button>
    </AuthLayout>
  )
}

export default AccountCreatedPage
