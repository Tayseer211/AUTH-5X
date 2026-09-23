import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../../data/demoCases.js'
import { createSeedTransactions } from '../../data/seedTransactions.js'
import { zonedDate } from '../../utils/time.js'
import { analyseStandingOrder } from '../engine.js'
import { deriveUserProfile } from '../profile.js'
import { compareEvidence, compareTextEvidence } from './evidence.js'
import { extractEntities } from './extract.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const PROFILE = deriveUserProfile(createSeedTransactions(NOW))
const mu = (month, day, hour = 6) => zonedDate({ year: 2026, month, day, hour }).toISOString()

const REQUEST = {
  type: 'STANDING_ORDER',
  recipient: 'Harbourline Property Management',
  recipientAccount: '0932',
  recipientBank: 'OTHER_LOCAL_BANK',
  amount: 12500,
  currency: 'MUR',
  frequency: 'MONTHLY',
  date: mu(10, 17),
  reference: 'HPM-4471',
}

const evidence = (text, request = REQUEST, options = { userBank: 'MCB' }) => compareTextEvidence(text, request, PROFILE, options)
const signalsFor = (result, field) => result.signals.filter((signal) => signal.field === field)
const tones = (result, field) => signalsFor(result, field).map((signal) => signal.tone)

describe('compareEvidence — amount and currency', () => {
  test('exact amount match', () => {
    const result = evidence('Please pay Rs 12,500 on the 17th of each month.')
    assert.equal(result.fields.amount.status, 'MATCH')
    assert.deepEqual(tones(result, 'amount'), ['ok'])
    assert.equal(result.fields.currency.status, 'MATCH')
  })

  test('a single different amount is a clear conflict', () => {
    const result = evidence('Please pay Rs 15,000 this month.')
    assert.equal(result.fields.amount.status, 'CONFLICT')
    assert.deepEqual(tones(result, 'amount'), ['bad'])
    assert.match(signalsFor(result, 'amount')[0].text, /Rs 15,000.*Rs 12,500/)
  })

  test('several amounts, none of them the requested one, are a weaker conflict', () => {
    const result = evidence('Instalments of Rs 10,000 then Rs 2,000.')
    assert.deepEqual(tones(result, 'amount'), ['warn'])
  })

  test('a different currency conflicts', () => {
    const result = evidence('Please pay USD 12500.')
    assert.equal(result.fields.currency.status, 'CONFLICT')
    assert.equal(result.fields.amount.status, 'CONFLICT')
  })
})

describe('compareEvidence — payee', () => {
  test('the same payee, ignoring legal suffixes, matches without claiming identity', () => {
    const result = evidence('Beneficiary: Harbourline Property Management Ltd')
    assert.equal(result.fields.payee.status, 'MATCH')
    assert.deepEqual(tones(result, 'payee'), ['ok'])
    assert.match(signalsFor(result, 'payee')[0].text, /does not prove/)
  })

  test('a different payee is a clear conflict', () => {
    const result = evidence('Transfer the fee to Coral Bay Syndic.')
    assert.equal(result.fields.payee.status, 'CONFLICT')
    assert.deepEqual(tones(result, 'payee'), ['bad'])
  })

  test('a look-alike payee is a warning', () => {
    const result = evidence('Transfer the fee to Harbourline Property Managment.')
    assert.equal(result.fields.payee.status, 'CONFLICT')
    assert.deepEqual(signalsFor(result, 'payee').map((signal) => [signal.id, signal.tone]), [['payee.lookalike', 'warn']])
  })

  test('a different payee that is already known is labelled as such', () => {
    const known = PROFILE.knownRecipients[0].name
    const result = evidence(`Beneficiary: ${known}`)
    assert.match(signalsFor(result, 'payee')[0].text, /an existing payee/)
  })
})

describe('compareEvidence — bank', () => {
  test('another local bank matches an OTHER_LOCAL_BANK request', () => {
    const result = evidence('Pay into the SBM account.')
    assert.equal(result.fields.bank.status, 'MATCH')
  })

  test("the customer's own bank conflicts with an OTHER_LOCAL_BANK request", () => {
    const result = evidence('Pay into the MCB account.')
    assert.equal(result.fields.bank.status, 'CONFLICT')
    assert.deepEqual(tones(result, 'bank'), ['warn'])
  })

  test('a local bank conflicts with an overseas request, even without the customer bank', () => {
    const result = evidence('Pay into the SBM account.', { ...REQUEST, recipientBank: 'OVERSEAS_BANK' }, {})
    assert.equal(result.fields.bank.status, 'CONFLICT')
  })

  test('without the customer bank, a local request cannot be compared', () => {
    const result = evidence('Pay into the SBM account.', REQUEST, {})
    assert.equal(result.fields.bank.status, 'UNCOMPARED')
    assert.deepEqual(tones(result, 'bank'), [null])
  })

  test('a bank named only by the sender claim is not the payee bank', () => {
    assert.equal(evidence('This is the MCB fraud department.').fields.bank.status, 'NOT_PRESENT')
  })
})

