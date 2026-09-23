import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { DEMO_CASES, VERIFICATION_CASES } from '../../data/demoCases.js'
import { createSeedTransactions } from '../../data/seedTransactions.js'
import { RISK_SIGNAL_FLAGS } from '../features.js'
import { allocateCounts, generateDataset, resolveConfig } from './generator.js'
import { createRng } from './random.js'
import { RISK_CLASSES, SCENARIOS } from './scenarios.js'
import { DERIVED_FEATURES, RAW_FEATURES, validateRecord } from './schema.js'

const CONFIG = { users: 40, standingOrders: 600, seed: 'test-seed' }
const dataset = generateDataset(CONFIG)
const { records, users } = dataset

const ofClass = (riskClass) => records.filter((record) => record.labels.riskClass === riskClass)
const flagged = (record, flag) => (flag === 'textRiskTermCount' ? record.derived[flag] > 0 : record.derived[flag])

describe('seeded random numbers', () => {
  test('the same seed gives the same sequence; a different seed does not', () => {
    const a = createRng('x')
    const b = createRng('x')
    const c = createRng('y')
    const draws = (rng) => Array.from({ length: 20 }, () => rng.next())
    const first = draws(a)
    assert.deepEqual(first, draws(b))
    assert.notDeepEqual(first, draws(c))
    assert.ok(first.every((value) => value >= 0 && value < 1))
  })
})

describe('generateDataset — shape', () => {
  test('produces the requested number of users and records', () => {
    assert.equal(users.length, CONFIG.users)
    assert.equal(records.length, CONFIG.standingOrders)
    assert.equal(new Set(records.map((record) => record.standingOrderId)).size, records.length)
    assert.equal(new Set(users.map((user) => user.userId)).size, users.length)
  })

  test('class counts follow the configured mix exactly', () => {
    const expected = allocateCounts(CONFIG.standingOrders, resolveConfig(CONFIG).classMix)
    for (const riskClass of RISK_CLASSES) assert.equal(ofClass(riskClass).length, expected[riskClass], riskClass)
  })

  test('every record has every schema field with a valid value', () => {
    for (const record of records) assert.deepEqual(validateRecord(record), [], record.standingOrderId)
    for (const spec of RAW_FEATURES) assert.ok(spec.name in records[0].raw, spec.name)
    for (const spec of DERIVED_FEATURES) assert.ok(spec.name in records[0].derived, spec.name)
  })

  test('values are internally consistent', () => {
    const userIds = new Set(users.map((user) => user.userId))
    const reference = Date.parse(dataset.config.referenceDate)
    for (const { userId, raw, derived } of records) {
      assert.ok(userIds.has(userId))
      assert.ok(raw.amount > 0)
      assert.equal(raw.currency, 'MUR')
      assert.ok(Date.parse(raw.initiatedAt) >= reference)
      assert.ok(Date.parse(raw.firstPaymentDate) > Date.parse(raw.initiatedAt))
      assert.equal(derived.newRecipient, !raw.recipientPreviouslyUsed)
      if (raw.userStandingOrderMaxAmount != null) assert.equal(derived.amountAboveUsualRange, raw.amount > raw.userStandingOrderMaxAmount)
    }
  })

  test('user profiles carry a behavioural baseline derived from history', () => {
    for (const { baseline } of users) {
      assert.ok(baseline.transactionCount > 0)
      assert.ok(baseline.averageAmount > 0)
      assert.ok(baseline.normalAmountRange.p10 <= baseline.normalAmountRange.p90)
      assert.ok(baseline.usualPaymentDays.length > 0)
      assert.ok(baseline.activeHours.start < baseline.activeHours.end)
      assert.ok(baseline.knownDevices.length > 0)
      assert.ok(baseline.usualChannel)
      assert.ok(baseline.commonRecipients.length > 0)
      assert.ok(baseline.existingStandingOrders.length > 0)
    }
  })
})

