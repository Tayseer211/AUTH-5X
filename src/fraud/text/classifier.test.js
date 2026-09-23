import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { MESSAGE_LABELS, generateMessageCorpus, messageInput } from '../synthetic/messages.js'
import { CLASSIFICATIONS, CLASSIFIER_VERSION, SIGNALS, THRESHOLDS, classifyMessage } from './classifier.js'

const LEGIT_INVOICE = 'Invoice INV-2026-0412 from Corail Cleaning Services for Rs 4,500 is due on 30/10/2026. Pay by bank transfer quoting the invoice number.'
const CHANGED_DETAILS = 'Please note our bank details have changed. Kindly pay invoice INV-2231 of Rs 12,000 to our new account 000999123456.'
const BANK_CODE_SCAM = 'MCB ALERT: your account will be suspended today. Reply with the one-time code we sent you to keep it active.'
const QUIET_REDIRECTION =
  'Good morning, please find attached invoice INV-5521 for Rs 30,800. Payments should now be made to account 000999322927; the account on the invoice is no longer in use. Kind regards, Accounts. Sent from accounts.corail@webmail-pro.example'

const intentsOf = (text) => classifyMessage(text).intents

describe('classifyMessage — output', () => {
  test('stable shape and version', () => {
    const result = classifyMessage(BANK_CODE_SCAM)
    assert.deepEqual(Object.keys(result), ['version', 'classification', 'score', 'confidence', 'intents', 'signals', 'summary'])
    assert.equal(result.version, CLASSIFIER_VERSION)
    for (const signal of result.signals) assert.deepEqual(Object.keys(signal), ['id', 'label', 'weight', 'evidence'])
    assert.match(result.summary, /not a fraud probability/)
  })

  test('classifications use the corpus label vocabulary', () => {
    assert.deepEqual(CLASSIFICATIONS, MESSAGE_LABELS)
  })

  test('deterministic and JSON-serialisable', () => {
    const { records } = generateMessageCorpus()
    const first = records.map((record) => classifyMessage(messageInput(record)))
    assert.deepEqual(records.map((record) => classifyMessage(messageInput(record))), first)
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first)
  })

  test('confidence stays in [0.5, 1] for text and is 0 without text', () => {
    for (const record of generateMessageCorpus().records) {
      const { confidence } = classifyMessage(messageInput(record))
      assert.ok(confidence >= 0.5 && confidence <= 1, `${record.id}: ${confidence}`)
    }
    assert.equal(classifyMessage('').confidence, 0)
  })

  test('empty or non-string input', () => {
    for (const input of ['', '   \n', null, undefined, 42, { text: BANK_CODE_SCAM }]) {
      const result = classifyMessage(input)
      assert.equal(result.classification, null)
      assert.equal(result.confidence, 0)
      assert.deepEqual(result.signals, [])
    }
  })
})

