import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { ASSESSMENT_RULES, ASSESSMENT_VERSION, assessStandingOrder } from './assessment.js'
import { analyseStandingOrder } from './engine.js'
import { DEFAULT_MODEL } from './ml/defaultModel.js'
import { prepareModel } from './ml/explain.js'
import { deriveUserProfile } from './profile.js'
import { classifyMessage } from './text/classifier.js'
import { compareTextEvidence } from './text/evidence.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const PROFILE = deriveUserProfile(createSeedTransactions(NOW))
const DEMO = Object.fromEntries(createDemoRequests({ bank: { code: 'MCB' } }, { now: NOW }).map((request) => [request.verificationCase, request]))

// The engine stamps each analysis with the current time, so tests that compare
// whole results pass one fixed analysis in.
const ANALYSIS = Object.fromEntries(Object.entries(DEMO).map(([key, request]) => [key, analyseStandingOrder(request, PROFILE)]))
const assess = (key, text, extra = {}) => assessStandingOrder({ request: DEMO[key], profile: PROFILE, text, userBank: 'MCB', analysis: ANALYSIS[key], ...extra })
const withoutTimestamp = ({ analysedAt, ...analysis }) => analysis

const LEGIT_TEXT =
  'Monthly service fee for the office cleaning contract, invoice INV-2291 for Rs 5,000. Please pay ABC Services Ltd, account ending in 4417, on the 30th of each month.'
const SUSPICIOUS_TEXT =
  'Harbourline Property Management: our bank details have changed. Please pay the revised contribution of Rs 12,500 to our new account 000999123456 from this month.'
const CODE_SCAM = 'MCB ALERT: your account will be suspended today. Reply with the one-time code we sent you to keep it active.'
const REDIRECTION_SCAM =
  'Urgent: ABC Services Ltd has changed bank. Pay Rs 5,000 to our new SBM account 000999555111 today, the old account is no longer in use. Do not call our office.'
const ALARMING_LEGIT = 'MCB will never ask for your PIN, password or one-time code. Never share them with anyone, including our staff.'

describe('assessStandingOrder — without text', () => {
  test('the existing demo behaviour is unchanged: 100 / 69 / 8', () => {
    const levels = {}
    for (const key of ['LEGITIMATE', 'GREY', 'FRAUD']) {
      const result = assessStandingOrder({ request: DEMO[key], profile: PROFILE })
      assert.equal(result.transactionAnalysis.score, { LEGITIMATE: 100, GREY: 69, FRAUD: 8 }[key])
      assert.deepEqual(withoutTimestamp(result.transactionAnalysis), withoutTimestamp(analyseStandingOrder(DEMO[key], PROFILE)))
      levels[key] = result.combinedAssessment.level
      assert.equal(result.combinedAssessment.level, result.transactionAnalysis.riskLevel)
      assert.equal(result.combinedAssessment.raisedByTextOrEvidence, false)
      // Only the transaction family speaks; the floor is never needed.
      assert.ok(result.combinedAssessment.rules.every((rule) => rule.startsWith('transaction.')), key)
      assert.equal(result.combinedAssessment.compatibilityFloor.applied, false)
    }
    assert.deepEqual(levels, { LEGITIMATE: 'LOW', GREY: 'MEDIUM', FRAUD: 'HIGH' })
  })

  test('no text means no text or evidence analysis, not an invented one', () => {
    for (const text of [undefined, null, '', '   ']) {
      const result = assessStandingOrder({ request: DEMO.LEGITIMATE, profile: PROFILE, text, analysis: ANALYSIS.LEGITIMATE })
      assert.equal(result.textAnalysis, null)
      assert.equal(result.evidenceAnalysis, null)
      assert.deepEqual(result.sources, { transaction: 'rules-1.0.0', model: null, text: null, evidence: null })
      assert.equal(result.mlAnalysis, null)
      assert.ok(result.combinedAssessment.reasons.every((reason) => reason.source === 'transaction'))
    }
  })
})

