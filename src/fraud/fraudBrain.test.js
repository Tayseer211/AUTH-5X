import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { approveTransaction, saveAnalysis } from '../transactions/ledger.js'
import { assessPendingRequest } from '../transactions/requestAssessment.js'
import { decisionWarnings } from '../verification/decisionState.js'
import { assessStandingOrder } from './assessment.js'
import { analyseStandingOrder } from './engine.js'
import { DEFAULT_MODEL } from './ml/defaultModel.js'
import { prepareModel } from './ml/explain.js'
import { deriveUserProfile } from './profile.js'
import { generateMessageCorpus, messageInput } from './synthetic/messages.js'
import { classifyMessage } from './text/classifier.js'

// Stage 6: the fraud brain end to end. Every expected level below follows the
// documented hybrid-2 policy (aggregation.js); the point is how families of
// evidence combine, not any single keyword or feature.

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const AS_OF = NOW.toISOString()
const DEMO = Object.fromEntries(createDemoRequests({ bank: { code: 'MCB' } }, { now: NOW }).map((tx) => [tx.verificationCase, tx]))
const HISTORY = [...createSeedTransactions(NOW), ...Object.values(DEMO)]
const PROFILE = deriveUserProfile(HISTORY)
const NORMAL = DEMO.LEGITIMATE // known payee, usual amount, day, hour and device
const MODERATE = DEMO.GREY // unusual amount and timing for a known payee
const FRAUD = DEMO.FRAUD // new payee, huge weekly amount, new device, email link

const ARTIFACT = JSON.parse(readFileSync(new URL('../../models/fraud-model.json', import.meta.url), 'utf8'))
const ALWAYS_HIGH = prepareModel({ ...ARTIFACT, model: { ...ARTIFACT.model, bias: ARTIFACT.model.bias + 30 } })

function brain(request, text, { history = HISTORY, profile = PROFILE, model = DEFAULT_MODEL, fixed = true } = {}) {
  const withText = { ...request, requestText: text ?? '' }
  const analysis = fixed ? { ...analyseStandingOrder(withText, profile), analysedAt: AS_OF } : null
  return assessStandingOrder({ request: withText, profile, text, userBank: 'MCB', analysis, history, model })
}
const levelOf = (...args) => brain(...args).combinedAssessment.level
const families = (result) => result.combinedAssessment.families

const MSG = {
  normal: 'Monthly service fee for the office cleaning contract, invoice INV-2291 for Rs 5,000. Please pay ABC Services Ltd, account ending in 4417, on the 30th of each month.',
  mild: 'Hi, just a reminder that the cleaning fee is now due. Kindly settle Rs 5,000 as usual when you can. Thanks.',
  accountChangeContradiction: 'Please note our bank details have changed. Pay invoice INV-2291 of Rs 5,000 to ABC Services Ltd, new account 000999123456.',
  pinAndOtherAmount: 'Please confirm your PIN to process the payment of Rs 9,000 to ABC Services Ltd.',
  greyNormal: 'Harbourline Property Management: revised monthly contribution of Rs 12,500 as agreed at the AGM, account ending in 0932.',
  greyPin: 'Harbourline Property Management: please confirm your PIN so we can process the revised Rs 12,500 contribution.',
  greyAccountChange: 'Harbourline Property Management: our bank details have changed. Please pay the revised contribution of Rs 12,500 to our new account 000999123456 from this month.',
  fraudNormal: 'Monthly payment to SecureVault Settlements Ltd as agreed. Thank you.',
  impersonationOtp: 'This is the MCB fraud department. To confirm this standing order, reply with the one-time code we just sent you.',
  changedAccount: 'ABC Services Ltd: our bank account has changed. Please pay the Rs 5,000 monthly fee to our new account 000999555111 from now on.',
  urgentChangedAccount: 'URGENT: your service will be suspended today. ABC Services Ltd has changed bank; transfer Rs 5,000 to our new account 000999555111 immediately. Do not call our office.',
}

