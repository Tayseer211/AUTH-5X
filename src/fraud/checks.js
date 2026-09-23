import { CHANNEL_LABELS, FREQUENCY_LABELS, formatMoney, formatTime, ordinal } from '../utils/format.js'
import { zonedParts } from '../utils/time.js'
import { LANGUAGE_PATTERNS, SECURITY_NAME_RULE_PATTERN } from './text/patterns.js'

// The six rule-based fraud checks. Each takes the standing-order request and
// the behavioural profile derived from the user's ledger (profile.js) and
// returns `{ score, findings }`:
//   score    — 1 means fully consistent with the user's normal activity;
//              penalties are subtracted and the engine clamps to [0, 1].
//   findings — explanations shown in the UI, tagged ok / warn / bad.

const ok = (text) => ({ tone: 'ok', text })
const warn = (text) => ({ tone: 'warn', text })
const bad = (text) => ({ tone: 'bad', text })

const PAYMENTS_PER_YEAR = { ONE_OFF: 1, DAILY: 365, WEEKLY: 52, MONTHLY: 12 }

function findKnownRecipient(request, profile) {
  const name = request.recipient.trim().toLowerCase()
  return profile.knownRecipients.find((recipient) => recipient.name.toLowerCase() === name) ?? null
}

export function checkAmount(request, profile) {
  if (!profile.standingOrderAmountRange) {
    return { score: 0.5, findings: [warn('There are no earlier standing orders on this account to compare the amount with.')] }
  }

  const { min, max } = profile.standingOrderAmountRange
  const ratio = request.amount / max

  if (ratio <= 1) {
    return {
      score: 1,
      findings: [ok(`${formatMoney(request.amount)} is within your usual standing-order range (${formatMoney(min)}–${formatMoney(max)}).`)],
    }
  }

  const score = 1 - (ratio - 1) * 0.9
  const finding =
    ratio < 2
      ? warn(`${formatMoney(request.amount)} is ${Math.round((ratio - 1) * 100)}% above the largest standing order you usually set up (${formatMoney(max)}).`)
      : bad(`${formatMoney(request.amount)} is ${ratio.toFixed(1)}× the largest standing order you usually set up (${formatMoney(max)}).`)
  return { score, findings: [finding] }
}

export function checkFrequency(request, profile) {
  const label = FREQUENCY_LABELS[request.frequency] ?? request.frequency
  const findings = []
  let score = 1

  if (profile.usualFrequencies.includes(request.frequency)) {
    findings.push(ok(`${label} matches how you normally schedule standing orders.`))
  } else {
    const penalty = { DAILY: 0.8, WEEKLY: 0.6, ONE_OFF: 0.1 }[request.frequency] ?? 0.5
    score -= penalty
    findings.push((penalty >= 0.5 ? bad : warn)(`${label} payments are unusual for this account; your standing orders are normally monthly.`))
  }

  const yearlyTotal = request.amount * (PAYMENTS_PER_YEAR[request.frequency] ?? 1)
  const usualMax = profile.standingOrderAmountRange?.max
  if (usualMax != null && yearlyTotal > usualMax * 12 * 2) {
    score -= 0.3
    findings.push(bad(`At this frequency the order would move ${formatMoney(yearlyTotal)} per year.`))
  }

  return { score, findings }
}

export function checkRecipient(request, profile) {
  const known = findKnownRecipient(request, profile)
  const context = request.context ?? {}
  const findings = []
  let score = 1

  if (known) {
    const payments = known.transactionCount === 1 ? '1 earlier payment' : `${known.transactionCount} earlier payments`
    findings.push(ok(`${request.recipient} is an existing payee (${known.relationship.toLowerCase()}, ${payments}).`))
  } else {
    score -= 0.4
    findings.push(bad(`${request.recipient} has never been paid from this account.`))
  }

  if (context.beneficiaryAddedMinutesBefore != null && context.beneficiaryAddedMinutesBefore < 1440) {
    score -= 0.25
    findings.push(bad(`The payee was added ${context.beneficiaryAddedMinutesBefore} minutes before this request.`))
  }

  if (SECURITY_NAME_RULE_PATTERN.test(request.recipient)) {
    score -= 0.1
    findings.push(warn('The payee name uses security-themed wording that often appears in impersonation scams.'))
  }

  return { score, findings }
}

export function checkBehaviour(request, profile) {
  const context = request.context ?? {}
  const findings = []
  let score = 1

  // Day and hour are read in the profile's time zone, not the runtime's.
  const timeZone = profile.timezone
  const paymentDay = zonedParts(request.date, timeZone).day
  if (profile.paymentDays.length && !profile.usualPaymentDays.includes(paymentDay)) {
    score -= 0.3
    findings.push(warn(`The first payment on the ${ordinal(paymentDay)} falls outside your usual payment days (${profile.usualPaymentDaysLabel}).`))
  }

  if (context.initiatedAt && profile.activeHours) {
    const { hour } = zonedParts(context.initiatedAt, timeZone)
    if (hour < profile.activeHours.start || hour >= profile.activeHours.end) {
      score -= 0.34
      findings.push(warn(`It was set up at ${formatTime(context.initiatedAt, { timeZone })}, outside the hours you normally bank.`))
    }
  }

  // Devices can only be judged once the history records some.
  if (context.deviceId && profile.knownDevices.length && !profile.knownDevices.includes(context.deviceId)) {
    score -= 0.3
    findings.push(bad('It was initiated from a device that has not been used on this account before.'))
  }

  if (findings.length === 0) findings.push(ok('Timing, payment day and device all match your usual activity.'))
  return { score, findings }
}

// Scam-language patterns live in text/patterns.js; re-exported so existing
// imports of LANGUAGE_PATTERNS from checks.js keep working.
export { LANGUAGE_PATTERNS }

export function checkLanguage(request) {
  const text = request.requestText ?? ''
  const findings = []
  let score = 1

  for (const { label, penalty, pattern } of LANGUAGE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      score -= penalty
      findings.push(bad(`${label}: “${match[0]}”`))
    }
  }

  if (findings.length === 0) {
    findings.push(ok('No urgency, threats, impersonation or unusual payment instructions in the request wording.'))
  }
  return { score, findings }
}

export function checkExpectedRequest(request, profile) {
  const known = findKnownRecipient(request, profile)
  const channel = request.context?.channel
  const findings = []
  let score = 1

  if (channel && profile.usualChannel && channel !== profile.usualChannel) {
    score -= 0.5
    findings.push(bad(`The request arrived through ${CHANNEL_LABELS[channel] ?? channel}, not through your online banking.`))
  }

  // An existing standing order to this payee is the arrangement on file.
  const arrangement = known?.standingOrder
  if (!arrangement) {
    score -= 0.4
    findings.push(bad('No existing standing order or earlier arrangement with this payee supports this request.'))
  } else if (arrangement.frequency !== request.frequency) {
    score -= 0.3
    findings.push(warn('The frequency differs from your existing standing order to this payee.'))
  } else {
    findings.push(ok(`Matches your existing ${known.relationship.toLowerCase()} standing order.`))
  }

  return { score, findings }
}
