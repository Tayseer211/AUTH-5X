import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { LANGUAGE_PATTERNS } from '../text/patterns.js'
import { extractEntities } from '../text/extract.js'
import {
  DEFAULT_MESSAGE_CONFIG,
  MESSAGE_LABELS,
  MESSAGE_SCENARIOS,
  SYNTHETIC_ACCOUNT_PREFIX,
  SYNTHETIC_DOMAIN_SUFFIX,
  generateMessageCorpus,
  messageInput,
} from './messages.js'

const corpus = generateMessageCorpus()
const { records } = corpus
const byLabel = (label) => records.filter((record) => record.label === label)
const LEGIT = ['legit_normal', 'legit_unusual']

// Wording that looks alarming on its own.
const ALARM_WORDS = /\b(security|urgent|urgently|immediately|verify|frozen|blocked|suspension|pin|password|warning|link|deadline|final notice)\b|https?:\/\//i
const OBVIOUS_FRAUD_WORDS = /\b(fraud\w*|scam\w*|otp|one-time code|pin|password)\b/i

describe('message corpus — generation', () => {
  test('deterministic for a fixed seed', () => {
    assert.deepEqual(generateMessageCorpus(), corpus)
    assert.deepEqual(generateMessageCorpus({ seed: 'other' }), generateMessageCorpus({ seed: 'other' }))
  })

  test('a different seed gives a different corpus', () => {
    const other = generateMessageCorpus({ seed: 'another-seed' })
    assert.notDeepEqual(other.records.map(messageInput), records.map(messageInput))
    assert.deepEqual(other.summary.byLabel, corpus.summary.byLabel)
  })

  test('record counts follow the config', () => {
    assert.equal(records.length, Object.values(DEFAULT_MESSAGE_CONFIG.counts).reduce((a, b) => a + b, 0))
    assert.deepEqual(corpus.summary.byLabel, DEFAULT_MESSAGE_CONFIG.counts)
    assert.equal(generateMessageCorpus({ counts: { legit_normal: 3, legit_unusual: 0, suspicious: 0, fraudulent: 2 } }).records.length, 5)
    assert.throws(() => generateMessageCorpus({ counts: { genuine: 5 } }), /Unknown label/)
  })

  test('unique IDs', () => {
    assert.equal(new Set(records.map((record) => record.id)).size, records.length)
    for (const record of records) assert.match(record.id, /^SYN-MSG-\d{5}$/)
  })

  test('every record has the required fields', () => {
    for (const record of records) {
      assert.deepEqual(Object.keys(record), ['id', 'text', 'label', 'scenario', 'language', 'format', 'patternTags'])
      assert.ok(typeof record.text === 'string' && record.text.trim().length > 20, record.id)
      assert.ok(MESSAGE_LABELS.includes(record.label), record.id)
      assert.ok(MESSAGE_SCENARIOS.some((scenario) => scenario.id === record.scenario && scenario.label === record.label), record.id)
      assert.ok(['en', 'fr', 'mfe'].includes(record.language), record.id)
      assert.ok(Array.isArray(record.patternTags) && record.patternTags.length > 0, record.id)
      assert.doesNotMatch(record.text, /\{\w+\}|undefined|null|NaN/, record.id)
    }
  })

  test('every label is well represented across scenarios and languages', () => {
    for (const label of MESSAGE_LABELS) {
      const group = byLabel(label)
      assert.ok(group.length >= 80, `${label}: ${group.length}`)
      const scenarios = new Set(group.map((record) => record.scenario))
      assert.ok(scenarios.size >= 6, `${label}: ${scenarios.size} scenarios`)
      assert.equal(scenarios.size, MESSAGE_SCENARIOS.filter((scenario) => scenario.label === label).length, `${label}: every scenario used`)
      // Language is never a signal: French and Kreol appear in every label.
      for (const language of ['en', 'fr', 'mfe']) assert.ok(group.some((record) => record.language === language), `${label} has no ${language}`)
    }
  })

  // Some genuine bank broadcasts ("MCB will never ask for your PIN…") are the
  // same for every customer, so a few texts legitimately repeat.
  test('texts vary', () => {
    for (const label of MESSAGE_LABELS) {
      const group = byLabel(label)
      assert.ok(new Set(group.map(messageInput)).size >= group.length * 0.85, label)
    }
  })
})

