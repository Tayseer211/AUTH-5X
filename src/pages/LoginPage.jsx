import BrandPanel from '../components/BrandPanel.jsx'
import LoginForm from '../components/LoginForm.jsx'
import './LoginPage.css'

// Two-section layout: branding on the left, login card on the right.
// Stacks vertically on smaller screens (see LoginPage.css).
function LoginPage({ onLoginSuccess, onCreateAccount }) {
  return (
    <div className="login-page">
      <BrandPanel />
      <div className="login-page__form-section">
        <LoginForm onLoginSuccess={onLoginSuccess} onCreateAccount={onCreateAccount} />
      </div>
    </div>
  )
}

export default LoginPage
