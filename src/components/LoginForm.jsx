import { useState } from 'react'
import PasswordInput from './PasswordInput.jsx'
import SecurityMessage from './SecurityMessage.jsx'
import { GoogleIcon, ShieldCheckIcon, CheckCircleIcon } from './icons.jsx'
import './LoginForm.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate({ email, password }) {
  const errors = {}

  if (!email.trim()) {
    errors.email = 'Email address is required.'
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  }

  return errors
}

function LoginForm({ onLoginSuccess, onCreateAccount }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [demoStatus, setDemoStatus] = useState(null)

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validate({ email, password })
    setErrors(validationErrors)
    setDemoStatus(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    // NOTE: There is no backend yet. This is a frontend-only demo action
    // that simulates a network request. Real authentication (an API call,
    // token/session handling, error responses, etc.) will replace this
    // setTimeout once the backend is available.
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setDemoStatus('success')
      onLoginSuccess?.()
    }, 900)
  }

  const handleGoogleClick = () => {
    // Placeholder only — no real Google OAuth is wired up yet.
    setDemoStatus('google')
  }

  return (
    <div className="login-form-card">
      <div className="login-form-card__mobile-logo">
        <ShieldCheckIcon className="login-form-card__mobile-logo-icon" />
        <span>
          fraud<span className="login-form-card__logo-dot">.</span>auth
        </span>
      </div>

      <h2 className="login-form-card__title">Welcome back</h2>
      <p className="login-form-card__subtitle">
        Log in to continue protecting your transactions.
      </p>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <div className="form-field">
          <label htmlFor="email" className="field-label">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className="text-input"
          />
          {errors.email && (
            <p id="email-error" className="field-error" role="alert">
              {errors.email}
            </p>
          )}
        </div>

        <PasswordInput
          id="password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          placeholder="Enter your password"
          autoComplete="current-password"
        />

        <div className="login-form__row">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <a href="#forgot-password" className="text-link">
            Forgot password?
          </a>
        </div>

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>

        {demoStatus === 'success' && (
          <p className="demo-banner demo-banner--success" role="status">
            <CheckCircleIcon className="demo-banner__icon" />
            Demo login successful — real authentication will be connected later.
          </p>
        )}
        {demoStatus === 'google' && (
          <p className="demo-banner" role="status">
            Google sign-in is a UI placeholder only — not yet connected.
          </p>
        )}
      </form>

      <div className="divider">
        <span>or</span>
      </div>

      <button type="button" className="google-button" onClick={handleGoogleClick}>
        <GoogleIcon className="google-button__icon" />
        Continue with Google
      </button>

      <SecurityMessage />

      <p className="signup-prompt">
        Don&apos;t have an account?{' '}
        <button type="button" className="text-link text-link--bold link-button" onClick={onCreateAccount}>
          Create an account
        </button>
      </p>
    </div>
  )
}

export default LoginForm
