import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { ASSESSMENT_RULES, ASSESSMENT_VERSION, assessStandingOrder } from './assessment.js'
import { analyseStandingOrder } from './engine.js'
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
      assert.deepEqual(result.combinedAssessment.rules, [])
    }
    assert.deepEqual(levels, { LEGITIMATE: 'LOW', GREY: 'MEDIUM', FRAUD: 'HIGH' })
  })

  test('no text means no text or evidence analysis, not an invented one', () => {
    for (const text of [undefined, null, '', '   ']) {
      const result = assessStandingOrder({ request: DEMO.LEGITIMATE, profile: PROFILE, text, analysis: ANALYSIS.LEGITIMATE })
      assert.equal(result.textAnalysis, null)
      assert.equal(result.evidenceAnalysis, null)
      assert.deepEqual(result.sources, { transaction: 'rules-1.0.0', text: null, evidence: null })
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
    assert.deepEqual(combinedAssessment.rules, ['text.suspicious', 'evidence.conflict'])
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
    assert.ok(combinedAssessment.rules.includes('text.fraudulent+evidence.strongConflict'))
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
