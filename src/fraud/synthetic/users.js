import { addMonths, daysInMonth, zonedDate, zonedParts } from '../../utils/time.js'
import { recipientSimilarity } from '../features.js'
import {
  BILL_CATEGORIES,
  MERCHANTS,
  NAME_STEMS,
  PAYEE_CATEGORIES,
  TRANSFER_CATEGORIES,
  personalAccountName,
} from './catalog.js'

// Fictional users and their transaction history.
//
// Each user starts as a *persona* — latent habits such as income, payday,
// active hours, devices and standing orders — and the persona is played out
// as a ledger of settled transactions in the app's own transaction shape.
// The behavioural baseline is then derived from that ledger by
// deriveUserProfile (profile.js), exactly as the app does for a real account,
// so dataset features and app features are computed the same way.

const DAY_MS = 24 * 60 * 60 * 1000
const STANDING_ORDER_HOUR = 6

// `channels` is the usual-channel mix; `categories` weights the standing
// orders a user of this segment tends to have.
export const SEGMENTS = {
  YOUNG_PROFESSIONAL: {
    weight: 3,
    income: [18000, 45000],
    standingOrders: [2, 3],
    oneOffPerMonth: [18, 35],
    activeStart: [8, 10],
    activeEnd: [22, 24],
    devices: [1, 2],
    channels: { MOBILE_APP: 0.7, ONLINE_BANKING: 0.3 },
    categories: { TELECOM: 3, FITNESS: 3, RENT: 2, SAVINGS: 2, FAMILY: 1, LOAN: 1, INSURANCE: 1 },
  },
  FAMILY_HOUSEHOLD: {
    weight: 4,
    income: [35000, 95000],
    standingOrders: [3, 6],
    oneOffPerMonth: [20, 40],
    activeStart: [6, 8],
    activeEnd: [21, 23],
    devices: [2, 3],
    channels: { ONLINE_BANKING: 0.55, MOBILE_APP: 0.45 },
    categories: { PROPERTY: 3, TELECOM: 3, INSURANCE: 3, EDUCATION: 3, CHILDCARE: 2, UTILITIES: 2, LOAN: 2, SAVINGS: 1 },
  },
  RETIREE: {
    weight: 2,
    income: [15000, 45000],
    standingOrders: [2, 4],
    oneOffPerMonth: [8, 18],
    activeStart: [7, 9],
    activeEnd: [18, 20],
    devices: [1, 1],
    channels: { ONLINE_BANKING: 0.8, MOBILE_APP: 0.2 },
    categories: { PROPERTY: 3, INSURANCE: 3, UTILITIES: 3, CHARITY: 2, FAMILY: 2, TELECOM: 1 },
  },
  SMALL_BUSINESS_OWNER: {
    weight: 2,
    income: [60000, 250000],
    standingOrders: [4, 7],
    oneOffPerMonth: [30, 60],
    activeStart: [5, 7],
    activeEnd: [22, 24],
    devices: [2, 3],
    channels: { ONLINE_BANKING: 0.7, MOBILE_APP: 0.3 },
    categories: { SERVICES: 3, PROPERTY: 2, RENT: 3, INSURANCE: 2, LOAN: 3, TELECOM: 2, UTILITIES: 2 },
  },
}

const WEEKLY_CAPABLE = new Set(['CHILDCARE', 'FITNESS', 'FAMILY'])

// Standing-order-style rounding: nearest Rs 50 from Rs 1,000, else Rs 10.
export function roundAmount(amount) {
  const step = amount >= 1000 ? 50 : 10
  return Math.max(step, Math.round(amount / step) * step)
}

const cents = (amount) => Math.round(amount * 100) / 100

export function incomeFactor(monthlyIncome) {
  return Math.min(3, Math.max(0.5, monthlyIncome / 50000)) ** 0.6
}

export function newDeviceId(rng) {
  return `dev-${rng.hex(8)}`
}

export function newAccount(rng) {
  return rng.digits(4)
}

