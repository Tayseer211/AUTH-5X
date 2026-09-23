import { LANGUAGE_PATTERNS } from './checks.js'
import { initiatedHour, isBaselineTransaction } from './profile.js'
import { zonedParts } from '../utils/time.js'

// Feature extraction for standing-order requests: the step that turns a
// request, the user's ledger and the profile derived from it (profile.js)
// into the flat features a model can learn from.
//
// Pure: the same request, history and profile always give the same features.
// It reads only what the bank would know when the request is submitted, so it
// works both on the app's pending requests and on the synthetic dataset
// (synthetic/generator.js). Features are split into
//   raw     — observed on the request or counted from history, untransformed;
//   derived — ratios, flags and scores computed from the raw values.
// Fields the history cannot support (e.g. account numbers the ledger never
// recorded) are null rather than guessed.

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTES_PER_DAY = 24 * 60

export const PAYMENTS_PER_YEAR = { ONE_OFF: 1, DAILY: 365, WEEKLY: 52, MONTHLY: 12 }

// A payee name at least this similar to a known payee, without being the
// same payee, is treated as a look-alike.
export const LOOKALIKE_THRESHOLD = 0.8

// Keyword categories for payee names and payment references. Checked in
// order; the first match wins.
export const CATEGORY_KEYWORDS = [
  ['INVESTMENT', /\b(invest\w*|trading|forex|crypto|yield|capital growth)\b/i],
  ['SECURITY', /\b(secure\w*|safe\w*|verif\w*|shield\w*|guardian\w*|settlements?|holding|escrow|clearing|protection)\b/i],
  ['PROPERTY', /\b(syndic|property|residences?|service charge|building|estate)\b/i],
  ['RENT', /\b(rent|rentals?|lettings?|tenancy)\b/i],
  ['TELECOM', /\b(internet|fibre|broadband|mobile plan|telecom|connect)\b/i],
  ['UTILITIES', /\b(electricity|water|power|utility)\b/i],
  ['INSURANCE', /\b(insurance|assurance|premium|cover)\b/i],
  ['EDUCATION', /\b(school|tuition|college|academy|learning|university|term fees)\b/i],
  ['CHILDCARE', /\b(cr[eè]che|childcare|nursery)\b/i],
  ['FITNESS', /\b(gym|fitness|wellness|yoga)\b/i],
  ['SERVICES', /\b(cleaning|garden\w*|home services|housekeeping)\b/i],
  ['LOAN', /\b(loan|lease|leasing|finance|credit union|instal+ments?)\b/i],
  ['CHARITY', /\b(donation|foundation|charity|community fund|pledge)\b/i],
  ['SAVINGS', /\bsavings\b/i],
  ['FAMILY', /\b(family|allowance)\b/i],
]

const SECURITY_THEMED_NAME = /\b(secure\w*|safe\w*|verif\w*|shield\w*|guardian\w*|settlements?|holding|escrow|clearing|protection)\b/i
const CHANGED_DETAILS_TEXT =
  /\b(new|updated|changed|revised)\b[^.]{0,40}\b(bank details|account details|account|payment details)\b|\b(bank details|account details|payment details|account) (was|were|has been|have been|have|has) (changed|updated)\b|\bno longer active\b/i
const PROMISED_RETURNS_TEXT = /\b(guaranteed|returns?|profits?|double your|interest of \d+%|\d+% (monthly|weekly))\b/i
const LEGAL_SUFFIXES = new Set(['ltd', 'limited', 'co', 'company', 'inc', 'plc'])

const round = (value, places = 4) => (value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** places) / 10 ** places)
const ratio = (a, b) => (a == null || b == null || b === 0 ? null : round(a / b))
const recipientKey = (name) => name.trim().toLowerCase()

export function categorize(text) {
  if (!text) return null
  for (const [category, pattern] of CATEGORY_KEYWORDS) if (pattern.test(text)) return category
  return null
}

function nameTokens(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token))
}

function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]
}

