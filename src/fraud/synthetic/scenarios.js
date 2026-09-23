import {
  BANK_ADVISED_TEXTS,
  BLAND_TEXTS,
  CHANGED_DETAILS_TEXTS,
  EBILL_TEXTS,
  EVERYDAY_CATEGORIES,
  GENERIC_DESCRIPTIONS,
  GENERIC_SUFFIXES,
  IMPERSONATION_TEXTS,
  INVESTMENT_TEXTS,
  LARGE_LEGIT_TEXTS,
  LEGIT_NOTICE_TEXTS,
  LEGIT_RETURNS_TEXTS,
  LEGIT_URGENT_TEXTS,
  MILD_PRESSURE_TEXTS,
  NAME_STEMS,
  NO_CALLBACK_TEXTS,
  PAYEE_CATEGORIES,
  PLANNED_LARGE_CATEGORIES,
  ROUTINE_TEXTS,
  investmentName,
  lookalikeName,
  personalAccountName,
  securityThemedName,
} from './catalog.js'
import { createPayee, newAccount, newDeviceId, roundAmount, typicalAmount } from './users.js'

// How each synthetic standing-order request is put together.
//
// A scenario belongs to one risk class and builds a request *spec* — payee,
// amount, frequency, timing, device, channel and wording — from the user's
// persona and derived profile. The four classes deliberately overlap:
//   legit_normal     consistent with the user's established behaviour;
//   legit_unusual    genuine, but departing from the norm — sometimes on
//                    several axes at once, and sometimes with the same
//                    wording, links or payee vocabulary scams use (so a model
//                    cannot learn "unusual = fraud");
//   suspicious       several risk signals, outcome uncertain — the fraud
//                    label is drawn per record (see generator.js);
//   fraudulent       distinct scam patterns. Many carry strong indicators,
//                    but each pattern also has quiet variants that look
//                    routine: no scam wording, known device, usual amount.
// No scenario sets a score or outcome for the fraud engine; scores are
// computed from the resulting request. applyIncidentalNoise adds everyday,
// fraud-unrelated departures at the same rate to every class.

export const RISK_CLASSES = ['legit_normal', 'legit_unusual', 'suspicious', 'fraudulent']

const MINUTES_PER_DAY = 24 * 60

// ---- Helpers -------------------------------------------------------------

const soMax = (ctx) => ctx.profile.standingOrderAmountRange?.max ?? 5000
const soMin = (ctx) => ctx.profile.standingOrderAmountRange?.min ?? 1000
const knownNames = (ctx) => ctx.profile.knownRecipients.map((recipient) => recipient.name)
const businessOrders = (ctx) => ctx.persona.standingOrders.filter((order) => !PAYEE_CATEGORIES[order.category].personal)
const clampDay = (day) => Math.min(28, Math.max(1, day))
const minutesAgo = (ctx, min, max) => ctx.rng.int(min, max)
const daysAgo = (ctx, min, max) => ctx.rng.int(min * MINUTES_PER_DAY, max * MINUTES_PER_DAY)

// Fraud amounts are often, but not always, round thousands.
const fraudAmount = (ctx, amount) => (ctx.rng.chance(0.5) ? Math.max(1000, Math.round(amount / 1000) * 1000) : roundAmount(amount))

function reference(ctx, category) {
  const prefix = PAYEE_CATEGORIES[category]?.refPrefix
  return prefix ? `${prefix}-${ctx.rng.digits(4)}` : null
}

function fill(ctx, template, spec) {
  return template
    .replaceAll('{desc}', spec.description)
    .replaceAll('{descLower}', spec.description.toLowerCase())
    .replaceAll('{payee}', spec.payee.name)
    .replaceAll('{ref}', spec.paymentReference ?? ctx.rng.digits(6))
    .replaceAll('{code}', ctx.rng.hex(4))
}

// Many genuine requests carry no free text at all.
function routineText(ctx, spec, templates = ROUTINE_TEXTS, blankChance = 0.3) {
  return ctx.rng.chance(blankChance) ? '' : fill(ctx, ctx.rng.pick(templates), spec)
}

function usualHour(ctx) {
  const { start, end } = ctx.persona.activeWindow
  return ctx.rng.int(start, end - 1)
}

function hoursOutsideProfile(ctx) {
  const window = ctx.profile.activeHours
  if (!window) return [2, 3, 4]
  return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => hour < window.start || hour >= window.end)
}

function oddHour(ctx, { night = false } = {}) {
  const outside = hoursOutsideProfile(ctx)
  const pool = night ? outside.filter((hour) => hour < 5) : outside
  return ctx.rng.pick(pool.length ? pool : outside.length ? outside : [3])
}

// One or two hours either side of the user's active window.
function edgeHour(ctx) {
  const window = ctx.profile.activeHours
  if (!window) return oddHour(ctx)
  const outside = new Set(hoursOutsideProfile(ctx))
  const near = [window.start - 1, window.start - 2, window.end, window.end + 1].filter((hour) => outside.has(hour))
  return near.length ? ctx.rng.pick(near) : oddHour(ctx)
}

