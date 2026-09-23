import { CHANNEL_LABELS, FREQUENCY_LABELS, formatMoney, formatTime, ordinal } from '../utils/format.js'

// The six rule-based fraud checks. Each takes the standing-order request and
// the user's behavioural profile and returns `{ score, findings }`:
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
  if (yearlyTotal > profile.standingOrderAmountRange.max * 12 * 2) {
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
    findings.push(ok(`${request.recipient} is an existing payee (${known.relationship.toLowerCase()}).`))
  } else {
    score -= 0.4
    findings.push(bad(`${request.recipient} has never been paid from this account.`))
  }

  if (context.beneficiaryAddedMinutesBefore != null && context.beneficiaryAddedMinutesBefore < 1440) {
    score -= 0.25
    findings.push(bad(`The payee was added ${context.beneficiaryAddedMinutesBefore} minutes before this request.`))
  }

  if (/secure|settlement|holding|verif|safe account|protection/i.test(request.recipient)) {
    score -= 0.1
    findings.push(warn('The payee name uses security-themed wording that often appears in impersonation scams.'))
  }

  return { score, findings }
}

export function checkBehaviour(request, profile) {
  const context = request.context ?? {}
  const findings = []
  let score = 1

  // TIMEZONE: getDate()/getHours() read the runtime's local zone, so the
  // result depends on where this code runs. Must use Indian/Mauritius.
  const paymentDay = new Date(request.date).getDate()
  if (!profile.usualPaymentDays.includes(paymentDay)) {
    score -= 0.3
    findings.push(warn(`The first payment on the ${ordinal(paymentDay)} falls outside your usual payment days (${profile.usualPaymentDaysLabel}).`))
  }

  if (context.initiatedAt) {
    const hour = new Date(context.initiatedAt).getHours()
    if (hour < profile.activeHours.start || hour >= profile.activeHours.end) {
      score -= 0.34
      findings.push(warn(`It was set up at ${formatTime(context.initiatedAt)}, outside the hours you normally bank.`))
    }
  }

  if (context.deviceId && !profile.knownDevices.includes(context.deviceId)) {
    score -= 0.3
    findings.push(bad('It was initiated from a device that has not been used on this account before.'))
  }

  if (findings.length === 0) findings.push(ok('Timing, payment day and device all match your usual activity.'))
  return { score, findings }
}

// Scam-language patterns for the request text. Keyword rules for now — the
// "NLP" check will later combine these with a trained text model.
const LANGUAGE_PATTERNS = [
  {
    label: 'Urgency pressure',
    penalty: 0.2,
    pattern: /\b(urgent(ly)?|immediately|today|right away|as soon as possible|within \d+ (hours?|minutes?)|before \d{1,2}[:.]\d{2})/i,
  },
  {
    label: 'Threat of consequences',
    penalty: 0.25,
    pattern: /\b(suspen(d|ded|sion)|frozen|freeze|blocked|legal action|penalt(y|ies)|closure)\b/i,
  },
  {
    label: 'Asks you to bypass normal checks',
    penalty: 0.3,
    pattern: /\b(no need to (contact|call|verify)|do not (contact|call|tell)|don't (contact|call|tell)|without (verifying|checking)|skip (the )?(verification|checks?))\b/i,
  },
  {
    label: 'External link or website',
    penalty: 0.25,
    pattern: /(https?:\/\/\S+|\b[a-z0-9-]+\.(com|net|org|info|xyz|link|site|online)\b)/i,
  },
  {
    label: 'Requests sensitive information',
    penalty: 0.35,
    pattern: /\b(otp|one-time (pass)?code|pin|password|card number|cvv)\b/i,
  },
  {
    label: 'Claims to act for your bank',
    penalty: 0.2,
    pattern: /\b(security team|account protection|security review|on behalf of (your|the) bank|bank officer|fraud department)\b/i,
  },
]

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

  if (channel && channel !== profile.usualChannel) {
    score -= 0.5
    findings.push(bad(`The request arrived through ${CHANNEL_LABELS[channel] ?? channel}, not through your online banking.`))
  }

  if (!known?.agreementOnFile) {
    score -= 0.4
    findings.push(bad('No agreement, invoice or earlier arrangement on file supports this request.'))
  } else if (known.expectedFrequency !== request.frequency) {
    score -= 0.3
    findings.push(warn('The frequency differs from the arrangement on file for this payee.'))
  } else {
    findings.push(ok(`Matches the ${known.relationship.toLowerCase()} arrangement on file.`))
  }

  return { score, findings }
}
