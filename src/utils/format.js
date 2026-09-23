// Display formatting and label maps shared across the app.
//
// TIMEZONE: formatDate/formatTime use the runtime's local time zone (no
// `timeZone` option). They should eventually pass
// `timeZone: 'Indian/Mauritius'` so the simulation never depends on the
// browser's or server's zone. Left unchanged during the migration so output
// matches the original prototype exactly.

// "Rs 5,000" / "Rs 2,184.50", with a +/− sign when a direction is given.
export function formatMoney(amount, { direction } = {}) {
  const value = Math.abs(amount)
  const digits = value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })
  const sign = direction === 'IN' ? '+ ' : direction === 'OUT' ? '− ' : ''
  return `${sign}Rs ${digits}`
}

export function formatDate(value, { long = false } = {}) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
  })
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(value) {
  return `${formatDate(value)}, ${formatTime(value)}`
}

// Shows only the last four digits: "••••••4821".
export function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber ?? '')
  return `${'•'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`
}

// 1 -> "1st", 12 -> "12th", 23 -> "23rd".
export function ordinal(n) {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const lastTwo = n % 100
  return n + (suffixes[(lastTwo - 20) % 10] || suffixes[lastTwo] || suffixes[0])
}

export const FREQUENCY_LABELS = {
  ONE_OFF: 'One-time',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
}

export const TRANSACTION_TYPE_LABELS = {
  STANDING_ORDER: 'Standing order',
  CARD_PAYMENT: 'Card payment',
  TRANSFER: 'Transfer',
  INCOMING: 'Incoming transfer',
  BILL_PAYMENT: 'Bill payment',
}

export const CHANNEL_LABELS = {
  ONLINE_BANKING: 'Online banking',
  EMAIL_LINK: 'a link in an email',
}

export const STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  FLAGGED: 'Flagged',
  REJECTED: 'Rejected',
}
