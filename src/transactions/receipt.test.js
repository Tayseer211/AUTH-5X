import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import jsQR from 'jsqr'
import { createDemoRequests } from '../data/demoCases.js'
import { createSeedTransactions } from '../data/seedTransactions.js'
import { qrMatrix, qrSvg } from '../utils/qr.js'
import {
  RECEIPT_FIELDS,
  buildReceiptDetails,
  createProof,
  createReceiptQr,
  describeReceiptDate,
  findTransactionByReference,
  isTransactionReference,
  isoWithOffset,
  issuedReferences,
  lookupScannedReceipt,
  newTransactionReference,
  parseReceiptPayload,
  receiptFor,
  receiptPayload,
} from './receipt.js'
import { approveTransaction, loadLedger, rejectTransaction, requestMoreInformation, saveAnalysis } from './ledger.js'
import { assessPendingRequest } from './requestAssessment.js'

// 23 Sep 2026, 12:00 in Mauritius.
const NOW = new Date('2026-09-23T08:00:00Z')
const USER = { id: 'receipt-test-user', bank: { code: 'MCB' } }
const PAYER = { name: 'QR Receipt Tester', bank: 'MCB' }

// A ledger with the three demo requests analysed, as the app has it before a
// decision. Saving goes through the same storage the app uses (in memory here).
function analysedLedger() {
  let ledger = { transactions: [...createSeedTransactions(NOW), ...createDemoRequests(USER, { now: NOW })], demoRun: 1 }
  for (const tx of ledger.transactions.filter((item) => item.verificationCase)) {
    const { analysis, assessment } = assessPendingRequest(tx, ledger.transactions, USER)
    ledger = saveAnalysis(USER.id, ledger, tx.id, analysis, assessment)
  }
  return ledger
}
const find = (ledger, verificationCase) => ledger.transactions.find((tx) => tx.verificationCase === verificationCase)
const approve = (ledger, txId, options = {}) => approveTransaction(USER.id, ledger, txId, { payer: PAYER, ...options })

// Reads the code back the way a phone would: the drawn code (the same path the
// app draws) is rasterised to pixels and decoded by an independent QR reader.
function scan(payload, scale = 6) {
  const { size, path } = qrSvg(qrMatrix(payload))
  const pixels = size * scale
  const rgba = new Uint8ClampedArray(pixels * pixels * 4).fill(255)
  for (const [, x, y, length] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let row = 0; row < scale; row += 1) {
      for (let column = 0; column < Number(length) * scale; column += 1) {
        const at = ((Number(y) * scale + row) * pixels + Number(x) * scale + column) * 4
        rgba[at] = rgba[at + 1] = rgba[at + 2] = 0
      }
    }
  }
  return jsQR(rgba, pixels, pixels)?.data ?? null
}

const DETAILS = {
  type: 'fraud.auth.transaction',
  version: 1,
  reference: 'FA-A4BAF956C5',
  date: '2026-09-24T14:32:00+04:00',
  amount: 2500,
  currency: 'MUR',
  customer: 'Tayseer',
  bank: 'MCB',
  recipient: 'ABC Services Ltd',
}

describe('references', () => {
  test('a reference is FA- and ten hex characters', () => {
    for (let i = 0; i < 50; i += 1) assert.match(newTransactionReference(), /^FA-[0-9A-F]{10}$/)
    assert.ok(isTransactionReference('FA-0123456789'))
    for (const bad of ['fa-0123456789', 'FA-012345678', 'FA-01234567890', 'FA-012345678G', 'XX-0123456789', '', null, undefined, 12]) {
      assert.ok(!isTransactionReference(bad), String(bad))
    }
  })

  test('a reference is never one that is already issued', () => {
    const answers = ['0123456789abcdef', '0123456789abcdef', 'aaaaaaaaaaaaaaaa']
    const random = () => answers.shift()
    assert.equal(newTransactionReference({ taken: new Set(['FA-0123456789']), random }), 'FA-AAAAAAAAAA')
    assert.throws(() => newTransactionReference({ taken: new Set(['FA-0123456789']), random: () => '0123456789abcdef' }), /unique transaction reference/)
    assert.deepEqual([...issuedReferences([{ proof: { reference: 'FA-0123456789' } }, { proof: null }, {}])], ['FA-0123456789'])
  })
})

