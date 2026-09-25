import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { analyseStandingOrder } from '../fraud/engine.js'
import { deriveUserProfile } from '../fraud/profile.js'
import {
  approveTransaction,
  createDemoLedger,
  getApprovalQueue,
  getLedgerStats,
  loadLedger,
  rejectTransaction,
  replayDemoRequests,
  requestMoreInformation,
  resetLedger,
  saveAnalysis,
} from './ledger.js'
import { awaitingDecision, needsEngineRun, openingPhase } from '../verification/decisionState.js'
import { receiptFor } from './receipt.js'
import { assessPendingRequest } from './requestAssessment.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { id: 'demo-reset-test-user', bank: { code: 'MCB' }, fullName: 'Reset Tester' }
const PAYER = { name: USER.fullName, bank: 'MCB' }

const demoLedger = (options = {}) => createDemoLedger(USER, { now: NOW, seed: 'reset-test', size: 100, ...options })
const generated = (ledger) => ledger.transactions.filter((tx) => tx.demoScenario)
const pending = (ledger) => getApprovalQueue(ledger.transactions)
const levelOf = (tx) => tx.assessment.combined.level

// The first size-100 batch (from a fixed list of seeds) that has a generated
// request at `level`, with that request.
function withLevel(level) {
  for (let i = 0; i < 40; i += 1) {
    const ledger = demoLedger({ seed: `level-${i}` })
    const tx = generated(ledger).find((item) => levelOf(item) === level)
    if (tx) return { ledger, tx }
  }
  throw new Error(`no generated ${level} request in 40 batches`)
}

describe('Reset demo data', () => {
  test('generates 1–100 pending requests, a different count each time, and saves them', () => {
    let previous = null
    const sizes = []
    for (let i = 0; i < 40; i += 1) {
      const ledger = resetLedger(USER, previous)
      const queue = pending(ledger)
      assert.ok(queue.length >= 1 && queue.length <= 100, `queue of ${queue.length}`)
      assert.equal(ledger.demoBatch.size, queue.length)
      assert.equal(getLedgerStats(ledger.transactions).awaitingApproval, queue.length)
      if (previous) assert.notEqual(queue.length, previous.demoBatch.size, 'two resets in a row gave the same count')
      // Saved: reloading gives back the same ledger.
      assert.deepEqual(loadLedger(USER), ledger)
      sizes.push(queue.length)
      previous = ledger
    }
    assert.ok(new Set(sizes).size >= 15, 'sizes vary')
  })

  test('keeps the seed history and replaces the earlier demo run', () => {
    const first = demoLedger({ seed: 'first', size: 30 })
    const second = demoLedger({ seed: 'second', size: 12, previous: first })
    const seedCount = createSeedTransactions(NOW).length
    for (const ledger of [first, second]) assert.equal(ledger.transactions.filter((tx) => tx.demoRun == null).length, seedCount)
    assert.equal(pending(second).length, 12)
    assert.equal(second.demoRun, 1)
    assert.equal(new Set([...first.transactions, ...second.transactions].map((tx) => tx.id)).size, seedCount * 2 + 30 + 12)
  })

  test('a first sign-in gets a batch too', () => {
    const fresh = loadLedger({ id: 'demo-reset-fresh-user', bank: { code: 'SBM' }, fullName: 'Fresh User' })
    assert.ok(pending(fresh).length >= 1 && pending(fresh).length <= 100)
    assert.ok(fresh.demoBatch.seed)
  })

  test('a batch of 100 is built and analysed quickly', () => {
    const start = performance.now()
    const ledger = demoLedger({ seed: 'timing' })
    const elapsed = performance.now() - start
    assert.equal(pending(ledger).length, 100)
    assert.ok(elapsed < 3000, `${Math.round(elapsed)} ms`)
  })
})

