import AuthLayout from '../components/AuthLayout.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'

const WELCOME_POINTS = [
  { icon: 'repeat', text: "Review every standing order request before it's approved." },
  { icon: 'shield', text: 'Six risk checks compare each request with how you normally bank.' },
  { icon: 'check', text: 'Confirm payments in your transaction history, not from a screenshot.' },
]

// First screen on a browser with no saved accounts.
function WelcomePage() {
  return (
    <AuthLayout>
      <h1 className="fa-auth__title">Welcome to fraud.auth</h1>
      <p className="fa-auth__subtitle">Verify payment requests before money leaves your account.</p>
      <ul className="fa-welcome-points">
        {WELCOME_POINTS.map((point) => (
          <li key={point.text}>
            <span className="fa-welcome-points__icon">
              <Icon name={point.icon} size={17} />
            </span>
            {point.text}
          </li>
        ))}
      </ul>
      <div className="fa-auth__form">
        <Button href="#/signup" block size="lg">
          Create account
        </Button>
        <Button href="#/login" variant="secondary" block size="lg">
          Log in
        </Button>
      </div>
    </AuthLayout>
  )
}

export default WelcomePage