describe('fraud brain — A: normal transaction', () => {
  test('1 normal message, consistent evidence → LOW', () => {
    const result = brain(NORMAL, MSG.normal)
    assert.equal(result.combinedAssessment.level, 'LOW')
    assert.equal(result.evidenceAnalysis.status, 'CONSISTENT')
  })

  test('2 mildly unusual message → LOW', () => {
    assert.equal(levelOf(NORMAL, MSG.mild), 'LOW')
  })

  test('3 suspicious message + strong contradiction on an independent fact → HIGH', () => {
    const result = brain(NORMAL, MSG.pinAndOtherAmount)
    assert.deepEqual(families(result), { transaction: 'NONE', message: 'MODERATE', contradiction: 'STRONG' })
    assert.equal(result.combinedAssessment.level, 'HIGH')
    assert.ok(result.combinedAssessment.rules.includes('message+independentContradiction'))
  })

  test('3′ suspicious message whose contradiction is the same fact it announces → MEDIUM (not counted twice)', () => {
    // "Our bank details have changed … new account X" and "X is not the request's account" are one fact.
    const result = brain(NORMAL, MSG.accountChangeContradiction)
    assert.deepEqual(families(result), { transaction: 'NONE', message: 'MODERATE', contradiction: 'STRONG' })
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })
})

describe('fraud brain — B: moderately suspicious transaction', () => {
  test('4 normal message, consistent evidence → MEDIUM', () => {
    const result = brain(MODERATE, MSG.greyNormal)
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.deepEqual(result.combinedAssessment.rules, ['transaction.medium'])
  })

  test('5 suspicious message, consistent evidence → MEDIUM (no contradiction to combine with)', () => {
    const result = brain(MODERATE, MSG.greyPin)
    assert.deepEqual(families(result), { transaction: 'MODERATE', message: 'MODERATE', contradiction: 'NONE' })
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })

  test('6 suspicious message + strong contradiction → HIGH (all three families)', () => {
    const result = brain(MODERATE, MSG.greyAccountChange)
    assert.deepEqual(families(result), { transaction: 'MODERATE', message: 'MODERATE', contradiction: 'STRONG' })
    assert.equal(result.combinedAssessment.level, 'HIGH')
    assert.ok(result.combinedAssessment.rules.includes('all.families'))
  })
})

describe('fraud brain — C: strongly fraudulent transaction', () => {
  test('7 no message → HIGH', () => assert.equal(levelOf(FRAUD, null), 'HIGH'))
  test('8 normal message → HIGH (a reassuring message never lowers it)', () => {
    const result = brain(FRAUD, MSG.fraudNormal)
    assert.equal(result.textAnalysis.classification, 'legit_normal')
    assert.equal(result.combinedAssessment.level, 'HIGH')
  })
  test('9 suspicious message → HIGH', () => assert.equal(levelOf(FRAUD, FRAUD.requestText), 'HIGH'))
})

describe('fraud brain — D: social engineering', () => {
  test('10 bank impersonation + one-time code request → MEDIUM, driven by the message and its evidence', () => {
    const result = brain(NORMAL, MSG.impersonationOtp)
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.equal(families(result).message, 'STRONG')
    assert.ok(result.textAnalysis.intents.includes('sensitiveInfoRequest'))
    assert.ok(result.evidenceAnalysis.signals.some((signal) => signal.id === 'sensitive.request'))
  })

  test('11 changed account details + account contradiction → MEDIUM (one fact, reported twice)', () => {
    const result = brain(NORMAL, MSG.changedAccount)
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.equal(result.evidenceAnalysis.fields.account.status, 'CONFLICT')
  })

  test('12 urgency and threats + a changed account → HIGH', () => {
    const result = brain(NORMAL, MSG.urgentChangedAccount)
    assert.deepEqual(families(result), { transaction: 'NONE', message: 'STRONG', contradiction: 'STRONG' })
    assert.equal(result.combinedAssessment.level, 'HIGH')
  })
})

describe('fraud brain — E: legitimate unusual activity', () => {
  test('13 unusual amount, known payee, coherent explanation → LOW (not HIGH)', () => {
    const result = brain({ ...NORMAL, amount: 12000 }, 'ABC Services Ltd: new annual contract price agreed in August. Monthly fee is now Rs 12,000, same account ending in 4417. Invoice INV-2291.')
    assert.equal(result.transactionAnalysis.score, 87)
    // Stage 5 dropped the passing language check and re-weighted the amount
    // penalty to 84 (MEDIUM); neutralising it keeps the engine's 87.
    assert.equal(result.risk.transactionRisk.rulesExcludingLanguage.score, 87)
    assert.equal(result.combinedAssessment.level, 'LOW')
  })

  test('14 unusual frequency, same payee and account → LOW', () => {
    assert.equal(levelOf({ ...NORMAL, frequency: 'WEEKLY', amount: 1250 }, 'ABC Services Ltd: as agreed, the cleaning fee is now paid weekly, Rs 1,250 per week to the same account ending in 4417.'), 'LOW')
  })

  test('15 a new, legitimate payee → not HIGH', () => {
    const request = { ...NORMAL, recipient: 'Corail Garden Services', recipientAccount: '5521', recipientBank: 'OTHER_LOCAL_BANK', amount: 3000, description: 'Garden maintenance' }
    const level = levelOf(request, 'Corail Garden Services: monthly garden maintenance, Rs 3,000, invoice INV-5521. Payable to our SBM account ending in 5521.')
    assert.notEqual(level, 'HIGH')
    assert.equal(level, 'LOW')
  })
})