describe('generated requests enter the existing assessment pipeline', () => {
  const ledger = demoLedger()

  test('every generated request is analysed and stored with the ordinary structure', () => {
    assert.equal(generated(ledger).length, 97)
    for (const tx of generated(ledger)) {
      assert.equal(tx.analysis.checks.length, 6)
      assert.equal(typeof tx.analysis.analysedAt, 'string')
      assert.equal(tx.assessment.version, 'assessment-2.1.0')
      assert.equal(tx.assessment.policy, 'hybrid-2')
      assert.equal(tx.assessment.asOf, tx.analysis.analysedAt)
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(levelOf(tx)))
      assert.equal(tx.riskScore, tx.analysis.score)
      assert.equal(tx.riskLevel, levelOf(tx))
      assert.deepEqual(Object.keys(tx.assessment.risk), ['transactionRisk', 'mlRisk', 'behaviouralRisk', 'messageRisk', 'evidenceRisk'])
      assert.equal(tx.assessment.mlAnalysis.status, 'AVAILABLE', tx.reference)
      assert.equal(Boolean(tx.assessment.textAnalysis), tx.requestText.trim().length > 0)
      assert.ok(!('transactionAnalysis' in tx.assessment))
      // Real messages are never copied into the assessment (a one-word text such as
      // "Payment" can coincide with a field name, so only longer ones are checked).
      if (tx.requestText.length >= 25) assert.ok(!JSON.stringify(tx.assessment).includes(tx.requestText), `${tx.reference}: raw text stored`)
    }
  })

  test('the stored result is exactly what the pipeline gives for that request and analysis', () => {
    const profile = deriveUserProfile(ledger.transactions)
    for (const tx of generated(ledger).filter((_, i) => i % 3 === 0)) {
      const again = assessPendingRequest(tx, ledger.transactions, USER, { analysis: tx.analysis, profile })
      assert.deepEqual(again.assessment, tx.assessment, tx.reference)
      assert.deepEqual(again.analysis, tx.analysis)
      // The engine's own score for the request, from the same profile.
      assert.equal(analyseStandingOrder(tx, profile).score, tx.analysis.score, tx.reference)
    }
  })

  test('the pipeline never reads the demo labels', () => {
    for (const tx of generated(ledger).filter((_, i) => i % 7 === 0)) {
      const { demoScenario, ...unlabelled } = tx
      const again = assessPendingRequest(unlabelled, ledger.transactions, USER, { analysis: tx.analysis })
      assert.deepEqual(again.assessment, tx.assessment, tx.reference)
    }
  })

  test('the results are mixed: LOW, MEDIUM and HIGH all occur, and the riskier classes rate higher', () => {
    const levels = new Set()
    const byClass = { legit_normal: [], legit_unusual: [], suspicious: [], fraudulent: [] }
    for (let i = 0; i < 25; i += 1) {
      for (const tx of generated(demoLedger({ seed: `mixed-${i}` }))) {
        levels.add(levelOf(tx))
        byClass[tx.demoScenario.riskClass].push(levelOf(tx))
      }
    }
    assert.deepEqual([...levels].sort(), ['HIGH', 'LOW', 'MEDIUM'])
    const share = (list, level) => list.filter((item) => item === level).length / list.length
    assert.ok(share(byClass.legit_normal, 'LOW') > 0.85, 'normal requests are mostly LOW')
    assert.ok(share(byClass.suspicious, 'LOW') < 0.2, 'suspicious requests are rarely LOW')
    assert.ok(share(byClass.fraudulent, 'LOW') < 0.2 && share(byClass.fraudulent, 'HIGH') > 0.1, 'fraudulent requests reach HIGH')
    assert.ok(share(byClass.legit_unusual, 'MEDIUM') > share(byClass.legit_normal, 'MEDIUM'), 'unusual requests are reviewed more often')
  })

  test('every MEDIUM and HIGH request can explain itself', () => {
    for (const tx of generated(ledger).filter((item) => levelOf(item) !== 'LOW')) {
      assert.ok(tx.assessment.combined.drivers.length > 0, tx.reference)
      for (const driver of tx.assessment.combined.drivers) assert.ok(driver.reasons.length > 0, `${tx.reference}: ${driver.rule}`)
    }
  })

  test('the controlled cases are in the queue, unanalysed, and still score 100 / 69 / 8', () => {
    const controlled = pending(ledger).filter((tx) => tx.verificationCase)
    assert.deepEqual(controlled.map((tx) => tx.verificationCase).sort(), ['FRAUD', 'GREY', 'LEGITIMATE'])
    assert.ok(controlled.every((tx) => tx.analysis === null && tx.assessment === undefined))
    let updated = ledger
    for (const tx of controlled) {
      const { analysis, assessment } = assessPendingRequest(tx, updated.transactions, USER)
      updated = saveAnalysis(USER.id, updated, tx.id, analysis, assessment)
    }
    const result = Object.fromEntries(updated.transactions.filter((tx) => tx.verificationCase).map((tx) => [tx.verificationCase, [tx.analysis.score, levelOf(tx)]]))
    assert.deepEqual(result, { LEGITIMATE: [100, 'LOW'], GREY: [69, 'MEDIUM'], FRAUD: [8, 'HIGH'] })
  })

  test('a small batch has no controlled cases and is fully analysed', () => {
    const small = demoLedger({ seed: 'small', size: 2 })
    assert.equal(pending(small).length, 2)
    assert.ok(pending(small).every((tx) => tx.analysis && tx.assessment && !tx.verificationCase))
  })
})

