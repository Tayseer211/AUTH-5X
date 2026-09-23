import { analyseStandingOrder } from '../engine.js'
import { extractFeatures } from '../features.js'
import { deriveUserProfile, isBaselineTransaction } from '../profile.js'
import { APP_TIMEZONE, addMonths, daysInMonth, zonedDate, zonedParts } from '../../utils/time.js'
import { createRng } from './random.js'
import { RISK_CLASSES, SCENARIOS, escalate } from './scenarios.js'
import { createHistory, createPersona } from './users.js'

// Synthetic standing-order dataset generator.
//
//   persona (users.js) → ledger history → deriveUserProfile (profile.js)
//   → scenario (scenarios.js) → pending standing-order request
//   → extractFeatures (features.js) → record { raw, derived, labels }
//
// Entirely synthetic: fictional users, payees and accounts, for building and
// evaluating a fraud model. It says nothing about real fraud rates. Every
// random choice comes from a stream seeded by `config.seed`, so the same
// config always regenerates the same dataset.

export const GENERATOR_VERSION = '1.0.0'

export const DEFAULT_CONFIG = {
  seed: 'fraud-auth-stage2',
  users: 200,
  standingOrders: 2000,
  // Share of records per risk class; normalised to sum to 1.
  classMix: { legit_normal: 0.6, legit_unusual: 0.2, suspicious: 0.12, fraudulent: 0.08 },
  // Probability that a suspicious record is labelled fraud.
  suspiciousFraudShare: 0.35,
  // Months of ledger history behind each user's profile.
  historyMonths: 6,
  // History ends here; requests are submitted over the following window.
  referenceDate: '2026-09-01T00:00:00+04:00',
  requestWindowDays: 30,
  timeZone: APP_TIMEZONE,
}

const DAY_MS = 24 * 60 * 60 * 1000

// Sets the fraudulent share to `rate` and rescales the other classes to fill
// the rest in their existing proportions.
export function withFraudRate(classMix, rate) {
  if (!(rate >= 0 && rate < 1)) throw new Error(`fraudRate must be in [0, 1), got ${rate}`)
  const others = RISK_CLASSES.filter((riskClass) => riskClass !== 'fraudulent')
  const otherTotal = others.reduce((sum, riskClass) => sum + (classMix[riskClass] ?? 0), 0)
  const mix = { fraudulent: rate }
  for (const riskClass of others) mix[riskClass] = otherTotal === 0 ? (1 - rate) / others.length : ((classMix[riskClass] ?? 0) / otherTotal) * (1 - rate)
  return mix
}

export function resolveConfig(overrides = {}) {
  const { fraudRate, ...rest } = overrides
  const config = { ...DEFAULT_CONFIG, ...rest, classMix: { ...DEFAULT_CONFIG.classMix, ...rest.classMix } }
  if (fraudRate != null) config.classMix = withFraudRate(config.classMix, fraudRate)

  for (const key of Object.keys(config.classMix)) if (!RISK_CLASSES.includes(key)) throw new Error(`Unknown risk class in classMix: ${key}`)
  const total = RISK_CLASSES.reduce((sum, riskClass) => sum + (config.classMix[riskClass] ?? 0), 0)
  if (!(total > 0) || RISK_CLASSES.some((riskClass) => (config.classMix[riskClass] ?? 0) < 0)) throw new Error('classMix must be non-negative and not all zero')
  config.classMix = Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, (config.classMix[riskClass] ?? 0) / total]))

  if (!Number.isInteger(config.users) || config.users < 1) throw new Error('users must be a positive integer')
  if (!Number.isInteger(config.standingOrders) || config.standingOrders < 0) throw new Error('standingOrders must be a non-negative integer')
  if (!(config.suspiciousFraudShare >= 0 && config.suspiciousFraudShare <= 1)) throw new Error('suspiciousFraudShare must be in [0, 1]')
  if (Number.isNaN(Date.parse(config.referenceDate))) throw new Error('referenceDate must be a date')
  config.seed = String(config.seed)
  return config
}