describe('compareEvidence — account and reference', () => {
  test('last four digits match the request account', () => {
    const result = evidence('Pay the account ending in 0932.')
    assert.equal(result.fields.account.status, 'MATCH')
    assert.match(signalsFor(result, 'account')[0].text, /Only the last four digits/)
  })

  test('different last four digits conflict', () => {
    const result = evidence('Pay the account ending in 1111.')
    assert.equal(result.fields.account.status, 'CONFLICT')
    assert.deepEqual(tones(result, 'account'), ['bad'])
  })

  test('full account numbers are compared in full when the request has one', () => {
    const request = { ...REQUEST, recipientAccount: '000123450932' }
    assert.equal(evidence('Account no: 000123450932', request).fields.account.status, 'MATCH')
    // Same last four, different number.
    assert.equal(evidence('Account no: 999999990932', request).fields.account.status, 'CONFLICT')
  })

  test('reference match and mismatch', () => {
    assert.equal(evidence('Ref HPM-4471, as agreed.').fields.reference.status, 'MATCH')
    const mismatch = evidence('Ref HPM-9999, as agreed.')
    assert.equal(mismatch.fields.reference.status, 'CONFLICT')
    assert.deepEqual(tones(mismatch, 'reference'), ['bad'])
  })

  test("fraud.auth's own SO- references are never compared", () => {
    const result = evidence('Ref HPM-9999', { ...REQUEST, reference: 'SO-12345' })
    assert.equal(result.fields.reference.status, 'UNCOMPARED')
    assert.equal(result.summary.conflicts, 0)
  })
})

describe('compareEvidence — dates', () => {
  test('dates on the monthly schedule match; earlier dates are warnings', () => {
    assert.equal(evidence('First payment 17/10/2026, then 17/11/2026.').fields.date.status, 'MATCH')
    const early = evidence('Pay by 10/10/2026.')
    assert.equal(early.fields.date.status, 'CONFLICT')
    assert.deepEqual(signalsFor(early, 'date').map((signal) => [signal.id, signal.tone]), [['date.before', 'warn']])
  })

  test('dates without a year never conflict', () => {
    assert.equal(evidence('Starting 17 Oct.').fields.date.status, 'MATCH')
    const other = evidence('Starting 3 Nov.')
    assert.equal(other.fields.date.status, 'UNCOMPARED')
    assert.deepEqual(other.findings, [])
  })
})