describe('receipt dates', () => {
  test('the date is local time with its UTC offset', () => {
    assert.equal(isoWithOffset('2026-09-24T10:32:00.000Z'), '2026-09-24T14:32:00+04:00')
    assert.equal(isoWithOffset('2026-09-24T10:32:00.000Z', 'America/New_York'), '2026-09-24T06:32:00-04:00')
    assert.equal(isoWithOffset('2026-09-24T10:32:00.000Z', 'Asia/Kolkata'), '2026-09-24T16:02:00+05:30')
    assert.equal(isoWithOffset('2026-09-23T21:30:00.000Z'), '2026-09-24T01:30:00+04:00')
    assert.throws(() => isoWithOffset('not a date'), /Invalid date/)
  })

  test('it is described from its own text, so it reads the same anywhere', () => {
    assert.equal(describeReceiptDate('2026-09-24T14:32:00+04:00'), '24 September 2026, 14:32 (UTC+04:00)')
    assert.equal(describeReceiptDate('2026-01-05T06:02:09-04:30'), '5 January 2026, 06:02 (UTC-04:30)')
    assert.equal(describeReceiptDate('garbage'), 'garbage')
  })
})

describe('receipt payload', () => {
  test('carries exactly the required fields, in order', () => {
    const payload = receiptPayload(DETAILS)
    assert.deepEqual(Object.keys(JSON.parse(payload)), RECEIPT_FIELDS)
    assert.deepEqual(RECEIPT_FIELDS, ['type', 'version', 'reference', 'date', 'amount', 'currency', 'customer', 'bank', 'recipient'])
    assert.equal(
      payload,
      '{"type":"fraud.auth.transaction","version":1,"reference":"FA-A4BAF956C5","date":"2026-09-24T14:32:00+04:00","amount":2500,"currency":"MUR","customer":"Tayseer","bank":"MCB","recipient":"ABC Services Ltd"}',
    )
    assert.deepEqual(createReceiptQr(DETAILS), { version: 1, payload })
  })

  test('is built from the real transaction, customer and bank', () => {
    const transaction = { amount: 12500, currency: 'MUR', recipient: 'Harbourline Property Management' }
    const details = buildReceiptDetails({ reference: 'FA-0123456789', issuedAt: '2026-09-24T10:32:00.000Z', transaction, payer: { name: '  Ada   Lovelace ', bank: 'SBM' } })
    assert.deepEqual(details, {
      type: 'fraud.auth.transaction',
      version: 1,
      reference: 'FA-0123456789',
      date: '2026-09-24T14:32:00+04:00',
      amount: 12500,
      currency: 'MUR',
      customer: 'Ada Lovelace',
      bank: 'SBM',
      recipient: 'Harbourline Property Management',
    })
  })

  test('is complete or not made at all: nothing is invented', () => {
    const base = { reference: 'FA-0123456789', issuedAt: '2026-09-24T10:32:00.000Z', transaction: { amount: 100, currency: 'MUR', recipient: 'Payee' }, payer: PAYER }
    assert.ok(buildReceiptDetails(base))
    for (const broken of [
      { ...base, payer: null },
      { ...base, payer: { name: PAYER.name } },
      { ...base, payer: { name: '   ', bank: 'MCB' } },
      { ...base, payer: { name: PAYER.name, bank: 'mcb bank' } },
      { ...base, transaction: { ...base.transaction, recipient: '' } },
      { ...base, transaction: { ...base.transaction, amount: 0 } },
      { ...base, transaction: { ...base.transaction, amount: '100' } },
      { ...base, reference: 'nope' },
      { ...base, issuedAt: null },
    ]) {
      assert.equal(buildReceiptDetails(broken), null)
    }
  })

  test('carries no other data, however much the inputs contain', () => {
    const transaction = {
      amount: 100,
      currency: 'MUR',
      recipient: 'Payee',
      recipientAccount: '4417',
      requestText: 'Reply with the one-time code',
      riskScore: 8,
      analysis: { score: 8 },
      assessment: { combined: { level: 'HIGH' } },
    }
    const payer = { name: PAYER.name, bank: 'MCB', passwordHash: 'abc123', accountNumber: '000999000001', email: 'a@example.test' }
    const payload = receiptPayload(buildReceiptDetails({ reference: 'FA-0123456789', issuedAt: '2026-09-24T10:32:00.000Z', transaction, payer }))
    assert.deepEqual(Object.keys(JSON.parse(payload)), RECEIPT_FIELDS)
    for (const leaked of ['4417', 'one-time', 'score', 'HIGH', 'abc123', '000999000001', 'example.test', 'password', 'risk']) {
      assert.ok(!payload.includes(leaked), `payload contains ${leaked}`)
    }
  })

  test('is plain ASCII, so scanners read it the same everywhere, and parses back to the original text', () => {
    const recipient = 'Marché Central Grocers ’Ltd’ — Rose-Hill'
    const details = buildReceiptDetails({ reference: 'FA-0123456789', issuedAt: '2026-09-24T10:32:00.000Z', transaction: { amount: 45.5, currency: 'MUR', recipient }, payer: PAYER })
    const payload = receiptPayload(details)
    assert.match(payload, /^[\x20-\x7e]+$/)
    assert.match(payload, /March\\u00e9/)
    assert.equal(parseReceiptPayload(payload).recipient, recipient)
    assert.equal(parseReceiptPayload(payload).amount, 45.5)
  })

  test('long names are cut so the QR stays practical', () => {
    const long = 'N'.repeat(200)
    const details = buildReceiptDetails({ reference: 'FA-0123456789', issuedAt: '2026-09-24T10:32:00.000Z', transaction: { amount: 1, currency: 'MUR', recipient: long }, payer: { name: long, bank: 'MCB' } })
    assert.equal(details.customer.length, 48)
    assert.equal(details.recipient.length, 48)
    assert.ok(receiptPayload(details).length < 300)
  })
})