describe('decision gates on generated requests', () => {
  const PAYER_OPTIONS = { payer: PAYER }

  test('LOW: approves directly and gets a QR receipt with its own details', () => {
    const { ledger, tx } = withLevel('LOW')
    const done = approveTransaction(USER.id, ledger, tx.id, PAYER_OPTIONS)
    const approved = done.transactions.find((item) => item.id === tx.id)
    assert.equal(approved.status, 'APPROVED')
    const receipt = receiptFor(approved)
    assert.equal(receipt.details.recipient.slice(0, 40), tx.recipient.slice(0, 40))
    assert.equal(receipt.details.amount, tx.amount)
    assert.equal(receipt.details.currency, 'MUR')
    assert.equal(receipt.details.customer, PAYER.name)
    assert.equal(receipt.details.bank, 'MCB')
    assert.equal(receipt.details.reference, approved.proof.reference)
    // The analysis it was approved on is untouched.
    assert.deepEqual(approved.assessment, tx.assessment)
    assert.equal(getLedgerStats(done.transactions).awaitingApproval, pending(ledger).length - 1)
  })

  test('MEDIUM: needs the acknowledgement, then approves', () => {
    const { ledger, tx } = withLevel('MEDIUM')
    assert.throws(() => approveTransaction(USER.id, ledger, tx.id, PAYER_OPTIONS), /Confirm you have checked/)
    assert.throws(() => approveTransaction(USER.id, ledger, tx.id, { ...PAYER_OPTIONS, acknowledgedWarnings: false }), /Confirm you have checked/)
    const done = approveTransaction(USER.id, ledger, tx.id, { ...PAYER_OPTIONS, acknowledgedWarnings: true })
    assert.equal(done.transactions.find((item) => item.id === tx.id).status, 'APPROVED')
  })

  test('HIGH: cannot be approved, with or without the acknowledgement, and gets no QR', () => {
    const { ledger, tx } = withLevel('HIGH')
    for (const options of [PAYER_OPTIONS, { ...PAYER_OPTIONS, acknowledgedWarnings: true }]) assert.throws(() => approveTransaction(USER.id, ledger, tx.id, options), /High-risk/)
    const stored = loadLedger(USER).transactions.find((item) => item.id === tx.id)
    assert.equal(stored?.proof ?? null, null)
    assert.equal(receiptFor(tx), null)
  })

  test('any request can be rejected or held for information, whatever its level', () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
      const { ledger, tx } = withLevel(level)
      const rejected = rejectTransaction(USER.id, ledger, tx.id).transactions.find((item) => item.id === tx.id)
      assert.equal(rejected.status, 'REJECTED', level)
      assert.equal(rejected.proof, null)
      const held = requestMoreInformation(USER.id, ledger, tx.id, { items: ['Invoice'], note: '' }).transactions.find((item) => item.id === tx.id)
      assert.equal(held.status, 'FLAGGED', level)
      assert.equal(receiptFor(held), null)
    }
  })

  test('a decided request cannot be decided again', () => {
    const { ledger, tx } = withLevel('LOW')
    const rejected = rejectTransaction(USER.id, ledger, tx.id)
    assert.throws(() => approveTransaction(USER.id, rejected, tx.id, PAYER_OPTIONS), /already been processed/)
  })

  test('approving one request leaves the others’ stored assessments alone', () => {
    const { ledger, tx } = withLevel('LOW')
    const done = approveTransaction(USER.id, ledger, tx.id, PAYER_OPTIONS)
    const others = ledger.transactions.filter((item) => item.id !== tx.id && item.assessment)
    for (const other of others) assert.deepEqual(done.transactions.find((item) => item.id === other.id).assessment, other.assessment)
    assert.deepEqual(loadLedger(USER).transactions.find((item) => item.id === others[0].id).assessment, others[0].assessment)
  })
})

