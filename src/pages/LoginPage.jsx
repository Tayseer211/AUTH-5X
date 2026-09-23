import { useState } from 'react'
import AuthLayout from '../components/AuthLayout.jsx'
import Button from '../components/Button.jsx'
import TextField from '../components/TextField.jsx'
import { Alert, Divider } from '../components/Feedback.jsx'
import { navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { validateLogin } from '../auth/validation.js'

function LoginPage() {
  const { logIn, setSignUpDraft } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
    if (submitError) setSubmitError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateLogin(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      // Navigates to /dashboard on success.
      await logIn(form)
    } catch (error) {
      setSubmitError(error.message)
      setSubmitting(false)
    }
  }

  function startSignUp() {
    setSignUpDraft(null)
    navigate('/signup')
  }

  return (
    <AuthLayout>
      <h1 className="fa-auth__title">Welcome back</h1>
      <p className="fa-auth__subtitle">Log in to review your transactions.</p>
      <form className="fa-auth__form" onSubmit={handleSubmit} noValidate>
        {submitError && <Alert tone="danger">{submitError}</Alert>}
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
          autoComplete="email"
          autoFocus
        />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          autoComplete="current-password"
        />
        <Button type="submit" block size="lg" loading={submitting}>
          Log in
        </Button>
        <Divider label="or" />
        <Button variant="secondary" block size="lg" onClick={startSignUp}>
          Sign up
        </Button>
      </form>
    </AuthLayout>
  )
}

export default LoginPage