// Exact per-class counts for `total` records (largest-remainder rounding), so
// the requested proportions hold as closely as whole records allow.
export function allocateCounts(total, classMix) {
  const exact = RISK_CLASSES.map((riskClass) => [riskClass, total * classMix[riskClass]])
  const counts = Object.fromEntries(exact.map(([riskClass, value]) => [riskClass, Math.floor(value)]))
  let remaining = total - Object.values(counts).reduce((sum, count) => sum + count, 0)
  const byRemainder = [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))
  for (let i = 0; remaining > 0; i += 1, remaining -= 1) counts[byRemainder[i % byRemainder.length][0]] += 1
  return counts
}

// Next `dayOfMonth` at least two days after submission, at 06:00; with no
// day, as soon as possible (one to three days later).
function firstPaymentDate(rng, initiatedAt, dayOfMonth, timeZone) {
  const parts = zonedParts(initiatedAt, timeZone)
  if (dayOfMonth == null) return zonedDate({ ...parts, day: parts.day + rng.int(1, 3), hour: 6, minute: 0 }, timeZone)

  const earliest = new Date(initiatedAt.getTime() + 2 * DAY_MS)
  for (let offset = 0; offset < 3; offset += 1) {
    const month = addMonths(parts, offset)
    const candidate = zonedDate({ ...month, day: Math.min(dayOfMonth, daysInMonth(month)), hour: 6 }, timeZone)
    if (candidate >= earliest) return candidate
  }
  return earliest
}

// A pending standing-order request in the app's transaction shape.
function toRequest(spec, standingOrderId, rng, config) {
  const reference = zonedParts(config.referenceDate, config.timeZone)
  const initiatedAt = zonedDate({ ...reference, day: reference.day + rng.int(0, config.requestWindowDays - 1), hour: spec.hour, minute: spec.minute }, config.timeZone)
  const date = firstPaymentDate(rng, initiatedAt, spec.dayOfMonth, config.timeZone)

  return {
    id: standingOrderId,
    reference: standingOrderId,
    type: 'STANDING_ORDER',
    direction: 'OUT',
    recipient: spec.payee.name,
    recipientAccount: spec.payee.account,
    recipientBank: spec.payee.bank,
    amount: spec.amount,
    currency: 'MUR',
    date: date.toISOString(),
    status: 'PENDING',
    frequency: spec.frequency,
    description: spec.description,
    paymentReference: spec.paymentReference ?? null,
    requestText: spec.requestText ?? '',
    requiresApproval: true,
    decision: null,
    context: {
      channel: spec.channel,
      deviceId: spec.deviceId,
      initiatedAt: initiatedAt.toISOString(),
      beneficiaryAddedMinutesBefore: spec.beneficiaryAddedMinutesBefore ?? null,
    },
    createdAt: initiatedAt.toISOString(),
  }
}

