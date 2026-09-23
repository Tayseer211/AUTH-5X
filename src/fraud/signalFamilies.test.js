import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { CHECKS } from './engine.js'
import { MODEL_FEATURES } from './ml/featureSpec.js'
import {
  BEHAVIOUR_ANOMALY_FLAGS,
  ENGINE_CHECK_FAMILIES,
  EVIDENCE_FIELD_FACTS,
  EVIDENCE_FIELD_FAMILIES,
  FAMILIES,
  MESSAGE_INTENT_FACTS,
  MESSAGE_SIGNALS,
  MODEL_FEATURE_DESCRIPTIONS,
  MODEL_FEATURE_FAMILIES,
  TRANSACTION_PROFILE_FLAGS,
  behaviourAnomalies,
  engineFindingTopic,
  evidenceSignalFact,
  evidenceSignalFamily,
  evidenceSignalTopic,
  messageSignalTopic,
  transactionProfileFlags,
} from './signalFamilies.js'
import { SIGNALS } from './text/classifier.js'
import { LANGUAGE_PATTERNS } from './text/patterns.js'
import { DERIVED_FEATURES } from './synthetic/schema.js'

// Every evidence signal id emitted by evidence.js ("date.${relation}" gives
// date.before and date.after).
function evidenceSignalIds() {
  const source = readFileSync(new URL('./text/evidence.js', import.meta.url), 'utf8')
  const ids = [...source.matchAll(/signal\(\s*signals,\s*'([^']+)'/g)].map((match) => match[1])
  assert.match(source, /`date\.\$\{date\.relation\.toLowerCase\(\)\}`/)
  return [...new Set([...ids, 'date.before', 'date.after'])].sort()
}

describe('signal families — completeness', () => {
  test('every rule check has one family; only language is message', () => {
    assert.deepEqual(Object.keys(ENGINE_CHECK_FAMILIES).sort(), CHECKS.map((check) => check.id).sort())
    assert.deepEqual(Object.entries(ENGINE_CHECK_FAMILIES).filter(([, family]) => family !== 'transaction').map(([id]) => id), ['language'])
  })

  test('every language pattern has a topic', () => {
    for (const { id, label } of LANGUAGE_PATTERNS) assert.ok(engineFindingTopic('language', `${label}: “x”`), id)
    assert.equal(engineFindingTopic('amount', 'Urgency pressure: “today”'), null)
  })

  test('every classifier signal is registered', () => {
    assert.deepEqual(Object.keys(MESSAGE_SIGNALS).sort(), Object.keys(SIGNALS).sort())
  })

  test('every evidence signal has a family', () => {
    const ids = evidenceSignalIds()
    assert.ok(ids.length >= 30)
    for (const id of ids) assert.ok(FAMILIES.includes(evidenceSignalFamily(id)), id)
    assert.deepEqual(Object.keys(EVIDENCE_FIELD_FAMILIES).sort(), [...new Set(ids.map((id) => id.split('.')[0]))].sort())
  })

  test('every model feature has exactly one group and family', () => {
    assert.deepEqual(Object.keys(MODEL_FEATURE_FAMILIES).sort(), MODEL_FEATURES.map((feature) => feature.name).sort())
    for (const { family } of Object.values(MODEL_FEATURE_FAMILIES)) assert.ok(FAMILIES.includes(family))
  })

  test('behaviour anomaly flags are real derived features', () => {
    const derived = new Set(DERIVED_FEATURES.map((feature) => feature.name))
    for (const flag of Object.keys(BEHAVIOUR_ANOMALY_FLAGS)) assert.ok(derived.has(flag), flag)
    assert.deepEqual(behaviourAnomalies({ derived: { newDevice: true, unusualHour: false, nightTime: true } }), ['nightTime', 'newDevice'])
    assert.deepEqual(behaviourAnomalies(null), [])
  })
})

describe('signal families — Stage 6 registries', () => {
  test('every model feature has a plain-language description, with no internal names', () => {
    assert.deepEqual(Object.keys(MODEL_FEATURE_DESCRIPTIONS).sort(), MODEL_FEATURES.map((feature) => feature.name).sort())
    for (const [name, text] of Object.entries(MODEL_FEATURE_DESCRIPTIONS)) {
      assert.ok(text.length > 5, name)
      assert.doesNotMatch(text, /[A-Z]|_|=|logit|feature|column/, name)
    }
  })

  test('every compared evidence field has a payment fact; amount and currency share one', () => {
    const contradictionFields = Object.entries(EVIDENCE_FIELD_FAMILIES).filter(([, family]) => family === 'contradiction').map(([field]) => field)
    assert.deepEqual(Object.keys(EVIDENCE_FIELD_FACTS).sort(), contradictionFields.sort())
    assert.equal(evidenceSignalFact('amount.mismatch'), evidenceSignalFact('currency.mismatch'))
    assert.equal(evidenceSignalFact('sender.claim'), null)
  })

  test('message intent facts refer to real classifier signals and payment facts', () => {
    const facts = new Set(Object.values(EVIDENCE_FIELD_FACTS))
    for (const [intent, intentFacts] of Object.entries(MESSAGE_INTENT_FACTS)) {
      assert.ok(intent in SIGNALS, intent)
      for (const fact of intentFacts) assert.ok(facts.has(fact), `${intent}: ${fact}`)
    }
  })

  test('profile flags are real derived features with plain-language reasons', () => {
    const derived = new Set(DERIVED_FEATURES.map((feature) => feature.name))
    for (const flag of Object.keys(TRANSACTION_PROFILE_FLAGS)) assert.ok(derived.has(flag), flag)
    assert.deepEqual(transactionProfileFlags({ derived: { recipientAccountChanged: true, lookalikeRecipient: false } }), ['recipientAccountChanged'])
    assert.deepEqual(transactionProfileFlags(null), [])
  })
})

describe('signal families — assignments', () => {
  test('comparisons are contradiction, message content is message', () => {
    assert.equal(evidenceSignalFamily('account.mismatch'), 'contradiction')
    assert.equal(evidenceSignalFamily('amount.match'), 'contradiction')
    assert.equal(evidenceSignalFamily('sensitive.request'), 'message')
    assert.equal(evidenceSignalFamily('sender.claim'), 'message')
    assert.equal(evidenceSignalFamily('unknown.id'), null)
  })

  test('wording features are message family; everything else in the model is transaction', () => {
    const message = Object.entries(MODEL_FEATURE_FAMILIES).filter(([, { family }]) => family === 'message').map(([name]) => name)
    assert.ok(message.every((name) => name.startsWith('text')))
    assert.equal(MODEL_FEATURE_FAMILIES.newDevice.group, 'behaviour')
    assert.equal(MODEL_FEATURE_FAMILIES.riskSignalCount.family, 'transaction')
  })

  test('the same concern shares a topic across sources', () => {
    assert.equal(engineFindingTopic('language', 'Urgency pressure: “today”'), messageSignalTopic('urgency'))
    assert.equal(engineFindingTopic('language', 'Requests sensitive information: “pin”'), evidenceSignalTopic('sensitive.request'))
    assert.equal(messageSignalTopic('lookalikeLink'), evidenceSignalTopic('link.lookalike'))
    assert.equal(messageSignalTopic('linkAction'), null)
  })
})