describe('generateDataset — labels', () => {
  test('labels are valid and consistent with the risk class', () => {
    const scenarioClass = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario.riskClass]))
    for (const { labels } of records) {
      assert.ok(RISK_CLASSES.includes(labels.riskClass))
      assert.equal(scenarioClass[labels.scenario], labels.riskClass)
      assert.equal(typeof labels.isFraud, 'boolean')
      if (labels.riskClass === 'fraudulent') assert.equal(labels.isFraud, true)
      if (labels.riskClass.startsWith('legit_')) assert.equal(labels.isFraud, false)
    }
  })

  test('suspicious records are genuinely ambiguous: both outcomes occur', () => {
    const suspicious = ofClass('suspicious')
    assert.ok(suspicious.some((record) => record.labels.isFraud))
    assert.ok(suspicious.some((record) => !record.labels.isFraud))
  })

  test('labels are not the demo-case names', () => {
    const demoNames = Object.values(VERIFICATION_CASES)
    for (const { labels } of records) {
      assert.ok(!demoNames.includes(labels.riskClass))
      assert.ok(!demoNames.includes(labels.scenario))
    }
  })

  test('rule-engine scores are recorded as a benchmark and vary continuously', () => {
    const scores = new Set(records.map((record) => record.benchmark.ruleEngineScore))
    assert.ok(scores.size > 20, `only ${scores.size} distinct scores`)
    for (const riskClass of RISK_CLASSES) {
      const classScores = new Set(ofClass(riskClass).map((record) => record.benchmark.ruleEngineScore))
      assert.ok(classScores.size > 1 || riskClass === 'legit_normal', riskClass)
    }
  })
})

describe('generateDataset — reproducibility', () => {
  test('the same seed and config regenerate an identical dataset', () => {
    assert.deepEqual(generateDataset(CONFIG), dataset)
  })

  test('a different seed gives a different dataset', () => {
    const other = generateDataset({ ...CONFIG, seed: 'another-seed' })
    assert.notDeepEqual(other.records, records)
  })
})

describe('generateDataset — unusual is not fraud', () => {
  test('legitimate-but-unusual examples exist and each departs from the norm', () => {
    const unusual = ofClass('legit_unusual')
    assert.ok(unusual.length > 0)
    for (const record of unusual) {
      assert.equal(record.labels.isFraud, false)
      assert.ok(record.derived.riskSignalCount >= 1, `${record.standingOrderId} (${record.labels.scenario}) has no risk signal`)
    }
    assert.ok(new Set(unusual.map((record) => record.labels.scenario)).size >= 6)
  })

  test('each common fraud signal also appears on legitimate requests', () => {
    const legitimate = records.filter((record) => !record.labels.isFraud)
    for (const flag of ['newRecipient', 'amountAboveUsualRange', 'newDevice', 'unusualHour', 'unusualPaymentDay', 'unusualChannel', 'beneficiaryAddedRecently', 'frequencyChangedForRecipient', 'referencePayeeConflict', 'textRiskTermCount']) {
      assert.ok(legitimate.some((record) => flagged(record, flag)), `no legitimate example with ${flag}`)
    }
  })
})

describe('generateDataset — fraud', () => {
  const fraudulent = ofClass('fraudulent')

  test('fraudulent examples exist, across several distinct patterns', () => {
    assert.ok(fraudulent.length > 0)
    assert.ok(new Set(fraudulent.map((record) => record.labels.scenario)).size >= 5)
  })

  test('each fraudulent example combines at least two risk signals', () => {
    for (const record of fraudulent) assert.ok(record.derived.riskSignalCount >= 2, `${record.standingOrderId} (${record.labels.scenario})`)
  })

  test('no single signal defines fraud', () => {
    // Some fraud looks clean on each individual axis.
    assert.ok(fraudulent.some((record) => record.derived.textRiskTermCount === 0))
    assert.ok(fraudulent.some((record) => !record.derived.newDevice))
    assert.ok(fraudulent.some((record) => !record.derived.unusualHour))
    for (const flag of RISK_SIGNAL_FLAGS) {
      assert.ok(!fraudulent.every((record) => flagged(record, flag)), `every fraudulent record has ${flag}`)
    }
  })
})