function createUser(config, index) {
  const rng = createRng(`${config.seed}/user/${index}`)
  const persona = createPersona(rng, index)
  const history = createHistory(rng, persona, config)
  const profile = deriveUserProfile(history, { timeZone: config.timeZone })
  return { persona, history, profile }
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

// The user as written to users.json: the behavioural baseline derived from
// their history, plus the latent persona it was generated from.
function describeUser({ persona, history, profile }, config) {
  const amounts = history.filter(isBaselineTransaction).map((tx) => tx.amount).sort((a, b) => a - b)
  return {
    userId: persona.userId,
    synthetic: true,
    segment: persona.segment,
    baseline: {
      transactionCount: profile.transactionCount,
      transactionsPer30Days: Math.round((profile.transactionCount / (config.historyMonths * 30)) * 30 * 10) / 10,
      averageAmount: profile.averageAmount,
      normalAmountRange: { p10: percentile(amounts, 0.1), p90: percentile(amounts, 0.9) },
      standingOrderAmountRange: profile.standingOrderAmountRange,
      usualFrequencies: profile.usualFrequencies,
      usualPaymentDays: profile.paymentDays,
      activeHours: profile.activeHours,
      knownDevices: profile.knownDevices,
      usualChannel: profile.usualChannel,
      commonRecipients: [...profile.knownRecipients]
        .sort((a, b) => b.transactionCount - a.transactionCount || a.name.localeCompare(b.name))
        .slice(0, 5)
        .map(({ name, transactionCount, averageAmount }) => ({ recipient: name, transactionCount, averageAmount })),
      existingStandingOrders: profile.knownRecipients
        .filter((recipient) => recipient.standingOrder)
        .map((recipient) => ({ recipient: recipient.name, ...recipient.standingOrder })),
    },
    persona: {
      monthlyIncome: persona.monthlyIncome,
      payday: persona.payday,
      activeWindow: persona.activeWindow,
      deviceCount: persona.devices.length,
      usualChannel: persona.usualChannel,
      oneOffPaymentsPerMonth: persona.oneOffPerMonth,
    },
  }
}

function createRecord(config, users, riskClass, index) {
  const rng = createRng(`${config.seed}/record/${index}`)
  const user = users[rng.int(0, users.length - 1)]
  const ctx = { rng, persona: user.persona, profile: user.profile, history: user.history }

  const candidates = SCENARIOS.filter((scenario) => scenario.riskClass === riskClass && (!scenario.applicable || scenario.applicable(ctx)))
  const scenario = rng.weighted(candidates.map((candidate) => [candidate, candidate.weight]))
  const isFraud = riskClass === 'fraudulent' || (riskClass === 'suspicious' && rng.chance(config.suspiciousFraudShare))

  let spec = scenario.build(ctx)
  if (riskClass === 'suspicious' && isFraud && rng.chance(0.5)) spec = escalate(ctx, spec)

  const standingOrderId = `SYN-SO-${String(index + 1).padStart(6, '0')}`
  const request = toRequest(spec, standingOrderId, rng, config)
  const { raw, derived } = extractFeatures(request, { history: user.history, profile: user.profile, timeZone: config.timeZone })
  const analysis = analyseStandingOrder(request, user.profile)

  return {
    record: {
      standingOrderId,
      userId: user.persona.userId,
      raw,
      derived,
      labels: { isFraud, riskClass, scenario: scenario.id },
      benchmark: { ruleEngineScore: analysis.score, ruleEngineRiskLevel: analysis.riskLevel },
    },
    request,
  }
}

function summarise(records, config) {
  const fraud = records.filter((record) => record.labels.isFraud).length
  return {
    records: records.length,
    users: config.users,
    byRiskClass: Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, records.filter((record) => record.labels.riskClass === riskClass).length])),
    byScenario: Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, records.filter((record) => record.labels.scenario === scenario.id).length])),
    fraudLabelled: fraud,
    fraudRate: records.length ? Math.round((fraud / records.length) * 10000) / 10000 : 0,
    suspiciousLabelledFraud: records.filter((record) => record.labels.riskClass === 'suspicious' && record.labels.isFraud).length,
  }
}

// Returns { config, users, records, summary }, plus `histories` (the ledger
// each profile was derived from) and `requests` (the app-shaped requests the
// records were extracted from).
export function generateDataset(overrides = {}) {
  const config = resolveConfig(overrides)
  const users = Array.from({ length: config.users }, (_, index) => createUser(config, index))

  const counts = allocateCounts(config.standingOrders, config.classMix)
  const classes = createRng(`${config.seed}/classes`).shuffle(RISK_CLASSES.flatMap((riskClass) => Array(counts[riskClass]).fill(riskClass)))
  const generated = classes.map((riskClass, index) => createRecord(config, users, riskClass, index))
  const records = generated.map(({ record }) => record)

  return {
    generatorVersion: GENERATOR_VERSION,
    config,
    users: users.map((user) => describeUser(user, config)),
    histories: Object.fromEntries(users.map(({ persona, history }) => [persona.userId, history])),
    requests: generated.map(({ request }) => request),
    records,
    summary: summarise(records, config),
  }
}