// A fictional payee of `category` whose name does not clash with or closely
// resemble any name in `takenNames`.
export function createPayee(rng, category, takenNames = []) {
  const spec = PAYEE_CATEGORIES[category]
  let name = null
  for (let attempt = 0; attempt < 20 && !name; attempt += 1) {
    const candidate = spec.personal ? personalAccountName(rng, spec.personal) : `${rng.pick(NAME_STEMS)} ${rng.pick(spec.suffixes)}`
    if (takenNames.every((taken) => recipientSimilarity(candidate, taken) < 0.75 && taken.toLowerCase() !== candidate.toLowerCase())) name = candidate
  }
  if (!name) name = `${rng.pick(NAME_STEMS)} ${rng.pick(NAME_STEMS)} ${spec.suffixes?.[0] ?? 'Account'} ${rng.digits(2)}`
  return {
    name,
    account: newAccount(rng),
    bank: rng.weighted({ SAME_BANK: 0.45, OTHER_LOCAL_BANK: 0.53, OVERSEAS_BANK: 0.02 }),
    category,
  }
}

export function typicalAmount(rng, category, factor) {
  const [min, max] = PAYEE_CATEGORIES[category].amount
  return roundAmount(rng.float(min, max) * factor)
}

function wrapDay(day) {
  return ((((day - 1) % 28) + 28) % 28) + 1
}

// ---- Persona -------------------------------------------------------------

export function createPersona(rng, index) {
  const segmentName = rng.weighted(Object.entries(SEGMENTS).map(([name, segment]) => [name, segment.weight]))
  const segment = SEGMENTS[segmentName]
  const monthlyIncome = roundAmount(rng.float(...segment.income))
  const factor = incomeFactor(monthlyIncome)
  const payday = rng.chance(0.7) ? rng.int(25, 28) : rng.int(1, 5)
  const activeWindow = { start: rng.int(...segment.activeStart), end: rng.int(...segment.activeEnd) }
  const devices = Array.from({ length: rng.int(...segment.devices) }, () => newDeviceId(rng))
  const usualChannel = rng.weighted(segment.channels)

  const names = []
  const addPayee = (category) => {
    const payee = createPayee(rng, category, names)
    names.push(payee.name)
    return payee
  }

  // Distinct categories, weighted by how common they are for the segment.
  const orderCount = rng.int(...segment.standingOrders)
  const chosen = []
  while (chosen.length < orderCount) {
    chosen.push(rng.weighted(Object.entries(segment.categories).filter(([name]) => !chosen.includes(name))))
  }

  const standingOrders = chosen.map((category) => {
    const weekly = WEEKLY_CAPABLE.has(category) && rng.chance(0.15)
    const monthlyAmount = typicalAmount(rng, category, factor)
    return {
      payee: addPayee(category),
      category,
      frequency: weekly ? 'WEEKLY' : 'MONTHLY',
      amount: weekly ? roundAmount(monthlyAmount / 4.33) : monthlyAmount,
      dayOfMonth: rng.chance(0.7) ? wrapDay(payday + rng.int(-3, 3)) : rng.int(1, 28),
      startedMonthsAgo: rng.int(2, 24),
      deviceId: rng.pick(devices),
      description: rng.pick(PAYEE_CATEGORIES[category].descriptions),
    }
  })

  const billPayees = Array.from({ length: rng.int(1, 3) }, () => {
    const category = rng.pick(BILL_CATEGORIES)
    return { payee: addPayee(category), category, typicalAmount: typicalAmount(rng, category, factor), description: rng.pick(PAYEE_CATEGORIES[category].descriptions) }
  })
  const transferPayees = Array.from({ length: rng.int(1, 2) }, () => {
    const category = rng.pick(TRANSFER_CATEGORIES)
    return { payee: addPayee(category), category, typicalAmount: typicalAmount(rng, category, factor), description: rng.pick(PAYEE_CATEGORIES[category].descriptions) }
  })
  const merchants = rng.sample(MERCHANTS, rng.int(4, MERCHANTS.length)).map(([suffix, median]) => {
    let name = `${rng.pick(NAME_STEMS)} ${suffix}`
    while (names.includes(name)) name = `${rng.pick(NAME_STEMS)} ${suffix}`
    names.push(name)
    return { name, median: median * factor }
  })

  return {
    userId: `SYN-U${String(index + 1).padStart(5, '0')}`,
    segment: segmentName,
    monthlyIncome,
    incomeFactor: Math.round(factor * 1000) / 1000,
    payday,
    activeWindow,
    oneOffPerMonth: rng.int(...segment.oneOffPerMonth),
    devices,
    usualChannel,
    standingOrders,
    billPayees,
    transferPayees,
    merchants,
  }
}

// ---- History -------------------------------------------------------------

