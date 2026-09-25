import { APP_TIMEZONE, zonedParts } from '../utils/time.js'
import { createId } from '../utils/ids.js'

// Transaction reference and QR receipt for approved standing orders.
//
// When a transaction is approved it gets a reference ("FA-" and ten hex
// characters) that is unique in the user's ledger. The reference is created
// once, at approval, and saved with the transaction as `proof`:
//
//   proof: { reference, issuedAt, qr: { version, payload } }
//
// The QR code encodes `payload`, a compact JSON receipt with exactly these
// fields, in this order:
//
//   type       "fraud.auth.transaction"
//   version    1
//   reference  the transaction reference (the canonical identifier)
//   date       approval time in the app's time zone, with its UTC offset
//   amount     amount of the payment
//   currency   ISO currency code
//   customer   the customer's name
//   bank       the customer's bank code (MCB, SBM, MAUBANK): a code, never
//              an image; the receipt screen picks the logo from it
//   recipient  the payee / merchant
//
// Nothing else goes in: no account numbers, credentials, one-time codes or
// fraud scores. The payload is plain ASCII (other characters are written as
// \uXXXX escapes, which parse back to the same text), so scanners read it the
// same way everywhere. The QR image is never stored; it is derived from the
// payload each time it is shown, so the same transaction always gives the
// same code.
//
// A scanned payload is parsed back into its details by parseReceiptPayload,
// and lookupScannedReceipt finds the transaction from its reference and
// checks the other details against what was stored. That is the hook a later
// workflow (a refund, say) can use to find the transaction again; nothing
// here implements one and nothing decides anything about fraud.
//
// Transactions approved before receipts existed have a proof without `qr`;
// they keep working and simply have no QR receipt (receiptFor returns null).

export const REFERENCE_PREFIX = 'FA-'
export const REFERENCE_LENGTH = 10
export const RECEIPT_TYPE = 'fraud.auth.transaction'
// Version of the payload and of the stored `qr` shape.
export const RECEIPT_VERSION = 1
export const RECEIPT_FIELDS = ['type', 'version', 'reference', 'date', 'amount', 'currency', 'customer', 'bank', 'recipient']

// Names longer than this are cut when the receipt is made, to keep the QR
// practical; a parsed receipt may carry up to MAX_PARSED_TEXT.
const MAX_TEXT = 48
const MAX_PARSED_TEXT = 64
const MAX_PAYLOAD_LENGTH = 1024

const REFERENCE_PATTERN = new RegExp(`^${REFERENCE_PREFIX}[0-9A-F]{${REFERENCE_LENGTH}}$`)
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/
const BANK_PATTERN = /^[A-Z0-9_]{2,16}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const MAX_ATTEMPTS = 50

export const isTransactionReference = (value) => typeof value === 'string' && REFERENCE_PATTERN.test(value)

// --- References ---------------------------------------------------------------

// The references already issued in a list of transactions.
export function issuedReferences(transactions) {
  return new Set(transactions.map((tx) => tx.proof?.reference).filter(Boolean))
}

// A new reference that is not in `taken`. `random` supplies hex text and
// exists so tests can force a collision.
export function newTransactionReference({ taken = new Set(), random = createId } = {}) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const reference = `${REFERENCE_PREFIX}${random().slice(0, REFERENCE_LENGTH).toUpperCase()}`
    if (isTransactionReference(reference) && !taken.has(reference)) return reference
  }
  throw new Error('Could not create a unique transaction reference.')
}

// --- Dates ----------------------------------------------------------------------