function usualDay(ctx) {
  const days = ctx.profile.paymentDays
  return days.length ? clampDay(ctx.rng.pick(days) + ctx.rng.int(-1, 1)) : clampDay(ctx.persona.payday)
}

function offDays(ctx) {
  const usual = new Set(ctx.profile.usualPaymentDays)
  return Array.from({ length: 28 }, (_, i) => i + 1).filter((day) => !usual.has(day))
}

function normalTiming(ctx) {
  return {
    hour: usualHour(ctx),
    minute: ctx.rng.int(0, 59),
    deviceId: ctx.rng.pick(ctx.persona.devices),
    channel: ctx.persona.usualChannel,
    beneficiaryAddedMinutesBefore: null,
  }
}

function fromOrder(ctx, order) {
  return {
    payee: order.payee,
    amount: order.amount,
    frequency: order.frequency,
    dayOfMonth: order.dayOfMonth,
    description: order.description,
    paymentReference: reference(ctx, order.category),
  }
}

function newPayee(ctx, category) {
  return createPayee(ctx.rng, category, knownNames(ctx))
}

// A new payee of an everyday category at an amount inside the user's range.
function everydayNewPayee(ctx) {
  const category = ctx.rng.pick(EVERYDAY_CATEGORIES)
  const payee = newPayee(ctx, category)
  return {
    payee,
    amount: roundAmount(Math.min(soMax(ctx), Math.max(soMin(ctx), typicalAmount(ctx.rng, category, ctx.persona.incomeFactor)))),
    frequency: 'MONTHLY',
    dayOfMonth: usualDay(ctx),
    description: ctx.rng.pick(PAYEE_CATEGORIES[category].descriptions),
    paymentReference: reference(ctx, category),
  }
}

function otherCategoryDescription(ctx, category) {
  const others = Object.keys(PAYEE_CATEGORIES).filter((name) => name !== category && !PAYEE_CATEGORIES[name].personal)
  return ctx.rng.pick(PAYEE_CATEGORIES[ctx.rng.pick(others)].descriptions)
}

function unusualFrequencyFor(ctx) {
  const usual = ctx.profile.usualFrequencies
  const options = ['WEEKLY', 'DAILY'].filter((frequency) => !usual.includes(frequency))
  return options.length ? ctx.rng.pick(options) : 'DAILY'
}

const mulePayee = (ctx) => ({
  name: personalAccountName(ctx.rng),
  account: newAccount(ctx.rng),
  bank: ctx.rng.weighted({ OTHER_LOCAL_BANK: 0.85, OVERSEAS_BANK: 0.15 }),
  category: null,
})

// A new business payee whose name says nothing about what it does.
function genericPayee(ctx) {
  const taken = new Set(knownNames(ctx).map((name) => name.toLowerCase()))
  let name
  do name = `${ctx.rng.pick(NAME_STEMS)} ${ctx.rng.pick(GENERIC_SUFFIXES)}`
  while (taken.has(name.toLowerCase()))
  return { name, account: newAccount(ctx.rng), bank: ctx.rng.weighted({ SAME_BANK: 0.3, OTHER_LOCAL_BANK: 0.6, OVERSEAS_BANK: 0.1 }), category: null }
}

// Everyday departures that have nothing to do with fraud — a replaced phone,
// a late evening, a generic description — applied at the same rates to every
// class, so none of them is a label.
export const INCIDENTAL_RATES = { genericDescription: 0.2, newDevice: 0.05, edgeHour: 0.06 }

export function applyIncidentalNoise(ctx, spec) {
  const { rng } = ctx
  let next = spec
  // Only where the note does not quote the description, to keep them consistent.
  if (rng.chance(INCIDENTAL_RATES.genericDescription) && !(next.requestText ?? '').includes(next.description)) {
    next = { ...next, description: rng.pick(GENERIC_DESCRIPTIONS) }
  }
  if (next.deviceId && rng.chance(INCIDENTAL_RATES.newDevice)) next = { ...next, deviceId: newDeviceId(rng) }
  if (rng.chance(INCIDENTAL_RATES.edgeHour)) next = { ...next, hour: edgeHour(ctx) }
  return next
}

// Individually weak departures from the norm, applied in combination.
const WEAK_SIGNALS = {
  higherAmount: (ctx, spec) => ({ ...spec, amount: roundAmount(soMax(ctx) * ctx.rng.float(1.3, 2.2)) }),
  edgeHour: (ctx, spec) => ({ ...spec, hour: edgeHour(ctx) }),
  offDay: (ctx, spec) => {
    const days = offDays(ctx)
    return days.length ? { ...spec, dayOfMonth: ctx.rng.pick(days) } : { ...spec, hour: edgeHour(ctx) }
  },
  newDevice: (ctx, spec) => ({ ...spec, deviceId: newDeviceId(ctx.rng) }),
  recentBeneficiary: (ctx, spec) => ({ ...spec, beneficiaryAddedMinutesBefore: minutesAgo(ctx, 60, 1400) }),
  otherFrequency: (ctx, spec) => {
    const frequency = unusualFrequencyFor(ctx)
    return { ...spec, frequency, amount: roundAmount(spec.amount * (frequency === 'DAILY' ? 0.08 : 0.3)) }
  },
  pressureWording: (ctx, spec) => ({ ...spec, requestText: fill(ctx, ctx.rng.pick(MILD_PRESSURE_TEXTS), spec) }),
  overseas: (ctx, spec) => ({ ...spec, payee: { ...spec.payee, bank: 'OVERSEAS_BANK' } }),
}

