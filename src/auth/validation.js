import { ACCOUNT_NUMBER_RULES, getBank, normalizeAccountNumber } from '../data/banks.js'

// Form validators. Each returns an object of field -> error message; an
// empty object means the input is valid.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function validateAccountDetails({ fullName, email, password, confirmPassword }) {
  const errors = {}

  if (!fullName?.trim()) errors.fullName = 'Enter your full name.'
  else if (fullName.trim().length < 2) errors.fullName = 'Name must be at least 2 characters.'

  if (!email?.trim()) errors.email = 'Enter your email address.'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address, like name@example.com.'

  if (!password) errors.password = 'Create a password.'
  else if (password.length < 8) errors.password = 'Use at least 8 characters.'

  if (!confirmPassword) errors.confirmPassword = 'Confirm your password.'
  else if (password && confirmPassword !== password) errors.confirmPassword = "Passwords don't match."

  return errors
}

export function validateBankDetails({ bankCode, accountHolder, accountNumber }) {
  const errors = {}

  if (!getBank(bankCode)) errors.bankCode = 'Choose a bank.'
  if (!accountHolder?.trim()) errors.accountHolder = "Enter the account holder's name."

  const digits = normalizeAccountNumber(accountNumber ?? '')
  const { min, max } = ACCOUNT_NUMBER_RULES
  if (!digits) errors.accountNumber = 'Enter an account number.'
  else if (!/^\d+$/.test(digits)) errors.accountNumber = 'Account numbers can only contain digits.'
  else if (digits.length < min || digits.length > max) errors.accountNumber = `Enter ${min}–${max} digits.`

  return errors
}

export function validateLogin({ email, password }) {
  const errors = {}

  if (!email?.trim()) errors.email = 'Enter your email address.'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.'

  if (!password) errors.password = 'Enter your password.'

  return errors
}