describe('message corpus — safe synthetic data', () => {
  const entities = records.map((record) => extractEntities(messageInput(record)))

  test('no phone numbers, card numbers or personal titles with names', () => {
    for (const [i, found] of entities.entries()) assert.deepEqual(found.phoneNumbers, [], records[i].text)
    for (const record of records) {
      assert.doesNotMatch(record.text, /\d{13,19}/, record.id)
      assert.doesNotMatch(record.text, /\b(Mr|Mrs|Ms|Dr|Mme|M\.)\s+[A-Z][a-z]+/, record.id)
    }
  })

  test('every account number uses the synthetic prefix', () => {
    const accounts = entities.flatMap((found) => found.accountNumbers)
    assert.ok(accounts.length > 50)
    for (const account of accounts) assert.ok(account.value.startsWith(SYNTHETIC_ACCOUNT_PREFIX) && account.value.length === 12, account.value)
  })

  test('every link and email uses the reserved .example domain', () => {
    const domains = entities.flatMap((found) => found.domains)
    assert.ok(domains.length > 50)
    for (const domain of domains) assert.ok(domain.value.endsWith(SYNTHETIC_DOMAIN_SUFFIX), domain.value)
    for (const record of records) {
      for (const email of record.text.match(/\S+@\S+/g) ?? []) assert.ok(email.replace(/[.,]$/, '').endsWith(SYNTHETIC_DOMAIN_SUFFIX), email)
      assert.doesNotMatch(record.text, /\.(com|net|org|mu|io|co)\b/i, record.id)
    }
  })

  // Ordinary words may overlap ("invoice", "a suspicious payment"); what must
  // never appear are the corpus identifiers themselves.
  test('the text never contains label or scenario identifiers', () => {
    const identifiers = [...MESSAGE_LABELS, 'fraudulent', ...MESSAGE_SCENARIOS.map((scenario) => scenario.id).filter((id) => id.includes('_'))]
    for (const record of records) {
      for (const identifier of identifiers.filter((id) => id !== 'suspicious')) assert.ok(!record.text.toLowerCase().includes(identifier), `${record.id}: ${identifier}`)
    }
  })
})

describe('message corpus — realism', () => {
  test('genuine messages sometimes use alarming vocabulary', () => {
    const alarming = byLabel('legit_normal').filter((record) => ALARM_WORDS.test(record.text))
    assert.ok(alarming.length >= 30, `${alarming.length} legit_normal messages`)
    const matched = new Set(alarming.map((record) => record.text.match(ALARM_WORDS)[0].toLowerCase()))
    assert.ok(matched.size >= 4, [...matched].join(', '))
  })

  test('some fraudulent messages avoid obvious fraud vocabulary', () => {
    const quiet = byLabel('fraudulent').filter((record) => !OBVIOUS_FRAUD_WORDS.test(record.text))
    assert.ok(quiet.length >= 40, `${quiet.length} fraudulent messages`)
    assert.ok(new Set(quiet.map((record) => record.scenario)).size >= 5)
  })

  test('warning tags are shared between genuine and fraudulent messages', () => {
    const tagsIn = (labels) => new Set(records.filter((record) => labels.includes(record.label)).flatMap((record) => record.patternTags))
    const legit = tagsIn(LEGIT)
    const fraud = tagsIn(['fraudulent'])
    const suspicious = tagsIn(['suspicious'])
    for (const tag of ['urgency', 'threat', 'link', 'bank_name', 'security_wording', 'changed_details', 'new_payee']) {
      assert.ok(legit.has(tag) && fraud.has(tag), tag)
    }
    for (const tag of ['changed_details', 'urgency', 'account_number', 'link']) assert.ok(suspicious.has(tag) && fraud.has(tag), tag)
  })

  test('the existing scam-language patterns fire in every label', () => {
    for (const { id, pattern } of LANGUAGE_PATTERNS.filter((p) => ['urgency', 'threat', 'sensitiveInfo'].includes(p.id))) {
      const labels = new Set(records.filter((record) => pattern.test(record.text)).map((record) => record.label))
      assert.ok(labels.has('fraudulent'), `${id} in fraudulent`)
      assert.ok(LEGIT.some((label) => labels.has(label)), `${id} in a genuine label`)
    }
  })

  test('suspicious messages include strong signals without being labelled fraud', () => {
    const strong = byLabel('suspicious').filter((record) => record.patternTags.includes('changed_details') || record.patternTags.includes('unfamiliar_link'))
    assert.ok(strong.length >= 20)
  })

  test('Mauritian context: local banks and currencies', () => {
    const text = records.map(messageInput).join('\n')
    for (const bank of ['MCB', 'SBM', 'MauBank']) assert.ok(text.includes(bank), bank)
    assert.match(text, /\bRs ?\d/)
    assert.match(text, /\bMUR \d/)
  })
})

describe('message corpus — classifier input', () => {
  test('messageInput exposes only the text', () => {
    const [record] = records
    assert.equal(messageInput(record), record.text)
    assert.equal(messageInput({ text: 'x', label: 'fraudulent', scenario: 'fake_refund', patternTags: ['refund'] }), 'x')
  })

  test('the extractor reads only text, so label metadata cannot change its output', () => {
    const record = byLabel('fraudulent')[0]
    const relabelled = { ...record, label: 'legit_normal', scenario: 'invoice', patternTags: [] }
    assert.deepEqual(extractEntities(messageInput(relabelled)), extractEntities(messageInput(record)))
    const source = readFileSync(new URL('../text/extract.js', import.meta.url), 'utf8')
    // No access to corpus record fields ("label" alone is also used there for
    // reference labels such as "Invoice no:").
    assert.doesNotMatch(source, /\.label\b|\bscenario\b|\bpatternTags\b/)
  })
})
