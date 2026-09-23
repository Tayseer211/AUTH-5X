import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { zonedDate } from '../utils/time.js'
import { analyseStandingOrder } from './engine.js'
import { deriveUserProfile, isBaselineTransaction } from './profile.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { bank: { code: null } }

function tx(overrides) {
  return {
    type: 'CARD_PAYMENT',
    direction: 'OUT',
    status: 'APPROVED',
    frequency: 'ONE_OFF',
    requiresApproval: false,
    decision: null,
    context: null,
    ...overrides,
    createdAt: overrides.date,
  }
}

// A Mauritius wall-clock time as an ISO string.
const mu = (month, day, hour, minute = 0) => zonedDate({ year: 2026, month, day, hour, minute }).toISOString()

const scoresByCase = (requests, profile) =>
  Object.fromEntries(requests.map((request) => [request.verificationCase, analyseStandingOrder(request, profile).score]))

describe('deriveUserProfile — hand-built ledger', () => {
  const ledger = [
    tx({ recipient: 'Acme Rentals', type: 'STANDING_ORDER', frequency: 'MONTHLY', amount: 2000, date: mu(7, 2, 6), description: 'Rent', context: { channel: 'ONLINE_BANKING', deviceId: 'laptop' } }),
    tx({ recipient: 'Acme Rentals', type: 'STANDING_ORDER', frequency: 'MONTHLY', amount: 3000, date: mu(8, 2, 6), description: 'Rent', context: { channel: 'ONLINE_BANKING', deviceId: 'laptop' } }),
    tx({ recipient: 'Bay Gym', type: 'STANDING_ORDER', frequency: 'MONTHLY', amount: 1000, date: mu(8, 27, 6), description: 'Gym', context: { channel: 'ONLINE_BANKING', deviceId: 'phone' } }),
    tx({ recipient: 'Corner Shop', amount: 500, date: mu(8, 10, 9, 30), description: 'Groceries' }),
    tx({ recipient: 'Corner Shop', amount: 1500, date: mu(8, 11, 17, 5), description: 'Groceries' }),
    // Not baseline: incoming, flagged, still awaiting approval, decided in-app.
    tx({ recipient: 'Employer', direction: 'IN', amount: 50000, date: mu(8, 25, 3) }),
    tx({ recipient: 'Odd Merchant', status: 'FLAGGED', amount: 90000, date: mu(8, 12, 2) }),
    tx({ recipient: 'Pending Payee', status: 'PENDING', requiresApproval: true, amount: 70000, date: mu(8, 13, 1) }),
    tx({ recipient: 'Decided Payee', decision: { action: 'APPROVED' }, amount: 80000, date: mu(8, 14, 0) }),
  ]
  const profile = deriveUserProfile(ledger)

  test('uses only settled outgoing history', () => {
    assert.equal(profile.transactionCount, 5)
    assert.deepEqual(ledger.map(isBaselineTransaction), [true, true, true, true, true, false, false, false, false])
  })

  test('average and standing-order amounts', () => {
    assert.equal(profile.averageAmount, 1600) // (2000 + 3000 + 1000 + 500 + 1500) / 5
    assert.deepEqual(profile.standingOrderAmountRange, { min: 1000, max: 3000 })
    assert.deepEqual(profile.usualFrequencies, ['MONTHLY'])
  })

  test('payment days come from standing orders, with a ±2 day window', () => {
    assert.deepEqual(profile.paymentDays, [2, 27])
    assert.deepEqual(profile.usualPaymentDays, [1, 2, 3, 4, 25, 26, 27, 28, 29, 31])
    assert.equal(profile.usualPaymentDaysLabel, 'around the 2nd and 27th')
  })

  test('active hours come from user-initiated activity, padded by an hour', () => {
    // Card payments at 09:30 and 17:05; 06:00 standing-order runs are ignored.
    assert.deepEqual(profile.activeHours, { start: 8, end: 19 })
  })

  test('known recipients with counts, typical amounts and arrangements', () => {
    const byName = Object.fromEntries(profile.knownRecipients.map((recipient) => [recipient.name, recipient]))
    assert.deepEqual(Object.keys(byName).sort(), ['Acme Rentals', 'Bay Gym', 'Corner Shop'])
    assert.equal(byName['Acme Rentals'].transactionCount, 2)
    assert.equal(byName['Acme Rentals'].averageAmount, 2500)
    assert.deepEqual(byName['Acme Rentals'].standingOrder, { frequency: 'MONTHLY', amount: 3000, dayOfMonth: 2 })
    assert.equal(byName['Corner Shop'].averageAmount, 1000)
    assert.equal(byName['Corner Shop'].standingOrder, null)
  })

  test('devices, channel and timezone', () => {
    assert.deepEqual(profile.knownDevices, ['laptop', 'phone'])
    assert.equal(profile.usualChannel, 'ONLINE_BANKING')
    assert.equal(profile.timezone, 'Indian/Mauritius')
  })

  test('an empty ledger yields an empty profile the engine can still use', () => {
    const empty = deriveUserProfile([])
    assert.equal(empty.transactionCount, 0)
    assert.equal(empty.standingOrderAmountRange, null)
    assert.equal(empty.activeHours, null)
    const [request] = createDemoRequests(USER, { now: NOW })
    assert.equal(typeof analyseStandingOrder(request, empty).score, 'number')
  })
})