describe('fraud brain — F: contradictions', () => {
  const conflict = (result, field) => result.evidenceAnalysis.fields[field].status
  test('16 a different amount is detected', () => {
    const result = brain(NORMAL, 'Invoice INV-2291 from ABC Services Ltd for Rs 7,500, payable monthly.')
    assert.equal(conflict(result, 'amount'), 'CONFLICT')
    assert.deepEqual(result.risk.evidenceRisk.strongFacts, ['amount'])
  })
  test('17 a different payee is detected', () => {
    const result = brain(NORMAL, 'Please pay the monthly fee to Blue Lagoon Cleaning Ltd, invoice INV-2291 for Rs 5,000.')
    assert.equal(conflict(result, 'payee'), 'CONFLICT')
  })
  test('18 a different bank is detected (as a warning-level conflict)', () => {
    const result = brain(NORMAL, 'ABC Services Ltd: please pay Rs 5,000 into our SBM account ending in 4417.')
    assert.equal(conflict(result, 'bank'), 'CONFLICT')
    assert.equal(families(result).contradiction, 'WEAK')
  })
  test('19 a request for sensitive details is a clear message signal', () => {
    const result = brain(NORMAL, 'Before we process the Rs 5,000 fee, please send us your card PIN and the OTP you receive.')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.equal(result.evidenceAnalysis.fields.sensitiveInfo.status, 'SUSPICIOUS')
    assert.ok(result.combinedAssessment.reasons.some((reason) => reason.signal === 'sensitiveInfoRequest'))
  })
})

describe('fraud brain — G: no double counting', () => {
  test('rules and model are one family: a HIGH model on a MEDIUM request alone stays MEDIUM', () => {
    const result = brain(MODERATE, MODERATE.requestText, { model: ALWAYS_HIGH })
    assert.equal(result.mlAnalysis.band, 'HIGH')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })

  test('behaviour is explanation, not a vote', () => {
    const withBehaviour = brain(MODERATE, MODERATE.requestText)
    const withoutHistory = assessStandingOrder({ request: MODERATE, profile: PROFILE, text: MODERATE.requestText, userBank: 'MCB', analysis: { ...analyseStandingOrder(MODERATE, PROFILE), analysedAt: AS_OF } })
    assert.ok(withBehaviour.risk.behaviouralRisk.anomalies.length > 0)
    assert.equal(withBehaviour.combinedAssessment.level, withoutHistory.combinedAssessment.level)
    assert.deepEqual(withBehaviour.combinedAssessment.families, withoutHistory.combinedAssessment.families)
  })

  test('message wording is not counted through the engine and the classifier', () => {
    // Engine MEDIUM on wording alone (other checks fine apart from the hour),
    // classifier reads the same words as fraudulent: one family, MEDIUM.
    const text = 'URGENT: your account will be suspended today. Do not contact your branch. Confirm your PIN at https://mcb-verify-now.example/login'
    const result = brain({ ...NORMAL, context: { ...NORMAL.context, initiatedAt: MODERATE.context.initiatedAt } }, text)
    assert.equal(result.transactionAnalysis.riskLevel, 'MEDIUM')
    assert.equal(result.risk.transactionRisk.rulesExcludingLanguage.level, 'LOW')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })

  test('one contradicted fact never escalates twice', () => {
    // A different currency makes the amount and the currency disagree.
    const currency = brain(NORMAL, 'Invoice INV-2291 from ABC Services Ltd for USD 5,000.')
    assert.equal(currency.risk.evidenceRisk.strongConflicts, 1)
    assert.equal(currency.combinedAssessment.level, 'MEDIUM')
    // Two different facts (payee and account) do combine.
    assert.equal(levelOf(NORMAL, 'Please pay XYZ Holdings Ltd, account 000999777888, Rs 5,000.'), 'HIGH')
  })

  test('one suspicious keyword or signal cannot decide the outcome alone', () => {
    assert.equal(levelOf(NORMAL, 'URGENT'), 'LOW')
    assert.equal(levelOf(NORMAL, 'Please confirm your PIN.'), 'MEDIUM')
    assert.equal(levelOf(NORMAL, 'Security notice from MCB.'), 'LOW')
  })
})

