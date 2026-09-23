import { createId } from '../utils/ids.js'

// Simulated transaction history every new account starts with. Dates are
// relative to "now" so the dashboard always looks recent. None of these need
// approval; the three pending standing orders come from demoCases.js.
const SEED_HISTORY = [
  { daysAgo: 0, hour: 9, minute: 5, type: 'TRANSFER', recipient: 'Transfer to savings', amount: 10000, status: 'PENDING', description: 'Own-account transfer, processing' },
  { daysAgo: 1, hour: 18, minute: 22, type: 'CARD_PAYMENT', recipient: 'Marché Central Grocers', amount: 2184.5, status: 'APPROVED', description: 'Groceries' },
  { daysAgo: 2, hour: 6, minute: 0, type: 'STANDING_ORDER', recipient: 'Lumière Fibre Ltd', amount: 1899, status: 'APPROVED', frequency: 'MONTHLY', description: 'Home internet' },
  { daysAgo: 3, hour: 19, minute: 40, type: 'CARD_PAYMENT', recipient: 'Rivière Noire Fitness', amount: 1500, status: 'APPROVED', description: 'Gym membership' },
  { daysAgo: 4, hour: 8, minute: 12, type: 'CARD_PAYMENT', recipient: 'Island Fuel Station', amount: 1200, status: 'APPROVED', description: 'Fuel' },
  { daysAgo: 5, hour: 6, minute: 0, type: 'STANDING_ORDER', recipient: 'Coastal Shield Insurance', amount: 3250, status: 'APPROVED', frequency: 'MONTHLY', description: 'Home insurance' },
  { daysAgo: 6, hour: 23, minute: 17, type: 'CARD_PAYMENT', recipient: 'QuickCart Online Store', amount: 14999, status: 'FLAGGED', riskLevel: 'MEDIUM', description: 'Held for review: unusual merchant location' },
  { daysAgo: 8, hour: 7, minute: 30, type: 'INCOMING', direction: 'IN', recipient: 'Northwind Logistics (salary)', amount: 68500, status: 'APPROVED', description: 'Monthly salary' },
  { daysAgo: 9, hour: 12, minute: 48, type: 'CARD_PAYMENT', recipient: 'Pharmacie du Port', amount: 640, status: 'APPROVED', description: 'Pharmacy' },
  { daysAgo: 12, hour: 10, minute: 2, type: 'BILL_PAYMENT', recipient: 'Island Power Utility', amount: 2430, status: 'APPROVED', description: 'Electricity bill' },
  { daysAgo: 24, hour: 6, minute: 0, type: 'STANDING_ORDER', recipient: 'ABC Services Ltd.', amount: 5000, status: 'APPROVED', frequency: 'MONTHLY', description: 'Office cleaning contract' },
  { daysAgo: 30, hour: 14, minute: 26, type: 'TRANSFER', recipient: 'Harbourline Property Management', amount: 9800, status: 'APPROVED', description: 'Annual maintenance top-up' },
]

export function createSeedTransactions(now = new Date()) {
  return SEED_HISTORY.map((seed) => {
    // TIMEZONE: setDate/setHours use the runtime's local zone. Should be
    // built in Indian/Mauritius time.
    const at = new Date(now)
    at.setDate(at.getDate() - seed.daysAgo)
    at.setHours(seed.hour, seed.minute, 0, 0)
    const timestamp = at.toISOString()

    return {
      id: createId('txn'),
      reference: `TX-${createId().slice(0, 6).toUpperCase()}`,
      type: seed.type,
      direction: seed.direction ?? 'OUT',
      recipient: seed.recipient,
      amount: seed.amount,
      currency: 'MUR',
      date: timestamp,
      status: seed.status,
      riskScore: null,
      riskLevel: seed.riskLevel ?? null,
      frequency: seed.frequency ?? 'ONE_OFF',
      description: seed.description,
      requestText: null,
      requiresApproval: false,
      verificationCase: null,
      analysis: null,
      decision: null,
      proof: null,
      context: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
}
