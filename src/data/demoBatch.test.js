import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { deriveUserProfile } from '../fraud/profile.js'
import { CHANNELS } from '../fraud/synthetic/catalog.js'
import { generateDataset } from '../fraud/synthetic/generator.js'
import { createRng } from '../fraud/synthetic/random.js'
import { RISK_CLASSES, SCENARIOS } from '../fraud/synthetic/scenarios.js'
import { FREQUENCY_LABELS } from '../utils/format.js'
import {
  BATCH_MIX_RANGES,
  CONTROLLED_CASE_COUNT,
  MAX_BATCH_SIZE,
  MIN_BATCH_SIZE,
  batchClasses,
  chooseBatchMix,
  chooseBatchSize,
  createAppPersona,
  createDemoBatch,
  scenarioIds,
} from './demoBatch.js'
import { createDemoRequests } from './demoCases.js'
import { RECIPIENT_BANKS } from './recipientBanks.js'
import { createSeedTransactions } from './seedTransactions.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { id: 'batch-test-user', bank: { code: 'MCB' } }
const HISTORY = createSeedTransactions(NOW)
const batch = (options = {}) => createDemoBatch(USER, HISTORY, { seed: 'batch-test', now: NOW, ...options })
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

describe('batch size', () => {
  test('is always between 1 and 100 and reaches both ends of the range', () => {
    const sizes = Array.from({ length: 3000 }, (_, i) => chooseBatchSize(createRng(`size-${i}`)))
    assert.ok(sizes.every((size) => Number.isInteger(size) && size >= MIN_BATCH_SIZE && size <= MAX_BATCH_SIZE))
    assert.ok(Math.min(...sizes) <= 3 && Math.max(...sizes) >= 98)
    assert.ok(new Set(sizes).size > 80)
  })

  test('never repeats the previous size, from either end or the middle', () => {
    for (const previous of [1, 2, 50, 99, 100]) {
      const sizes = Array.from({ length: 1500 }, (_, i) => chooseBatchSize(createRng(`prev-${previous}-${i}`), previous))
      assert.ok(sizes.every((size) => size !== previous && size >= 1 && size <= 100), `previous ${previous}`)
    }
    // A previous size outside the range excludes nothing.
    assert.ok(Array.from({ length: 300 }, (_, i) => chooseBatchSize(createRng(`out-${i}`), 500)).every((size) => size >= 1 && size <= 100))
  })

  test('a batch has exactly the size it is given, or a random size in range', () => {
    for (const size of [1, 2, 3, 4, 17, 100]) assert.equal(batch({ size }).transactions.length, size)
    const random = batch({ seed: 'random-size' })
    assert.equal(random.transactions.length, random.meta.size)
    assert.ok(random.meta.size >= 1 && random.meta.size <= 100)
    for (const size of [0, 101, 2.5, -4]) assert.throws(() => batch({ size }), /holds 1–100/)
  })

  test('the controlled cases are part of a batch from three requests up', () => {
    assert.equal(CONTROLLED_CASE_COUNT, 3)
    for (const size of [1, 2]) assert.equal(batch({ size }).transactions.filter((tx) => tx.verificationCase).length, 0, `size ${size}`)
    for (const size of [3, 4, 40, 100]) {
      const controlled = batch({ size }).transactions.filter((tx) => tx.verificationCase)
      assert.deepEqual(controlled.map((tx) => tx.verificationCase).sort(), ['FRAUD', 'GREY', 'LEGITIMATE'], `size ${size}`)
    }
  })
})

