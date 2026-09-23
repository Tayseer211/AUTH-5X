import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../../data/demoCases.js'
import { RECIPIENT_BANKS, RECIPIENT_BANK_LABELS } from '../../data/recipientBanks.js'
import { createSeedTransactions } from '../../data/seedTransactions.js'
import { extractFeatures } from '../features.js'
import { deriveUserProfile } from '../profile.js'
import { GENERATOR_VERSION, generateDataset } from '../synthetic/generator.js'
import { BENCHMARK_FIELDS, DERIVED_FEATURES, ID_FIELDS, LABEL_FIELDS, RAW_FEATURES } from '../synthetic/schema.js'
import { EXCLUDED_FIELDS, MODEL_FEATURES } from './featureSpec.js'
import { trainLogisticRegression } from './logistic.js'
import { averagePrecision, classificationMetrics, confusionMatrix, rocAuc } from './metrics.js'
import { MODEL_TYPE, loadFraudModel, predictFraud, predictFraudForRequest } from './predict.js'
import { MISSING_LEVEL, fitPreprocessor, transformFeatures } from './preprocess.js'
import { recordSplit, userSplit } from './split.js'
import { assertTrainable, trainFraudModel } from './train.js'

const small = generateDataset({ seed: 'ml-test', users: 60, standingOrders: 600 })
const records = small.records
const trained = trainFraudModel(records, { seed: 'ml-test-split', l2Grid: [0.001, 0.01] })

const FORBIDDEN_INPUTS = ['isFraud', 'riskClass', 'scenario', 'ruleEngineScore', 'ruleEngineRiskLevel', 'standingOrderId', 'userId']

describe('feature selection', () => {
  test('every schema field is either a model input or explicitly excluded, never both', () => {
    const inputs = new Set(MODEL_FEATURES.map((feature) => feature.name))
    for (const spec of [...ID_FIELDS, ...RAW_FEATURES, ...DERIVED_FEATURES, ...LABEL_FIELDS, ...BENCHMARK_FIELDS]) {
      const excluded = spec.name in EXCLUDED_FIELDS
      assert.ok(inputs.has(spec.name) !== excluded, `${spec.name}: input=${inputs.has(spec.name)} excluded=${excluded}`)
    }
    assert.equal(inputs.size, MODEL_FEATURES.length, 'no duplicate inputs')
  })

  test('labels, scenario, riskClass, benchmark scores and IDs are never inputs', () => {
    const inputs = MODEL_FEATURES.map((feature) => feature.name)
    for (const name of FORBIDDEN_INPUTS) assert.ok(!inputs.includes(name), name)
    for (const spec of [...ID_FIELDS, ...LABEL_FIELDS, ...BENCHMARK_FIELDS]) assert.ok(spec.name in EXCLUDED_FIELDS, spec.name)
    for (const name of ['deviceId', 'recipient', 'recipientAccount']) assert.ok(!inputs.includes(name), name)
  })

  test('inputs come only from the raw and derived feature sections', () => {
    for (const feature of MODEL_FEATURES) assert.ok(['raw', 'derived'].includes(feature.source), feature.name)
  })

  test('the fitted encoder and the trained artifact expose no forbidden column', () => {
    for (const column of trained.artifact.model.preprocessing.columns) {
      for (const name of FORBIDDEN_INPUTS) assert.ok(!column.startsWith(name), column)
    }
    for (const feature of trained.artifact.features) assert.ok(!FORBIDDEN_INPUTS.includes(feature.name), feature.name)
  })
})