function transaction(persona, n, fields) {
  return {
    id: `${persona.userId}-TX${String(n).padStart(4, '0')}`,
    type: fields.type,
    direction: fields.direction ?? 'OUT',
    recipient: fields.recipient,
    recipientAccount: fields.recipientAccount ?? null,
    amount: fields.amount,
    currency: 'MUR',
    date: fields.date,
    status: 'APPROVED',
    frequency: fields.frequency ?? 'ONE_OFF',
    description: fields.description,
    requiresApproval: false,
    decision: null,
    context: fields.context ?? null,
    createdAt: fields.createdAt ?? fields.date,
  }
}

// Settled transactions over the `historyMonths` before `referenceDate`,
// oldest first.
export function createHistory(rng, persona, { referenceDate, historyMonths, timeZone }) {
  const end = new Date(referenceDate)
  const start = new Date(end.getTime() - historyMonths * 30 * DAY_MS)
  const endParts = zonedParts(end, timeZone)
  const history = []
  let n = 0
  const push = (fields) => history.push(transaction(persona, (n += 1), fields))
  const online = (deviceId = rng.pick(persona.devices)) => ({ channel: persona.usualChannel, deviceId })

  for (const order of persona.standingOrders) {
    const firstMonth = addMonths(endParts, -Math.min(order.startedMonthsAgo, historyMonths))
    const context = online(order.deviceId)
    const record = (date) =>
      push({
        type: 'STANDING_ORDER',
        recipient: order.payee.name,
        recipientAccount: order.payee.account,
        amount: order.amount,
        date: date.toISOString(),
        frequency: order.frequency,
        description: order.description,
        context,
      })

    if (order.frequency === 'MONTHLY') {
      for (let offset = 0; offset <= historyMonths; offset += 1) {
        const month = addMonths(firstMonth, offset)
        const date = zonedDate({ ...month, day: Math.min(order.dayOfMonth, daysInMonth(month)), hour: STANDING_ORDER_HOUR }, timeZone)
        if (date >= start && date < end) record(date)
      }
    } else {
      const first = zonedDate({ ...firstMonth, day: order.dayOfMonth, hour: STANDING_ORDER_HOUR }, timeZone)
      for (let at = first.getTime(); at < end.getTime(); at += 7 * DAY_MS) if (at >= start.getTime()) record(new Date(at))
    }
  }

  // Salary, not part of the outgoing baseline but part of a realistic ledger.
  for (let offset = -historyMonths; offset < 0; offset += 1) {
    const month = addMonths(endParts, offset)
    const date = zonedDate({ ...month, day: Math.min(persona.payday, daysInMonth(month)), hour: 7 }, timeZone)
    push({ type: 'INCOMING', direction: 'IN', recipient: 'Salary credit', amount: persona.monthlyIncome, date: date.toISOString(), description: 'Monthly income' })
  }

  const days = historyMonths * 30
  const oneOffCount = persona.oneOffPerMonth * historyMonths
  for (let i = 0; i < oneOffCount; i += 1) {
    const dayStart = new Date(start.getTime() + rng.int(0, days - 1) * DAY_MS)
    const at = zonedDate({ ...zonedParts(dayStart, timeZone), hour: rng.int(persona.activeWindow.start, persona.activeWindow.end - 1), minute: rng.int(0, 59) }, timeZone)
    const date = at.toISOString()
    const kind = rng.weighted({ CARD_PAYMENT: 0.72, BILL_PAYMENT: 0.14, TRANSFER: 0.14 })

    if (kind === 'CARD_PAYMENT') {
      const merchant = rng.pick(persona.merchants)
      push({ type: 'CARD_PAYMENT', recipient: merchant.name, amount: cents(Math.min(25000, rng.logNormal(merchant.median, 0.6))), date, description: 'Card payment' })
    } else {
      const payee = rng.pick(kind === 'BILL_PAYMENT' ? persona.billPayees : persona.transferPayees)
      push({
        type: kind,
        recipient: payee.payee.name,
        recipientAccount: payee.payee.account,
        amount: kind === 'BILL_PAYMENT' ? cents(payee.typicalAmount * rng.float(0.85, 1.15)) : roundAmount(payee.typicalAmount * rng.float(0.7, 1.3)),
        date,
        description: payee.description,
        context: online(),
      })
    }
  }

  return history.sort((a, b) => new Date(a.date) - new Date(b.date))
}