describe('class mix', () => {
  test('each batch draws its shares from the target ranges and they sum to one', () => {
    for (let i = 0; i < 300; i += 1) {
      const mix = chooseBatchMix(createRng(`mix-${i}`))
      assert.ok(Math.abs(Object.values(mix).reduce((sum, share) => sum + share, 0) - 1) < 1e-9)
      for (const [riskClass, [low, high]] of Object.entries(BATCH_MIX_RANGES)) assert.ok(mix[riskClass] >= low && mix[riskClass] <= high, riskClass)
      assert.ok(mix.legit_normal >= 0.5 && mix.legit_normal <= 0.65)
    }
  })

  test('across batches the average mix is roughly 60 / 22 / 12 / 7, and it varies from batch to batch', () => {
    const shares = Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, []]))
    for (let i = 0; i < 100; i += 1) {
      const { transactions } = batch({ seed: `mix-batch-${i}`, size: 100 })
      const counts = batchClasses(transactions)
      for (const riskClass of RISK_CLASSES) shares[riskClass].push(counts[riskClass] / transactions.length)
    }
    const mean = Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, average(shares[riskClass])]))
    assert.ok(mean.legit_normal > 0.5 && mean.legit_normal < 0.66, `normal ${mean.legit_normal}`)
    assert.ok(mean.legit_unusual > 0.19 && mean.legit_unusual < 0.26, `unusual ${mean.legit_unusual}`)
    assert.ok(mean.suspicious > 0.09 && mean.suspicious < 0.16, `suspicious ${mean.suspicious}`)
    assert.ok(mean.fraudulent > 0.05 && mean.fraudulent < 0.11, `fraudulent ${mean.fraudulent}`)
    for (const riskClass of RISK_CLASSES) assert.ok(new Set(shares[riskClass].map((share) => share.toFixed(2))).size > 3, `${riskClass} varies`)
  })

  test('every class is present in a large batch, and the batch records what it holds', () => {
    const { transactions, meta } = batch({ size: 100 })
    const counts = batchClasses(transactions)
    for (const riskClass of RISK_CLASSES) assert.ok(counts[riskClass] > 0, riskClass)
    assert.equal(meta.controlled, 3)
    assert.equal(Object.values(meta.generated).reduce((sum, count) => sum + count, 0), 97)
    for (const riskClass of RISK_CLASSES) assert.equal(transactions.filter((tx) => tx.demoScenario?.riskClass === riskClass).length, meta.generated[riskClass])
  })
})

describe('generated requests', () => {
  const { transactions } = batch({ size: 100 })
  const generated = transactions.filter((tx) => tx.demoScenario)
  const controlledKeys = Object.keys(createDemoRequests(USER, { now: NOW })[0])

  test('have the transaction shape the app already uses', () => {
    assert.equal(generated.length, 97)
    for (const tx of generated) {
      for (const key of controlledKeys) assert.ok(key in tx, `${tx.reference} lacks ${key}`)
      assert.equal(tx.type, 'STANDING_ORDER')
      assert.equal(tx.direction, 'OUT')
      assert.equal(tx.currency, 'MUR')
      assert.equal(tx.status, 'PENDING')
      assert.equal(tx.requiresApproval, true)
      assert.equal(tx.verificationCase, null)
      assert.equal(tx.demoRun, 1)
      assert.equal(tx.analysis, null)
      assert.equal(tx.decision, null)
      assert.equal(tx.proof, null)
      assert.match(tx.id, /^txn_[0-9a-f]{16}$/)
      assert.match(tx.reference, /^SO-\d{5}$/)
      assert.ok(Number.isFinite(tx.amount) && tx.amount > 0)
      assert.ok(tx.frequency in FREQUENCY_LABELS)
      assert.ok(RECIPIENT_BANKS.includes(tx.recipientBank))
      assert.ok(CHANNELS.includes(tx.context.channel))
      // A request made without a device (a branch visit, say) has none.
      assert.ok(tx.context.deviceId === null || typeof tx.context.deviceId === 'string')
      assert.ok(Number.isFinite(new Date(tx.date).getTime()) && Number.isFinite(new Date(tx.context.initiatedAt).getTime()))
      assert.equal(typeof tx.requestText, 'string')
      assert.equal(typeof tx.recipient, 'string')
    }
  })

  test('are unique, queued in order, pending, and never dated in the future', () => {
    assert.equal(new Set(transactions.map((tx) => tx.id)).size, 100)
    assert.equal(new Set(transactions.map((tx) => tx.reference)).size, 100)
    assert.deepEqual(transactions.map((tx) => tx.queuePosition), Array.from({ length: 100 }, (_, i) => i))
    for (const tx of transactions) {
      assert.ok(new Date(tx.context.initiatedAt) <= NOW, `${tx.reference} initiated after now`)
      assert.ok(new Date(tx.createdAt) <= NOW)
    }
  })

  test('vary across the fields the fraud pipeline looks at', () => {
    const distinct = (pick) => new Set(generated.map(pick)).size
    assert.ok(distinct((tx) => tx.recipient) >= 25, 'recipients')
    assert.ok(distinct((tx) => tx.amount) >= 30, 'amounts')
    assert.ok(distinct((tx) => tx.frequency) >= 2, 'frequencies')
    assert.ok(distinct((tx) => tx.recipientBank) >= 2, 'banks')
    assert.ok(distinct((tx) => tx.context.channel) >= 2, 'channels')
    assert.ok(distinct((tx) => tx.context.deviceId) >= 3, 'devices')
    assert.ok(distinct((tx) => new Date(tx.context.initiatedAt).getUTCHours()) >= 6, 'hours')
    assert.ok(distinct((tx) => tx.demoScenario.scenario) >= 15, 'scenarios')
    assert.ok(generated.filter((tx) => tx.requestText === '').length >= 5, 'requests without wording')
    assert.ok(generated.filter((tx) => tx.requestText !== '').length >= 30, 'requests with wording')
    assert.ok(generated.some((tx) => tx.context.beneficiaryAddedMinutesBefore != null), 'recently added payees')
  })

  test('mix payees the user already pays with new ones', () => {
    const known = new Set(deriveUserProfile(HISTORY).knownRecipients.map((recipient) => recipient.name))
    assert.ok(generated.filter((tx) => known.has(tx.recipient)).length >= 10)
    assert.ok(generated.filter((tx) => !known.has(tx.recipient)).length >= 10)
  })

  test('stay fictional: made-up payees and reserved .example links only', () => {
    for (const tx of generated) {
      for (const [host] of tx.requestText.matchAll(/https?:\/\/[^\s/]+/g)) assert.match(host, /\.example$/, `${tx.reference}: ${host}`)
      assert.doesNotMatch(tx.requestText, /\b\d{13,19}\b/)
    }
  })

  test('the scenarios come from the synthetic library: all of them are reachable', () => {
    const all = new Set()
    for (let i = 0; i < 40; i += 1) scenarioIds(batch({ seed: `library-${i}`, size: 100 }).transactions).forEach((id) => all.add(id))
    assert.deepEqual([...all].sort(), SCENARIOS.map((scenario) => scenario.id).sort())
  })
})

