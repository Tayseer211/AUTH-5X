import { createId } from '../utils/ids.js'
import { APP_TIMEZONE, addMonths, daysInMonth, zonedDate, zonedParts } from '../utils/time.js'

// Simulated transaction history every new account starts with. It is also
// the baseline the fraud engine's behavioural profile is derived from (see
// fraud/profile.js). None of these need approval; the three pending standing
// orders come from demoCases.js.
//
// `context` records how an online-banking transaction was set up (channel and
// device); card payments have none.
const LAPTOP = { channel: 'ONLINE_BANKING', deviceId: 'device-home-laptop' }
const PHONE = { channel: 'ONLINE_BANKING', deviceId: 'device-personal-phone' }

// One-off activity, dated relative to "now" so the dashboard always looks
// recent. Hours are Mauritius local time.
const SEED_HISTORY = [
  { daysAgo: 0, hour: 9, minute: 5, type: 'TRANSFER', recipient: 'Transfer to savings', amount: 10000, status: 'PENDING', description: 'Own-account transfer, processing', context: LAPTOP },
  { daysAgo: 1, hour: 18, minute: 22, type: 'CARD_PAYMENT', recipient: 'Marché Central Grocers', amount: 2184.5, status: 'APPROVED', description: 'Groceries' },
  { daysAgo: 3, hour: 19, minute: 40, type: 'CARD_PAYMENT', recipient: 'Rivière Noire Fitness', amount: 1500, status: 'APPROVED', description: 'Gym membership' },
  { daysAgo: 4, hour: 8, minute: 12, type: 'CARD_PAYMENT', recipient: 'Island Fuel Station', amount: 1200, status: 'APPROVED', description: 'Fuel' },
  { daysAgo: 6, hour: 23, minute: 17, type: 'CARD_PAYMENT', recipient: 'QuickCart Online Store', amount: 14999, status: 'FLAGGED', riskLevel: 'MEDIUM', description: 'Held for review: unusual merchant location' },
  { daysAgo: 8, hour: 7, minute: 30, type: 'INCOMING', direction: 'IN', recipient: 'Northwind Logistics (salary)', amount: 68500, status: 'APPROVED', description: 'Monthly salary' },
  { daysAgo: 9, hour: 12, minute: 48, type: 'CARD_PAYMENT', recipient: 'Pharmacie du Port', amount: 640, status: 'APPROVED', description: 'Pharmacy' },
  { daysAgo: 12, hour: 10, minute: 2, type: 'BILL_PAYMENT', recipient: 'Island Power Utility', amount: 2430, status: 'APPROVED', description: 'Electricity bill', context: LAPTOP },
  { daysAgo: 30, hour: 14, minute: 26, type: 'TRANSFER', recipient: 'Harbourline Property Management', amount: 9800, status: 'APPROVED', description: 'Annual maintenance top-up', context: PHONE },
]

// Existing monthly standing orders. Each is paid on a fixed day of the month
// at 06:00; the ledger holds the last STANDING_ORDER_MONTHS payments of each.
const STANDING_ORDERS = [
  { dayOfMonth: 1, recipient: 'Harbourline Property Management', amount: 7500, description: 'Building maintenance fees', context: PHONE },
  { dayOfMonth: 3, recipient: 'Lumière Fibre Ltd', amount: 1899, description: 'Home internet', context: LAPTOP },
  { dayOfMonth: 28, recipient: 'Coastal Shield Insurance', amount: 3250, description: 'Home insurance', context: LAPTOP },
  { dayOfMonth: 30, recipient: 'ABC Services Ltd.', amount: 5000, description: 'Office cleaning contract', context: LAPTOP },
]

const STANDING_ORDER_MONTHS = 3
const STANDING_ORDER_HOUR = 6

function daysBefore(now, daysAgo, hour, minute, timeZone) {
  const today = zonedParts(now, timeZone)
  return zonedDate({ ...today, day: today.day - daysAgo, hour, minute }, timeZone)
}

// The most recent `count` payment dates of a monthly order, all before `now`.
function pastPaymentDates(now, dayOfMonth, count, timeZone) {
  const dates = []
  const current = zonedParts(now, timeZone)
  for (let offset = 0; dates.length < count; offset -= 1) {
    const month = addMonths(current, offset)
    const date = zonedDate({ ...month, day: Math.min(dayOfMonth, daysInMonth(month)), hour: STANDING_ORDER_HOUR }, timeZone)
    if (date < now) dates.push(date)
  }
  return dates
}

function toTransaction(seed, at) {
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
    context: seed.context ? { ...seed.context } : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createSeedTransactions(now = new Date(), timeZone = APP_TIMEZONE) {
  const oneOff = SEED_HISTORY.map((seed) => toTransaction(seed, daysBefore(now, seed.daysAgo, seed.hour, seed.minute, timeZone)))

  const standingOrders = STANDING_ORDERS.flatMap((order) =>
    pastPaymentDates(now, order.dayOfMonth, STANDING_ORDER_MONTHS, timeZone).map((at) =>
      toTransaction({ ...order, type: 'STANDING_ORDER', status: 'APPROVED', frequency: 'MONTHLY' }, at),
    ),
  )

  return [...oneOff, ...standingOrders]
}
