import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { analyseStandingOrder } from '../fraud/engine.js'
import { deriveUserProfile } from '../fraud/profile.js'
import { classifyMessage } from '../fraud/text/classifier.js'
import { compareTextEvidence } from '../fraud/text/evidence.js'
import { approveTransaction, rejectTransaction, requestMoreInformation, saveAnalysis } from './ledger.js'
import { assessPendingRequest, decisionLevel, requestMessage } from './requestAssessment.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { id: 'test-user', bank: { code: 'MCB' } }

const LEGIT_TEXT =
  'Monthly service fee for the office cleaning contract, invoice INV-2291 for Rs 5,000. Please pay ABC Services Ltd, account ending in 4417, on the 30th of each month.'
const CODE_SCAM = 'MCB ALERT: your account will be suspended today. Reply with the one-time code we sent you to keep it active.'
const REDIRECTION_SCAM =
  'Urgent: ABC Services Ltd has changed bank. Pay Rs 5,000 to our new SBM account 000999555111 today, the old account is no longer in use. Do not call our office.'

function createLedger(overrides = {}) {
  const demo = createDemoRequests(USER, { now: NOW }).map((tx) => ({ ...tx, ...overrides[tx.verificationCase] }))
  return { transactions: [...createSeedTransactions(NOW), ...demo], demoRun: 1 }
}
const find = (ledger, verificationCase) => ledger.transactions.find((tx) => tx.verificationCase === verificationCase)

// What AppProvider.runAnalysis does.
function runAnalysis(ledger, txId) {
  const tx = ledger.transactions.find((item) => item.id === txId)
  const { analysis, assessment } = assessPendingRequest(tx, ledger.transactions, USER)
  return saveAnalysis(USER.id, ledger, txId, analysis, assessment)
}
const analysed = (ledger, verificationCase) => find(runAnalysis(ledger, find(ledger, verificationCase).id), verificationCase)
const withoutTimestamp = ({ analysedAt, ...analysis }) => analysis
const AS_OF = NOW.toISOString()

describe('pending standing-order flow — demo behaviour', () => {
  test('the three demos keep 100 / LOW, 69 / MEDIUM, 8 / HIGH', () => {
    const ledger = createLedger()
    const expected = { LEGITIMATE: [100, 'LOW'], GREY: [69, 'MEDIUM'], FRAUD: [8, 'HIGH'] }
    for (const [key, [score, level]] of Object.entries(expected)) {
      const tx = analysed(ledger, key)
      assert.equal(tx.analysis.score, score, key)
      assert.equal(tx.analysis.riskLevel, level, key)
      assert.equal(tx.riskScore, score, key)
      assert.equal(tx.riskLevel, level, key)
      assert.equal(tx.assessment.combined.level, level, key)
      assert.equal(tx.assessment.combined.raisedByTextOrEvidence, false, key)
    }
  })

  test('the demo request text is analysed as the message', () => {
    const ledger = createLedger()
    const fraud = analysed(ledger, 'FRAUD')
    assert.equal(fraud.assessment.textAnalysis.classification, 'fraudulent')
    assert.deepEqual(fraud.assessment.textAnalysis, classifyMessage(fraud.requestText))
    // The GREY text has no payment details: reported as such, not as evidence.
    assert.equal(analysed(ledger, 'GREY').assessment.evidenceAnalysis.status, 'NO_EVIDENCE')
  })
})

describe('pending standing-order flow — message and evidence', () => {
  test('a request without a message gets no text or evidence analysis', () => {
    for (const requestText of [null, '', '   ']) {
      const ledger = createLedger({ LEGITIMATE: { requestText } })
      const tx = analysed(ledger, 'LEGITIMATE')
      assert.equal(requestMessage(find(ledger, 'LEGITIMATE')), null)
      assert.equal(tx.assessment.textAnalysis, null)
      assert.equal(tx.assessment.evidenceAnalysis, null)
      assert.deepEqual(tx.assessment.sources, { transaction: 'rules-1.0.0', model: 'fraud-lr-1.1.0', text: null, evidence: null })
      assert.equal(tx.assessment.combined.level, tx.analysis.riskLevel)
    }
  })

  test('the request’s message reaches the classifier and the evidence comparison', () => {
    const ledger = createLedger({ LEGITIMATE: { requestText: LEGIT_TEXT } })
    const request = find(ledger, 'LEGITIMATE')
    const tx = analysed(ledger, 'LEGITIMATE')
    assert.deepEqual(tx.assessment.textAnalysis, classifyMessage(LEGIT_TEXT))
    assert.deepEqual(tx.assessment.evidenceAnalysis, compareTextEvidence(LEGIT_TEXT, request, deriveUserProfile(ledger.transactions), { userBank: 'MCB' }))
    assert.equal(tx.assessment.evidenceAnalysis.status, 'CONSISTENT')
    assert.equal(tx.assessment.combined.level, 'LOW')
  })

  test('a fraud-like message raises a clean request to review, and approval then needs acknowledgement', () => {
    const ledger = createLedger({ LEGITIMATE: { requestText: CODE_SCAM } })
    const after = runAnalysis(ledger, find(ledger, 'LEGITIMATE').id)
    const tx = find(after, 'LEGITIMATE')
    // The engine's own language check reads the request text too, so its score
    // drops a little, but it still rates the request LOW.
    assert.equal(tx.analysis.score, 88)
    assert.equal(tx.analysis.riskLevel, 'LOW')
    assert.equal(tx.assessment.combined.level, 'MEDIUM')
    assert.equal(tx.riskLevel, 'MEDIUM')
    assert.equal(decisionLevel(tx), 'MEDIUM')
    assert.throws(() => approveTransaction(USER.id, after, tx.id), /Confirm you have checked/)
    assert.equal(find(approveTransaction(USER.id, after, tx.id, { acknowledgedWarnings: true }), 'LEGITIMATE').status, 'APPROVED')
  })

  test('a message that contradicts the request blocks approval', () => {
    const ledger = createLedger({ LEGITIMATE: { requestText: REDIRECTION_SCAM } })
    const after = runAnalysis(ledger, find(ledger, 'LEGITIMATE').id)
    const tx = find(after, 'LEGITIMATE')
    assert.equal(tx.assessment.combined.level, 'HIGH')
    assert.equal(tx.assessment.evidenceAnalysis.fields.account.status, 'CONFLICT')
    assert.throws(() => approveTransaction(USER.id, after, tx.id, { acknowledgedWarnings: true }), /High-risk/)
  })
})