describe('replaying the demo', () => {
  test('still adds the controlled cases once the queue is empty, and keeps the batch record', () => {
    let ledger = demoLedger({ seed: 'replay', size: 5 })
    assert.throws(() => replayDemoRequests(USER, ledger), /Finish the current approvals/)
    for (const tx of pending(ledger)) ledger = rejectTransaction(USER.id, ledger, tx.id)
    assert.equal(pending(ledger).length, 0)
    const replayed = replayDemoRequests(USER, ledger)
    assert.deepEqual(pending(replayed).map((tx) => tx.verificationCase).sort(), ['FRAUD', 'GREY', 'LEGITIMATE'])
    assert.equal(replayed.demoRun, 2)
    assert.deepEqual(replayed.demoBatch, ledger.demoBatch)
  })
})

describe('animated review of stored analyses', () => {
  test('a generated request with a stored analysis opens in the animation and needs no engine run', () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH']) {
      const { tx } = withLevel(level)
      assert.equal(openingPhase(tx), 'analysing', level)
      assert.equal(needsEngineRun(tx), false, level)
      assert.equal(awaitingDecision(tx), true, level)
    }
  })

  test('the stored analysis and assessment are what is shown afterwards, unchanged by opening, saving and reloading', () => {
    const { ledger, tx } = withLevel('MEDIUM')
    const before = JSON.stringify({ analysis: tx.analysis, assessment: tx.assessment })
    // Opening never calls saveAnalysis; a reload round-trips the JSON.
    const reloaded = JSON.parse(JSON.stringify(ledger)).transactions.find((item) => item.id === tx.id)
    assert.equal(JSON.stringify({ analysis: reloaded.analysis, assessment: reloaded.assessment }), before)
    assert.equal(openingPhase(reloaded), 'analysing')
  })

  test('decision gates are unchanged: HIGH cannot be approved, MEDIUM needs acknowledgement, LOW approves', () => {
    const high = withLevel('HIGH')
    assert.throws(() => approveTransaction(USER.id, high.ledger, high.tx.id, { payer: PAYER }))
    const medium = withLevel('MEDIUM')
    assert.throws(() => approveTransaction(USER.id, medium.ledger, medium.tx.id, { payer: PAYER }))
    const low = withLevel('LOW')
    const approved = approveTransaction(USER.id, low.ledger, low.tx.id, { payer: PAYER })
    assert.equal(approved.transactions.find((item) => item.id === low.tx.id).status, 'APPROVED')
  })

  test('controlled cases without analysis still open at the prompt and run the engine; decided requests show results', () => {
    const ledger = demoLedger()
    for (const tx of ledger.transactions.filter((item) => item.verificationCase)) {
      assert.equal(openingPhase(tx), 'request', tx.verificationCase)
      assert.equal(needsEngineRun(tx), true, tx.verificationCase)
      const { analysis, assessment } = assessPendingRequest(tx, ledger.transactions, USER)
      const analysed = saveAnalysis(USER.id, ledger, tx.id, analysis, assessment).transactions.find((item) => item.id === tx.id)
      assert.equal(openingPhase(analysed), 'analysing')
    }
    const { ledger: batch, tx } = withLevel('LOW')
    const rejected = rejectTransaction(USER.id, batch, tx.id).transactions.find((item) => item.id === tx.id)
    assert.equal(openingPhase(rejected), 'results')
  })
})