describe('fraud brain — adversarial', () => {
  // A ledger that records payee accounts, so a changed account can be seen.
  const HISTORY_WITH_ACCOUNTS = HISTORY.map((tx) => (tx.recipient === NORMAL.recipient && tx.status === 'APPROVED' ? { ...tx, recipientAccount: '4417' } : tx))
  const PROFILE_WITH_ACCOUNTS = deriveUserProfile(HISTORY_WITH_ACCOUNTS)

  test('A routine-looking redirection (ordinary wording, new account, webmail sender) → HIGH', () => {
    const text =
      'Good morning, please find attached invoice INV-2291 for Rs 5,000. Please note payments should now be made to account 000999322927; the account on the invoice is no longer in use. Kind regards, Accounts. Sent from accounts.abc@webmail-pro.example'
    assert.equal(levelOf(NORMAL, text), 'HIGH')
  })

  test('B bank impersonation asking for a code → MEDIUM with the code request as a reason', () => {
    const result = brain(NORMAL, 'MCB security team: we detected unusual activity. Share the 6-digit code we sent to keep this standing order active.')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.ok(result.combinedAssessment.drivers[0].reasons.some((reason) => /codes, PINs or passwords/.test(reason)))
  })

  test('C threat-only wording with no redirection or code request: flagged by the rules, not escalated', () => {
    const result = brain(NORMAL, 'Your account will be frozen today unless this payment is completed immediately. Pay Rs 5,000 now to avoid closure.')
    assert.equal(result.combinedAssessment.level, 'LOW')
    assert.equal(result.transactionAnalysis.checks.find((check) => check.id === 'language').status, 'WARN')
  })

  test('D "no need to call" → MEDIUM', () => {
    assert.equal(levelOf(NORMAL, 'ABC Services Ltd: please process this payment today. No need to call our office to verify, we are handling it directly.'), 'MEDIUM')
  })

  test('E a genuine warning that mentions codes is not treated as a request → LOW', () => {
    const result = brain(NORMAL, 'MCB will never ask for your PIN, password or one-time code. Never share them with anyone, including our staff.')
    assert.equal(result.combinedAssessment.level, 'LOW')
    assert.equal(families(result).message, 'NONE')
  })

  test('F an unusually high but explained payment to a known payee → LOW', () => {
    assert.equal(levelOf({ ...NORMAL, amount: 9000 }, 'ABC Services Ltd: deep-clean of the office after renovation, one month only, Rs 9,000 as per quote Q-2291, same account ending in 4417.'), 'LOW')
  })

  test('G fraud that looks routine: a known payee’s account quietly changed → MEDIUM via the payee history check', () => {
    const changed = { ...NORMAL, recipientAccount: '9911' }
    const result = brain(changed, NORMAL.requestText, { history: HISTORY_WITH_ACCOUNTS, profile: PROFILE_WITH_ACCOUNTS })
    assert.equal(result.transactionAnalysis.score, 100)
    assert.deepEqual(result.risk.transactionRisk.profileFlags, ['recipientAccountChanged'])
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.ok(result.combinedAssessment.rules.includes('transaction.profile'))
    // The same account as before raises nothing.
    assert.equal(levelOf(NORMAL, NORMAL.requestText, { history: HISTORY_WITH_ACCOUNTS, profile: PROFILE_WITH_ACCOUNTS }), 'LOW')
    // A ledger that never recorded accounts cannot show a change.
    assert.equal(levelOf(changed, NORMAL.requestText), 'LOW')
  })

  test('G′ a look-alike payee name → MEDIUM via the payee history check', () => {
    const result = brain({ ...NORMAL, recipient: 'ABC Service Ltd' }, null)
    assert.equal(result.transactionAnalysis.riskLevel, 'LOW')
    assert.deepEqual(result.risk.transactionRisk.profileFlags, ['lookalikeRecipient'])
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })
})