describe('pending standing-order flow — stored state', () => {
  test('the engine analysis is stored unchanged and not duplicated', () => {
    const ledger = createLedger()
    const request = find(ledger, 'GREY')
    const tx = analysed(ledger, 'GREY')
    assert.deepEqual(withoutTimestamp(tx.analysis), withoutTimestamp(analyseStandingOrder(request, deriveUserProfile(ledger.transactions))))
    assert.ok(!('transactionAnalysis' in tx.assessment))
    const reasons = [...tx.assessment.combined.reasons, ...tx.assessment.combined.mitigating]
    assert.ok(reasons.every((reason) => reason.source !== 'transaction'))
    assert.ok(!JSON.stringify(tx.assessment).includes(request.requestText), 'message text is not copied')
  })

  test('the input ledger and transactions are not mutated', () => {
    const ledger = createLedger({ LEGITIMATE: { requestText: REDIRECTION_SCAM } })
    const snapshot = structuredClone(ledger)
    for (const key of ['LEGITIMATE', 'GREY', 'FRAUD']) runAnalysis(ledger, find(ledger, key).id)
    assert.deepEqual(ledger, snapshot)
  })

  test('repeated analysis is deterministic for the same analysis time', () => {
    const ledger = createLedger({ GREY: { requestText: LEGIT_TEXT } })
    const tx = find(ledger, 'GREY')
    const analysis = { ...analyseStandingOrder(tx, deriveUserProfile(ledger.transactions)), analysedAt: AS_OF }
    const first = assessPendingRequest(tx, ledger.transactions, USER, { analysis })
    const second = assessPendingRequest(tx, ledger.transactions, USER, { analysis })
    assert.deepEqual(second.assessment, first.assessment)
    assert.equal(first.assessment.asOf, AS_OF)
    assert.deepEqual(JSON.parse(JSON.stringify(first.assessment)), first.assessment)
    // Two separate analyses differ only in their timestamp.
    const a = assessPendingRequest(tx, ledger.transactions, USER).assessment
    const b = assessPendingRequest(tx, ledger.transactions, USER).assessment
    const untimed = ({ asOf, mlAnalysis, ...rest }) => ({ ...rest, mlAnalysis: { ...mlAnalysis, asOf: null } })
    assert.deepEqual(untimed(b), untimed(a))
    assert.deepEqual(withoutTimestamp(assessPendingRequest(tx, ledger.transactions, USER).analysis), withoutTimestamp(analysis))
  })

  test('transactions analysed before the assessment layer fall back to the engine level', () => {
    const ledger = createLedger()
    const tx = find(ledger, 'GREY')
    const legacy = saveAnalysis(USER.id, ledger, tx.id, analyseStandingOrder(tx, deriveUserProfile(ledger.transactions)))
    const stored = find(legacy, 'GREY')
    assert.equal(stored.assessment, undefined)
    assert.equal(decisionLevel(stored), 'MEDIUM')
    assert.throws(() => approveTransaction(USER.id, legacy, tx.id), /Confirm you have checked/)
  })
})