// 0–1 similarity of two payee names, ignoring case, accents, punctuation and
// legal suffixes ("Ltd", "Limited"). Generic labels that differ only in their
// account digits ("Family account ••1234" / "••5678") are different payees.
export function recipientSimilarity(a, b) {
  const tokensA = nameTokens(a)
  const tokensB = nameTokens(b)
  const wordsA = tokensA.filter((token) => !/^\d+$/.test(token))
  const wordsB = tokensB.filter((token) => !/^\d+$/.test(token))
  const textA = wordsA.join(' ')
  const textB = wordsB.join(' ')
  if (!textA || !textB) return 0
  if (textA === textB) return tokensA.join(' ') === tokensB.join(' ') ? 1 : 0

  const setA = new Set(wordsA)
  const setB = new Set(wordsB)
  if (wordsA.every((word) => setB.has(word)) || wordsB.every((word) => setA.has(word))) return 0.9
  return 1 - levenshtein(textA, textB) / Math.max(textA.length, textB.length)
}

function logStats(amounts) {
  const logs = amounts.filter((amount) => amount > 0).map(Math.log)
  if (logs.length < 2) return null
  const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length
  const variance = logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1)
  return { mean, sd: Math.sqrt(variance) }
}

// ISO day of week, Monday = 1 … Sunday = 7, in `timeZone`.
function dayOfWeek(value, timeZone) {
  const { year, month, day } = zonedParts(value, timeZone)
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1
}

function hoursOutside(hour, window) {
  if (!window || (hour >= window.start && hour < window.end)) return 0
  // Distance to the window on a 24-hour clock.
  const toStart = (window.start - hour + 24) % 24
  const fromEnd = (hour - (window.end - 1) + 24) % 24
  return Math.min(toStart, fromEnd)
}

function rawFeatures(request, baseline, profile, timeZone) {
  const context = request.context ?? {}
  const initiatedAt = context.initiatedAt ?? request.createdAt ?? request.date
  const initiated = zonedParts(initiatedAt, timeZone)
  const firstPayment = zonedParts(request.date, timeZone)

  const key = recipientKey(request.recipient)
  const known = profile.knownRecipients.find((recipient) => recipientKey(recipient.name) === key) ?? null
  const arrangement = known?.standingOrder ?? null
  const orders = profile.knownRecipients.filter((recipient) => recipient.standingOrder)

  // Account numbers are only comparable when the history recorded them.
  const accountsOnFile = baseline.filter((tx) => recipientKey(tx.recipient) === key && tx.recipientAccount).map((tx) => tx.recipientAccount)
  const recipientAccountPreviouslyUsed = !known || !request.recipientAccount || accountsOnFile.length === 0 ? null : accountsOnFile.includes(request.recipientAccount)

  const dates = baseline.map((tx) => new Date(tx.date).getTime())
  const spanDays = dates.length ? Math.max(30, (Math.max(...dates) - Math.min(...dates)) / DAY_MS) : null

  return {
    amount: request.amount,
    currency: request.currency,
    frequency: request.frequency,
    recipient: request.recipient,
    recipientAccount: request.recipientAccount ?? null,
    recipientBank: request.recipientBank ?? null,
    channel: context.channel ?? null,
    deviceId: context.deviceId ?? null,
    initiatedAt: new Date(initiatedAt).toISOString(),
    initiatedHour: initiated.hour,
    initiatedDayOfWeek: dayOfWeek(initiatedAt, timeZone),
    firstPaymentDate: new Date(request.date).toISOString(),
    firstPaymentDayOfMonth: firstPayment.day,
    firstPaymentDayOfWeek: dayOfWeek(request.date, timeZone),
    beneficiaryAddedMinutesBefore: context.beneficiaryAddedMinutesBefore ?? null,
    description: request.description ?? '',
    paymentReference: request.paymentReference ?? null,
    requestText: request.requestText ?? '',

    userBaselineTransactionCount: profile.transactionCount,
    userAverageAmount: profile.averageAmount,
    userTransactionsPer30Days: spanDays ? round((baseline.length / spanDays) * 30, 2) : 0,
    userStandingOrderCount: orders.length,
    userStandingOrderMinAmount: profile.standingOrderAmountRange?.min ?? null,
    userStandingOrderMaxAmount: profile.standingOrderAmountRange?.max ?? null,
    userUsualFrequencies: [...profile.usualFrequencies],
    userPaymentDays: [...profile.paymentDays],
    userActiveHourStart: profile.activeHours?.start ?? null,
    userActiveHourEnd: profile.activeHours?.end ?? null,
    userKnownDeviceCount: profile.knownDevices.length,
    userUsualChannel: profile.usualChannel,

    recipientPreviouslyUsed: Boolean(known),
    recipientPreviousPaymentCount: known?.transactionCount ?? 0,
    recipientHistoricalAverageAmount: known?.averageAmount ?? null,
    recipientLastPaidDaysAgo: known ? round((new Date(initiatedAt) - new Date(known.lastPaidAt)) / DAY_MS, 1) : null,
    recipientAccountPreviouslyUsed,
    existingStandingOrderToRecipient: Boolean(arrangement),
    existingStandingOrderAmount: arrangement?.amount ?? null,
    existingStandingOrderFrequency: arrangement?.frequency ?? null,
    existingStandingOrderDayOfMonth: arrangement?.dayOfMonth ?? null,
  }
}