describe('fraud brain — payee history checks never decide alone', () => {
  // A ledger that records which account each past payment to the payee went to.
  function ledgerWithAccounts(accounts) {
    const paid = HISTORY.filter((tx) => tx.recipient === NORMAL.recipient && tx.status === 'APPROVED')
    const history = HISTORY.map((tx) => (paid.includes(tx) ? { ...tx, recipientAccount: accounts[0] } : tx))
    if (accounts[1]) history.push({ ...paid[0], id: 'second-account', recipientAccount: accounts[1] })
    return { history, profile: deriveUserProfile(history) }
  }
  const ONE_ACCOUNT = ledgerWithAccounts(['4417'])
  const TWO_ACCOUNTS = ledgerWithAccounts(['4417', '8830'])
  const NEW_PAYEE = { ...NORMAL, recipient: 'Corail Garden Services', recipientAccount: '5521', recipientBank: 'OTHER_LOCAL_BANK', amount: 3000, description: 'Garden maintenance' }
  const CHANGED = { ...NORMAL, recipientAccount: '9911' }
  const LOOKALIKE = { ...NORMAL, recipient: 'ABC Service Ltd' }

  test('a known payee at an account not seen before is MEDIUM, and stays MEDIUM with a HIGH model', () => {
    for (const model of [DEFAULT_MODEL, ALWAYS_HIGH]) {
      const result = brain(CHANGED, null, { ...ONE_ACCOUNT, model })
      assert.deepEqual(result.risk.transactionRisk.profileFlags, ['recipientAccountChanged'])
      assert.equal(result.combinedAssessment.level, 'MEDIUM')
      assert.deepEqual(result.combinedAssessment.rules, ['transaction.profile'])
    }
  })

  test('any account already on file for the payee raises nothing; a third, unseen one does', () => {
    assert.equal(levelOf({ ...NORMAL, recipientAccount: '8830' }, null, TWO_ACCOUNTS), 'LOW')
    assert.equal(levelOf(NORMAL, null, TWO_ACCOUNTS), 'LOW')
    assert.equal(levelOf(CHANGED, null, TWO_ACCOUNTS), 'MEDIUM')
  })

  test('a look-alike payee name is MEDIUM, and stays MEDIUM with a HIGH model', () => {
    for (const model of [DEFAULT_MODEL, ALWAYS_HIGH]) {
      const result = brain(LOOKALIKE, null, { ...ONE_ACCOUNT, model })
      assert.deepEqual(result.risk.transactionRisk.profileFlags, ['lookalikeRecipient'])
      assert.equal(result.combinedAssessment.level, 'MEDIUM')
    }
  })

  test('a new legitimate payee is LOW, with or without a HIGH model (no flag, and the model cannot act alone)', () => {
    for (const model of [DEFAULT_MODEL, ALWAYS_HIGH]) {
      const result = brain(NEW_PAYEE, null, { ...ONE_ACCOUNT, model })
      assert.deepEqual(result.risk.transactionRisk.profileFlags, [])
      assert.equal(result.combinedAssessment.level, 'LOW')
    }
  })

  test('a payee history flag with an ordinary message is still MEDIUM, not HIGH', () => {
    const text = 'Monthly service fee for the office cleaning contract, invoice INV-2291 for Rs 5,000. Please pay ABC Services Ltd, account ending in 9911.'
    assert.equal(levelOf(CHANGED, text, ONE_ACCOUNT), 'MEDIUM')
  })

  test('it escalates only together with a second family: a message quoting the old account', () => {
    const quotesOldAccount = 'Invoice INV-2291 from ABC Services Ltd, Rs 5,000, account ending in 4417.'
    const alone = brain(CHANGED, quotesOldAccount, ONE_ACCOUNT)
    assert.deepEqual(families(alone), { transaction: 'MODERATE', message: 'NONE', contradiction: 'STRONG' })
    assert.equal(alone.combinedAssessment.level, 'MEDIUM')
    // Backed by a HIGH model band the transaction family is strong, and the contradiction agrees.
    const backed = brain(CHANGED, quotesOldAccount, { ...ONE_ACCOUNT, model: ALWAYS_HIGH })
    assert.equal(backed.combinedAssessment.level, 'HIGH')
    assert.ok(backed.combinedAssessment.rules.includes('contradiction+transaction'))
  })

  test('the flag is explained in plain language', () => {
    const { combinedAssessment } = brain(CHANGED, null, ONE_ACCOUNT)
    assert.ok(combinedAssessment.reasons.some((reason) => reason.source === 'profile' && /not one you have paid them at before/.test(reason.text)))
    assert.ok(combinedAssessment.drivers[0].reasons.some((reason) => /not one you have paid them at before/.test(reason)))
  })
})

