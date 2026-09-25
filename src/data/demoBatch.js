import { deriveUserProfile } from '../fraud/profile.js'
import { DEFAULT_CONFIG, allocateCounts, buildRequestSpec, toRequest } from '../fraud/synthetic/generator.js'
import { createRng } from '../fraud/synthetic/random.js'
import { RISK_CLASSES } from '../fraud/synthetic/scenarios.js'
import { incomeFactor } from '../fraud/synthetic/users.js'
import { createId } from '../utils/ids.js'
import { APP_TIMEZONE, zonedDate, zonedParts } from '../utils/time.js'
import { createDemoRequests } from './demoCases.js'

// Randomised demo batches of pending standing-order requests.
//
// "Reset demo data" fills the approval queue with a batch of 1–100 requests
// instead of the three controlled cases alone. The requests come from the same
// scenario library as the synthetic dataset (fraud/synthetic/scenarios.js,
// through buildRequestSpec and toRequest in generator.js), so they vary the
// same way: payee, amount, bank, frequency, day, time, device, channel, wording
// and how far each departs from this user's habits.
//
// That library builds a request from a *persona*: the habits of a user. The
// dataset invents personas; here the persona is read from the app user's own
// seed history (createAppPersona), so "usual amount", "usual hours" and
// "known payee" mean what they mean for this account, and the fraud pipeline
// judges the requests against the same history.
//
// Everything is fictional. Payees are made-up names, links use the reserved
// .example domain, and nothing here scores or labels a request: each one is
// analysed by the ordinary pipeline (ledger.js -> requestAssessment.js).
//
// A batch is fully determined by its seed, so the same seed and clock always
// give the same requests. The seed is random per reset, and the size is
// guaranteed to differ from the previous reset's.

export const MIN_BATCH_SIZE = 1
export const MAX_BATCH_SIZE = 100
// The requests of a batch arrive over the last few days (never in the future).
export const REQUEST_WINDOW_DAYS = 3

// Share of each risk class among the generated requests. Each batch draws its
// own share from these ranges; legit_normal takes the rest (about 60% on
// average), so batches differ a little in proportion.
export const BATCH_MIX_RANGES = {
  legit_unusual: [0.2, 0.25],
  suspicious: [0.1, 0.15],
  fraudulent: [0.05, 0.1],
}

// Below this size a batch holds only generated requests; from this size on, the
// three controlled demo cases (LEGITIMATE, GREY, FRAUD) are part of it, so a
// presentation can always find them.
export const CONTROLLED_CASE_COUNT = 3

// --- The app user's persona ---------------------------------------------------

// Payee details the seed ledger does not record. The names are the seed's own;
// the account, bank and category are what the demo requests use for them.
const APP_PAYEES = {
  'Harbourline Property Management': { account: '0932', bank: 'OTHER_LOCAL_BANK', category: 'PROPERTY' },
  'Lumière Fibre Ltd': { account: '2210', bank: 'OTHER_LOCAL_BANK', category: 'TELECOM' },
  'Coastal Shield Insurance': { account: '6145', bank: 'SAME_BANK', category: 'INSURANCE' },
  'ABC Services Ltd.': { account: '4417', bank: 'SAME_BANK', category: 'SERVICES' },
  'Island Power Utility': { account: '3308', bank: 'SAME_BANK', category: 'UTILITIES' },
}

const paymentPayee = (name) => ({ name, ...APP_PAYEES[name] })

// The habits of the app user, read from their seed ledger (`history`) and the
// profile derived from it, in the shape the scenario library expects.
export function createAppPersona(history, profile) {
  const known = profile.knownRecipients.filter((recipient) => APP_PAYEES[recipient.name])
  const monthlyIncome = history.find((tx) => tx.direction === 'IN')?.amount ?? 50000
  return {
    userId: 'APP-USER',
    segment: 'APP_USER',
    monthlyIncome,
    incomeFactor: incomeFactor(monthlyIncome),
    payday: 28,
    activeWindow: profile.activeHours ?? { start: 8, end: 22 },
    devices: profile.knownDevices,
    usualChannel: profile.usualChannel ?? 'ONLINE_BANKING',
    standingOrders: known
      .filter((recipient) => recipient.standingOrder)
      .map((recipient) => ({
        payee: paymentPayee(recipient.name),
        category: APP_PAYEES[recipient.name].category,
        frequency: recipient.standingOrder.frequency,
        amount: recipient.standingOrder.amount,
        dayOfMonth: recipient.standingOrder.dayOfMonth,
        startedMonthsAgo: 3,
        deviceId: profile.knownDevices[0],
        description: recipient.relationship,
      })),
    billPayees: known
      .filter((recipient) => APP_PAYEES[recipient.name].category === 'UTILITIES')
      .map((recipient) => ({ payee: paymentPayee(recipient.name), category: 'UTILITIES', typicalAmount: recipient.averageAmount, description: recipient.relationship })),
    transferPayees: [],
    merchants: [],
  }
}