function applyWeakSignals(ctx, spec, names, count) {
  return ctx.rng.sample(names, count).reduce((current, name) => WEAK_SIGNALS[name](ctx, current), spec)
}

// For suspicious requests whose drawn outcome is fraud: sometimes one more
// signal, so the two outcomes overlap without being identical.
export function escalate(ctx, spec) {
  const options = [
    (current) => ({ ...current, hour: oddHour(ctx, { night: true }) }),
    (current) => ({ ...current, deviceId: newDeviceId(ctx.rng) }),
  ]
  if (spec.beneficiaryAddedMinutesBefore != null) {
    options.push((current) => ({ ...current, beneficiaryAddedMinutesBefore: minutesAgo(ctx, 2, 60) }))
  }
  return ctx.rng.pick(options)(spec)
}

// ---- Scenarios -----------------------------------------------------------

const hasBusinessOrder = (ctx) => businessOrders(ctx).length > 0

export const SCENARIOS = [
  // legit_normal ----------------------------------------------------------
  {
    id: 'routine_existing_payee',
    riskClass: 'legit_normal',
    weight: 3,
    description: 'Renews or re-creates an existing standing order: same payee, near-identical amount, usual day, time, device and channel.',
    build(ctx) {
      const order = ctx.rng.pick(ctx.persona.standingOrders)
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), amount: roundAmount(order.amount * ctx.rng.float(0.97, 1.05)) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'routine_known_biller',
    riskClass: 'legit_normal',
    weight: 2,
    description: 'Moves a payee the user already pays by bill payment or transfer onto a monthly standing order at their usual amount.',
    build(ctx) {
      const known = ctx.rng.pick([...ctx.persona.billPayees, ...ctx.persona.transferPayees])
      const spec = {
        payee: known.payee,
        amount: roundAmount(known.typicalAmount * ctx.rng.float(0.85, 1.15)),
        frequency: 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: known.description,
        paymentReference: reference(ctx, known.category),
        ...normalTiming(ctx),
      }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'new_payee_everyday',
    riskClass: 'legit_normal',
    weight: 2,
    description: 'A new everyday payee (gym, internet, insurance…) added days or weeks earlier, at an amount inside the user\'s usual range, set up in the usual way.',
    build(ctx) {
      const spec = { ...everydayNewPayee(ctx), ...normalTiming(ctx), beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 60) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'amount_adjustment',
    riskClass: 'legit_normal',
    weight: 1.5,
    description: 'An existing standing order re-issued with a modest price increase (5–25%).',
    build(ctx) {
      const order = ctx.rng.pick(ctx.persona.standingOrders)
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), amount: roundAmount(order.amount * ctx.rng.float(1.05, 1.25)) }
      return { ...spec, requestText: ctx.rng.chance(0.5) ? `Revised ${spec.description.toLowerCase()} from next month.` : routineText(ctx, spec) }
    },
  },

  // legit_unusual ---------------------------------------------------------
  {
    id: 'large_payment_known_payee',
    riskClass: 'legit_unusual',
    weight: 2,
    description: 'A much larger payment than usual (annual premium, arrears, deposit) to a payee the user already pays, set up in the usual way.',
    build(ctx) {
      const known = ctx.rng.chance(0.6) ? ctx.rng.pick(ctx.persona.standingOrders) : ctx.rng.pick([...ctx.persona.billPayees, ...ctx.persona.transferPayees])
      const base = known.amount ?? known.typicalAmount
      const amount = Math.max(base * ctx.rng.float(2.5, 6), soMax(ctx) * ctx.rng.float(1.5, 3))
      const spec = {
        payee: known.payee,
        amount: ctx.rng.chance(0.4) ? Math.round(amount / 1000) * 1000 : roundAmount(amount),
        frequency: ctx.rng.chance(0.5) ? 'ONE_OFF' : 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: known.description,
        paymentReference: reference(ctx, known.category),
        ...normalTiming(ctx),
      }
      return { ...spec, requestText: routineText(ctx, spec, LARGE_LEGIT_TEXTS, 0.2) }
    },
  },
  {
    id: 'new_device_routine',
    riskClass: 'legit_unusual',
    weight: 1.5,
    description: 'A routine standing order to an existing payee, set up from a phone or laptop the account has not used before.',
    build(ctx) {
      const spec = { ...fromOrder(ctx, ctx.rng.pick(ctx.persona.standingOrders)), ...normalTiming(ctx), deviceId: newDeviceId(ctx.rng) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'late_night_routine',
    riskClass: 'legit_unusual',
    weight: 1.5,
    description: 'A routine standing order to an existing payee set up in the middle of the night, outside the user\'s usual banking hours.',
    build(ctx) {
      const spec = { ...fromOrder(ctx, ctx.rng.pick(ctx.persona.standingOrders)), ...normalTiming(ctx), hour: oddHour(ctx, { night: true }) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'new_payee_large_planned',
    riskClass: 'legit_unusual',
    weight: 2,
    description: 'A new payee for a planned, larger commitment (school fees, car lease, rent), added days in advance and set up from a known device.',
    build(ctx) {
      const category = ctx.rng.pick(PLANNED_LARGE_CATEGORIES)
      const payee = newPayee(ctx, category)
      if (category === 'EDUCATION' && ctx.rng.chance(0.25)) payee.bank = 'OVERSEAS_BANK'
      const spec = {
        payee,
        amount: roundAmount(soMax(ctx) * ctx.rng.float(1.5, 4)),
        frequency: ctx.rng.chance(0.3) ? 'ONE_OFF' : 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: ctx.rng.pick(PAYEE_CATEGORIES[category].descriptions),
        paymentReference: reference(ctx, category),
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 30),
      }
      return { ...spec, requestText: routineText(ctx, spec, ctx.rng.chance(0.6) ? LARGE_LEGIT_TEXTS : ROUTINE_TEXTS, 0.2) }
    },
  },
  {
    id: 'frequency_restructure',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'An existing monthly payment switched to weekly instalments of the same yearly total.',
    applicable: (ctx) => ctx.persona.standingOrders.some((order) => order.frequency === 'MONTHLY'),
    build(ctx) {
      const order = ctx.rng.pick(ctx.persona.standingOrders.filter((candidate) => candidate.frequency === 'MONTHLY'))
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), frequency: 'WEEKLY', amount: roundAmount((order.amount * 12) / 52) }
      return { ...spec, requestText: ctx.rng.chance(0.7) ? `Switching ${spec.description.toLowerCase()} to weekly payments as agreed with ${spec.payee.name}.` : '' }
    },
  },
  {
    id: 'payment_day_moved',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'An existing payment moved to a day of the month the user does not normally pay on (e.g. a new salary date).',
    applicable: (ctx) => offDays(ctx).length > 0,
    build(ctx) {
      const spec = { ...fromOrder(ctx, ctx.rng.pick(ctx.persona.standingOrders)), ...normalTiming(ctx), dayOfMonth: ctx.rng.pick(offDays(ctx)) }
      return { ...spec, requestText: ctx.rng.chance(0.6) ? `Moving the ${spec.description.toLowerCase()} payment date to match my new salary date.` : '' }
    },
  },
  {
    id: 'branch_setup',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'A new payee added and paid by standing order in person at a branch, rather than through the user\'s usual digital channel.',
    build(ctx) {
      const spec = { ...everydayNewPayee(ctx), ...normalTiming(ctx), channel: 'BRANCH', deviceId: null, hour: ctx.rng.int(9, 14), beneficiaryAddedMinutesBefore: minutesAgo(ctx, 5, 30) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'urgent_wording_legit',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'A genuine payment whose note uses urgent, threatening or "no need to call" wording ("today", "service will be suspended", "no need to contact me") — pressure language without a scam.',
    build(ctx) {
      const spec = ctx.rng.chance(0.5)
        ? { ...fromOrder(ctx, ctx.rng.pick(ctx.persona.standingOrders)), ...normalTiming(ctx) }
        : { ...everydayNewPayee(ctx), ...normalTiming(ctx), beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 20) }
      const texts = ctx.rng.weighted([[LEGIT_URGENT_TEXTS, 0.45], [LEGIT_NOTICE_TEXTS, 0.35], [NO_CALLBACK_TEXTS, 0.2]])
      return { ...spec, requestText: fill(ctx, ctx.rng.pick(texts), spec) }
    },
  },
  {
    id: 'recent_beneficiary_everyday',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'A new everyday payee added minutes before the standing order, at a normal amount from a known device.',
    build(ctx) {
      const spec = { ...everydayNewPayee(ctx), ...normalTiming(ctx), beneficiaryAddedMinutesBefore: minutesAgo(ctx, 5, 180) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'mixed_reference_legit',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'An existing payee paid under a reference that names a different kind of service (a property manager also billing garden upkeep).',
    build(ctx) {
      const order = ctx.rng.pick(ctx.persona.standingOrders)
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), description: otherCategoryDescription(ctx, order.category) }
      return { ...spec, requestText: routineText(ctx, spec) }
    },
  },
  {
    id: 'ebill_link_setup',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'A genuine biller\'s e-bill "pay by standing order" link: the request arrives through an emailed link, sometimes quoting the link.',
    build(ctx) {
      const known = ctx.rng.chance(0.6) ? ctx.rng.pick(ctx.persona.billPayees) : null
      const base = known
        ? { payee: known.payee, amount: roundAmount(known.typicalAmount * ctx.rng.float(0.9, 1.15)), frequency: 'MONTHLY', dayOfMonth: usualDay(ctx), description: known.description, paymentReference: reference(ctx, known.category) }
        : { ...everydayNewPayee(ctx), beneficiaryAddedMinutesBefore: minutesAgo(ctx, 10, 3 * MINUTES_PER_DAY) }
      const spec = { ...normalTiming(ctx), ...base, channel: 'EMAIL_LINK' }
      return { ...spec, requestText: fill(ctx, ctx.rng.pick(EBILL_TEXTS), spec) }
    },
  },
  {
    id: 'bank_advised_account_move',
    riskClass: 'legit_unusual',
    weight: 0.6,
    description: 'After a genuine fraud alert, the customer moves their savings to a newly opened account on the bank\'s advice: new payee, large amount, often a new phone, recent beneficiary and security wording — every hallmark of an impersonation scam, but genuine.',
    build(ctx) {
      const { rng } = ctx
      const payee = { ...newPayee(ctx, 'SAVINGS'), bank: rng.weighted({ SAME_BANK: 0.6, OTHER_LOCAL_BANK: 0.4 }) }
      const spec = {
        payee,
        amount: roundAmount(soMax(ctx) * rng.float(1.5, 4)),
        frequency: rng.chance(0.6) ? 'MONTHLY' : 'ONE_OFF',
        dayOfMonth: usualDay(ctx),
        description: rng.pick(PAYEE_CATEGORIES.SAVINGS.descriptions),
        paymentReference: null,
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 10, 600),
      }
      if (rng.chance(0.5)) spec.deviceId = newDeviceId(rng)
      return { ...spec, requestText: rng.pick(BANK_ADVISED_TEXTS) }
    },
  },
  {
    id: 'new_investment_plan',
    riskClass: 'legit_unusual',
    weight: 1,
    description: 'A new, genuine pension or unit-trust plan: a new payee with investment wording, often mentioning returns, set up normally.',
    build(ctx) {
      const spec = {
        payee: newPayee(ctx, 'INVESTMENT_PLAN'),
        amount: roundAmount(Math.max(soMin(ctx), soMax(ctx) * ctx.rng.float(0.6, 2))),
        frequency: 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: ctx.rng.pick(PAYEE_CATEGORIES.INVESTMENT_PLAN.descriptions),
        paymentReference: reference(ctx, 'INVESTMENT_PLAN'),
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 20),
      }
      return { ...spec, requestText: ctx.rng.pick(LEGIT_RETURNS_TEXTS) }
    },
  },
  {
    id: 'life_event_multi_signal',
    riskClass: 'legit_unusual',
    weight: 1.5,
    description: 'A genuine request around a life event (moving house, new job, studies abroad) that departs from the norm on two to four axes at once: new payee plus a higher amount, new device, odd hours, off-cycle day, recent beneficiary, other schedule, overseas bank or pressure wording.',
    build(ctx) {
      const category = ctx.rng.pick([...PLANNED_LARGE_CATEGORIES, ...EVERYDAY_CATEGORIES])
      const base = {
        payee: newPayee(ctx, category),
        amount: roundAmount(Math.max(soMin(ctx), typicalAmount(ctx.rng, category, ctx.persona.incomeFactor))),
        frequency: 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: ctx.rng.pick(PAYEE_CATEGORIES[category].descriptions),
        paymentReference: reference(ctx, category),
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 20),
      }
      const withText = { ...base, requestText: routineText(ctx, base, ctx.rng.chance(0.5) ? LARGE_LEGIT_TEXTS : ROUTINE_TEXTS, 0.4) }
      const names = ['higherAmount', 'edgeHour', 'offDay', 'newDevice', 'recentBeneficiary', 'otherFrequency', 'overseas', 'pressureWording']
      return applyWeakSignals(ctx, withText, names, ctx.rng.int(2, 4))
    },
  },

  // suspicious ------------------------------------------------------------
  {
    id: 'changed_account_details',
    riskClass: 'suspicious',
    weight: 2,
    description: 'An existing payee\'s name with a different account number, following a "bank details have changed" message. Genuine account changes and redirection scams look alike.',
    applicable: hasBusinessOrder,
    build(ctx) {
      const order = ctx.rng.pick(businessOrders(ctx))
      const payee = { ...order.payee, account: newAccount(ctx.rng), bank: ctx.rng.weighted({ OTHER_LOCAL_BANK: 0.6, SAME_BANK: 0.25, OVERSEAS_BANK: 0.15 }) }
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), payee, amount: roundAmount(order.amount * ctx.rng.float(1, 1.1)), beneficiaryAddedMinutesBefore: minutesAgo(ctx, 60, 1400) }
      return { ...spec, requestText: fill(ctx, ctx.rng.pick(CHANGED_DETAILS_TEXTS), spec) }
    },
  },
  {
    id: 'lookalike_payee',
    riskClass: 'suspicious',
    weight: 1.5,
    description: 'A new payee whose name closely resembles an existing one ("Ltd" vs "Limited", one changed letter), at the existing amount.',
    applicable: hasBusinessOrder,
    build(ctx) {
      const order = ctx.rng.pick(businessOrders(ctx))
      const payee = { name: lookalikeName(ctx.rng, order.payee.name), account: newAccount(ctx.rng), bank: ctx.rng.weighted({ OTHER_LOCAL_BANK: 0.7, SAME_BANK: 0.3 }), category: order.category }
      const spec = { ...fromOrder(ctx, order), ...normalTiming(ctx), payee, amount: roundAmount(order.amount * ctx.rng.float(1, 1.15)), beneficiaryAddedMinutesBefore: minutesAgo(ctx, 30, 3 * MINUTES_PER_DAY) }
      return { ...spec, requestText: ctx.rng.chance(0.3) ? fill(ctx, ctx.rng.pick(CHANGED_DETAILS_TEXTS), spec) : routineText(ctx, spec) }
    },
  },
  {
    id: 'weak_signal_combo',
    riskClass: 'suspicious',
    weight: 2,
    description: 'A new payee plus two or three individually weak departures (somewhat higher amount, edge-of-hours, off-cycle day, recent beneficiary, new device).',
    build(ctx) {
      const base = { ...everydayNewPayee(ctx), ...normalTiming(ctx), beneficiaryAddedMinutesBefore: daysAgo(ctx, 2, 30) }
      const spec = applyWeakSignals(ctx, base, ['higherAmount', 'edgeHour', 'offDay', 'recentBeneficiary', 'newDevice'], ctx.rng.int(2, 3))
      return { ...spec, requestText: routineText(ctx, spec, ROUTINE_TEXTS, 0.5) }
    },
  },
  {
    id: 'new_payee_new_device',
    riskClass: 'suspicious',
    weight: 1.5,
    description: 'A new payee set up from an unrecognised device at a moderately elevated amount.',
    build(ctx) {
      const spec = {
        ...everydayNewPayee(ctx),
        ...normalTiming(ctx),
        deviceId: newDeviceId(ctx.rng),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 30, 3 * MINUTES_PER_DAY),
      }
      spec.amount = roundAmount(soMax(ctx) * ctx.rng.float(0.8, 1.8))
      return { ...spec, requestText: routineText(ctx, spec, ROUTINE_TEXTS, 0.5) }
    },
  },
  {
    id: 'mild_pressure_wording',
    riskClass: 'suspicious',
    weight: 1,
    description: 'A new payee for a deposit or booking with mild time-pressure wording, otherwise set up normally.',
    build(ctx) {
      const category = ctx.rng.pick(['RENT', 'PROPERTY', 'EDUCATION'])
      const spec = {
        payee: newPayee(ctx, category),
        amount: roundAmount(soMax(ctx) * ctx.rng.float(0.8, 1.6)),
        frequency: 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: ctx.rng.pick(PAYEE_CATEGORIES[category].descriptions),
        paymentReference: reference(ctx, category),
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 20, 2 * MINUTES_PER_DAY),
      }
      return { ...spec, requestText: fill(ctx, ctx.rng.pick(MILD_PRESSURE_TEXTS), spec) }
    },
  },
  {
    id: 'frequency_spike',
    riskClass: 'suspicious',
    weight: 1,
    description: 'A new payee paid weekly or daily — a schedule the user does not use — in small individual amounts.',
    build(ctx) {
      const frequency = unusualFrequencyFor(ctx)
      const spec = {
        ...everydayNewPayee(ctx),
        ...normalTiming(ctx),
        frequency,
        dayOfMonth: null,
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 60, 7 * MINUTES_PER_DAY),
      }
      spec.amount = roundAmount(soMax(ctx) * (frequency === 'DAILY' ? ctx.rng.float(0.03, 0.1) : ctx.rng.float(0.1, 0.4)))
      return { ...spec, requestText: routineText(ctx, spec, ROUTINE_TEXTS, 0.6) }
    },
  },

  // fraudulent ------------------------------------------------------------
  {
    id: 'bank_impersonation',
    riskClass: 'fraudulent',
    weight: 2,
    description: 'Someone posing as the bank talks the user into paying a "safe account": new payee, large amount, recently added. Written instructions carry pressure, links or security wording; when the victim is coached by phone the request carries only their own bland note, and the payee may be a personal or generic-looking account rather than a security-themed name.',
    build(ctx) {
      const { rng } = ctx
      const kind = rng.weighted({ security: 0.45, mule: 0.3, generic: 0.25 })
      const payee =
        kind === 'security'
          ? { name: securityThemedName(rng), account: newAccount(rng), bank: rng.weighted({ OTHER_LOCAL_BANK: 0.7, SAME_BANK: 0.1, OVERSEAS_BANK: 0.2 }), category: null }
          : kind === 'mule'
            ? mulePayee(ctx)
            : genericPayee(ctx)
      const coachedByPhone = rng.chance(0.4)
      const spec = {
        payee,
        amount: fraudAmount(ctx, Math.max(soMax(ctx) * rng.float(2, 8), rng.float(15000, 80000) * ctx.persona.incomeFactor)),
        frequency: rng.weighted({ WEEKLY: 0.5, MONTHLY: 0.35, DAILY: 0.15 }),
        dayOfMonth: null,
        description: coachedByPhone || rng.chance(0.3) ? rng.pick(['Savings transfer', 'Transfer to new account', ...GENERIC_DESCRIPTIONS]) : rng.pick(['Account protection settlement', 'Security holding transfer', 'Verification deposit']),
        paymentReference: rng.chance(0.5) ? `REF-${rng.digits(6)}` : null,
        ...normalTiming(ctx),
        channel: !coachedByPhone && rng.chance(0.6) ? 'EMAIL_LINK' : ctx.persona.usualChannel,
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 2, 60),
      }
      if (rng.chance(0.45)) spec.deviceId = newDeviceId(rng)
      if (rng.chance(0.4)) spec.hour = oddHour(ctx)
      if (coachedByPhone) return { ...spec, requestText: fill(ctx, rng.pick(BLAND_TEXTS), spec) }

      const t = IMPERSONATION_TEXTS
      // Some written instructions are "clean": no pressure, threat or link.
      const extras = rng.chance(0.25) ? [] : rng.sample([t.pressure, t.bypass, t.link, t.sensitive], rng.int(1, 3)).map((pool) => rng.pick(pool))
      return { ...spec, requestText: fill(ctx, [rng.pick(t.opener), rng.pick(t.body), ...extras].join(' '), spec) }
    },
  },
  {
    id: 'account_takeover',
    riskClass: 'fraudulent',
    weight: 2,
    description: 'Someone else in control of the account: usually an unrecognised device (sometimes the user\'s own, via remote access), often at night, payee added minutes earlier, a large or moderately raised amount to a personal or shell account, bland wording.',
    build(ctx) {
      const { rng } = ctx
      const payee = rng.chance(0.6) ? mulePayee(ctx) : { ...newPayee(ctx, rng.pick(EVERYDAY_CATEGORIES)), bank: rng.weighted({ OTHER_LOCAL_BANK: 0.85, OVERSEAS_BANK: 0.15 }) }
      const spec = {
        payee,
        amount: fraudAmount(ctx, soMax(ctx) * (rng.chance(0.3) ? rng.float(1.1, 1.8) : rng.float(2, 8))),
        frequency: rng.weighted({ MONTHLY: 0.4, WEEKLY: 0.4, DAILY: 0.2 }),
        dayOfMonth: null,
        description: rng.pick(['Payment', 'Transfer', 'Services', 'Monthly']),
        paymentReference: null,
        ...normalTiming(ctx),
        // Remote-access takeovers use the victim's own device.
        deviceId: rng.chance(0.25) ? rng.pick(ctx.persona.devices) : newDeviceId(rng),
        hour: rng.chance(0.6) ? oddHour(ctx, { night: true }) : usualHour(ctx),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 1, 30),
      }
      return { ...spec, requestText: fill(ctx, rng.pick(BLAND_TEXTS), spec) }
    },
  },
  {
    id: 'invoice_redirection',
    riskClass: 'fraudulent',
    weight: 1.5,
    description: 'A known supplier impersonated — same or look-alike name, new account, often a raised amount and "updated bank details" wording, sometimes a mismatched reference; quiet variants keep the usual amount and carry no note about the change.',
    applicable: hasBusinessOrder,
    build(ctx) {
      const { rng } = ctx
      const order = rng.pick(businessOrders(ctx))
      const payee = {
        name: rng.chance(0.5) ? order.payee.name : lookalikeName(rng, order.payee.name),
        account: newAccount(rng),
        bank: rng.weighted({ OTHER_LOCAL_BANK: 0.75, OVERSEAS_BANK: 0.25 }),
        category: order.category,
      }
      const spec = {
        ...fromOrder(ctx, order),
        ...normalTiming(ctx),
        payee,
        amount: roundAmount(order.amount * (rng.chance(0.5) ? rng.float(1, 1.08) : rng.float(1.2, 3))),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 10, 720),
      }
      if (rng.chance(0.3)) spec.description = otherCategoryDescription(ctx, order.category)
      if (rng.chance(0.3)) spec.deviceId = newDeviceId(rng)
      const style = rng.weighted({ changedDetails: 0.55, routine: 0.3, none: 0.15 })
      if (style === 'none') return { ...spec, requestText: '' }
      if (style === 'routine') return { ...spec, requestText: routineText(ctx, spec, ROUTINE_TEXTS, 0) }
      const urgency = rng.chance(0.4) ? ' Payment is overdue, please settle urgently.' : ''
      return { ...spec, requestText: fill(ctx, rng.pick(CHANGED_DETAILS_TEXTS), spec) + urgency }
    },
  },
  {
    id: 'investment_scam',
    riskClass: 'fraudulent',
    weight: 1.5,
    description: 'The user, on their own device and at their usual time, sets up large payments to a fake investment scheme — often promising returns, sometimes under a respectable-sounding fund name and wording copied from genuine plans.',
    build(ctx) {
      const { rng } = ctx
      const payee = rng.chance(0.6)
        ? { name: investmentName(rng), account: newAccount(rng), bank: rng.weighted({ OTHER_LOCAL_BANK: 0.6, OVERSEAS_BANK: 0.4 }), category: null }
        : { ...newPayee(ctx, 'INVESTMENT_PLAN'), bank: rng.weighted({ OTHER_LOCAL_BANK: 0.6, OVERSEAS_BANK: 0.4 }) }
      const spec = {
        payee,
        amount: fraudAmount(ctx, soMax(ctx) * rng.float(2, 10)),
        frequency: rng.weighted({ MONTHLY: 0.5, WEEKLY: 0.4, ONE_OFF: 0.1 }),
        dayOfMonth: usualDay(ctx),
        description: rng.pick(['Investment plan', 'Trading account top-up', 'Monthly contribution']),
        paymentReference: `INV-${rng.digits(5)}`,
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 30, 2 * MINUTES_PER_DAY),
      }
      const t = INVESTMENT_TEXTS
      const style = rng.weighted({ pitch: 0.55, copied: 0.25, none: 0.2 })
      if (style === 'none') return { ...spec, requestText: '' }
      if (style === 'copied') return { ...spec, requestText: rng.pick(LEGIT_RETURNS_TEXTS) }
      return { ...spec, requestText: [rng.pick(t.pitch), rng.pick(t.pressure)].filter(Boolean).join(' ') }
    },
  },
  {
    id: 'frequency_drain',
    riskClass: 'fraudulent',
    weight: 1,
    description: 'Many smaller daily or weekly payments to a new payee, draining far more per year than the user\'s usual commitments.',
    build(ctx) {
      const { rng } = ctx
      const frequency = rng.chance(0.65) ? 'DAILY' : 'WEEKLY'
      const spec = {
        payee: rng.chance(0.6) ? mulePayee(ctx) : newPayee(ctx, rng.pick(EVERYDAY_CATEGORIES)),
        amount: roundAmount(soMax(ctx) * (frequency === 'DAILY' ? rng.float(0.15, 0.6) : rng.float(0.4, 1.2))),
        frequency,
        dayOfMonth: null,
        description: rng.pick(['Payment', 'Services', 'Subscription']),
        paymentReference: null,
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: minutesAgo(ctx, 1, 240),
      }
      if (rng.chance(0.5)) spec.deviceId = newDeviceId(rng)
      if (rng.chance(0.4)) spec.hour = oddHour(ctx)
      return { ...spec, requestText: fill(ctx, rng.pick(BLAND_TEXTS), spec) }
    },
  },
  {
    id: 'mimic_routine',
    riskClass: 'fraudulent',
    weight: 1.5,
    description: 'Dressed up as a routine bill — monthly, usual payment day, usual hours, business-like name and wording — but a brand-new payee, at an amount anywhere from inside the user\'s usual range to several times it, added hours to days before.',
    build(ctx) {
      const { rng } = ctx
      const category = rng.pick(['PROPERTY', 'SERVICES', 'INSURANCE', 'TELECOM'])
      const spec = {
        payee: newPayee(ctx, category),
        amount: roundAmount(soMax(ctx) * (rng.chance(0.5) ? rng.float(0.6, 1.6) : rng.float(2.5, 6))),
        frequency: 'MONTHLY',
        dayOfMonth: usualDay(ctx),
        description: rng.chance(0.4) ? otherCategoryDescription(ctx, category) : rng.pick(PAYEE_CATEGORIES[category].descriptions),
        paymentReference: reference(ctx, category),
        ...normalTiming(ctx),
        beneficiaryAddedMinutesBefore: rng.chance(0.5) ? daysAgo(ctx, 1, 10) : minutesAgo(ctx, 15, 1380),
      }
      if (rng.chance(0.3)) spec.deviceId = newDeviceId(rng)
      return { ...spec, requestText: routineText(ctx, spec, ROUTINE_TEXTS, 0.2) }
    },
  },
  {
    id: 'weak_signal_stack',
    riskClass: 'fraudulent',
    weight: 1,
    description: 'No single strong indicator, but three to five weak ones at once (higher amount, edge hours, off-cycle day, new device, recent beneficiary, odd schedule, pressure wording, overseas bank).',
    build(ctx) {
      const base = { ...everydayNewPayee(ctx), ...normalTiming(ctx), beneficiaryAddedMinutesBefore: daysAgo(ctx, 1, 10) }
      const names = ['higherAmount', 'edgeHour', 'offDay', 'newDevice', 'recentBeneficiary', 'otherFrequency', 'pressureWording', 'overseas']
      const spec = applyWeakSignals(ctx, { ...base, requestText: routineText(ctx, base, ROUTINE_TEXTS, 0.5) }, names, ctx.rng.int(3, 5))
      return spec
    },
  },
]

export const SCENARIOS_BY_ID = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]))
