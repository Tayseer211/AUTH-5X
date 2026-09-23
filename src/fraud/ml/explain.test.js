import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../../data/demoCases.js'
import { createSeedTransactions } from '../../data/seedTransactions.js'
import { extractFeatures } from '../features.js'
import { deriveUserProfile } from '../profile.js'
import { DEFAULT_MODEL } from './defaultModel.js'
import { MODEL_NOTICE, bandFor, bandThresholds, columnFeature, explainPrediction, historyAsOf, prepareModel, transactionModelEstimate } from './explain.js'
import { predictFraud } from './predict.js'

const ARTIFACT = JSON.parse(readFileSync(new URL('../../../models/fraud-model.json', import.meta.url), 'utf8'))
// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const AS_OF = NOW.toISOString()
const HISTORY = [...createSeedTransactions(NOW), ...createDemoRequests({ bank: { code: 'MCB' } }, { now: NOW })]
const PROFILE = deriveUserProfile(HISTORY)
const DEMO = Object.fromEntries(HISTORY.filter((tx) => tx.verificationCase).map((tx) => [tx.verificationCase, tx]))
const estimateFor = (request, model = DEFAULT_MODEL, asOf = AS_OF, history = HISTORY) => transactionModelEstimate(model, request, { history, profile: PROFILE, asOf }).snapshot

describe('model explanation', () => {
  test('contributions add up to the logit and match predictFraud', () => {
    for (const request of Object.values(DEMO)) {
      const features = extractFeatures(request, { history: HISTORY, profile: PROFILE })
      const { logit, estimate, contributions } = explainPrediction(DEFAULT_MODEL, features)
      const sum = DEFAULT_MODEL.bias + contributions.reduce((total, item) => total + item.logit, 0)
      assert.ok(Math.abs(sum - logit) < 1e-9)
      assert.ok(Math.abs(estimate - predictFraud(DEFAULT_MODEL, features).fraudProbability) < 1e-12)
    }
  })

  test('every encoded column maps to a model feature', () => {
    const features = new Set(DEFAULT_MODEL.preprocessing.features.map((feature) => feature.name))
    for (const column of DEFAULT_MODEL.preprocessing.columns) assert.ok(features.has(columnFeature(column)), column)
  })

  test('band thresholds come from the artifact and the edges are inclusive', () => {
    assert.deepEqual(bandThresholds(ARTIFACT.thresholds), { elevated: 0.05, high: 0.6 })
    assert.deepEqual(DEFAULT_MODEL.bandThresholds, { elevated: 0.05, high: 0.6 })
    const thresholds = DEFAULT_MODEL.bandThresholds
    assert.equal(bandFor(0.0499, thresholds), 'LOW')
    assert.equal(bandFor(0.05, thresholds), 'ELEVATED')
    assert.equal(bandFor(0.5999, thresholds), 'ELEVATED')
    assert.equal(bandFor(0.6, thresholds), 'HIGH')
    assert.throws(() => bandThresholds({}), /band thresholds/)
  })

  test('an invalid artifact is rejected', () => {
    assert.throws(() => prepareModel({ ...ARTIFACT, modelType: 'other' }), /logistic-regression/)
    assert.throws(() => prepareModel({ ...ARTIFACT, model: { ...ARTIFACT.model, weights: [1] } }), /weights/)
  })
})

describe('transaction-only model estimate', () => {
  test('the demo estimates, message removed', () => {
    const snapshots = Object.fromEntries(Object.entries(DEMO).map(([key, request]) => [key, estimateFor(request)]))
    assert.deepEqual(
      Object.fromEntries(Object.entries(snapshots).map(([key, snapshot]) => [key, [snapshot.status, snapshot.estimate, snapshot.band]])),
      { LEGITIMATE: ['AVAILABLE', 0.0046, 'LOW'], GREY: ['AVAILABLE', 0.0958, 'ELEVATED'], FRAUD: ['AVAILABLE', 0.9999, 'HIGH'] },
    )
    for (const snapshot of Object.values(snapshots)) {
      assert.equal(snapshot.notice, MODEL_NOTICE)
      assert.equal(snapshot.modelVersion, 'fraud-lr-1.1.0')
      assert.equal(snapshot.asOf, AS_OF)
      assert.equal(snapshot.input, 'request without message text')
    }
  })

  test('with the message kept, the estimate matches the artifact’s recorded demo predictions', () => {
    for (const { demoCase, fraudProbability } of ARTIFACT.demoRequests.predictions) {
      const features = extractFeatures(DEMO[demoCase], { history: HISTORY, profile: PROFILE })
      assert.equal(Math.round(explainPrediction(DEFAULT_MODEL, features).estimate * 1e4) / 1e4, fraudProbability, demoCase)
    }
  })

  test('the message never reaches the model', () => {
    const scam = { ...DEMO.LEGITIMATE, requestText: 'MCB ALERT: your account will be suspended today. Reply with the one-time code.' }
    assert.deepEqual(estimateFor(scam), estimateFor(DEMO.LEGITIMATE))
  })

  test('reproducible for a fixed asOf; later ledger entries are ignored', () => {
    const first = estimateFor(DEMO.GREY)
    assert.deepEqual(estimateFor(DEMO.GREY), first)
    const later = { ...HISTORY.find((tx) => tx.status === 'APPROVED'), id: 'later', recipient: 'Harbourline Property Management', amount: 90000, createdAt: '2026-12-01T00:00:00.000Z' }
    assert.deepEqual(estimateFor(DEMO.GREY, DEFAULT_MODEL, AS_OF, [...HISTORY, later]), first)
    // Even a profile derived from the later ledger is not used: the profile is
    // rebuilt from the history as of asOf.
    const laterHistory = [...HISTORY, later]
    const laterProfile = deriveUserProfile(laterHistory)
    assert.notEqual(laterProfile.averageAmount, PROFILE.averageAmount)
    assert.deepEqual(transactionModelEstimate(DEFAULT_MODEL, DEMO.GREY, { history: laterHistory, profile: laterProfile, asOf: AS_OF }).snapshot, first)
    assert.deepEqual(historyAsOf([...HISTORY, later], AS_OF), HISTORY.filter((tx) => new Date(tx.createdAt) <= NOW))
    assert.throws(() => historyAsOf(HISTORY, 'not a date'), /Invalid asOf/)
  })

  test('explanations are ranked and serialisable', () => {
    const { contributions } = estimateFor(DEMO.FRAUD)
    const positive = contributions.filter((item) => item.logit > 0)
    assert.ok(positive.length <= 5 && contributions.length - positive.length <= 3)
    assert.deepEqual([...positive].sort((a, b) => b.logit - a.logit), positive)
    assert.equal(positive[0].feature, 'riskSignalCount')
    const snapshot = estimateFor(DEMO.FRAUD)
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot)
  })

  test('an out-of-distribution input makes the estimate unavailable', () => {
    const odd = { ...DEMO.LEGITIMATE, recipientBank: 'MOON_BANK' }
    const snapshot = estimateFor(odd)
    assert.equal(snapshot.status, 'UNAVAILABLE')
    assert.equal(snapshot.estimate, null)
    assert.equal(snapshot.band, null)
    assert.ok(snapshot.warnings.length > 0)
  })

  test('the explanation code never reads the clock', () => {
    const source = readFileSync(new URL('./explain.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /new Date\(\)|Date\.now/)
  })
})