describe('deriveUserProfile — seed history', () => {
  const seed = createSeedTransactions(NOW)
  const demo = createDemoRequests(USER, { now: NOW })
  const profile = deriveUserProfile(seed)

  test('produces the expected behavioural profile', () => {
    assert.deepEqual(profile.standingOrderAmountRange, { min: 1899, max: 7500 })
    assert.deepEqual(profile.usualFrequencies, ['MONTHLY'])
    assert.deepEqual(profile.paymentDays, [1, 3, 28, 30])
    assert.deepEqual(profile.activeHours, { start: 7, end: 21 })
    assert.deepEqual(profile.knownDevices, ['device-home-laptop', 'device-personal-phone'])
    assert.equal(profile.usualChannel, 'ONLINE_BANKING')
  })

  test('demo requests are not part of the profile', () => {
    assert.deepEqual(deriveUserProfile([...seed, ...demo]), profile)
    const demoNames = demo.map((request) => request.recipient)
    assert.ok(!profile.knownRecipients.some((recipient) => recipient.name === 'SecureVault Settlements Ltd'))
    assert.ok(demoNames.includes('SecureVault Settlements Ltd'))
  })

  test('approving a demo request does not change the profile', () => {
    const approved = demo.map((request) => ({ ...request, status: 'APPROVED', requiresApproval: false, decision: { action: 'APPROVED' } }))
    assert.deepEqual(deriveUserProfile([...seed, ...approved]), profile)
  })
})

describe('demo requests against the derived profile', () => {
  const ORIGINAL_TZ = process.env.TZ
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
  })

  function scoresAt(now) {
    const ledger = [...createSeedTransactions(now), ...createDemoRequests(USER, { now })]
    return scoresByCase(ledger.filter((item) => item.requiresApproval), deriveUserProfile(ledger))
  }

  test('score 100 / 69 / 8 and stay in their bands', () => {
    const scores = scoresAt(NOW)
    assert.deepEqual(scores, { LEGITIMATE: 100, GREY: 69, FRAUD: 8 })
    assert.ok(scores.LEGITIMATE >= 95)
    assert.ok(scores.GREY >= 60 && scores.GREY <= 75)
    assert.ok(scores.FRAUD <= 10)
  })

  test('scores do not depend on the date the demo runs', () => {
    for (let day = 0; day < 366; day += 1) {
      const now = new Date(Date.UTC(2026, 0, 1, 5) + day * 24 * 60 * 60 * 1000)
      assert.deepEqual(scoresAt(now), { LEGITIMATE: 100, GREY: 69, FRAUD: 8 }, now.toISOString())
    }
  })

  test('scores do not depend on the runtime time zone', () => {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Indian/Mauritius']) {
      process.env.TZ = zone
      assert.deepEqual(scoresAt(NOW), { LEGITIMATE: 100, GREY: 69, FRAUD: 8 }, zone)
    }
  })

  test('the engine ignores the verificationCase label', () => {
    const ledger = [...createSeedTransactions(NOW), ...createDemoRequests(USER, { now: NOW })]
    const profile = deriveUserProfile(ledger)
    for (const request of ledger.filter((item) => item.requiresApproval)) {
      const relabelled = { ...request, verificationCase: 'LEGITIMATE' }
      const unlabelled = { ...request, verificationCase: undefined }
      const expected = analyseStandingOrder(request, profile).score
      assert.equal(analyseStandingOrder(relabelled, profile).score, expected)
      assert.equal(analyseStandingOrder(unlabelled, profile).score, expected)
    }
  })

  test('analysis keeps its response shape', () => {
    const [request] = createDemoRequests(USER, { now: NOW })
    const analysis = analyseStandingOrder(request, deriveUserProfile(createSeedTransactions(NOW)))
    assert.deepEqual(Object.keys(analysis).sort(), ['analysedAt', 'checks', 'engine', 'riskLevel', 'score'])
    assert.deepEqual(analysis.checks.map((check) => check.id), ['amount', 'frequency', 'recipient', 'behaviour', 'language', 'expected'])
    for (const check of analysis.checks) {
      assert.deepEqual(Object.keys(check).sort(), ['findings', 'id', 'label', 'score', 'status', 'weight'])
    }
  })
})