describe('fraud brain — pressure wording without a payment demand is not a fraud rule', () => {
  const PRESSURE = 'Your account will be frozen. Pay immediately.'

  test('urgency and threats alone stay LOW, with the reasons still shown', () => {
    const result = brain(NORMAL, PRESSURE)
    assert.deepEqual(result.textAnalysis.intents, ['urgency', 'threat'])
    assert.equal(result.textAnalysis.classification, 'legit_unusual')
    assert.equal(result.combinedAssessment.level, 'LOW')
    assert.deepEqual(result.combinedAssessment.drivers, [])
    // The engine's own language check flags it, and the message reasons are listed.
    assert.equal(result.transactionAnalysis.checks.find((check) => check.id === 'language').status, 'WARN')
    const signals = result.combinedAssessment.reasons.filter((reason) => reason.source === 'text').map((reason) => reason.signal)
    assert.deepEqual(signals.sort(), ['threat', 'urgency'])
  })

  test('the same wording combined with a payment to an account stated in the message is MEDIUM', () => {
    const result = brain(NORMAL, 'Your account will be frozen today unless you pay Rs 5,000 immediately to account 000999123456.')
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
    assert.deepEqual(result.textAnalysis.intents.sort(), ['newPaymentDestination', 'threat', 'urgency'])
  })

  test('with a different amount as well, two contradicted facts make it HIGH', () => {
    const result = brain(NORMAL, 'Your account will be frozen today unless you pay Rs 9,000 immediately to account 000999123456.')
    assert.equal(result.combinedAssessment.level, 'HIGH')
  })

  test('on a review-level transaction it stays MEDIUM: wording alone does not block approval', () => {
    const result = brain(MODERATE, PRESSURE)
    assert.deepEqual(families(result), { transaction: 'MODERATE', message: 'NONE', contradiction: 'NONE' })
    assert.equal(result.combinedAssessment.level, 'MEDIUM')
  })

  test('a genuine overdue notice with consistent details is not escalated', () => {
    const notice = 'URGENT – ABC Services Ltd: invoice INV-2291 (Rs 5,000) is now 30 days overdue. Please settle it immediately to avoid suspension of your service.'
    const result = brain(NORMAL, notice)
    assert.deepEqual(result.textAnalysis.intents, ['urgency', 'threat'])
    assert.equal(result.combinedAssessment.level, 'LOW')
  })

  // Why the level is left alone: in the synthetic corpus every message with both
  // urgency and threat wording that the classifier reads as legitimate is a
  // genuine overdue or expiry notice, and every scam with that pairing is
  // already classified fraudulent. "Urgency + threat ⇒ review" would flag the
  // genuine notices and catch no scam the system misses.
  test('corpus evidence: urgency + threat that reads as legitimate is only ever a genuine notice', () => {
    const rows = generateMessageCorpus().records.map((record) => ({ record, result: classifyMessage(messageInput(record)) }))
    const pressured = rows.filter(({ result }) => result.intents.includes('urgency') && result.intents.includes('threat'))
    const readAsLegit = pressured.filter(({ result }) => result.classification === 'legit_normal' || result.classification === 'legit_unusual')
    assert.ok(readAsLegit.length >= 5)
    assert.ok(readAsLegit.every(({ record }) => record.label === 'legit_unusual' && ['overdue_urgent', 'notice_fr'].includes(record.scenario)))
    const scams = pressured.filter(({ record }) => record.label === 'suspicious' || record.label === 'fraudulent')
    assert.ok(scams.length >= 10)
    assert.ok(scams.every(({ result }) => result.classification === 'fraudulent'))
  })
})

