import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import {
  ENGINE_LEVEL_CUTOFFS,
  HYBRID_RULES,
  aggregate,
  contradictionFamily,
  levelForScore,
  messageFamily,
  modelAgreement,
  rulesExcludingLanguage,
  transactionFamily,
} from './aggregation.js'
import { analyseStandingOrder } from './engine.js'
import { deriveUserProfile } from './profile.js'
import { generateDataset } from './synthetic/generator.js'

const NONE_MESSAGE = { strength: 'NONE', classification: null, corroboratedSuspicious: 0 }
const NONE_CONTRADICTION = { strength: 'NONE', strongConflicts: 0, weakConflicts: 0 }
const message = (strength) => ({ ...NONE_MESSAGE, strength })
const contradiction = (strength, strongConflicts = strength === 'STRONG' ? 1 : 0) => ({ strength, strongConflicts, weakConflicts: strength === 'WEAK' ? 1 : 0 })

// One scenario through the policy: R, model band, message, contradiction,
// and the original engine level for the floor.
function run({ rules, band = null, msg = NONE_MESSAGE, con = NONE_CONTRADICTION, engine = rules }) {
  return aggregate({ engineLevel: engine, rulesLevel: rules, transaction: transactionFamily(rules, band), message: msg, contradiction: con })
}

describe('engine parity', () => {
  test('levelForScore reproduces the engine’s own levels', () => {
    const now = new Date('2026-09-23T08:00:00Z')
    const history = [...createSeedTransactions(now), ...createDemoRequests({ bank: { code: 'MCB' } }, { now })]
    const profile = deriveUserProfile(history)
    for (const request of history.filter((tx) => tx.verificationCase)) {
      const analysis = analyseStandingOrder(request, profile)
      assert.equal(levelForScore(analysis.score), analysis.riskLevel)
    }
    // The synthetic dataset records the engine's score and level for every request.
    const { records } = generateDataset({ users: 40, standingOrders: 500 })
    for (const record of records) assert.equal(levelForScore(record.benchmark.ruleEngineScore), record.benchmark.ruleEngineRiskLevel)
    assert.deepEqual(ENGINE_LEVEL_CUTOFFS, { low: 85, medium: 40 })
  })

  test('the rules baseline drops only the language check and uses the engine’s weighting', () => {
    const analysis = {
      checks: [
        { id: 'amount', weight: 25, score: 1 },
        { id: 'frequency', weight: 10, score: 1 },
        { id: 'recipient', weight: 20, score: 1 },
        { id: 'behaviour', weight: 25, score: 0.66 },
        { id: 'language', weight: 15, score: 0 },
        { id: 'expected', weight: 5, score: 1 },
      ],
    }
    const baseline = rulesExcludingLanguage(analysis)
    assert.deepEqual(baseline.checks, ['amount', 'frequency', 'recipient', 'behaviour', 'expected'])
    assert.equal(baseline.score, 90)
    assert.equal(baseline.level, 'LOW')
  })
})

describe('transaction family: rules and model are one vote', () => {
  test('the model alone cannot raise LOW', () => {
    for (const band of ['ELEVATED', 'HIGH']) {
      const result = run({ rules: 'LOW', band })
      assert.equal(result.level, 'LOW', band)
      assert.deepEqual(result.rules, [])
    }
    assert.equal(modelAgreement('LOW', 'HIGH'), 'MODEL_HIGHER')
  })

  test('the model never lowers the level', () => {
    assert.equal(run({ rules: 'HIGH', band: 'LOW' }).level, 'HIGH')
    assert.equal(run({ rules: 'MEDIUM', band: 'LOW' }).level, 'MEDIUM')
    assert.equal(modelAgreement('HIGH', 'LOW'), 'MODEL_LOWER')
    assert.equal(modelAgreement('MEDIUM', 'ELEVATED'), 'AGREES')
    assert.equal(modelAgreement('MEDIUM', null), 'UNAVAILABLE')
  })

  test('rules MEDIUM with a HIGH model is still one family: MEDIUM on its own', () => {
    const result = run({ rules: 'MEDIUM', band: 'HIGH' })
    assert.deepEqual(transactionFamily('MEDIUM', 'HIGH'), { strength: 'STRONG', strengthened: true })
    assert.equal(result.level, 'MEDIUM')
    assert.deepEqual(result.rules, ['transaction.medium'])
  })

  test('the model can strengthen a MEDIUM transaction when another family is strong (H4)', () => {
    assert.equal(run({ rules: 'MEDIUM', band: 'HIGH', con: contradiction('STRONG') }).level, 'HIGH')
    assert.ok(run({ rules: 'MEDIUM', band: 'HIGH', con: contradiction('STRONG') }).rules.includes('contradiction+transaction'))
    assert.equal(run({ rules: 'MEDIUM', band: 'ELEVATED', con: contradiction('STRONG') }).level, 'MEDIUM')
  })
})

