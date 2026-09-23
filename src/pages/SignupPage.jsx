import { useState } from 'react'
import BrandPanel from '../components/BrandPanel.jsx'
import SignupForm from '../components/SignupForm.jsx'
import BankPicker from '../components/BankPicker.jsx'
import AccountCreated from '../components/AccountCreated.jsx'
import { ShieldCheckIcon } from '../components/icons.jsx'
import './SignupPage.css'

const STEPS = ['Account details', 'Link your bank', 'Confirmation']

function randomLast4() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// Three-step signup flow: account details -> bank picker -> confirmation.
// Mirrors LoginPage's brand-panel + card layout so the two feel like the
// same product.
function SignupPage({ onComplete, onBackToLogin }) {
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState(null)
  const [bank, setBank] = useState(null)

  const handleDetailsSubmit = (formDetails) => {
    setDetails(formDetails)
    setStep(1)
  }

  const handleBankSelect = (selectedBank) => {
    setBank(selectedBank)
    setStep(2)
  }

  const user = details && bank ? { name: details.fullName, email: details.email, bankName: bank.name, accountLast4: randomLast4() } : null

  return (
    <div className="login-page">
      <BrandPanel />
      <div className="login-page__form-section">
        <div className="login-form-card">
          <div className="login-form-card__mobile-logo">
            <ShieldCheckIcon className="login-form-card__mobile-logo-icon" />
            <span>
              fraud<span className="login-form-card__logo-dot">.</span>auth
            </span>
          </div>

          <p className="auth-step">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>

          {step === 0 && (
            <>
              <h2 className="login-form-card__title">Create your account</h2>
              <p className="login-form-card__subtitle">
                Start protecting your payments in a couple of minutes.
              </p>
              <SignupForm onSubmit={handleDetailsSubmit} />
              <p className="signup-prompt">
                Already have an account?{' '}
                <button type="button" className="text-link text-link--bold link-button" onClick={onBackToLogin}>
                  Log in
                </button>
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="login-form-card__title">Link a bank account</h2>
              <p className="login-form-card__subtitle">
                Choose the bank fraud.auth should watch for suspicious payment requests.
              </p>
              <BankPicker onSelect={handleBankSelect} />
            </>
          )}

          {step === 2 && user && <AccountCreated user={user} onContinue={() => onComplete(user)} />}
        </div>
      </div>
    </div>
  )
}

export default SignupPage
