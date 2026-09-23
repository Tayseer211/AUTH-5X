import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { zonedDate } from '../utils/time.js'
import { extractFeatures, recipientSimilarity } from './features.js'
import { deriveUserProfile } from './profile.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const mu = (month, day, hour, minute = 0) => zonedDate({ year: 2026, month, day, hour, minute }).toISOString()

function tx(overrides) {
  return {
    type: 'TRANSFER',
    direction: 'OUT',
    status: 'APPROVED',
    frequency: 'ONE_OFF',
    requiresApproval: false,
    decision: null,
    context: { channel: 'ONLINE_BANKING', deviceId: 'laptop' },
    ...overrides,
    createdAt: overrides.date,
  }
}

function request(overrides) {
  return {
    type: 'STANDING_ORDER',
    recipient: 'Acme Rentals',
    amount: 2500,
    currency: 'MUR',
    frequency: 'MONTHLY',
    date: mu(9, 2, 6),
    description: 'Rent',
    requestText: '',
    ...overrides,
    context: { channel: 'ONLINE_BANKING', deviceId: 'laptop', initiatedAt: mu(8, 30, 10), ...overrides.context },
  }
}

describe('extractFeatures — hand-built ledger', () => {
  const history = [
    tx({ recipient: 'Acme Rentals', recipientAccount: '1111', type: 'STANDING_ORDER', frequency: 'MONTHLY', amount: 2500, date: mu(7, 2, 6), description: 'Rent', context: { channel: 'ONLINE_BANKING', deviceId: 'laptop' } }),
    tx({ recipient: 'Acme Rentals', recipientAccount: '1111', type: 'STANDING_ORDER', frequency: 'MONTHLY', amount: 2500, date: mu(8, 2, 6), description: 'Rent', context: { channel: 'ONLINE_BANKING', deviceId: 'laptop' } }),
    tx({ recipient: 'Corner Shop', amount: 2500, date: mu(8, 10, 8), description: 'Groceries' }),
    tx({ recipient: 'Corner Shop', amount: 2500, date: mu(8, 11, 20), description: 'Groceries' }),
  ]
  const profile = deriveUserProfile(history)
  const features = (overrides) => extractFeatures(request(overrides), { history, profile })

  test('a request matching an existing order has no risk signals', () => {
    const { raw, derived } = features({})
    assert.equal(raw.recipientPreviouslyUsed, true)
    assert.equal(raw.existingStandingOrderToRecipient, true)
    assert.equal(derived.newRecipient, false)
    assert.equal(derived.duplicateOfExistingOrder, true)
    assert.equal(derived.riskSignalCount, 0)
  })

  test('raw amount and history give the derived deviation ratio', () => {
    const { raw, derived } = features({ amount: 12000 })
    assert.equal(raw.userAverageAmount, 2500)
    assert.equal(derived.amountToUserAverageRatio, 4.8)
    assert.equal(derived.amountChangeVsExistingOrderRatio, 4.8)
    assert.equal(derived.amountAboveUsualRange, true)
  })

  test('an hour outside the usual window is flagged, with its distance', () => {
    // Active 07:00–22:00 (08:00 and 20:00, padded by an hour).
    const { raw, derived } = features({ context: { initiatedAt: mu(8, 30, 2) } })
    assert.equal(raw.initiatedHour, 2)
    assert.deepEqual([raw.userActiveHourStart, raw.userActiveHourEnd], [7, 22])
    assert.equal(derived.unusualHour, true)
    assert.equal(derived.nightTime, true)
    assert.equal(derived.hoursOutsideActiveWindow, 5)
  })

  test('a known payee name with a new account number is an account change', () => {
    const { raw, derived } = features({ recipientAccount: '9999' })
    assert.equal(raw.recipientAccountPreviouslyUsed, false)
    assert.equal(derived.recipientAccountChanged, true)
    assert.equal(derived.newRecipient, false)
  })

  test('a near-copy of a known payee name is a look-alike', () => {
    const { derived } = features({ recipient: 'Acme Rental' })
    assert.equal(derived.newRecipient, true)
    assert.equal(derived.lookalikeRecipient, true)
  })

  test('frequency and annualised volume', () => {
    const { derived } = features({ frequency: 'DAILY', amount: 500 })
    assert.equal(derived.unusualFrequency, true)
    assert.equal(derived.frequencyChangedForRecipient, true)
    assert.equal(derived.annualisedAmount, 182500)
  })

  test('does not modify its inputs', () => {
    const input = request({})
    const snapshot = structuredClone({ input, history, profile })
    extractFeatures(input, { history, profile })
    assert.deepEqual({ input, history, profile }, snapshot)
  })
})

describe('extractFeatures — app demo requests', () => {
  const history = createSeedTransactions(NOW)
  const profile = deriveUserProfile(history)
  const byCase = Object.fromEntries(
    createDemoRequests({ bank: { code: null } }, { now: NOW }).map((demo) => [demo.verificationCase, extractFeatures(demo, { history, profile })]),
  )

  test('works on the app\'s own request shape', () => {
    const { derived } = byCase.FRAUD
    assert.equal(derived.newRecipient, true)
    assert.equal(derived.newDevice, true)
    assert.equal(derived.externalLinkChannel, true)
    assert.equal(derived.securityThemedRecipientName, true)
    assert.equal(derived.textUrgency, true)
    assert.equal(byCase.LEGITIMATE.derived.riskSignalCount, 0)
  })

  test('ignores the demo verificationCase label', () => {
    const [demo] = createDemoRequests({ bank: { code: null } }, { now: NOW })
    const unlabelled = { ...demo, verificationCase: null }
    assert.deepEqual(extractFeatures(unlabelled, { history, profile }), extractFeatures(demo, { history, profile }))
  })
})

describe('recipientSimilarity', () => {
  test('ignores case, accents, punctuation and legal suffixes', () => {
    assert.equal(recipientSimilarity('Alizé Fibre Ltd', 'alize-fibre limited'), 1)
  })

  test('near-copies score high, unrelated names low', () => {
    assert.ok(recipientSimilarity('Corail Fibre Ltd', 'C0rail Fibre Ltd') >= 0.8)
    assert.ok(recipientSimilarity('Corail Fibre Ltd', 'Corail Fibre Ltd Payments') >= 0.8)
    assert.ok(recipientSimilarity('Corail Fibre Ltd', 'Filao Insurance Ltd') < 0.5)
  })

  test('generic account labels differing only in digits are different payees', () => {
    assert.equal(recipientSimilarity('Family account ••1234', 'Family account ••5678'), 0)
  })
})