describe('parsing a scanned payload', () => {
  const payload = receiptPayload(DETAILS)

  test('parses back into the transaction details', () => {
    assert.deepEqual(parseReceiptPayload(payload), DETAILS)
    // Field order and spacing may differ in a payload made elsewhere.
    const reordered = JSON.stringify(Object.fromEntries([...RECEIPT_FIELDS].reverse().map((field) => [field, DETAILS[field]])), null, 2)
    assert.deepEqual(parseReceiptPayload(reordered), DETAILS)
  })

  test('rejects anything that is not exactly a fraud.auth receipt', () => {
    const without = (field) => JSON.stringify(Object.fromEntries(RECEIPT_FIELDS.filter((key) => key !== field).map((key) => [key, DETAILS[key]])))
    const changed = (patch) => JSON.stringify({ ...DETAILS, ...patch })
    const bad = [
      null,
      undefined,
      42,
      '',
      'not json',
      '[]',
      'null',
      '"text"',
      'fraud.auth://transaction/FA-A4BAF956C5',
      ...RECEIPT_FIELDS.map(without),
      changed({ fraudScore: 8 }),
      changed({ password: 'x' }),
      changed({ type: 'other' }),
      changed({ version: 2 }),
      changed({ reference: 'FA-123' }),
      changed({ date: '2026-09-24 14:32' }),
      changed({ date: '2026-09-24T14:32:00' }),
      changed({ amount: '2500' }),
      changed({ amount: -1 }),
      changed({ amount: 0 }),
      changed({ currency: 'mur' }),
      changed({ currency: 'MURR' }),
      changed({ customer: '' }),
      changed({ customer: 'x'.repeat(65) }),
      changed({ bank: 'mcb' }),
      changed({ bank: 'M' }),
      changed({ recipient: 5 }),
      `${payload}${' '.repeat(2000)}`,
    ]
    for (const input of bad) assert.equal(parseReceiptPayload(input), null, String(input).slice(0, 60))
  })
})