// `value` as local time in `timeZone` with its UTC offset, e.g.
// "2026-09-24T14:32:00+04:00".
export function isoWithOffset(value, timeZone = APP_TIMEZONE) {
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms)) throw new Error(`Invalid date: ${value}`)
  const parts = zonedParts(ms, timeZone)
  const offsetMinutes = Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000) / 60000)
  const pad = (number) => String(number).padStart(2, '0')
  const sign = offsetMinutes < 0 ? '-' : '+'
  const offset = Math.abs(offsetMinutes)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`
}

// A receipt date for people: "24 September 2026, 14:32 (UTC+04:00)". It is
// read from the date's own text, so it shows the same time wherever the
// receipt is viewed.
export function describeReceiptDate(date) {
  const match = DATE_PATTERN.exec(date)
  if (!match) return String(date)
  const [, year, month, day, hour, minute, , sign, offsetHours, offsetMinutes] = match
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const dayText = calendar.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `${dayText}, ${hour}:${minute} (UTC${sign}${offsetHours}:${offsetMinutes})`
}

// --- Receipt details and payload --------------------------------------------

const cleanText = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT).trim() : '')

// The receipt details for an approved transaction, or null if any of them is
// missing. `transaction` is the approved request, `payer` is
// `{ name, bank }` for the customer, `issuedAt` the approval time.
export function buildReceiptDetails({ reference, issuedAt, transaction, payer }) {
  const details = {
    type: RECEIPT_TYPE,
    version: RECEIPT_VERSION,
    reference,
    date: isTransactionReference(reference) && issuedAt ? isoWithOffset(issuedAt) : null,
    amount: transaction?.amount,
    currency: transaction?.currency ?? 'MUR',
    customer: cleanText(payer?.name),
    bank: payer?.bank,
    recipient: cleanText(transaction?.recipient),
  }
  return validateDetails(details) ? details : null
}

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_PARSED_TEXT

function validateDetails(details) {
  return (
    details.type === RECEIPT_TYPE &&
    details.version === RECEIPT_VERSION &&
    isTransactionReference(details.reference) &&
    typeof details.date === 'string' &&
    DATE_PATTERN.test(details.date) &&
    typeof details.amount === 'number' &&
    Number.isFinite(details.amount) &&
    details.amount > 0 &&
    typeof details.currency === 'string' &&
    CURRENCY_PATTERN.test(details.currency) &&
    isText(details.customer) &&
    typeof details.bank === 'string' &&
    BANK_PATTERN.test(details.bank) &&
    isText(details.recipient)
  )
}

const escapeNonAscii = (json) => json.replace(/[\u007f-￿]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)

// The canonical payload for receipt details: the fields above, in order, as
// JSON, in plain ASCII.
export function receiptPayload(details) {
  return escapeNonAscii(JSON.stringify(Object.fromEntries(RECEIPT_FIELDS.map((field) => [field, details[field]]))))
}

// The details in a scanned or stored payload, or null if it is not a valid
// fraud.auth receipt. It must have exactly the receipt fields (extra
// fields are rejected, so nothing else can ride along) and every value must
// be valid; the field order and spacing may vary.
export function parseReceiptPayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH) return null
  let data
  try {
    data = JSON.parse(payload)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const keys = Object.keys(data)
  if (keys.length !== RECEIPT_FIELDS.length || !RECEIPT_FIELDS.every((field) => keys.includes(field))) return null
  const details = Object.fromEntries(RECEIPT_FIELDS.map((field) => [field, data[field]]))
  return validateDetails(details) ? details : null
}

// The `qr` data stored with a proof: the payload only.
export const createReceiptQr = (details) => ({ version: RECEIPT_VERSION, payload: receiptPayload(details) })

// The `proof` saved on a transaction at approval. `transactions` is the
// ledger so far, which keeps the new reference unique within it. The proof
// gets a `qr` only when the receipt details are complete; without the
// customer or bank it has the reference alone, as older approvals do.
export function createProof(transactions, issuedAt, { transaction, payer } = {}) {
  const reference = newTransactionReference({ taken: issuedReferences(transactions) })
  const details = buildReceiptDetails({ reference, issuedAt, transaction, payer })
  return details ? { reference, issuedAt, qr: createReceiptQr(details) } : { reference, issuedAt }
}

// --- Reading receipts back ------------------------------------------------------

// The receipt to show for an approved transaction, or null when it has none:
// not approved, approved before receipts existed, or a stored payload that is
// not a valid receipt for this transaction's own reference.
export function receiptFor(tx) {
  const proof = tx?.proof
  if (tx?.status !== 'APPROVED' || !isTransactionReference(proof?.reference)) return null
  const details = parseReceiptPayload(proof.qr?.payload)
  if (!details || details.reference !== proof.reference) return null
  return { reference: proof.reference, payload: proof.qr.payload, issuedAt: proof.issuedAt, details }
}

// Finds a transaction from its reference or from a scanned QR payload.
export function findTransactionByReference(transactions, referenceOrPayload) {
  const reference = isTransactionReference(referenceOrPayload) ? referenceOrPayload : parseReceiptPayload(referenceOrPayload)?.reference
  if (!reference) return null
  return transactions.find((tx) => tx.proof?.reference === reference) ?? null
}

// Looks up a scanned QR payload. The reference identifies the transaction;
// the rest of the scanned details are then checked against the stored ones.
//   INVALID  — not a fraud.auth receipt;
//   UNKNOWN  — a valid receipt whose reference is not in this ledger;
//   MISMATCH — the reference is known but the scanned details differ from
//              what was stored;
//   MATCH    — the reference is known and every detail agrees.
export function lookupScannedReceipt(transactions, scanned) {
  const details = parseReceiptPayload(scanned)
  if (!details) return { status: 'INVALID', transaction: null, details: null }
  const transaction = transactions.find((tx) => tx.proof?.reference === details.reference) ?? null
  if (!transaction) return { status: 'UNKNOWN', transaction: null, details }
  const stored = receiptFor(transaction)
  const agrees = stored && RECEIPT_FIELDS.every((field) => stored.details[field] === details[field])
  return { status: agrees ? 'MATCH' : 'MISMATCH', transaction, details }
}