// --- Size and mix ---------------------------------------------------------------

// A batch size in [MIN_BATCH_SIZE, MAX_BATCH_SIZE], never `previous`: two
// resets in a row always differ in size.
export function chooseBatchSize(rng, previous = null) {
  const excluded = Number.isInteger(previous) && previous >= MIN_BATCH_SIZE && previous <= MAX_BATCH_SIZE
  const size = rng.int(MIN_BATCH_SIZE, MAX_BATCH_SIZE - (excluded ? 1 : 0))
  return excluded && size >= previous ? size + 1 : size
}

// The class shares for one batch, summing to 1.
export function chooseBatchMix(rng) {
  const drawn = Object.fromEntries(Object.entries(BATCH_MIX_RANGES).map(([riskClass, [low, high]]) => [riskClass, rng.float(low, high)]))
  return { legit_normal: 1 - Object.values(drawn).reduce((sum, share) => sum + share, 0), ...drawn }
}

// --- The batch ------------------------------------------------------------------

function uniqueReference(rng, taken) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const reference = `SO-${rng.digits(5)}`
    if (!taken.has(reference)) {
      taken.add(reference)
      return reference
    }
  }
  throw new Error('Could not create a unique request reference.')
}

// Creates a batch of pending standing-order requests for `user`, on top of the
// seed ledger `history`. Returns
//   transactions — the requests, in queue order (queuePosition 0, 1, …), each in
//                  the app's transaction shape, unanalysed;
//   meta         — { seed, size, controlled, generated: { <riskClass>: count } }.
// Options: `seed` (default random), `size` (default random), `previousSize`
// (excluded from the random size), `run` (demo run number), `now`.
export function createDemoBatch(user, history, { seed = createId(), size = null, previousSize = null, run = 1, now = new Date() } = {}) {
  const rng = createRng(seed)
  const count = size ?? chooseBatchSize(rng.fork('size'), previousSize)
  if (!Number.isInteger(count) || count < MIN_BATCH_SIZE || count > MAX_BATCH_SIZE) throw new Error(`A batch holds ${MIN_BATCH_SIZE}–${MAX_BATCH_SIZE} requests, not ${count}.`)

  const profile = deriveUserProfile(history)
  const persona = createAppPersona(history, profile)
  const controlled = count >= CONTROLLED_CASE_COUNT ? createDemoRequests(user, { run, now }) : []
  const generatedCount = count - controlled.length
  const perClass = allocateCounts(generatedCount, chooseBatchMix(rng.fork('mix')))

  const today = zonedParts(now, APP_TIMEZONE)
  const window = {
    referenceDate: zonedDate({ ...today, day: today.day - REQUEST_WINDOW_DAYS, hour: 0, minute: 0 }, APP_TIMEZONE),
    requestWindowDays: REQUEST_WINDOW_DAYS,
    timeZone: APP_TIMEZONE,
    suspiciousFraudShare: DEFAULT_CONFIG.suspiciousFraudShare,
  }

  const taken = new Set(controlled.map((request) => request.reference))
  const generated = []
  for (const riskClass of RISK_CLASSES) {
    for (let i = 0; i < perClass[riskClass]; i += 1) {
      const requestRng = rng.fork(`request/${generated.length}`)
      const { scenario, spec } = buildRequestSpec({ rng: requestRng, persona, profile, history }, riskClass, window)
      const id = `txn_${requestRng.hex(16)}`
      const request = toRequest(spec, id, requestRng, window)
      generated.push({
        ...request,
        reference: uniqueReference(requestRng, taken),
        riskScore: null,
        riskLevel: null,
        verificationCase: null,
        demoRun: run,
        // Where the request came from, for tests and reports. Nothing in the
        // fraud pipeline reads it.
        demoScenario: { riskClass, scenario: scenario.id },
        analysis: null,
        proof: null,
        updatedAt: request.createdAt,
      })
    }
  }

  const transactions = rng.fork('order').shuffle([...controlled, ...generated]).map((request, queuePosition) => ({ ...request, queuePosition }))
  return { transactions, meta: { seed: String(seed), size: count, controlled: controlled.length, generated: perClass } }
}

// How many requests of each risk class a batch holds (controlled cases count
// under the class they were designed for); requests without a label are ignored.
export const CONTROLLED_CASE_CLASSES = { LEGITIMATE: 'legit_normal', GREY: 'suspicious', FRAUD: 'fraudulent' }

export function batchClasses(transactions) {
  const counts = Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, 0]))
  for (const tx of transactions) {
    const riskClass = tx.demoScenario?.riskClass ?? CONTROLLED_CASE_CLASSES[tx.verificationCase]
    if (riskClass) counts[riskClass] += 1
  }
  return counts
}

export const scenarioIds = (transactions) => [...new Set(transactions.map((tx) => tx.demoScenario?.scenario).filter(Boolean))].sort()