describe('generateDataset — no real personal data', () => {
  const PERSONAL_KEYS = /^(first|last|full)?_?name$|email|phone|mobile|address|birth|dob|nic|passport|iban|cardNumber|password/i
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/
  const LONG_DIGITS = /\d{7,}/ // phone, card or full account numbers
  const URL = /https?:\/\/[^\s]+/g

  function* strings(value, path = '') {
    if (typeof value === 'string') yield [path, value]
    else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* strings(item, `${path}[${i}]`)
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        assert.ok(!PERSONAL_KEYS.test(key), `personal-data field ${path}.${key}`)
        yield* strings(item, `${path}.${key}`)
      }
    }
  }

  test('no personal fields, e-mail addresses, phone/card numbers or real links', () => {
    for (const [path, text] of strings({ records, users })) {
      assert.ok(!EMAIL.test(text), `${path}: ${text}`)
      // Timestamps and random hex device IDs can contain long digit runs.
      if (!/(At|Date|deviceId|knownDevices\[\d+\])$/.test(path)) assert.ok(!LONG_DIGITS.test(text), `${path}: ${text}`)
      for (const url of text.match(URL) ?? []) assert.match(url, /^https:\/\/[a-z0-9-]+\.example(\/|$)/, `${path}: ${url}`)
    }
  })

  test('accounts are four-digit fictional suffixes and records are marked synthetic', () => {
    for (const { raw } of records) assert.match(raw.recipientAccount, /^\d{4}$/)
    for (const user of users) {
      assert.equal(user.synthetic, true)
      assert.match(user.userId, /^SYN-U\d{5}$/)
    }
  })

  test('no payee from the app\'s seed history or demo cases is reused', () => {
    const appNames = new Set([...createSeedTransactions(new Date('2026-09-23T08:00:00Z')), ...DEMO_CASES].map((item) => item.recipient.toLowerCase()))
    for (const { raw } of records) assert.ok(!appNames.has(raw.recipient.toLowerCase()), raw.recipient)
  })
})

describe('configuration', () => {
  test('fraudRate sets the fraudulent share and rescales the rest', () => {
    const { classMix } = resolveConfig({ fraudRate: 0.2 })
    assert.equal(Math.round(classMix.fraudulent * 1000), 200)
    assert.equal(Math.round(Object.values(classMix).reduce((sum, share) => sum + share, 0) * 1000), 1000)
    const counts = allocateCounts(1000, classMix)
    assert.equal(counts.fraudulent, 200)
  })

  test('class mix is configurable and normalised', () => {
    const { classMix } = resolveConfig({ classMix: { legit_normal: 1, legit_unusual: 1, suspicious: 1, fraudulent: 1 } })
    for (const riskClass of RISK_CLASSES) assert.equal(classMix[riskClass], 0.25)
  })

  test('invalid configuration is rejected', () => {
    assert.throws(() => resolveConfig({ classMix: { unknown: 1 } }), /Unknown risk class/)
    assert.throws(() => resolveConfig({ fraudRate: 1.5 }), /fraudRate/)
    assert.throws(() => resolveConfig({ users: 0 }), /users/)
  })
})

describe('DATA_CARD.md', () => {
  test('documents every feature, label and scenario', () => {
    const card = readFileSync(new URL('../../../data/synthetic/DATA_CARD.md', import.meta.url), 'utf8')
    for (const spec of [...RAW_FEATURES, ...DERIVED_FEATURES]) assert.ok(card.includes(`\`${spec.name}\``), `feature ${spec.name}`)
    for (const name of ['isFraud', 'riskClass', 'scenario', ...RISK_CLASSES, ...SCENARIOS.map((scenario) => scenario.id)]) {
      assert.ok(card.includes(`\`${name}\``), name)
    }
  })
})
