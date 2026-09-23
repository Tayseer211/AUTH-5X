import { useState } from 'react'
import AuthLayout from '../components/AuthLayout.jsx'
import Button from '../components/Button.jsx'
import Icon from '../components/Icon.jsx'
import TextField from '../components/TextField.jsx'
import { Alert } from '../components/Feedback.jsx'
import { navigate } from '../router/router.jsx'
import { useApp } from '../state/AppProvider.jsx'
import { ACCOUNT_NUMBER_RULES, BANKS } from '../data/banks.js'
import { validateBankDetails } from '../auth/validation.js'

// Sign-up step 2: pick a simulated bank and account, then create the account.
function BankDetailsPage() {
  const { signUpDraft, completeSignUp } = useApp()
  const [form, setForm] = useState({ bankCode: '', accountHolder: signUpDraft?.fullName ?? '', accountNumber: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateBankDetails(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      // Shows /signup/complete on success.
      await completeSignUp({ code: form.bankCode, accountHolder: form.accountHolder, accountNumber: form.accountNumber })
    } catch (error) {
      setSubmitError(error.message)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout step="Step 2 of 2" wide>
      <h1 className="fa-auth__title">Bank details</h1>
      <p className="fa-auth__subtitle">Choose the account you want fraud.auth to protect.</p>
      <form className="fa-auth__form" onSubmit={handleSubmit} noValidate>
        <fieldset className="fa-bank-picker">
          <legend className="fa-field__label">Bank</legend>
          <div className="fa-bank-picker__grid">
            {BANKS.map((bank) => {
              const selected = form.bankCode === bank.code
              return (
                <label key={bank.code} className={`fa-bank-card ${selected ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="bank"
                    value={bank.code}
                    checked={selected}
                    onChange={() => update('bankCode')(bank.code)}
                    className="fa-visually-hidden"
                  />
                  <span className="fa-bank-card__monogram">{bank.name.slice(0, 1)}</span>
                  <span className="fa-bank-card__name">{bank.name}</span>
                  <span className="fa-bank-card__check">
                    <Icon name="check" size={14} strokeWidth={2.4} />
                  </span>
                </label>
              )
            })}
          </div>
          {errors.bankCode && <p className="fa-field__error">{errors.bankCode}</p>}
        </fieldset>
        <TextField
          label="Account holder name"
          value={form.accountHolder}
          onChange={update('accountHolder')}
          error={errors.accountHolder}
          autoComplete="name"
        />
        <TextField
          label="Account number"
          value={form.accountNumber}
          onChange={update('accountNumber')}
          error={errors.accountNumber}
          hint={ACCOUNT_NUMBER_RULES.hint}
          inputMode="numeric"
          autoComplete="off"
        />
        <Alert tone="info">
          This is a simulation. fraud.auth does not connect to MCB, SBM or MauBank, and no real account is checked.
        </Alert>
        {submitError && <Alert tone="danger">{submitError}</Alert>}
        <div className="fa-auth__actions">
          <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/signup')}>
            Back
          </Button>
          <Button type="submit" loading={submitting}>
            Create account
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}

export default BankDetailsPage