describe('the QR code', () => {
  test('is deterministic: the same receipt always gives the same code', () => {
    const payload = receiptPayload(DETAILS)
    assert.equal(receiptPayload({ ...DETAILS }), payload)
    assert.deepEqual(qrMatrix(payload), qrMatrix(receiptPayload({ ...DETAILS })))
    assert.deepEqual(qrSvg(qrMatrix(payload)), qrSvg(qrMatrix(payload)))
    assert.notDeepEqual(qrMatrix(payload), qrMatrix(receiptPayload({ ...DETAILS, amount: 2501 })))
  })

  test('is a practical size for the receipt', () => {
    const { length } = qrMatrix(receiptPayload(DETAILS))
    assert.ok(length <= 65, `${length} modules wide`)
  })

  test('is scannable: an independent reader decodes the drawn code to the payload', () => {
    const payload = receiptPayload(DETAILS)
    assert.equal(scan(payload), payload)
    assert.deepEqual(parseReceiptPayload(scan(payload)), DETAILS)
    // Longer names and non-ASCII text (escaped) still scan.
    const long = buildReceiptDetails({
      reference: 'FA-0123456789',
      issuedAt: '2026-09-24T10:32:00.000Z',
      transaction: { amount: 1234567.89, currency: 'MUR', recipient: 'Marché Central Grocers ’Ltd’ — Rose-Hill Branch Office' },
      payer: { name: 'Jean-François Beauvallet-Rousseau of Port Louis', bank: 'MAUBANK' },
    })
    const longPayload = receiptPayload(long)
    assert.equal(scan(longPayload), longPayload)
    assert.deepEqual(parseReceiptPayload(scan(longPayload)), long)
  })
})