describe('compareEvidence — suspicious evidence', () => {
  test('sender claims are surfaced, not treated as conflicts', () => {
    const result = evidence('This is the SBM fraud department, on behalf of your bank.')
    assert.equal(result.fields.senderClaims.status, 'SUSPICIOUS')
    assert.deepEqual(tones(result, 'senderClaims'), ['warn', 'warn'])
    assert.match(signalsFor(result, 'senderClaims')[0].text, /SBM is not the customer's bank/)
    assert.equal(result.summary.conflicts, 0)
    assert.equal(result.status, 'SUSPICIOUS')
  })

  test('requests for sensitive information', () => {
    const result = evidence('Reply with the OTP and your PIN to continue.')
    assert.equal(result.fields.sensitiveInfo.status, 'SUSPICIOUS')
    assert.deepEqual(result.fields.sensitiveInfo.extracted, ['otp', 'pin'])
    assert.deepEqual(tones(result, 'sensitiveInfo'), ['bad'])
  })

  test('without the original text, wording checks are reported as not checked', () => {
    const result = compareEvidence(extractEntities('Reply with the OTP.'), REQUEST, PROFILE)
    assert.equal(result.fields.sensitiveInfo.status, 'NOT_CHECKED')
  })

  test('look-alike, bank-named, security-worded and plain domains', () => {
    const result = evidence('Visit mcb-secure-login.com, sbm.mu, account-verify.net, harbourline.co.uk or acme-rentals.com')
    assert.deepEqual(
      signalsFor(result, 'links').map((signal) => [signal.evidence[0].domain, signal.id, signal.tone]),
      [
        ['mcb-secure-login.com', 'link.lookalike', 'bad'],
        ['sbm.mu', 'link.bankName', 'warn'],
        ['account-verify.net', 'link.securityWording', 'warn'],
        ['harbourline.co.uk', 'link.present', null],
        ['acme-rentals.com', 'link.present', null],
      ],
    )
  })

  test('contradictions within the text', () => {
    const result = evidence('Pay Rs 12,500 to the account ending in 0932, or Rs 13,000 to the account ending in 4417.')
    assert.deepEqual(
      signalsFor(result, 'consistency').map((signal) => signal.id),
      ['consistency.amounts', 'consistency.accounts'],
    )
  })
})

describe('compareEvidence — missing and unavailable data', () => {
  test('text with no evidence produces no mismatch and no findings', () => {
    const result = evidence('Hello, thank you for your help last week.')
    assert.equal(result.status, 'NO_EVIDENCE')
    assert.deepEqual(result.signals, [])
    assert.deepEqual(result.findings, [])
    for (const [name, entry] of Object.entries(result.fields)) assert.equal(entry.status, 'NOT_PRESENT', name)
  })

  test('an empty or partial extraction is accepted', () => {
    assert.equal(compareEvidence({}, REQUEST, PROFILE).status, 'NO_EVIDENCE')
    assert.equal(compareEvidence({ amounts: [] }, REQUEST, null).status, 'NO_EVIDENCE')
  })

  test('request fields that are missing are never compared or invented', () => {
    const text = 'Pay Rs 12,500 to Coral Bay Syndic, SBM account ending in 1111, ref INV-5521, by 10/10/2026.'
    const result = evidence(text, {}, {})
    assert.equal(result.summary.matches, 0)
    assert.equal(result.summary.conflicts, 0)
    for (const name of ['amount', 'currency', 'payee', 'bank', 'account', 'reference', 'date']) {
      assert.equal(result.fields[name].status, 'UNCOMPARED', name)
      assert.equal(result.fields[name].request, null, name)
    }
    assert.equal(result.status, 'UNVERIFIED')
    assert.deepEqual(result.findings, [])
  })
})

describe('compareEvidence — whole messages', () => {
  const MIXED =
    'This is the MCB fraud department. Transfer Rs 12,500 to Harbourline Property Managment, SBM account ending in 7781, ' +
    'ref HPM-4471, by 10/10/2026. Share the OTP to confirm at mcb-verify.com.'

  test('combined evidence keeps matches and conflicts apart', () => {
    const result = evidence(MIXED)
    const status = Object.fromEntries(Object.entries(result.fields).map(([name, entry]) => [name, entry.status]))
    assert.deepEqual(status, {
      amount: 'MATCH',
      currency: 'MATCH',
      payee: 'CONFLICT',
      bank: 'MATCH',
      account: 'CONFLICT',
      reference: 'MATCH',
      date: 'CONFLICT',
      senderClaims: 'SUSPICIOUS',
      links: 'SUSPICIOUS',
      sensitiveInfo: 'SUSPICIOUS',
      consistency: 'NOT_PRESENT',
    })
    assert.equal(result.status, 'CONFLICTING')
    assert.deepEqual(result.summary, { matches: 4, conflicts: 3, suspicious: 3, uncompared: 0, notPresent: 1 })
    assert.equal(result.findings.length, result.signals.length)
  })

  test('deterministic, serialisable and free of scores', () => {
    const first = evidence(MIXED)
    for (let run = 0; run < 5; run++) assert.deepEqual(evidence(MIXED), first)
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first)
    assert.deepEqual(Object.keys(first), ['status', 'summary', 'fields', 'signals', 'findings'])
    assert.ok(!/score|probability/i.test(JSON.stringify(Object.keys(first))))
  })

  test('the demo requests: inputs untouched and rule scores still 100 / 69 / 8', () => {
    const requests = createDemoRequests({ bank: { code: 'MCB' } }, { now: NOW })
    const before = structuredClone(requests)
    for (const request of requests) compareTextEvidence(request.requestText, request, PROFILE, { userBank: 'MCB' })
    assert.deepEqual(requests, before)
    const scores = Object.fromEntries(requests.map((request) => [request.verificationCase, analyseStandingOrder(request, PROFILE).score]))
    assert.deepEqual(scores, { LEGITIMATE: 100, GREY: 69, FRAUD: 8 })
  })

  test('the fraud demo text surfaces its claims and look-alike link', () => {
    const fraud = createDemoRequests({ bank: { code: 'MCB' } }, { now: NOW }).find((request) => request.verificationCase === 'FRAUD')
    const result = compareTextEvidence(fraud.requestText, fraud, PROFILE, { userBank: 'MCB' })
    assert.deepEqual(
      result.signals.map((signal) => signal.id),
      ['sender.claim', 'sender.claim', 'link.lookalike'],
    )
    assert.equal(result.summary.conflicts, 0)
  })
})
