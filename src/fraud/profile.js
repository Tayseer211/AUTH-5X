import { ordinal } from '../utils/format.js'
import { APP_TIMEZONE, zonedParts } from '../utils/time.js'

// Derives the behavioural profile the fraud engine compares each request
// against from the user's own ledger. Pure: same transactions in, same
// profile out.
//
// Only settled, outgoing history counts as the baseline (see
// isBaselineTransaction). Requests decided through the approval flow are left
// out, so evaluating or approving one request never shifts the baseline the
// next one is scored against.

export const PROFILE_SETTINGS = {
  // A request is on a usual payment day if it is within this many days of a
  // day an existing standing order is paid on (wrapping over month end).
  paymentDayTolerance: 2,
  // Hours added either side of the earliest/latest hour the user has banked.
  activeHourPadding: 1,
}

export function isBaselineTransaction(tx) {
  return tx.status === 'APPROVED' && tx.direction === 'OUT' && !tx.requiresApproval && !tx.decision
}

const round2 = (value) => Math.round(value * 100) / 100
const recipientKey = (name) => name.trim().toLowerCase()
const byNewest = (a, b) => new Date(b.date) - new Date(a.date)
const unique = (values) => [...new Set(values.filter((value) => value != null))]

function mostCommon(values) {
  const counts = new Map()
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = null
  for (const [value, count] of counts) if (best === null || count > counts.get(best)) best = value
  return best
}

// Days 1–31 treated as a cycle, so the 30th is within two days of the 1st.
function dayDistance(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 31 - diff)
}

function expandPaymentDays(days, tolerance) {
  const expanded = []
  for (let day = 1; day <= 31; day += 1) {
    if (days.some((usual) => dayDistance(day, usual) <= tolerance)) expanded.push(day)
  }
  return expanded
}

function listLabel(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// Hour of day the user was actively banking. Standing-order payments run on
// the bank's schedule, so they only count when the set-up time is recorded.
export function initiatedHour(tx, timeZone) {
  if (tx.context?.initiatedAt) return zonedParts(tx.context.initiatedAt, timeZone).hour
  if (tx.type === 'STANDING_ORDER') return null
  return zonedParts(tx.createdAt ?? tx.date, timeZone).hour
}

function deriveRecipients(baseline, timeZone) {
  const groups = new Map()
  for (const tx of baseline) {
    const key = recipientKey(tx.recipient)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(tx)
  }

  return [...groups.values()].map((transactions) => {
    const newestFirst = [...transactions].sort(byNewest)
    const latestOrder = newestFirst.find((tx) => tx.type === 'STANDING_ORDER')
    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0)

    return {
      name: newestFirst[0].recipient,
      transactionCount: transactions.length,
      averageAmount: round2(total / transactions.length),
      lastPaidAt: newestFirst[0].date,
      relationship: (latestOrder ?? newestFirst[0]).description,
      // The existing arrangement with this payee, if they are paid by
      // standing order.
      standingOrder: latestOrder
        ? {
            frequency: latestOrder.frequency,
            amount: latestOrder.amount,
            dayOfMonth: zonedParts(latestOrder.date, timeZone).day,
          }
        : null,
    }
  })
}

export function deriveUserProfile(transactions, { timeZone = APP_TIMEZONE, settings = PROFILE_SETTINGS } = {}) {
  const baseline = transactions.filter(isBaselineTransaction)
  const standingOrders = baseline.filter((tx) => tx.type === 'STANDING_ORDER')
  const orderAmounts = standingOrders.map((tx) => tx.amount)

  const paymentDays = unique(standingOrders.map((tx) => zonedParts(tx.date, timeZone).day)).sort((a, b) => a - b)
  const hours = baseline.map((tx) => initiatedHour(tx, timeZone)).filter((hour) => hour != null)

  return {
    timezone: timeZone,
    transactionCount: baseline.length,
    averageAmount: baseline.length ? round2(baseline.reduce((sum, tx) => sum + tx.amount, 0) / baseline.length) : null,
    standingOrderAmountRange: orderAmounts.length ? { min: Math.min(...orderAmounts), max: Math.max(...orderAmounts) } : null,
    usualFrequencies: unique(standingOrders.map((tx) => tx.frequency)),
    paymentDays,
    usualPaymentDays: expandPaymentDays(paymentDays, settings.paymentDayTolerance),
    usualPaymentDaysLabel: paymentDays.length ? `around the ${listLabel(paymentDays.map(ordinal))}` : 'none yet',
    // Hours in `timezone`, [start, end).
    activeHours: hours.length
      ? {
          start: Math.max(0, Math.min(...hours) - settings.activeHourPadding),
          end: Math.min(24, Math.max(...hours) + 1 + settings.activeHourPadding),
        }
      : null,
    knownRecipients: deriveRecipients(baseline, timeZone),
    knownDevices: unique(baseline.map((tx) => tx.context?.deviceId)),
    usualChannel: mostCommon(baseline.map((tx) => tx.context?.channel)),
  }
}