describe('fraud brain — arbitrary pending requests', () => {
  const variants = {
    'no message': [NORMAL, null],
    'no account': [{ ...NORMAL, recipientAccount: null }, MSG.normal],
    'no reference': [{ ...NORMAL, reference: null }, MSG.normal],
    'unknown bank': [{ ...NORMAL, recipientBank: 'MOON_BANK' }, MSG.normal],
    'no bank': [{ ...NORMAL, recipientBank: null }, MSG.normal],
    'no device': [{ ...NORMAL, context: { ...NORMAL.context, deviceId: null } }, MSG.normal],
    'no channel': [{ ...NORMAL, context: { ...NORMAL.context, channel: null } }, MSG.normal],
    'no context': [{ ...NORMAL, context: undefined }, MSG.normal],
    'no currency': [{ ...NORMAL, currency: undefined }, MSG.normal],
    'no description': [{ ...NORMAL, description: undefined }, MSG.normal],
  }

  for (const [name, [request, text]] of Object.entries(variants)) {
    test(`${name}: assessed without error or invented evidence`, () => {
      const result = brain(request, text)
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.combinedAssessment.level))
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
      if (!text) assert.equal(result.evidenceAnalysis, null)
      if (!request.recipientAccount) assert.equal(result.evidenceAnalysis.fields.account.request, null)
    })
  }

  test('an unknown bank makes the model estimate unavailable, not wrong', () => {
    const result = brain({ ...NORMAL, recipientBank: 'MOON_BANK' }, MSG.normal)
    assert.equal(result.mlAnalysis.status, 'UNAVAILABLE')
    assert.equal(result.combinedAssessment.level, 'LOW')
  })

  test('a malformed (non-string) request text is read as no text', () => {
    const result = assessStandingOrder({ request: { ...NORMAL, requestText: 12345 }, profile: PROFILE, userBank: 'MCB', history: HISTORY, model: DEFAULT_MODEL })
    assert.equal(result.textAnalysis, null)
    assert.equal(result.transactionAnalysis.score, 100)
  })

  test('a new user with no history is assessed without error', () => {
    const result = brain(NORMAL, MSG.normal, { history: [], profile: deriveUserProfile([]) })
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(result.combinedAssessment.level))
  })
})

describe('fraud brain — explainability', () => {
  const scenarios = [
    [MODERATE, MODERATE.requestText],
    [FRAUD, FRAUD.requestText],
    [FRAUD, null],
    [NORMAL, MSG.impersonationOtp],
    [NORMAL, MSG.urgentChangedAccount],
    [NORMAL, MSG.pinAndOtherAmount],
    [MODERATE, MSG.greyAccountChange],
    [NORMAL, 'Invoice INV-2291 from ABC Services Ltd for USD 5,000.'],
    [{ ...NORMAL, recipient: 'ABC Service Ltd' }, null],
    [{ ...NORMAL, context: { ...NORMAL.context, initiatedAt: MODERATE.context.initiatedAt } }, 'URGENT: your account will be suspended today. Do not contact your branch. Confirm your PIN at https://mcb-verify-now.example/login'],
  ]

  test('every MEDIUM or HIGH names its drivers, and every driver reason comes from a source analysis', () => {
    for (const [request, text] of scenarios) {
      const result = brain(request, text)
      const { combinedAssessment } = result
      assert.notEqual(combinedAssessment.level, 'LOW')
      assert.ok(combinedAssessment.drivers.length > 0)
      const sourceTexts = new Set([
        ...result.transactionAnalysis.checks.flatMap((check) => check.findings.map((finding) => finding.text)),
        ...combinedAssessment.reasons.map((reason) => reason.text),
        ...combinedAssessment.supporting.map((item) => item.text),
      ])
      for (const driver of combinedAssessment.drivers) {
        assert.ok(driver.reasons.length > 0, driver.rule)
        for (const reason of driver.reasons) assert.ok(sourceTexts.has(reason), `${driver.rule}: untraceable "${reason}"`)
      }
    }
  })

  test('a driver that rests on several families shows evidence from each, even when shortened', () => {
    // Message + contradiction: the first three reasons a screen shows include
    // the actual contradiction, not only message signals.
    const twoFamilies = brain(NORMAL, MSG.urgentChangedAccount).combinedAssessment.drivers.find((driver) => driver.rule === 'message+contradiction')
    assert.deepEqual(twoFamilies.families, ['message', 'contradiction'])
    assert.ok(twoFamilies.reasons.slice(0, 3).some((reason) => /account ending .* but the request pays/.test(reason)), twoFamilies.reasons.join(' | '))
    assert.ok(twoFamilies.reasons.slice(0, 3).some((reason) => /^Message signal:/.test(reason)))
    // Within a family the strongest reason comes first: the account
    // contradiction (bad) is shown ahead of the bank-name difference (warn).
    const redirection = brain(NORMAL, 'Urgent: ABC Services Ltd has changed bank. Pay Rs 5,000 to our new SBM account 000999555111 today, the old account is no longer in use. Do not call our office.')
    const withBank = redirection.combinedAssessment.drivers.find((driver) => driver.rule === 'message+contradiction')
    assert.ok(redirection.evidenceAnalysis.signals.some((signal) => signal.id === 'bank.mismatch'))
    const conflictReasons = withBank.reasons.filter((reason) => !/^Message signal:/.test(reason))
    assert.match(conflictReasons[0], /account ending .* but the request pays/)
    assert.match(withBank.reasons.slice(0, 3).join(' '), /account ending .* but the request pays/)
    // All three families: one reason from each comes first.
    const threeFamilies = brain(MODERATE, MSG.greyAccountChange).combinedAssessment.drivers.find((driver) => driver.rule === 'all.families')
    assert.deepEqual(threeFamilies.families, ['transaction', 'message', 'contradiction'])
    const [first, second, third] = threeFamilies.reasons
    assert.doesNotMatch(first, /^Message signal:|account ending/)
    assert.match(second, /^Message signal:/)
    assert.match(third, /account ending/)
  })

  test('a LOW assessment has no drivers', () => {
    assert.deepEqual(brain(NORMAL, MSG.normal).combinedAssessment.drivers, [])
  })

  test('the model explains itself in plain language, never as a probability', () => {
    const result = brain(FRAUD, FRAUD.requestText)
    const factors = result.combinedAssessment.supporting.find((item) => item.text.startsWith('Factors that raised the model estimate most'))
    assert.ok(factors)
    for (const { text } of [...result.combinedAssessment.supporting, ...result.combinedAssessment.reasons]) {
      assert.doesNotMatch(text, /logit|column|__|[a-z][A-Z][a-z]+[A-Z]|probability of fraud|chance (that|this) is fraud|\d+(\.\d+)?% (probability|chance)/)
    }
    assert.doesNotMatch(result.combinedAssessment.summary, /\d+(\.\d+)?% (probability|chance)|probability of fraud/)
  })
})

