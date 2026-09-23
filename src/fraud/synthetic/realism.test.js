import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { RECIPIENT_BANKS } from '../../data/recipientBanks.js'
import { auditDataset } from '../ml/audit.js'
import { MODEL_FEATURES } from '../ml/featureSpec.js'
import { generateDataset } from './generator.js'

// Realism constraints on the default dataset (the one the model is trained
// on): no model input may reveal the label because of how the generator
// builds records. See DATA_CARD.md, "Changes in 2.0.0".

const { records } = generateDataset()
const audit = auditDataset(records)
const legitimate = records.filter((record) => !record.labels.isFraud)
const fraud = records.filter((record) => record.labels.isFraud)
const legitWith = (predicate) => legitimate.filter(predicate).length

describe('synthetic dataset realism', () => {
  test('every record is valid and uses canonical recipient-bank codes', () => {
    assert.equal(audit.invalidRecords, 0)
    for (const { raw } of records) assert.ok(RECIPIENT_BANKS.includes(raw.recipientBank), raw.recipientBank)
  })

  test('no model-input value is (almost) always fraud', () => {
    assert.deepEqual(
      audit.shortcuts.map((row) => `${row.feature}=${row.value} ${row.fraud}/${row.n}`),
      [],
    )
  })

  test('no single column separates the classes on its own', () => {
    for (const { column, auc } of audit.singleColumnAuc) assert.ok(auc > 0.03 && auc < 0.97, `${column}: AUC ${auc}`)
  })

  test('riskSignalCount does not split legitimate from fraud', () => {
    const { riskSignalCount } = audit
    assert.ok(riskSignalCount['isFraud=true'].min <= 2, `fraud min ${riskSignalCount['isFraud=true'].min}`)
    assert.ok(riskSignalCount['isFraud=false'].max >= 5, `legitimate max ${riskSignalCount['isFraud=false'].max}`)
    assert.ok(riskSignalCount.legit_normal.max >= 3)
  })

  test('missing payee and reference categories occur in both legitimate classes', () => {
    for (const name of ['payeeCategory', 'referenceCategory']) {
      assert.ok(audit.missingByClass[name].legit_normal > 0.02, `${name} legit_normal`)
      assert.ok(audit.missingByClass[name].legit_unusual > 0.02, `${name} legit_unusual`)
    }
  })

  test('scam-associated wording, links and payee vocabulary also appear on genuine requests', () => {
    for (const flag of ['textUrgency', 'textThreat', 'textBypassChecks', 'textExternalLink', 'textSensitiveInfo', 'textBankImpersonation', 'textPromisedReturns', 'securityThemedRecipientName', 'externalLinkChannel', 'overseasRecipient']) {
      assert.ok(legitWith((record) => record.derived[flag]) > 0, `no legitimate request with ${flag}`)
    }
    for (const category of ['SECURITY', 'INVESTMENT']) {
      assert.ok(legitWith((record) => record.derived.payeeCategory === category) > 0, `no legitimate ${category} payee`)
      assert.ok(legitWith((record) => record.derived.referenceCategory === category) > 0, `no legitimate ${category} reference`)
    }
  })

  test('each fraud pattern has quieter variants without scam wording', () => {
    for (const scenario of ['bank_impersonation', 'invoice_redirection', 'investment_scam', 'mimic_routine', 'account_takeover']) {
      const group = fraud.filter((record) => record.labels.scenario === scenario)
      assert.ok(group.some((record) => record.derived.textRiskTermCount === 0), scenario)
    }
  })

  test('the audit covers every model input', () => {
    const audited = new Set(audit.valueTable.map((row) => row.feature))
    for (const feature of MODEL_FEATURES) assert.ok(audited.has(feature.name), feature.name)
  })
})