describe('assessStandingOrder — with text', () => {
  test('legitimate request and message: LOW, with consistent evidence surfaced', () => {
    const { combinedAssessment, evidenceAnalysis } = assess('LEGITIMATE', LEGIT_TEXT)
    assert.equal(combinedAssessment.level, 'LOW')
    assert.equal(evidenceAnalysis.status, 'CONSISTENT')
    assert.deepEqual(
      combinedAssessment.mitigating.filter((reason) => reason.source === 'evidence').map((reason) => reason.signal),
      ['amount.match', 'currency.match', 'payee.match', 'account.match'],
    )
    assert.equal(combinedAssessment.verification.recommended, false)
  })

  test('suspicious message on a review-level request stays MEDIUM and names the conflict', () => {
    const { combinedAssessment, textAnalysis } = assess('GREY', SUSPICIOUS_TEXT)
    assert.equal(textAnalysis.classification, 'suspicious')
    assert.equal(combinedAssessment.level, 'MEDIUM')
    assert.deepEqual(combinedAssessment.rules, ['transaction.medium', 'message', 'contradiction'])
    assert.deepEqual(combinedAssessment.families, { transaction: 'MODERATE', message: 'MODERATE', contradiction: 'STRONG' })
    assert.ok(combinedAssessment.reasons.some((reason) => reason.source === 'evidence' && reason.signal === 'account.mismatch' && reason.tone === 'bad'))
    assert.match(combinedAssessment.verification.steps[0], /Confirm the payee and account details/)
  })

  test('fraudulent request and message: both sources stay visible', () => {
    const { combinedAssessment, textAnalysis, transactionAnalysis } = assess('FRAUD', DEMO.FRAUD.requestText)
    assert.equal(transactionAnalysis.riskLevel, 'HIGH')
    assert.equal(textAnalysis.classification, 'fraudulent')
    assert.equal(combinedAssessment.level, 'HIGH')
    const sources = new Set(combinedAssessment.reasons.filter((reason) => reason.tone === 'bad').map((reason) => reason.source))
    assert.deepEqual([...sources].sort(), ['evidence', 'text', 'transaction'])
  })

  test('a fraud-like message on a clean request raises it to review, not straight to HIGH', () => {
    const { combinedAssessment, transactionAnalysis } = assess('LEGITIMATE', CODE_SCAM)
    assert.equal(transactionAnalysis.score, 100)
    assert.equal(combinedAssessment.transactionLevel, 'LOW')
    assert.equal(combinedAssessment.level, 'MEDIUM')
    assert.equal(combinedAssessment.raisedByTextOrEvidence, true)
    assert.ok(combinedAssessment.verification.steps.some((step) => /one-time codes/.test(step)))
  })

  test('a fraud-like message that contradicts the request is HIGH', () => {
    const { combinedAssessment, evidenceAnalysis } = assess('LEGITIMATE', REDIRECTION_SCAM)
    assert.equal(combinedAssessment.level, 'HIGH')
    assert.ok(combinedAssessment.rules.includes('message+contradiction'))
    assert.equal(evidenceAnalysis.fields.account.status, 'CONFLICT')
    assert.equal(evidenceAnalysis.fields.bank.status, 'CONFLICT')
    assert.match(combinedAssessment.summary, /raised from LOW to HIGH/)
  })

  test('a genuine message with alarming vocabulary does not raise the level', () => {
    const { combinedAssessment, textAnalysis, evidenceAnalysis } = assess('LEGITIMATE', ALARMING_LEGIT)
    assert.equal(textAnalysis.classification, 'legit_normal')
    // The evidence layer flags the words; the classifier reads them as a warning.
    assert.equal(evidenceAnalysis.fields.sensitiveInfo.status, 'SUSPICIOUS')
    assert.equal(combinedAssessment.level, 'LOW')
    const mention = combinedAssessment.reasons.find((reason) => reason.signal === 'sensitive.request')
    assert.equal(mention.tone, 'warn')
    assert.match(mention.text, /mention, not a request/)
  })

  test('one strong text signal alone does not make the assessment HIGH', () => {
    const { combinedAssessment, textAnalysis } = assess('LEGITIMATE', 'Please confirm your PIN.')
    assert.deepEqual(textAnalysis.intents, ['sensitiveInfoRequest'])
    assert.equal(combinedAssessment.level, 'MEDIUM')
  })

  test('missing evidence is neither a risk nor a comfort', () => {
    const quiet = assess('LEGITIMATE', 'Thanks, see you at the meeting next week.')
    assert.equal(quiet.evidenceAnalysis.status, 'NO_EVIDENCE')
    assert.equal(quiet.combinedAssessment.level, 'LOW')
    assert.ok(!quiet.combinedAssessment.reasons.some((reason) => reason.source === 'evidence'))
    // A quiet message does not lower a review-level request either.
    assert.equal(assess('GREY', 'Thanks, see you at the meeting next week.').combinedAssessment.level, 'MEDIUM')
    assert.equal(assess('FRAUD', 'Thanks, see you at the meeting next week.').combinedAssessment.level, 'HIGH')
  })

  test('matching evidence never lowers the transaction level', () => {
    const text = 'Please pay SecureVault Settlements Ltd Rs 48,000 every week, account ending in 7781.'
    const { combinedAssessment, evidenceAnalysis } = assess('FRAUD', text)
    assert.ok(evidenceAnalysis.summary.matches >= 2)
    assert.equal(combinedAssessment.level, 'HIGH')
  })
})