describe('approved transactions', () => {
  test('all required fields are present, taken from the real transaction, customer and bank', () => {
    const ledger = analysedLedger()
    const before = find(ledger, 'LEGITIMATE')
    const approved = find(approve(ledger, before.id), 'LEGITIMATE')
    assert.equal(approved.status, 'APPROVED')
    assert.match(approved.proof.reference, /^FA-[0-9A-F]{10}$/)
    const receipt = receiptFor(approved)
    assert.deepEqual(receipt.details, {
      type: 'fraud.auth.transaction',
      version: 1,
      reference: approved.proof.reference,
      date: isoWithOffset(approved.decision.at),
      amount: before.amount,
      currency: 'MUR',
      customer: PAYER.name,
      bank: 'MCB',
      recipient: before.recipient,
    })
    assert.equal(receipt.payload, approved.proof.qr.payload)
    assert.equal(receipt.issuedAt, approved.decision.at)
    assert.deepEqual(Object.keys(approved.proof.qr).sort(), ['payload', 'version'])
    assert.deepEqual(Object.keys(JSON.parse(receipt.payload)), RECEIPT_FIELDS)
  })

  test('the reference and QR are stable after reload and re-render', () => {
    const ledger = analysedLedger()
    const approved = find(approve(ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE')
    // "Reload": the ledger is read back from storage, as the app does on start.
    const reloaded = find(loadLedger(USER), 'LEGITIMATE')
    assert.deepEqual(reloaded.proof, approved.proof)
    assert.deepEqual(receiptFor(reloaded), receiptFor(approved))
    // "Re-render": the drawn code is derived from the payload every time.
    assert.deepEqual(qrMatrix(receiptFor(reloaded).payload), qrMatrix(receiptFor(approved).payload))
    // Later, unrelated decisions do not touch it.
    const later = approve(loadLedger(USER), find(ledger, 'GREY').id, { acknowledgedWarnings: true })
    assert.deepEqual(find(later, 'LEGITIMATE').proof, approved.proof)
  })

  test('the approved receipt scans back to its own details', () => {
    const ledger = analysedLedger()
    const receipt = receiptFor(find(approve(ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE'))
    assert.equal(scan(receipt.payload), receipt.payload)
    assert.deepEqual(parseReceiptPayload(scan(receipt.payload)), receipt.details)
  })

  test('a second approved transaction gets a different reference and different data', () => {
    const ledger = analysedLedger()
    const first = approve(ledger, find(ledger, 'LEGITIMATE').id)
    const second = approve(first, find(ledger, 'GREY').id, { acknowledgedWarnings: true })
    const [a, b] = ['LEGITIMATE', 'GREY'].map((key) => receiptFor(find(second, key)))
    assert.notEqual(a.reference, b.reference)
    assert.notEqual(a.details.recipient, b.details.recipient)
    assert.notEqual(a.details.amount, b.details.amount)
    assert.notEqual(a.payload, b.payload)
    assert.notDeepEqual(qrMatrix(a.payload), qrMatrix(b.payload))
    assert.equal(a.details.customer, b.details.customer)
    // The first receipt is untouched by the second approval.
    assert.deepEqual(find(second, 'LEGITIMATE').proof, find(first, 'LEGITIMATE').proof)
  })

  test('an approval without customer details still succeeds, with a reference and no QR', () => {
    const ledger = analysedLedger()
    const approved = find(approveTransaction(USER.id, ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE')
    assert.equal(approved.status, 'APPROVED')
    assert.match(approved.proof.reference, /^FA-[0-9A-F]{10}$/)
    assert.equal(approved.proof.qr, undefined)
    assert.equal(receiptFor(approved), null)
  })

  test('approving does not change the fraud analysis stored with the transaction', () => {
    const ledger = analysedLedger()
    const before = find(ledger, 'GREY')
    assert.equal(before.analysis.score, 69)
    const after = find(approve(ledger, before.id, { acknowledgedWarnings: true }), 'GREY')
    for (const key of ['analysis', 'assessment', 'riskScore', 'riskLevel']) assert.deepEqual(after[key], before[key], key)
    assert.deepEqual(['LEGITIMATE', 'GREY', 'FRAUD'].map((key) => find(ledger, key).analysis.score), [100, 69, 8])
    assert.deepEqual(['LEGITIMATE', 'GREY', 'FRAUD'].map((key) => find(ledger, key).assessment.combined.level), ['LOW', 'MEDIUM', 'HIGH'])
  })
})

describe('transactions that are not approved', () => {
  test('rejected, held, pending and blocked transactions get no reference or QR', () => {
    const ledger = analysedLedger()
    const rejected = find(rejectTransaction(USER.id, ledger, find(ledger, 'GREY').id), 'GREY')
    const held = find(requestMoreInformation(USER.id, ledger, find(ledger, 'FRAUD').id, { items: ['Invoice'], note: '' }), 'FRAUD')
    for (const tx of [rejected, held, find(ledger, 'LEGITIMATE')]) {
      assert.equal(tx.proof, null, tx.status)
      assert.equal(receiptFor(tx), null, tx.status)
    }
  })

  test('a HIGH-risk transaction cannot be approved, so it cannot receive a QR', () => {
    const ledger = analysedLedger()
    const fraud = find(ledger, 'FRAUD')
    assert.equal(fraud.assessment.combined.level, 'HIGH')
    assert.throws(() => approve(ledger, fraud.id, { acknowledgedWarnings: true }), /High-risk/)
    const stored = find(loadLedger(USER), 'FRAUD')
    assert.equal(stored.proof, null)
    assert.equal(stored.status, 'PENDING')
    assert.equal(receiptFor(stored), null)
  })
})

describe('transaction history and older transactions', () => {
  test('history finds a receipt for each approved-with-QR transaction and for no other', () => {
    const ledger = analysedLedger()
    const approved = approve(ledger, find(ledger, 'LEGITIMATE').id)
    assert.deepEqual(approved.transactions.filter((tx) => receiptFor(tx)).map((tx) => tx.id), [find(ledger, 'LEGITIMATE').id])
    assert.ok(approved.transactions.filter((tx) => tx.status === 'APPROVED').length > 1)
  })

  test('older transactions without QR data keep working and get no receipt', () => {
    const ledger = analysedLedger()
    const seeded = ledger.transactions.filter((tx) => tx.status === 'APPROVED')
    assert.ok(seeded.length > 0)
    for (const tx of seeded) assert.equal(receiptFor(tx), null)
    // Approved before receipts existed: a proof with a reference but no `qr`.
    const legacy = { ...seeded[0], proof: { reference: 'FA-0123456789', issuedAt: '2026-09-01T08:00:00.000Z' } }
    assert.equal(receiptFor(legacy), null)
    assert.deepEqual(legacy.proof, { reference: 'FA-0123456789', issuedAt: '2026-09-01T08:00:00.000Z' })
    assert.equal(findTransactionByReference([legacy], 'FA-0123456789'), legacy)
    // The first, reference-only QR format is not a receipt either, and does not break anything.
    const uriFormat = { ...legacy, proof: { ...legacy.proof, qr: { version: 1, payload: 'fraud.auth://transaction/FA-0123456789' } } }
    assert.equal(receiptFor(uriFormat), null)
    for (const bad of [null, undefined, {}, { status: 'APPROVED' }, { status: 'APPROVED', proof: {} }]) assert.equal(receiptFor(bad), null)
  })

  test('a stored payload that is not the transaction’s own receipt is not shown', () => {
    const ledger = analysedLedger()
    const approved = find(approve(ledger, find(ledger, 'LEGITIMATE').id), 'LEGITIMATE')
    const otherReference = createReceiptQr({ ...parseReceiptPayload(approved.proof.qr.payload), reference: 'FA-FFFFFFFFFF' })
    assert.equal(receiptFor({ ...approved, proof: { ...approved.proof, qr: otherReference } }), null)
    assert.equal(receiptFor({ ...approved, proof: { ...approved.proof, qr: { version: 1, payload: '{"broken":true}' } } }), null)
    assert.equal(receiptFor({ ...approved, status: 'REJECTED' }), null)
  })
})

describe('finding a transaction from its receipt (the hook for a refund workflow)', () => {
  function approvedLedger() {
    const ledger = analysedLedger()
    const done = approve(ledger, find(ledger, 'LEGITIMATE').id)
    return { transactions: done.transactions, approved: find(done, 'LEGITIMATE') }
  }

  test('the reference or a scanned payload finds the transaction', () => {
    const { transactions, approved } = approvedLedger()
    assert.equal(findTransactionByReference(transactions, approved.proof.reference).id, approved.id)
    assert.equal(findTransactionByReference(transactions, approved.proof.qr.payload).id, approved.id)
    for (const miss of ['FA-FFFFFFFFFF', receiptPayload({ ...DETAILS, reference: 'FA-FFFFFFFFFF' }), 'garbage', '', null, undefined]) {
      assert.equal(findTransactionByReference(transactions, miss), null, String(miss))
    }
  })

  test('a scanned receipt is matched on its reference and its details are checked', () => {
    const { transactions, approved } = approvedLedger()
    const scanned = scan(approved.proof.qr.payload)
    const match = lookupScannedReceipt(transactions, scanned)
    assert.equal(match.status, 'MATCH')
    assert.equal(match.transaction.id, approved.id)
    assert.equal(match.details.reference, approved.proof.reference)

    const details = parseReceiptPayload(scanned)
    const altered = lookupScannedReceipt(transactions, receiptPayload({ ...details, amount: details.amount + 1 }))
    assert.equal(altered.status, 'MISMATCH')
    assert.equal(altered.transaction.id, approved.id)

    assert.equal(lookupScannedReceipt(transactions, receiptPayload({ ...details, reference: 'FA-FFFFFFFFFF' })).status, 'UNKNOWN')
    for (const invalid of ['garbage', 'fraud.auth://transaction/FA-0123456789', '', null]) {
      assert.deepEqual(lookupScannedReceipt(transactions, invalid), { status: 'INVALID', transaction: null, details: null })
    }
  })

  test('createProof issues a unique reference against the ledger so far', () => {
    const existing = [{ proof: { reference: 'FA-0123456789' } }]
    const transaction = { amount: 10, currency: 'MUR', recipient: 'Payee' }
    const proof = createProof(existing, '2026-09-24T10:32:00.000Z', { transaction, payer: PAYER })
    assert.notEqual(proof.reference, 'FA-0123456789')
    assert.equal(parseReceiptPayload(proof.qr.payload).reference, proof.reference)
    assert.deepEqual(Object.keys(createProof(existing, '2026-09-24T10:32:00.000Z')), ['reference', 'issuedAt'])
  })
})
