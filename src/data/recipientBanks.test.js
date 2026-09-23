import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { BANKS } from '../fraud/synthetic/catalog.js'
import { RAW_FEATURES } from '../fraud/synthetic/schema.js'
import { DEMO_CASES } from './demoCases.js'
import { RECIPIENT_BANKS, RECIPIENT_BANK_LABELS, normalizeRecipientBank, recipientBankLabel } from './recipientBanks.js'

describe('recipient banks', () => {
  test('codes are canonical and shared with the synthetic dataset schema', () => {
    assert.deepEqual(RECIPIENT_BANKS, ['SAME_BANK', 'OTHER_LOCAL_BANK', 'OVERSEAS_BANK'])
    assert.deepEqual(BANKS, RECIPIENT_BANKS)
    assert.deepEqual(RAW_FEATURES.find((spec) => spec.name === 'recipientBank').values, RECIPIENT_BANKS)
  })

  test('display labels and codes normalise to the code', () => {
    assert.equal(normalizeRecipientBank('Same bank'), 'SAME_BANK')
    assert.equal(normalizeRecipientBank('Another local bank'), 'OTHER_LOCAL_BANK')
    assert.equal(normalizeRecipientBank('Overseas bank'), 'OVERSEAS_BANK')
    assert.equal(normalizeRecipientBank('  overseas BANK '), 'OVERSEAS_BANK')
    assert.equal(normalizeRecipientBank('other_local_bank'), 'OTHER_LOCAL_BANK')
    for (const code of RECIPIENT_BANKS) assert.equal(normalizeRecipientBank(code), code)
  })

  test('null stays null and unknown values pass through unchanged', () => {
    assert.equal(normalizeRecipientBank(null), null)
    assert.equal(normalizeRecipientBank(undefined), null)
    assert.equal(normalizeRecipientBank('Moon bank'), 'Moon bank')
  })

  test('labels are shown for codes and for legacy label values', () => {
    for (const [code, label] of Object.entries(RECIPIENT_BANK_LABELS)) {
      assert.equal(recipientBankLabel(code), label)
      assert.equal(recipientBankLabel(label), label)
    }
    assert.equal(recipientBankLabel('Moon bank'), 'Moon bank')
    assert.equal(recipientBankLabel(null), '')
  })

  test('demo cases store canonical codes', () => {
    for (const demoCase of DEMO_CASES) assert.ok(RECIPIENT_BANKS.includes(demoCase.recipientBank), demoCase.recipientBank)
  })
})
