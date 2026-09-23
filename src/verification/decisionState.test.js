import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { approveTransaction, rejectTransaction, requestMoreInformation, saveAnalysis } from '../transactions/ledger.js'
import { assessPendingRequest } from '../transactions/requestAssessment.js'
import { awaitingDecision, decisionWarnings } from './decisionState.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { id: 'test-user', bank: { code: 'MCB' } }
const CODE_SCAM = 'MCB ALERT: your account will be suspended today. Reply with the one-time code we sent you to keep it active.'
const ALARMING_LEGIT = 'MCB will never ask for your PIN, password or one-time code. Never share them with anyone, including our staff.'

function analysedLedger(overrides = {}) {
  let ledger = {
    transactions: [...createSeedTransactions(NOW), ...createDemoRequests(USER, { now: NOW }).map((tx) => ({ ...tx, ...overrides[tx.verificationCase] }))],
    demoRun: 1,
  }
  for (const tx of ledger.transactions.filter((item) => item.verificationCase)) {
    const { analysis, assessment } = assessPendingRequest(tx, ledger.transactions, USER)
    ledger = saveAnalysis(USER.id, ledger, tx.id, analysis, assessment)
  }
  return ledger
}
const find = (ledger, key) => ledger.transactions.find((tx) => tx.verificationCase === key)
const warningsFor = (tx) => decisionWarnings(tx.analysis, tx.assessment)

describe('awaitingDecision', () => {
  test('an analysed pending request awaits a decision, whether analysed now or earlier', () => {
    const ledger = analysedLedger()
    for (const key of ['LEGITIMATE', 'GREY', 'FRAUD']) assert.equal(awaitingDecision(find(ledger, key)), true, key)
  })

  test('not before analysis, and not once decided', () => {
    const fresh = createDemoRequests(USER, { now: NOW })[0]
    assert.equal(awaitingDecision(fresh), false)
    assert.equal(awaitingDecision(null), false)

    const ledger = analysedLedger()
    const approved = find(approveTransaction(USER.id, ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE')
    const flagged = find(requestMoreInformation(USER.id, ledger, find(ledger, 'FRAUD').id, { items: ['Invoice'], note: '' }), 'FRAUD')
    const rejected = find(rejectTransaction(USER.id, ledger, find(ledger, 'GREY').id), 'GREY')
    for (const tx of [approved, flagged, rejected]) assert.equal(awaitingDecision(tx), false, tx.status)
  })
})

describe('decisionWarnings', () => {
  test('without message warnings the list is exactly the engine’s findings', () => {
    const grey = find(analysedLedger(), 'GREY')
    const engineFindings = grey.analysis.checks
      .filter((check) => check.status !== 'PASS')
      .flatMap((check) => check.findings.filter((finding) => finding.tone !== 'ok').map((finding) => finding.text))
    const warnings = warningsFor(grey)
    assert.deepEqual(warnings.map((warning) => warning.text), engineFindings)
    assert.ok(warnings.every((warning) => warning.sources.length === 1 && warning.sources[0] === 'transaction'))
  })

  test('the same concern from the engine, message and evidence is listed once with its sources', () => {
    const tx = find(analysedLedger({ LEGITIMATE: { requestText: CODE_SCAM } }), 'LEGITIMATE')
    const warnings = warningsFor(tx)
    assert.deepEqual(
      warnings.map(({ text, sources }) => [text, sources]),
      [
        ['Urgency pressure: “today”', ['transaction', 'text']],
        ['Threat of consequences: “suspended”', ['transaction', 'text']],
        ['Requests sensitive information: “one-time code”', ['transaction', 'evidence', 'text']],
        ['Message signal: speaks for a bank while asking for risky actions (“MCB”).', ['text']],
        ['Message signal: unusual contact channel (“Reply with”).', ['text']],
      ],
    )
    // The strongest tone of the group is kept.
    assert.equal(warnings.find((warning) => warning.id === 'topic:sensitiveInfo').tone, 'bad')
  })

  test('different concerns are not merged', () => {
    const fraud = find(analysedLedger(), 'FRAUD')
    const warnings = warningsFor(fraud)
    const ids = warnings.map((warning) => warning.id)
    assert.equal(new Set(ids).size, ids.length)
    // A plain external link and a look-alike bank link are separate concerns.
    const link = warnings.find((warning) => warning.id === 'topic:externalLink')
    const lookalike = warnings.find((warning) => warning.id === 'topic:lookalikeLink')
    assert.deepEqual(link.sources, ['transaction', 'text'])
    assert.deepEqual(lookalike.sources, ['evidence', 'text'])
    assert.match(lookalike.text, /combines MCB's name/)
    // Every engine finding is still covered: language findings as the lead
    // text of a group that lists the transaction checks, the rest verbatim.
    for (const check of fraud.analysis.checks) {
      for (const finding of check.findings.filter((item) => item.tone !== 'ok')) {
        const shown = warnings.find((warning) => warning.text === finding.text)
        assert.ok(shown, finding.text)
        assert.ok(shown.sources.includes('transaction'), finding.text)
      }
    }
    // Sender claims have no engine counterpart and stay separate lines.
    assert.equal(warnings.filter((warning) => /presents itself as/.test(warning.text)).length, 2)
  })

  test('a code warning read as a mention is not merged with a request for codes', () => {
    const tx = find(analysedLedger({ LEGITIMATE: { requestText: ALARMING_LEGIT } }), 'LEGITIMATE')
    const mention = warningsFor(tx).find((warning) => warning.sources.includes('evidence'))
    assert.ok(mention, 'evidence mention still listed')
    assert.deepEqual(mention.sources, ['evidence'])
    assert.match(mention.text, /mention, not a request/)
  })

  test('identical text from any source is shown once; inputs are not changed', () => {
    const analysis = {
      checks: [
        { id: 'amount', status: 'WARN', findings: [{ tone: 'warn', text: 'Same text' }] },
        { id: 'recipient', status: 'FAIL', findings: [{ tone: 'bad', text: 'Same text' }, { tone: 'ok', text: 'Fine' }] },
      ],
    }
    const snapshot = structuredClone(analysis)
    assert.deepEqual(decisionWarnings(analysis, null), [{ id: 'text:Same text', text: 'Same text', tone: 'bad', sources: ['transaction'] }])
    assert.deepEqual(analysis, snapshot)
  })
})
