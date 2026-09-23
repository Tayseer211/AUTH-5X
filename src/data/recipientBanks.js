// Where a payee's account is held, relative to the customer's bank.
//
// Requests, the fraud engine, feature extraction, the synthetic dataset and
// the ML model all store and compare the canonical codes; only the UI shows
// the human-readable labels.

export const RECIPIENT_BANK_LABELS = {
  SAME_BANK: 'Same bank',
  OTHER_LOCAL_BANK: 'Another local bank',
  OVERSEAS_BANK: 'Overseas bank',
}

export const RECIPIENT_BANKS = Object.keys(RECIPIENT_BANK_LABELS)

const BY_LABEL = new Map(Object.entries(RECIPIENT_BANK_LABELS).map(([code, label]) => [label.toLowerCase(), code]))

// The canonical code for a code or display label (case-insensitive), e.g.
// "Another local bank" → OTHER_LOCAL_BANK. Requests saved before codes were
// introduced carry labels, so both are accepted. null stays null; anything
// unrecognised is returned unchanged, so downstream validation can flag it
// rather than have it silently become "unknown".
export function normalizeRecipientBank(value) {
  if (value == null) return null
  const text = String(value).trim()
  if (RECIPIENT_BANKS.includes(text)) return text
  const upper = text.toUpperCase()
  if (RECIPIENT_BANKS.includes(upper)) return upper
  return BY_LABEL.get(text.toLowerCase()) ?? value
}

export function recipientBankLabel(value) {
  const code = normalizeRecipientBank(value)
  return RECIPIENT_BANK_LABELS[code] ?? (value == null ? '' : String(value))
}