function derivedFeatures(raw, baseline, profile, timeZone) {
  const knownRecipients = profile.knownRecipients
  const key = recipientKey(raw.recipient)
  const known = knownRecipients.find((recipient) => recipientKey(recipient.name) === key) ?? null

  const stats = logStats(baseline.map((tx) => tx.amount))
  const soMax = raw.userStandingOrderMaxAmount
  const paymentsPerYear = PAYMENTS_PER_YEAR[raw.frequency] ?? 1
  const annualisedAmount = round(raw.amount * paymentsPerYear, 2)

  const recipientNameSimilarity = round(
    knownRecipients.reduce((best, recipient) => (recipientKey(recipient.name) === key ? best : Math.max(best, recipientSimilarity(raw.recipient, recipient.name))), 0),
    3,
  )

  const window = raw.userActiveHourStart == null ? null : { start: raw.userActiveHourStart, end: raw.userActiveHourEnd }
  const hours = baseline.map((tx) => initiatedHour(tx, timeZone)).filter((hour) => hour != null)
  const nearby = hours.filter((hour) => Math.min(Math.abs(hour - raw.initiatedHour), 24 - Math.abs(hour - raw.initiatedHour)) <= 1)

  const text = raw.requestText
  const language = Object.fromEntries(LANGUAGE_PATTERNS.map(({ id, pattern }) => [id, pattern.test(text)]))
  const textChangedPaymentDetails = CHANGED_DETAILS_TEXT.test(text)
  const textPromisedReturns = PROMISED_RETURNS_TEXT.test(text)

  const payeeCategory = categorize(known?.relationship) ?? categorize(raw.recipient)
  const referenceCategory = categorize([raw.description, raw.paymentReference].filter(Boolean).join(' '))

  const derived = {
    amountLog10: round(Math.log10(Math.max(raw.amount, 1))),
    amountToUserAverageRatio: ratio(raw.amount, raw.userAverageAmount),
    amountToStandingOrderMaxRatio: ratio(raw.amount, soMax),
    amountLogZScore: stats && stats.sd > 0 ? round((Math.log(raw.amount) - stats.mean) / stats.sd) : null,
    amountToRecipientAverageRatio: ratio(raw.amount, raw.recipientHistoricalAverageAmount),
    amountChangeVsExistingOrderRatio: ratio(raw.amount, raw.existingStandingOrderAmount),
    amountAboveUsualRange: soMax != null && raw.amount > soMax,
    roundThousandAmount: raw.amount >= 1000 && raw.amount % 1000 === 0,
    paymentsPerYear,
    annualisedAmount,
    annualisedToUsualRatio: ratio(annualisedAmount, soMax == null ? null : soMax * 12),
    unusualFrequency: raw.userUsualFrequencies.length > 0 && !raw.userUsualFrequencies.includes(raw.frequency),
    frequencyChangedForRecipient: raw.existingStandingOrderFrequency != null && raw.existingStandingOrderFrequency !== raw.frequency,
    duplicateOfExistingOrder:
      raw.existingStandingOrderToRecipient && raw.existingStandingOrderFrequency === raw.frequency && raw.existingStandingOrderAmount === raw.amount,

    newRecipient: !raw.recipientPreviouslyUsed,
    recipientAccountChanged: raw.recipientAccountPreviouslyUsed === false,
    recipientNameSimilarity,
    lookalikeRecipient: !raw.recipientPreviouslyUsed && recipientNameSimilarity >= LOOKALIKE_THRESHOLD,
    securityThemedRecipientName: SECURITY_THEMED_NAME.test(raw.recipient),
    overseasRecipient: raw.recipientBank === 'OVERSEAS_BANK',
    beneficiaryAddedRecently: raw.beneficiaryAddedMinutesBefore != null && raw.beneficiaryAddedMinutesBefore < MINUTES_PER_DAY,

    unusualHour: hoursOutside(raw.initiatedHour, window) > 0,
    hoursOutsideActiveWindow: hoursOutside(raw.initiatedHour, window),
    nightTime: raw.initiatedHour < 5,
    hourTypicality: hours.length ? round(nearby.length / hours.length, 3) : null,
    unusualPaymentDay: profile.paymentDays.length > 0 && !profile.usualPaymentDays.includes(raw.firstPaymentDayOfMonth),
    weekendInitiation: raw.initiatedDayOfWeek >= 6,
    newDevice: raw.deviceId != null && raw.userKnownDeviceCount > 0 && !profile.knownDevices.includes(raw.deviceId),
    unusualChannel: raw.channel != null && raw.userUsualChannel != null && raw.channel !== raw.userUsualChannel,
    externalLinkChannel: raw.channel === 'EMAIL_LINK',

    textLength: text.length,
    textUrgency: language.urgency,
    textThreat: language.threat,
    textBypassChecks: language.bypassChecks,
    textExternalLink: language.externalLink,
    textSensitiveInfo: language.sensitiveInfo,
    textBankImpersonation: language.bankImpersonation,
    textChangedPaymentDetails,
    textPromisedReturns,
    textRiskTermCount: Object.values(language).filter(Boolean).length + Number(textChangedPaymentDetails) + Number(textPromisedReturns),

    payeeCategory,
    referenceCategory,
    referencePayeeConflict: payeeCategory != null && referenceCategory != null && payeeCategory !== referenceCategory,
  }

  derived.riskSignalCount = RISK_SIGNAL_FLAGS.filter((flag) => (flag === 'textRiskTermCount' ? derived[flag] > 0 : derived[flag])).length
  return derived
}

// The flags counted by `riskSignalCount`: each is a departure from the
// user's normal behaviour, none of which alone implies fraud.
export const RISK_SIGNAL_FLAGS = [
  'amountAboveUsualRange',
  'newRecipient',
  'recipientAccountChanged',
  'lookalikeRecipient',
  'securityThemedRecipientName',
  'overseasRecipient',
  'beneficiaryAddedRecently',
  'unusualHour',
  'unusualPaymentDay',
  'newDevice',
  'unusualChannel',
  'unusualFrequency',
  'frequencyChangedForRecipient',
  'textRiskTermCount',
  'referencePayeeConflict',
]

// `history` is the user's ledger; only baseline transactions (settled,
// outgoing, not decided through approval) are read, matching the profile.
export function extractFeatures(request, { history, profile, timeZone = profile.timezone }) {
  const baseline = history.filter(isBaselineTransaction)
  const raw = rawFeatures(request, baseline, profile, timeZone)
  return { raw, derived: derivedFeatures(raw, baseline, profile, timeZone) }
}