describe('pending standing-order flow — decisions', () => {
  test('approve, request information and reject still work', () => {
    let ledger = createLedger()
    for (const key of ['LEGITIMATE', 'GREY', 'FRAUD']) ledger = runAnalysis(ledger, find(ledger, key).id)

    const approved = find(approveTransaction(USER.id, ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE')
    assert.equal(approved.status, 'APPROVED')
    assert.ok(approved.proof.reference.startsWith('FA-'))

    assert.throws(() => approveTransaction(USER.id, ledger, find(ledger, 'GREY').id), /Confirm you have checked/)
    assert.equal(find(approveTransaction(USER.id, ledger, find(ledger, 'GREY').id, { acknowledgedWarnings: true }), 'GREY').status, 'APPROVED')

    assert.throws(() => approveTransaction(USER.id, ledger, find(ledger, 'FRAUD').id, { acknowledgedWarnings: true }), /High-risk/)
    const flagged = find(requestMoreInformation(USER.id, ledger, find(ledger, 'FRAUD').id, { items: ['Invoice'], note: '' }), 'FRAUD')
    assert.equal(flagged.status, 'FLAGGED')
    assert.equal(find(rejectTransaction(USER.id, ledger, find(ledger, 'FRAUD').id), 'FRAUD').status, 'REJECTED')
  })
})

describe('pending standing-order flow — Stage 5 snapshot', () => {
  test('the stored snapshot carries the model estimate, families and asOf, and no raw text', () => {
    const ledger = createLedger()
    const expected = { LEGITIMATE: [0.0046, 'LOW', 'LOW'], GREY: [0.0958, 'ELEVATED', 'MEDIUM'], FRAUD: [0.9999, 'HIGH', 'HIGH'] }
    for (const [key, [estimate, band, level]] of Object.entries(expected)) {
      const tx = analysed(ledger, key)
      const { assessment } = tx
      assert.equal(assessment.version, 'assessment-2.1.0')
      assert.equal(assessment.policy, 'hybrid-2')
      assert.equal(assessment.asOf, tx.analysis.analysedAt, key)
      assert.equal(assessment.mlAnalysis.asOf, assessment.asOf, key)
      assert.deepEqual([assessment.mlAnalysis.estimate, assessment.mlAnalysis.band], [estimate, band], key)
      assert.equal(assessment.combined.level, level, key)
      assert.deepEqual(Object.keys(assessment.risk), ['transactionRisk', 'mlRisk', 'behaviouralRisk', 'messageRisk', 'evidenceRisk'])
      assert.ok(!('transactionAnalysis' in assessment))
      assert.ok(!JSON.stringify(assessment).includes(tx.requestText), `${key}: raw text stored`)
    }
  })

  test('reopening reads the stored snapshot; later ledger changes do not alter it', () => {
    const base = createLedger()
    let ledger = runAnalysis(base, find(base, 'GREY').id)
    const grey = find(ledger, 'GREY')
    const stored = structuredClone(grey.assessment)
    // The ledger moves on: another request is analysed and approved, and a
    // later settled payment is added.
    ledger = runAnalysis(ledger, find(ledger, 'LEGITIMATE').id)
    ledger = approveTransaction(USER.id, ledger, find(ledger, 'LEGITIMATE').id)
    const later = { ...ledger.transactions.find((tx) => tx.status === 'APPROVED' && !tx.decision), id: 'later', amount: 99000, createdAt: '2099-01-01T00:00:00.000Z' }
    ledger = { ...ledger, transactions: [...ledger.transactions, later] }
    assert.deepEqual(find(ledger, 'GREY').assessment, stored)
    assert.equal(decisionLevel(find(ledger, 'GREY')), 'MEDIUM')

    // Re-running with the same analysis time on the later ledger reproduces the model result.
    const again = assessPendingRequest(grey, ledger.transactions, USER, { analysis: grey.analysis }).assessment
    assert.deepEqual(again.mlAnalysis, stored.mlAnalysis)
    assert.equal(again.combined.level, stored.combined.level)
  })

  test('an old Stage 4 assessment still gates decisions', () => {
    const ledger = createLedger()
    const tx = find(ledger, 'LEGITIMATE')
    const analysis = analyseStandingOrder(tx, deriveUserProfile(ledger.transactions))
    const stage4 = (level) => ({
      version: 'assessment-1.0.0',
      sources: { transaction: 'rules-1.0.0', text: 'text-rules-1.0.0', evidence: 'evidence-comparison' },
      textAnalysis: classifyMessage(CODE_SCAM),
      evidenceAnalysis: null,
      combined: { level, label: level, transactionLevel: 'LOW', transactionScore: 100, raisedByTextOrEvidence: level !== 'LOW', rules: [], reasons: [], mitigating: [], verification: { recommended: level !== 'LOW', steps: [] }, summary: '' },
    })
    const medium = saveAnalysis(USER.id, ledger, tx.id, analysis, stage4('MEDIUM'))
    assert.equal(decisionLevel(find(medium, 'LEGITIMATE')), 'MEDIUM')
    assert.throws(() => approveTransaction(USER.id, medium, tx.id), /Confirm you have checked/)
    assert.equal(find(approveTransaction(USER.id, medium, tx.id, { acknowledgedWarnings: true }), 'LEGITIMATE').status, 'APPROVED')
    const high = saveAnalysis(USER.id, ledger, tx.id, analysis, stage4('HIGH'))
    assert.throws(() => approveTransaction(USER.id, high, tx.id, { acknowledgedWarnings: true }), /High-risk/)
  })
})