describe('determinism', () => {
  const strip = ({ id, ...rest }) => rest

  test('the same seed and clock give the same batch; another seed gives another', () => {
    const generatedOnly = (result) => result.transactions.filter((tx) => tx.demoScenario)
    assert.deepEqual(generatedOnly(batch({ seed: 'same', size: 60 })), generatedOnly(batch({ seed: 'same', size: 60 })))
    assert.notDeepEqual(generatedOnly(batch({ seed: 'same', size: 60 })).map(strip), generatedOnly(batch({ seed: 'other', size: 60 })).map(strip))
  })

  test('the app persona is read from the seed ledger, so requests are judged against real habits', () => {
    const profile = deriveUserProfile(HISTORY)
    const persona = createAppPersona(HISTORY, profile)
    const known = new Map(profile.knownRecipients.map((recipient) => [recipient.name, recipient]))
    assert.equal(persona.standingOrders.length, 4)
    for (const order of persona.standingOrders) {
      const recipient = known.get(order.payee.name)
      assert.ok(recipient, order.payee.name)
      assert.equal(order.amount, recipient.standingOrder.amount)
      assert.equal(order.frequency, recipient.standingOrder.frequency)
      assert.equal(order.dayOfMonth, recipient.standingOrder.dayOfMonth)
    }
    assert.deepEqual(persona.devices, profile.knownDevices)
    assert.deepEqual(persona.activeWindow, profile.activeHours)
    assert.equal(persona.usualChannel, profile.usualChannel)
  })
})

describe('the synthetic dataset and model are untouched', () => {
  test('the default dataset still has the hash the model was trained on', () => {
    const artifact = JSON.parse(readFileSync(new URL('../../models/fraud-model.json', import.meta.url), 'utf8'))
    const text = generateDataset().records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    assert.equal(createHash('sha256').update(text).digest('hex'), artifact.dataset.sha256)
    assert.equal(artifact.modelVersion, 'fraud-lr-1.1.0')
  })
})