describe('preprocessing', () => {
  const specs = [
    { source: 'raw', name: 'amount', kind: 'numeric', transform: 'log1p', nullable: false },
    { source: 'raw', name: 'recipientLastPaidDaysAgo', kind: 'numeric', nullable: true },
    { source: 'derived', name: 'newDevice', kind: 'boolean' },
    { source: 'raw', name: 'channel', kind: 'category' },
    { source: 'raw', name: 'initiatedHour', kind: 'cyclic', period: 24 },
  ]
  const rows = [
    { raw: { amount: 100, recipientLastPaidDaysAgo: 10, channel: 'MOBILE_APP', initiatedHour: 0 }, derived: { newDevice: false } },
    { raw: { amount: 1000, recipientLastPaidDaysAgo: null, channel: 'ONLINE_BANKING', initiatedHour: 12 }, derived: { newDevice: true } },
    { raw: { amount: 10000, recipientLastPaidDaysAgo: 30, channel: null, initiatedHour: 23 }, derived: { newDevice: false } },
  ]
  const pre = fitPreprocessor(rows, specs)

  test('numeric features are transformed, median-imputed and standardised', () => {
    const amount = pre.features[0]
    assert.equal(amount.median, Math.round(Math.log1p(1000) * 1e8) / 1e8)
    const values = rows.map((row) => transformFeatures(pre, row).vector[0])
    assert.ok(Math.abs(values.reduce((a, b) => a + b, 0)) < 1e-6, 'mean ≈ 0 on training data')
    assert.ok(values[0] < values[1] && values[1] < values[2])
  })

  test('nullable numerics get a missing indicator and the training median', () => {
    const columns = pre.columns
    const { vector } = transformFeatures(pre, rows[1])
    assert.equal(vector[columns.indexOf('recipientLastPaidDaysAgo__missing')], 1)
    assert.equal(pre.features[1].median, 20)
    assert.equal(vector[columns.indexOf('recipientLastPaidDaysAgo')], (20 - pre.features[1].mean) / pre.features[1].sd)
  })

  test('categories are one-hot over training levels, with null as its own level', () => {
    assert.deepEqual(pre.features[3].levels, [MISSING_LEVEL, 'MOBILE_APP', 'ONLINE_BANKING'].sort())
    const { vector, warnings } = transformFeatures(pre, { ...rows[0], raw: { ...rows[0].raw, channel: 'CARRIER_PIGEON' } })
    const oneHot = pre.columns.map((column, i) => [column, vector[i]]).filter(([column]) => column.startsWith('channel='))
    assert.ok(oneHot.every(([, value]) => value === 0), 'unseen category encodes as all zeros')
    assert.match(warnings.join(), /channel: unseen category/)
  })

  test('booleans are 0/1 and hours are cyclic (23:00 is next to 00:00)', () => {
    const at = (row) => transformFeatures(pre, row).vector
    const sin = pre.columns.indexOf('initiatedHour__sin')
    const distance = (a, b) => Math.hypot(at(a)[sin] - at(b)[sin], at(a)[sin + 1] - at(b)[sin + 1])
    assert.ok(distance(rows[0], rows[2]) < distance(rows[0], rows[1]))
    assert.equal(at(rows[1])[pre.columns.indexOf('newDevice')], 1)
  })

  test('the vector has one value per column and ignores labels, benchmark and IDs', () => {
    const record = records[0]
    const base = transformFeatures(trained.artifact.model.preprocessing, record).vector
    assert.equal(base.length, trained.artifact.model.preprocessing.columns.length)
    const tampered = {
      ...record,
      standingOrderId: 'X',
      userId: 'Y',
      labels: { isFraud: !record.labels.isFraud, riskClass: 'fraudulent', scenario: 'bank_impersonation' },
      benchmark: { ruleEngineScore: 0, ruleEngineRiskLevel: 'HIGH' },
    }
    assert.deepEqual(transformFeatures(trained.artifact.model.preprocessing, tampered).vector, base)
  })
})

describe('logistic regression', () => {
  const X = Array.from({ length: 200 }, (_, i) => [((i * 37) % 200) / 50 - 2, ((i * 11) % 7) / 7])
  const y = X.map(([a], i) => (a + ((i * 13) % 5) / 5 - 0.4 > 0.5 ? 1 : 0))

  test('learns the direction of a signal and outputs probabilities', () => {
    const fit = trainLogisticRegression(X, y, { l2: 0.01 })
    assert.ok(fit.converged)
    assert.ok(fit.weights[0] > 1)
  })

  test('is deterministic', () => {
    assert.deepEqual(trainLogisticRegression(X, y, { l2: 0.01 }), trainLogisticRegression(X, y, { l2: 0.01 }))
  })

  test('stronger L2 shrinks the weights', () => {
    assert.ok(Math.abs(trainLogisticRegression(X, y, { l2: 1 }).weights[0]) < Math.abs(trainLogisticRegression(X, y, { l2: 0.001 }).weights[0]))
  })

  test('refuses single-class labels', () => {
    assert.throws(() => trainLogisticRegression(X, y.map(() => 0)), /both classes/)
  })
})

describe('metrics', () => {
  const labels = [true, true, false, false, false]
  const scores = [0.9, 0.4, 0.6, 0.2, 0.1]

  test('confusion matrix, precision, recall, F1', () => {
    const confusion = confusionMatrix(labels, scores, 0.5)
    assert.deepEqual(confusion, { truePositives: 1, falsePositives: 1, trueNegatives: 2, falseNegatives: 1 })
    const m = classificationMetrics(confusion)
    assert.equal(m.precision, 0.5)
    assert.equal(m.recall, 0.5)
    assert.equal(m.f1, 0.5)
    assert.equal(m.accuracy, 0.6)
  })

  test('ROC-AUC and average precision', () => {
    assert.equal(rocAuc(labels, scores), 5 / 6)
    assert.equal(rocAuc([true, false], [1, 0]), 1)
    assert.equal(rocAuc([true, false], [0, 1]), 0)
    assert.equal(rocAuc([true, false], [0.5, 0.5]), 0.5)
    assert.equal(averagePrecision([true, false, true], [0.9, 0.1, 0.8]), 1)
  })
})