describe('fraud brain — snapshots', () => {
  const USER = { id: 'stage6-user', bank: { code: 'MCB' } }

  test('a stored assessment, its reasons and its decision gate survive later ledger changes', () => {
    const base = { transactions: HISTORY, demoRun: 1 }
    const grey = base.transactions.find((tx) => tx.verificationCase === 'GREY')
    const analysis = { ...analyseStandingOrder(grey, deriveUserProfile(base.transactions)), analysedAt: AS_OF }
    const first = assessPendingRequest(grey, base.transactions, USER, { analysis })
    let ledger = saveAnalysis(USER.id, base, grey.id, first.analysis, first.assessment)
    const stored = structuredClone(ledger.transactions.find((tx) => tx.id === grey.id))
    const warningsBefore = decisionWarnings(stored.analysis, stored.assessment)

    // Unrelated ledger activity after the analysis.
    const legit = ledger.transactions.find((tx) => tx.verificationCase === 'LEGITIMATE')
    const legitAssessed = assessPendingRequest(legit, ledger.transactions, USER)
    ledger = approveTransaction(USER.id, saveAnalysis(USER.id, ledger, legit.id, legitAssessed.analysis, legitAssessed.assessment), legit.id)
    const later = { ...ledger.transactions.find((tx) => tx.status === 'APPROVED' && !tx.decision), id: 'later', amount: 99000, createdAt: '2099-01-01T00:00:00.000Z' }
    ledger = { ...ledger, transactions: [...ledger.transactions, later] }

    const reopened = ledger.transactions.find((tx) => tx.id === grey.id)
    assert.deepEqual(reopened.assessment, stored.assessment)
    assert.deepEqual(decisionWarnings(reopened.analysis, reopened.assessment), warningsBefore)

    // Re-assessing with the same analysis time on the later ledger reproduces it.
    const again = assessPendingRequest(grey, ledger.transactions, USER, { analysis })
    assert.deepEqual(again.assessment.mlAnalysis, stored.assessment.mlAnalysis)
    for (const key of ['level', 'rules', 'families', 'drivers', 'reasons']) assert.deepEqual(again.assessment.combined[key], stored.assessment.combined[key], key)
  })

  test('the same request, ledger and asOf always give the same assessment', () => {
    const first = brain(MODERATE, MSG.greyAccountChange)
    for (let run = 0; run < 3; run++) assert.deepEqual(brain(MODERATE, MSG.greyAccountChange), first)
  })
})