describe('assessStandingOrder — components are preserved', () => {
  test('the transaction analysis is passed through untouched', () => {
    const result = assess('GREY', SUSPICIOUS_TEXT)
    assert.equal(result.transactionAnalysis, ANALYSIS.GREY)
    assert.equal(result.combinedAssessment.transactionScore, 69)
  })

  test('the text and evidence results are exactly what their components return', () => {
    const result = assess('GREY', SUSPICIOUS_TEXT)
    assert.deepEqual(result.textAnalysis, classifyMessage(SUSPICIOUS_TEXT))
    assert.deepEqual(result.evidenceAnalysis, compareTextEvidence(SUSPICIOUS_TEXT, DEMO.GREY, PROFILE, { userBank: 'MCB' }))
  })

  test('classifier confidence is not presented as a fraud probability', () => {
    const { combinedAssessment } = assess('LEGITIMATE', CODE_SCAM)
    assert.match(combinedAssessment.summary, /classification confidence 1\.00, not a fraud probability/)
    assert.ok(!/probability/i.test(JSON.stringify(Object.keys(combinedAssessment))))
    assert.ok(!('confidence' in combinedAssessment) && !('probability' in combinedAssessment))
  })

  test('every reason names its source; rules come from the documented policy', () => {
    const { combinedAssessment } = assess('FRAUD', DEMO.FRAUD.requestText)
    for (const reason of [...combinedAssessment.reasons, ...combinedAssessment.mitigating]) {
      assert.ok(['transaction', 'text', 'evidence'].includes(reason.source))
      assert.ok(reason.text.length > 0)
    }
    for (const rule of combinedAssessment.rules) assert.ok(rule in ASSESSMENT_RULES, rule)
  })
})