describe('classifyMessage — classifications', () => {
  test('a routine invoice is legit_normal with no risk signals', () => {
    const result = classifyMessage(LEGIT_INVOICE)
    assert.equal(result.classification, 'legit_normal')
    assert.deepEqual(result.intents, [])
  })

  test('changed bank details with a new account number are suspicious, not fraud', () => {
    const result = classifyMessage(CHANGED_DETAILS)
    assert.equal(result.classification, 'suspicious')
    assert.deepEqual(result.intents, ['changedPaymentDetails', 'newPaymentDestination'])
  })

  test('a bank-impersonation code request is fraudulent, from several signals together', () => {
    const result = classifyMessage(BANK_CODE_SCAM)
    assert.equal(result.classification, 'fraudulent')
    for (const intent of ['urgency', 'threat', 'sensitiveInfoRequest', 'bankImpersonation', 'suspiciousContact']) assert.ok(result.intents.includes(intent), intent)
    assert.ok(result.score >= THRESHOLDS.fraudulent)
  })

  test('no single signal is enough for "fraudulent"', () => {
    for (const { weight } of Object.values(SIGNALS)) assert.ok(weight < THRESHOLDS.fraudulent)
    const result = classifyMessage('Please confirm your PIN.')
    assert.deepEqual(result.intents, ['sensitiveInfoRequest'])
    assert.equal(result.classification, 'suspicious')
  })

  test('alarming vocabulary in a genuine message', () => {
    const advice = classifyMessage('MCB will never ask for your PIN, password or one-time code. Never share them with anyone.')
    assert.equal(advice.classification, 'legit_normal')
    assert.ok(!advice.intents.includes('sensitiveInfoRequest'))

    const notice = classifyMessage('URGENT: planned water supply interruption on 12/10/2026 from 08:00. No payment or action is required.')
    assert.ok(notice.intents.includes('urgency'))
    assert.equal(notice.classification, 'legit_normal')
  })

  test('a routine-sounding fraud without obvious fraud vocabulary', () => {
    assert.doesNotMatch(QUIET_REDIRECTION, /\b(fraud|scam|otp|pin|password)\b/i)
    const result = classifyMessage(QUIET_REDIRECTION)
    assert.equal(result.classification, 'fraudulent')
    assert.deepEqual(result.intents, ['changedPaymentDetails', 'newPaymentDestination', 'suspiciousContact'])
  })

  test('French', () => {
    const scam = classifyMessage('MCB : votre compte sera suspendu aujourd’hui. Confirmez vos informations sur https://mcb-secure-login.example/verify avec votre code de sécurité.')
    assert.equal(scam.classification, 'fraudulent')
    assert.ok(scam.intents.includes('lookalikeLink') && scam.intents.includes('sensitiveInfoRequest'))
    const invoice = classifyMessage('Veuillez trouver ci-joint la facture INV-2026-8426 d’un montant de Rs 6,110, payable avant le 26/12/2026.')
    assert.equal(invoice.classification, 'legit_normal')
  })

  test('Mauritian Kreol', () => {
    const scam = classifyMessage('MCB: ou kont inn bloke. Pou debloke li, avoy nou kod OTP ki ou pou resevwar lor ou portab.')
    assert.equal(scam.classification, 'fraudulent')
    assert.ok(scam.intents.includes('sensitiveInfoRequest') && scam.intents.includes('threat'))
    const receipt = classifyMessage('Nou finn resevwar ou peyman Rs 1,880 pou kont ACC-2026-19874. Mersi.')
    assert.equal(receipt.classification, 'legit_normal')
  })

  test('each detected intent carries its evidence', () => {
    const result = classifyMessage(QUIET_REDIRECTION)
    assert.deepEqual(result.signals.find((signal) => signal.id === 'newPaymentDestination').evidence, ['000999322927'])
    assert.deepEqual(result.signals.find((signal) => signal.id === 'suspiciousContact').evidence, ['accounts.corail@webmail-pro.example'])
  })
})

describe('classifyMessage — input isolation', () => {
  test('changing a record’s label, scenario or tags leaves the result unchanged', () => {
    const record = generateMessageCorpus().records.find((entry) => entry.label === 'fraudulent')
    const relabelled = { ...record, label: 'legit_normal', scenario: 'invoice', language: 'fr', patternTags: [] }
    assert.equal(messageInput(relabelled), messageInput(record))
    assert.deepEqual(classifyMessage(messageInput(relabelled)), classifyMessage(messageInput(record)))
  })

  test('extra arguments are ignored and a record object is not read', () => {
    const record = generateMessageCorpus().records[0]
    assert.deepEqual(classifyMessage(record.text, record), classifyMessage(record.text))
    assert.equal(classifyMessage(record).classification, null)
  })

  test('the classifier depends only on text modules', () => {
    const source = readFileSync(new URL('./classifier.js', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]).sort()
    assert.deepEqual(imports, ['./extract.js', './patterns.js'])
    assert.doesNotMatch(source, /\bscenario\b|patternTags|compareEvidence|\b(profile|request)\.\w/)
  })
})