describe('message and contradiction are separate families', () => {
  test('each alone gives MEDIUM; together they give HIGH', () => {
    assert.equal(run({ rules: 'LOW', msg: message('STRONG') }).level, 'MEDIUM')
    assert.equal(run({ rules: 'LOW', msg: message('MODERATE') }).level, 'MEDIUM')
    assert.equal(run({ rules: 'LOW', con: contradiction('STRONG') }).level, 'MEDIUM')
    assert.equal(run({ rules: 'LOW', con: contradiction('WEAK') }).level, 'MEDIUM')
    assert.equal(run({ rules: 'LOW', msg: message('STRONG'), con: contradiction('STRONG') }).level, 'HIGH')
    assert.equal(run({ rules: 'LOW', msg: message('MODERATE'), con: contradiction('STRONG') }).level, 'MEDIUM')
    assert.equal(run({ rules: 'LOW', msg: message('STRONG'), con: contradiction('WEAK') }).level, 'MEDIUM')
  })

  test('a strong message with a review-level transaction is HIGH (H3)', () => {
    assert.equal(run({ rules: 'MEDIUM', msg: message('STRONG') }).level, 'HIGH')
    assert.equal(run({ rules: 'MEDIUM', msg: message('MODERATE') }).level, 'MEDIUM')
  })

  test('two strong contradictions are HIGH on their own (H5)', () => {
    assert.equal(run({ rules: 'LOW', con: contradiction('STRONG', 2) }).level, 'HIGH')
  })

  test('nothing present: the rules decide', () => {
    assert.equal(run({ rules: 'LOW' }).level, 'LOW')
    assert.equal(run({ rules: 'MEDIUM' }).level, 'MEDIUM')
    assert.equal(run({ rules: 'HIGH' }).level, 'HIGH')
  })
})

describe('compatibility floor', () => {
  test('the final level is never below the original engine level', () => {
    const held = run({ rules: 'LOW', engine: 'MEDIUM' })
    assert.equal(held.hybridLevel, 'LOW')
    assert.equal(held.level, 'MEDIUM')
    assert.deepEqual(held.compatibilityFloor, { level: 'MEDIUM', applied: true })
    assert.ok(held.rules.includes('compatibility.floor'))
    assert.equal(run({ rules: 'MEDIUM', engine: 'HIGH' }).level, 'HIGH')
  })

  test('language is not counted twice: a wording-only engine MEDIUM plus a fraudulent message stays MEDIUM', () => {
    // R LOW (the other checks are fine), engine MEDIUM only because of its
    // language check, and the classifier reads the same words as fraudulent.
    const result = run({ rules: 'LOW', engine: 'MEDIUM', msg: message('STRONG') })
    assert.equal(result.level, 'MEDIUM')
    assert.equal(result.hybridLevel, 'MEDIUM')
    assert.equal(result.compatibilityFloor.applied, false)
  })
})

describe('family summaries', () => {
  test('message family', () => {
    assert.equal(messageFamily(null, null).strength, 'NONE')
    assert.equal(messageFamily({ classification: 'legit_unusual', intents: [] }, null).strength, 'NONE')
    assert.equal(messageFamily({ classification: 'suspicious', intents: [] }, null).strength, 'MODERATE')
    assert.equal(messageFamily({ classification: 'fraudulent', intents: [] }, null).strength, 'STRONG')
    const lookalike = { signals: [{ id: 'link.lookalike', category: 'SUSPICIOUS', tone: 'bad' }] }
    assert.deepEqual(messageFamily({ classification: 'legit_normal', intents: [] }, lookalike), { strength: 'MODERATE', classification: 'legit_normal', corroboratedSuspicious: 1 })
    // Code words in a warning are not a request unless the classifier agrees.
    const codes = { signals: [{ id: 'sensitive.request', category: 'SUSPICIOUS', tone: 'bad' }] }
    assert.equal(messageFamily({ classification: 'legit_normal', intents: [] }, codes).strength, 'NONE')
    assert.equal(messageFamily({ classification: 'suspicious', intents: ['sensitiveInfoRequest'] }, codes).corroboratedSuspicious, 1)
  })

  test('contradiction family', () => {
    assert.deepEqual(contradictionFamily(null), NONE_CONTRADICTION)
    const evidence = {
      signals: [
        { category: 'CONFLICT', tone: 'warn' },
        { category: 'MATCH', tone: 'ok' },
        { category: 'SUSPICIOUS', tone: 'bad' },
      ],
    }
    assert.deepEqual(contradictionFamily(evidence), { strength: 'WEAK', strongConflicts: 0, weakConflicts: 1 })
    evidence.signals.push({ category: 'CONFLICT', tone: 'bad' })
    assert.deepEqual(contradictionFamily(evidence), { strength: 'STRONG', strongConflicts: 1, weakConflicts: 1 })
  })

  test('every fired rule is documented and the policy never reads the clock', () => {
    const result = run({ rules: 'HIGH', band: 'HIGH', msg: message('STRONG'), con: contradiction('STRONG', 2), engine: 'HIGH' })
    for (const id of result.rules) assert.ok(id in HYBRID_RULES, id)
    const source = readFileSync(new URL('./aggregation.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /new Date\(\)|Date\.now/)
  })
})
