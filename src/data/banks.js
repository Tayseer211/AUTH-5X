// Simulated Mauritian banks. fraud.auth never connects to any of them.

export const BANKS = [
  { code: 'MCB', name: 'MCB', description: 'Simulated MCB account' },
  { code: 'SBM', name: 'SBM', description: 'Simulated SBM account' },
  { code: 'MAUBANK', name: 'MauBank', description: 'Simulated MauBank account' },
]

export function getBank(code) {
  return BANKS.find((bank) => bank.code === code) ?? null
}

export const ACCOUNT_NUMBER_RULES = {
  min: 10,
  max: 14,
  hint: 'Demo format: 10–14 digits. Use a made-up number, not a real one.',
}

export function normalizeAccountNumber(value) {
  return String(value).replace(/\s+/g, '')
}