describe('assessStandingOrder — hygiene', () => {
  test('deterministic and JSON-serialisable', () => {
    for (const [key, text] of [['LEGITIMATE', LEGIT_TEXT], ['GREY', SUSPICIOUS_TEXT], ['LEGITIMATE', REDIRECTION_SCAM]]) {
      const first = assess(key, text)
      for (let run = 0; run < 3; run++) assert.deepEqual(assess(key, text), first)
      assert.deepEqual(JSON.parse(JSON.stringify(first)), first)
      assert.equal(first.version, ASSESSMENT_VERSION)
    }
  })

  test('the request, profile and analysis are not mutated', () => {
    const request = structuredClone(DEMO.LEGITIMATE)
    const profile = structuredClone(PROFILE)
    const analysis = structuredClone(ANALYSIS.LEGITIMATE)
    const snapshot = structuredClone({ request, profile, analysis })
    assessStandingOrder({ request, profile, analysis, text: REDIRECTION_SCAM, userBank: 'MCB' })
    assessStandingOrder({ request, profile })
    assert.deepEqual({ request, profile, analysis }, snapshot)
  })
})

// --- Stage 5: hybrid-1 with the model ---------------------------------------

const ARTIFACT = JSON.parse(readFileSync(new URL('../../models/fraud-model.json', import.meta.url), 'utf8'))
// Test models with the bias pushed so the estimate is always HIGH or LOW.
const shiftedModel = (shift) => prepareModel({ ...ARTIFACT, model: { ...ARTIFACT.model, bias: ARTIFACT.model.bias + shift } })
const ALWAYS_HIGH = shiftedModel(30)
const ALWAYS_LOW = shiftedModel(-30)

const HISTORY = [...createSeedTransactions(NOW), ...Object.values(DEMO)]
const AS_OF = NOW.toISOString()
const fixedAnalysis = (request) => ({ ...analyseStandingOrder(request, PROFILE), analysedAt: AS_OF })
function hybrid(request, text, { model = DEFAULT_MODEL, history = HISTORY } = {}) {
  return assessStandingOrder({ request, profile: PROFILE, text, userBank: 'MCB', analysis: fixedAnalysis(request), history, model })
}
const withText = (key, text) => [{ ...DEMO[key], requestText: text }, text]

// The LEGITIMATE request set up at 23:40 (behaviour 0.66, other checks 1) with
// a message that fails the engine's language check: the engine is MEDIUM on
// wording alone, while the rules without language stay LOW.
const BORDERLINE_TEXT = 'URGENT: your account will be suspended today. Do not contact your branch. Confirm your PIN at https://mcb-verify-now.example/login'
const BORDERLINE = { ...DEMO.LEGITIMATE, requestText: BORDERLINE_TEXT, context: { ...DEMO.LEGITIMATE.context, initiatedAt: '2026-09-22T19:40:00.000Z' } }
// GREY with a message naming a different payee account (ending 1111, not 0932).
const ACCOUNT_CONFLICT = 'Harbourline Property Management: please pay the Rs 12,500 contribution to the account ending in 1111 as usual.'

