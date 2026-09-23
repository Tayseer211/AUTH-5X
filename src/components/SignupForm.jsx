import { useState } from 'react'
import PasswordInput from './PasswordInput.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate({ fullName, email, password }) {
  const errors = {}

  if (!fullName.trim()) {
    errors.fullName = 'Full name is required.'
  }

  if (!email.trim()) {
    errors.email = 'Email address is required.'
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

// Step 1 of signup: basic account details. Kept separate from the bank
// picker and confirmation steps so SignupPage can swap steps in and out.
function SignupForm({ onSubmit }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validate({ fullName, email, password })
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length === 0) {
      onSubmit({ fullName: fullName.trim(), email: email.trim(), password })
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="fullName" className="field-label">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Jordan Ellis"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          className="text-input"
        />
        {errors.fullName && (
          <p id="fullName-error" className="field-error" role="alert">
            {errors.fullName}
          </p>
        )}
      </div>

      <div className="form-field">
        <label htmlFor="signupEmail" className="field-label">
          Email address
        </label>
        <input
          id="signupEmail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'signupEmail-error' : undefined}
          className="text-input"
        />
        {errors.email && (
          <p id="signupEmail-error" className="field-error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <PasswordInput
        id="signupPassword"
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={errors.password}
        placeholder="At least 8 characters"
        autoComplete="new-password"
      />

      <button type="submit" className="primary-button">
        Continue
      </button>
    </form>
  )
}

export default SignupForm