describe('splits', () => {
  test('user split: every record once, no user in two splits, fraud in every split', () => {
    const splits = userSplit(records, { seed: 's' })
    assert.equal(splits.train.length + splits.validation.length + splits.test.length, records.length)
    const usersOf = (split) => new Set(splits[split].map((record) => record.userId))
    for (const [a, b] of [['train', 'validation'], ['train', 'test'], ['validation', 'test']]) {
      for (const user of usersOf(a)) assert.ok(!usersOf(b).has(user), `${user} in ${a} and ${b}`)
    }
    for (const split of ['train', 'validation', 'test']) assert.ok(splits[split].some((record) => record.labels.isFraud), split)
    assert.ok(Math.abs(splits.train.length / records.length - 0.6) < 0.1)
  })

  test('record split is stratified', () => {
    const splits = recordSplit(records, { seed: 's' })
    const rate = (list) => list.filter((record) => record.labels.isFraud).length / list.length
    for (const split of ['train', 'validation', 'test']) assert.ok(Math.abs(rate(splits[split]) - rate(records)) < 0.02, split)
  })

  test('splits are reproducible from the seed', () => {
    const ids = (splits) => splits.test.map((record) => record.standingOrderId)
    assert.deepEqual(ids(userSplit(records, { seed: 's' })), ids(userSplit(records, { seed: 's' })))
    assert.notDeepEqual(ids(userSplit(records, { seed: 's' })), ids(userSplit(records, { seed: 't' })))
  })
})

describe('training', () => {
  test('the model is trained, tuned and tested on disjoint users', () => {
    const users = (split) => new Set(trained.splits[split].map((record) => record.userId))
    for (const [a, b] of [['train', 'validation'], ['train', 'test'], ['validation', 'test']]) {
      for (const user of users(a)) assert.ok(!users(b).has(user), `${user} in ${a} and ${b}`)
    }
    assert.equal(trained.artifact.training.split, 'user')
  })

  test('is deterministic: the same records and options give the same artifact', () => {
    const again = trainFraudModel(records, { seed: 'ml-test-split', l2Grid: [0.001, 0.01] })
    assert.deepEqual(again.artifact, trained.artifact)
  })

  test('scenario, riskClass and benchmark scores have no influence on the model', () => {
    const scrambled = records.map((record, i) => ({
      ...record,
      labels: { ...record.labels, riskClass: 'legit_normal', scenario: `s${i % 3}` },
      benchmark: { ruleEngineScore: i % 101, ruleEngineRiskLevel: 'LOW' },
    }))
    const model = trainFraudModel(scrambled, { seed: 'ml-test-split', l2Grid: [0.001, 0.01] }).artifact.model
    assert.deepEqual(model, trained.artifact.model)
  })

  test('the artifact carries metadata but no training records', () => {
    const { artifact } = trained
    assert.equal(artifact.modelType, MODEL_TYPE)
    assert.ok(artifact.modelVersion)
    assert.equal(artifact.training.seed, 'ml-test-split')
    assert.equal(artifact.training.split, 'user')
    assert.equal(artifact.training.sizes.train.records + artifact.training.sizes.validation.records + artifact.training.sizes.test.records, records.length)
    assert.ok(artifact.evaluation.test.ml.rocAuc > 0.5)
    assert.ok(artifact.thresholds.candidate.threshold > 0 && artifact.thresholds.candidate.threshold < 1)
    const text = JSON.stringify(artifact)
    assert.ok(!/SYN-SO-\d/.test(text), 'no record IDs')
    assert.ok(!/SYN-U\d/.test(text), 'no user IDs')
    assert.ok(!text.includes(records[0].raw.recipient), 'no payee names')
  })

  test('only synthetic dataset records are accepted — never the app\'s demo cases', () => {
    const now = new Date('2026-09-23T08:00:00Z')
    const history = createSeedTransactions(now)
    const profile = deriveUserProfile(history)
    const demo = createDemoRequests({ bank: { code: 'MCB' } }, { now }).map((request) => ({
      standingOrderId: request.id,
      ...extractFeatures(request, { history, profile }),
      labels: { isFraud: request.verificationCase === 'FRAUD' },
    }))
    assert.throws(() => assertTrainable(demo), /Not a synthetic dataset record/)
    assert.throws(() => trainFraudModel([...records, ...demo]), /Not a synthetic dataset record/)
    assert.throws(() => assertTrainable([{ ...records[0], labels: {} }]), /no isFraud label/)
  })
})

