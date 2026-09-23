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

  test('the rules baseline neutralises only the language check and keeps the engine’s weighting', () => {
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
    // Language treated as passed: 25 + 10 + 20 + 25·0.66 + 15 + 5 = 91.5.
    assert.deepEqual(rulesExcludingLanguage(analysis), { score: 92, level: 'LOW', neutralised: 'language' })
    // A passing language check changes nothing: the baseline equals the
    // engine's own score, so dropping-and-reweighting cannot inflate risk.
    const passing = { checks: analysis.checks.map((check) => (check.id === 'language' ? { ...check, score: 1 } : check)) }
    assert.equal(rulesExcludingLanguage(passing).score, 92)
  })

  test('the rules baseline is never below the engine score (Stage 6 fix)', () => {
    // Engine 87 with a clean language check: dropping language re-weighted the
    // other penalties to 84 (MEDIUM) in Stage 5; neutralising keeps 87 (LOW).
    const analysis = {
      checks: [
        { id: 'amount', weight: 25, score: 0.48 },
        { id: 'frequency', weight: 10, score: 1 },
        { id: 'recipient', weight: 20, score: 1 },
        { id: 'behaviour', weight: 25, score: 1 },
        { id: 'language', weight: 15, score: 1 },
        { id: 'expected', weight: 5, score: 1 },
      ],
    }
    assert.deepEqual(rulesExcludingLanguage(analysis), { score: 87, level: 'LOW', neutralised: 'language' })
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
    assert.deepEqual(transactionFamily('MEDIUM', 'HIGH'), { strength: 'STRONG', strengthened: true, profileFlags: [] })
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

describe('hybrid-2 rules (Stage 6)', () => {
  const withFacts = (strength, facts) => ({ ...message(strength), facts })
  const conflictOn = (...strongFacts) => ({ strength: 'STRONG', strongConflicts: strongFacts.length, weakConflicts: 0, strongFacts, weakFacts: [] })

  test('H6: all three families present is HIGH', () => {
    const result = run({ rules: 'MEDIUM', msg: withFacts('MODERATE', ['account']), con: conflictOn('account') })
    assert.equal(result.level, 'HIGH')
    assert.ok(result.rules.includes('all.families'))
    // Without the transaction family it is not.
    assert.equal(run({ rules: 'LOW', msg: withFacts('MODERATE', ['account']), con: conflictOn('account') }).level, 'MEDIUM')
  })

  test('H7: a suspicious message plus a contradiction on an independent fact is HIGH', () => {
    // A PIN request (no payment fact) and a different amount: independent.
    const independent = run({ rules: 'LOW', msg: withFacts('MODERATE', []), con: conflictOn('amount') })
    assert.equal(independent.level, 'HIGH')
    assert.ok(independent.rules.includes('message+independentContradiction'))
    // "Our account has changed" plus the account contradiction: one fact, told twice.
    const sameFact = run({ rules: 'LOW', msg: withFacts('MODERATE', ['account', 'bank', 'payee']), con: conflictOn('account') })
    assert.equal(sameFact.level, 'MEDIUM')
    assert.ok(!sameFact.rules.includes('message+independentContradiction'))
  })

  test('M4: a profile check makes the transaction family MODERATE, never a separate vote', () => {
    const flagged = { strength: 'MODERATE', strengthened: false, profileFlags: ['recipientAccountChanged'] }
    assert.deepEqual(transactionFamily('LOW', null, ['recipientAccountChanged']), flagged)
    const result = aggregate({ engineLevel: 'LOW', rulesLevel: 'LOW', transaction: flagged, message: NONE_MESSAGE, contradiction: NONE_CONTRADICTION })
    assert.equal(result.level, 'MEDIUM')
    assert.deepEqual(result.rules, ['transaction.profile'])
    // A profile check and the rules together are still one family.
    assert.equal(transactionFamily('MEDIUM', null, ['lookalikeRecipient']).strength, 'MODERATE')
    // With a HIGH model band it is strengthened, like a MEDIUM rules result.
    assert.equal(transactionFamily('LOW', 'HIGH', ['lookalikeRecipient']).strength, 'STRONG')
    // Without a profile check the model still cannot act on a LOW request.
    assert.equal(transactionFamily('LOW', 'HIGH', []).strength, 'NONE')
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
    assert.deepEqual(messageFamily({ classification: 'legit_normal', intents: [] }, lookalike), { strength: 'MODERATE', classification: 'legit_normal', corroboratedSuspicious: 1, facts: [] })
    // The facts the message's own warnings are about.
    assert.deepEqual(messageFamily({ classification: 'suspicious', intents: ['changedPaymentDetails', 'newPaymentDestination', 'urgency'] }, null).facts, ['account', 'bank', 'payee'])
    // Code words in a warning are not a request unless the classifier agrees.
    const codes = { signals: [{ id: 'sensitive.request', category: 'SUSPICIOUS', tone: 'bad' }] }
    assert.equal(messageFamily({ classification: 'legit_normal', intents: [] }, codes).strength, 'NONE')
    assert.equal(messageFamily({ classification: 'suspicious', intents: ['sensitiveInfoRequest'] }, codes).corroboratedSuspicious, 1)
  })

  test('contradiction family', () => {
    assert.deepEqual(contradictionFamily(null), { ...NONE_CONTRADICTION, strongFacts: [], weakFacts: [] })
    const evidence = {
      signals: [
        { id: 'bank.mismatch', category: 'CONFLICT', tone: 'warn' },
        { id: 'amount.match', category: 'MATCH', tone: 'ok' },
        { id: 'link.lookalike', category: 'SUSPICIOUS', tone: 'bad' },
      ],
    }
    assert.deepEqual(contradictionFamily(evidence), { strength: 'WEAK', strongConflicts: 0, weakConflicts: 1, strongFacts: [], weakFacts: ['bank'] })
    evidence.signals.push({ id: 'account.mismatch', category: 'CONFLICT', tone: 'bad' })
    assert.deepEqual(contradictionFamily(evidence), { strength: 'STRONG', strongConflicts: 1, weakConflicts: 1, strongFacts: ['account'], weakFacts: ['bank'] })
  })

  test('one currency difference is one contradicted fact, not two (Stage 6 fix)', () => {
    const evidence = {
      signals: [
        { id: 'amount.mismatch', category: 'CONFLICT', tone: 'bad' },
        { id: 'currency.mismatch', category: 'CONFLICT', tone: 'bad' },
      ],
    }
    const family = contradictionFamily(evidence)
    assert.deepEqual([family.strongConflicts, family.strongFacts], [1, ['amount']])
    assert.equal(run({ rules: 'LOW', con: family }).level, 'MEDIUM')
  })

  test('every fired rule is documented and the policy never reads the clock', () => {
    const result = run({ rules: 'HIGH', band: 'HIGH', msg: message('STRONG'), con: contradiction('STRONG', 2), engine: 'HIGH' })
    for (const id of result.rules) assert.ok(id in HYBRID_RULES, id)
    const source = readFileSync(new URL('./aggregation.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /new Date\(\)|Date\.now/)
  })
})