describe('hybrid-1 — demo and scenario regression', () => {
  test('the demos: 100 / 69 / 8 and LOW / MEDIUM / HIGH, with and without their message', () => {
    for (const [key, score, level] of [['LEGITIMATE', 100, 'LOW'], ['GREY', 69, 'MEDIUM'], ['FRAUD', 8, 'HIGH']]) {
      for (const text of [DEMO[key].requestText, null]) {
        const result = hybrid(DEMO[key], text)
        assert.equal(result.transactionAnalysis.score, score, key)
        assert.equal(result.combinedAssessment.transactionLevel, level, key)
        assert.equal(result.combinedAssessment.level, level, key)
        assert.equal(result.combinedAssessment.compatibilityFloor.applied, false, key)
      }
    }
  })

  test('the Stage 5 scenarios', () => {
    const cases = [
      ['LEGITIMATE + code scam', ...withText('LEGITIMATE', CODE_SCAM), 'MEDIUM', { transaction: 'NONE', message: 'STRONG', contradiction: 'NONE' }],
      ['LEGITIMATE + redirection scam', ...withText('LEGITIMATE', REDIRECTION_SCAM), 'HIGH', { transaction: 'NONE', message: 'STRONG', contradiction: 'STRONG' }],
      ['GREY + code scam', ...withText('GREY', CODE_SCAM), 'HIGH', { transaction: 'MODERATE', message: 'STRONG', contradiction: 'WEAK' }],
      ['FRAUD without a message', { ...DEMO.FRAUD, requestText: '' }, null, 'HIGH', { transaction: 'STRONG', message: 'NONE', contradiction: 'NONE' }],
    ]
    for (const [name, request, text, level, families] of cases) {
      const { combinedAssessment } = hybrid(request, text)
      assert.equal(combinedAssessment.level, level, name)
      assert.deepEqual(combinedAssessment.families, families, name)
    }
  })

  test('the borderline case: wording is not counted through the engine and the classifier', () => {
    const result = hybrid(BORDERLINE, BORDERLINE_TEXT)
    assert.equal(result.transactionAnalysis.riskLevel, 'MEDIUM')
    assert.equal(result.transactionAnalysis.checks.find((check) => check.id === 'language').score, 0)
    assert.deepEqual(result.risk.transactionRisk.rulesExcludingLanguage, { score: 90, level: 'LOW' })
    assert.equal(result.textAnalysis.classification, 'fraudulent')
    // Stage 4 turned "fraudulent message + MEDIUM engine" into HIGH.
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.deepEqual(result.combinedAssessment.families, { transaction: 'NONE', message: 'STRONG', contradiction: 'NONE' })
  })
})

describe('hybrid-1 — the model', () => {
  test('the demo model estimates, message removed', () => {
    const estimates = Object.fromEntries(['LEGITIMATE', 'GREY', 'FRAUD'].map((key) => [key, hybrid(DEMO[key], DEMO[key].requestText).mlAnalysis]))
    assert.deepEqual(
      Object.fromEntries(Object.entries(estimates).map(([key, ml]) => [key, [ml.estimate, ml.band]])),
      { LEGITIMATE: [0.0046, 'LOW'], GREY: [0.0958, 'ELEVATED'], FRAUD: [0.9999, 'HIGH'] },
    )
    for (const ml of Object.values(estimates)) assert.equal(ml.notice, 'Synthetic-trained; not calibrated to real-world fraud rates.')
  })

  test('the model alone cannot raise LOW', () => {
    const result = hybrid(DEMO.LEGITIMATE, DEMO.LEGITIMATE.requestText, { model: ALWAYS_HIGH })
    assert.equal(result.mlAnalysis.band, 'HIGH')
    assert.equal(result.risk.mlRisk.agreement, 'MODEL_HIGHER')
    assert.equal(result.combinedAssessment.level, 'LOW')
    assert.match(result.combinedAssessment.supporting[0].text, /Model and transaction rules disagree/)
    assert.equal(result.combinedAssessment.verification.recommended, false)
  })

  test('the model never lowers the level', () => {
    const result = hybrid(DEMO.FRAUD, DEMO.FRAUD.requestText, { model: ALWAYS_LOW })
    assert.equal(result.mlAnalysis.band, 'LOW')
    assert.equal(result.risk.mlRisk.agreement, 'MODEL_LOWER')
    assert.equal(result.combinedAssessment.level, 'HIGH')
    assert.equal(hybrid(DEMO.GREY, DEMO.GREY.requestText, { model: ALWAYS_LOW }).combinedAssessment.level, 'MEDIUM')
  })

  test('rules and model are one vote: a HIGH model on a MEDIUM request alone stays MEDIUM', () => {
    const result = hybrid(DEMO.GREY, DEMO.GREY.requestText, { model: ALWAYS_HIGH })
    assert.equal(result.risk.transactionRisk.strength, 'STRONG')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })

  test('the model can strengthen a MEDIUM transaction next to a strong contradiction', () => {
    const [request, text] = withText('GREY', ACCOUNT_CONFLICT)
    assert.equal(hybrid(request, text).combinedAssessment.level, 'MEDIUM')
    const strengthened = hybrid(request, text, { model: ALWAYS_HIGH })
    assert.equal(strengthened.combinedAssessment.level, 'HIGH')
    assert.ok(strengthened.combinedAssessment.rules.includes('contradiction+transaction'))
    assert.match(strengthened.combinedAssessment.supporting[0].text, /backs up/)
  })

  test('without history the model is unavailable and nothing else changes', () => {
    const result = assessStandingOrder({ request: DEMO.GREY, profile: PROFILE, text: DEMO.GREY.requestText, userBank: 'MCB', analysis: fixedAnalysis(DEMO.GREY), model: DEFAULT_MODEL })
    assert.equal(result.mlAnalysis.status, 'UNAVAILABLE')
    assert.equal(result.risk.mlRisk.agreement, 'UNAVAILABLE')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })
})