describe('prediction interface', () => {
  const model = loadFraudModel(trained.artifact)

  test('returns a probability between 0 and 1 and the model version', () => {
    for (const record of records.slice(0, 200)) {
      const result = predictFraud(model, { raw: record.raw, derived: record.derived })
      assert.ok(result.fraudProbability >= 0 && result.fraudProbability <= 1)
      assert.equal(result.modelVersion, trained.artifact.modelVersion)
      assert.deepEqual(result.warnings, [])
    }
  })

  test('scores are continuous, not a few fixed outcomes', () => {
    const scores = new Set(records.map((record) => predictFraud(model, record).fraudProbability.toFixed(3)))
    assert.ok(scores.size > 50)
  })

  test('a pending app request goes request → extractFeatures → prediction', () => {
    const now = new Date('2026-09-23T08:00:00Z')
    const history = createSeedTransactions(now)
    const profile = deriveUserProfile(history)
    for (const request of createDemoRequests({ bank: { code: 'MCB' } }, { now })) {
      const direct = predictFraudForRequest(model, request, { history, profile })
      assert.deepEqual(direct, predictFraud(model, extractFeatures(request, { history, profile })))
      assert.ok(direct.fraudProbability >= 0 && direct.fraudProbability <= 1)
      // Demo requests carry canonical bank codes, so nothing is out of vocabulary.
      assert.deepEqual(direct.warnings, [], request.verificationCase)
    }
  })

  test('recipient bank display labels and canonical codes give the same prediction', () => {
    const now = new Date('2026-09-23T08:00:00Z')
    const history = createSeedTransactions(now)
    const profile = deriveUserProfile(history)
    const [request] = createDemoRequests({ bank: { code: 'MCB' } }, { now })
    for (const [code, label] of Object.entries(RECIPIENT_BANK_LABELS)) {
      const byCode = predictFraudForRequest(model, { ...request, recipientBank: code }, { history, profile })
      const byLabel = predictFraudForRequest(model, { ...request, recipientBank: label }, { history, profile })
      assert.deepEqual(byLabel, byCode, label)
      assert.deepEqual(byCode.warnings, [])
    }
    const unknown = predictFraudForRequest(model, { ...request, recipientBank: 'Moon bank' }, { history, profile })
    assert.ok(unknown.warnings.some((warning) => warning.startsWith('recipientBank: unseen category')))
  })

  test('loading rejects malformed artifacts', () => {
    assert.throws(() => loadFraudModel({ modelType: 'neural-net' }), /logistic-regression/)
    const broken = structuredClone(trained.artifact)
    broken.model.weights.pop()
    assert.throws(() => loadFraudModel(broken), /do not match/)
  })
})

describe('committed model artifact', () => {
  const artifact = JSON.parse(readFileSync(new URL('../../../models/fraud-model.json', import.meta.url), 'utf8'))

  test('loads, uses the current feature list and is marked synthetic', () => {
    const model = loadFraudModel(artifact)
    assert.equal(artifact.synthetic, true)
    assert.deepEqual(
      artifact.features.map((feature) => feature.name),
      MODEL_FEATURES.map((feature) => feature.name),
    )
    const result = predictFraud(model, records[0])
    assert.ok(result.fraudProbability >= 0 && result.fraudProbability <= 1)
  })

  test('its encoding matches the dataset schema (canonical banks, current generator)', () => {
    const feature = (name) => artifact.model.preprocessing.features.find((candidate) => candidate.name === name)
    assert.deepEqual(feature('recipientBank').levels, [...RECIPIENT_BANKS, MISSING_LEVEL].sort())
    for (const spec of MODEL_FEATURES.filter((candidate) => candidate.kind === 'category')) {
      for (const value of spec.values) assert.ok(feature(spec.name).levels.includes(value === null ? MISSING_LEVEL : String(value)), `${spec.name}=${value}`)
    }
    assert.equal(artifact.dataset.generatorVersion, GENERATOR_VERSION)
    assert.equal(artifact.model.weights.length, artifact.model.preprocessing.columns.length)
  })

  test('is reproduced exactly by retraining on the default dataset', () => {
    const { records: defaultRecords } = generateDataset()
    const { artifact: retrained } = trainFraudModel(defaultRecords)
    assert.deepEqual(retrained.model, artifact.model)
    assert.deepEqual(retrained.thresholds.candidate, artifact.thresholds.candidate)
    assert.deepEqual(retrained.evaluation.test, artifact.evaluation.test)
  })
})
