import { useState } from 'react'
import AuthLayout from '../components/AuthLayout.jsx'
import Button from '../components/Button.jsx'
import TextField from '../components/TextField.jsx'
import { Link, navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { validateAccountDetails } from '../auth/validation.js'
import { emailIsRegistered } from '../auth/authService.js'

// Sign-up step 1: personal details, kept as a draft until the bank step.
function SignupPage() {
  const { signUpDraft, setSignUpDraft } = useApp()
  const [form, setForm] = useState({
    fullName: signUpDraft?.fullName ?? '',
    email: signUpDraft?.email ?? '',
    password: signUpDraft?.password ?? '',
    confirmPassword: signUpDraft?.password ?? '',
  })
  const [errors, setErrors] = useState({})

  const update = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateAccountDetails(form)
    if (!nextErrors.email && emailIsRegistered(form.email)) {
      nextErrors.email = 'An account with this email already exists. Log in instead.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSignUpDraft({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password })
    navigate('/signup/bank')
  }

  return (
    <AuthLayout step="Step 1 of 2">
      <h1 className="fa-auth__title">Create your account</h1>
      <p className="fa-auth__subtitle">Start by telling us who you are.</p>
      <form className="fa-auth__form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Full name"
          value={form.fullName}
          onChange={update('fullName')}
          error={errors.fullName}
          autoComplete="name"
          autoFocus
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          hint="At least 8 characters."
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          type="password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <Button type="submit" block size="lg">
          Continue
        </Button>
        <p className="fa-auth__switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export default SignupPage