describe('hybrid-1 — behaviour, missing evidence, snapshots', () => {
  test('behaviour is listed, never counted as its own family', () => {
    const withHistory = hybrid(DEMO.GREY, DEMO.GREY.requestText)
    assert.deepEqual(withHistory.risk.behaviouralRisk, { anomalies: ['unusualHour', 'unusualPaymentDay'], countedIn: 'transaction' })
    const withoutHistory = assessStandingOrder({ request: DEMO.GREY, profile: PROFILE, text: DEMO.GREY.requestText, userBank: 'MCB', analysis: fixedAnalysis(DEMO.GREY) })
    assert.equal(withoutHistory.risk.behaviouralRisk.anomalies, null)
    assert.equal(withHistory.combinedAssessment.level, withoutHistory.combinedAssessment.level)
    assert.deepEqual(withHistory.combinedAssessment.families, withoutHistory.combinedAssessment.families)
    assert.deepEqual(Object.keys(withHistory.combinedAssessment.families), ['transaction', 'message', 'contradiction'])
  })

  test('missing text or evidence never raises the level', () => {
    for (const key of ['LEGITIMATE', 'GREY', 'FRAUD']) {
      for (const text of [null, '', 'Thanks, see you at the meeting next week.']) {
        const result = hybrid(DEMO[key], text)
        assert.equal(result.combinedAssessment.level, result.transactionAnalysis.riskLevel, key)
        assert.equal(result.risk.messageRisk.strength, 'NONE')
        assert.equal(result.risk.evidenceRisk.strength, 'NONE')
      }
    }
  })

  test('the model estimate is reproducible for a fixed asOf; later ledger entries do not change it', () => {
    const first = hybrid(DEMO.GREY, DEMO.GREY.requestText)
    assert.equal(first.asOf, AS_OF)
    assert.equal(first.mlAnalysis.asOf, AS_OF)
    assert.deepEqual(hybrid(DEMO.GREY, DEMO.GREY.requestText), first)
    const later = { ...createSeedTransactions(NOW).find((tx) => tx.status === 'APPROVED'), id: 'later', amount: 99000, createdAt: '2026-12-01T00:00:00.000Z' }
    assert.deepEqual(hybrid(DEMO.GREY, DEMO.GREY.requestText, { history: [...HISTORY, later] }).mlAnalysis, first.mlAnalysis)
  })

  test('serialisable, and the request, profile and history are not changed', () => {
    const history = structuredClone(HISTORY)
    const request = structuredClone(DEMO.FRAUD)
    const profile = structuredClone(PROFILE)
    const snapshot = structuredClone({ history, request, profile })
    const result = assessStandingOrder({ request, profile, text: request.requestText, userBank: 'MCB', analysis: fixedAnalysis(DEMO.FRAUD), history, model: DEFAULT_MODEL })
    assert.deepEqual({ history, request, profile }, snapshot)
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
    assert.equal(result.version, 'assessment-2.0.0')
    assert.equal(result.policy, 'hybrid-1')
    assert.doesNotMatch(JSON.stringify(result.combinedAssessment), /probability of fraud|fraud probability:/i)
  })
})
