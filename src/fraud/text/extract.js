import { BANKS, getBank } from '../../data/banks.js'

// Deterministic entity extraction for pasted financial text (a message, an
// invoice, a payment instruction). It only finds and normalises what the text
// says (amounts, accounts, dates, links, names and so on). It never decides
// whether the text is fraudulent and never scores it.
//
// Pure: the same input always gives the same result, and nothing depends on
// the clock, locale or environment.
//
// Every item carries
//   text  — the exact substring of the input,
//   start — its offset in the input, end — the offset just past it,
// plus a normalised `value` and any type-specific fields. Lists are ordered by
// position.
//
// Extractors run in a fixed order and claim the spans they match, so a later,
// looser pattern cannot reuse them. For example, an email's domain is not
// reported again as a bare domain, and a phone number or a date is not taken
// for an account number. Banks, sender claims and payees are read alongside
// the other entities and do not claim.

const EMPTY_KEYS = [
  'amounts',
  'currencies',
  'accountNumbers',
  'accountLastFour',
  'dates',
  'times',
  'payees',
  'banks',
  'references',
  'urls',
  'domains',
  'emails',
  'phoneNumbers',
  'senderClaims',
]

// --- Links and addresses ----------------------------------------------------

const EMAIL = /(?<![\w.+-])[\w.+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w-])/gi
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi
const TLDS = 'com|net|org|gov|edu|info|biz|xyz|link|site|online|top|live|app|io|co|me|mu'
const BARE_DOMAIN = new RegExp(`(?<![\\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?:\\.[a-z]{2})?(?![\\w-])(?:\\/[^\\s<>"'()]*)?`, 'gi')
const TRAILING_PUNCTUATION = /[.,;:!?'"\]]+$/

// --- References and accounts ------------------------------------------------

const REFERENCE_PREFIXES = { INV: 'INVOICE', REF: 'REFERENCE', POL: 'POLICY', PAY: 'PAYMENT', TXN: 'TRANSACTION', TRX: 'TRANSACTION', ORD: 'ORDER', BILL: 'BILL' }
const PREFIXED_REFERENCE = /(?<![\w-])(INV|REF|POL|PAY|TXN|TRX|ORD|BILL)[-/#]?\d[A-Z0-9]*(?:[-/][A-Z0-9]+)*(?![\w-])/gi
const REFERENCE_LABELS = [
  [/^payment\s+ref/i, 'PAYMENT'],
  [/^(invoice|inv)$/i, 'INVOICE'],
  [/^(reference|ref)$/i, 'REFERENCE'],
  [/^policy$/i, 'POLICY'],
  [/^order$/i, 'ORDER'],
  [/^(transaction|txn)$/i, 'TRANSACTION'],
  [/^customer$/i, 'CUSTOMER'],
]
const LABELED_REFERENCE =
  /\b(payment\s+ref(?:erence)?|invoice|inv|reference|ref|policy|order|transaction|txn|customer)\b\s*(?:no\.?|number|num|#|id)?\s*[:#.]?\s*(?=[A-Z0-9/-]*\d)([A-Z0-9]+(?:[-/][A-Z0-9]+)*)(?![\w-])/gi
const IBAN = /\bMU\d{2}(?: ?[A-Z0-9]){26}\b/g
const LABELED_ACCOUNT = /\b(?:account|acct|a\/c)\s*(?:no\.?|number|num|#)?\s*[:#.]?\s*(\d(?:[ -]?\d){5,15})(?![ -]?\d)/gi
// 10–14 digits, the app's account-number format (ACCOUNT_NUMBER_RULES).
const BARE_ACCOUNT = /(?<![\w+])(?<!\d[ -])\d(?:[ -]?\d){9,13}(?![ -]?\d)/g
const MASKED_ACCOUNT = /(?<![A-Za-z0-9])(?:[*xX•]{2,}|\.{3,}|…)[ -]?(\d{4})(?!\d)/g
const ENDING_IN = /\b(?:ending|ends)\s+(?:in|with)\s+(\d{4})(?!\d)/gi
const LAST_FOUR = /\blast\s+(?:4|four)(?:\s+digits?)?(?:\s+(?:are|is|of))?\s*[:-]?\s*(\d{4})(?!\d)/gi

// --- Dates and times --------------------------------------------------------

const MONTH_NAMES = [
  [1, 'january', 'janvier', 'janv', 'jan'],
  [2, 'february', 'février', 'fevrier', 'feb', 'fév', 'fev'],
  [3, 'march', 'mars', 'mar'],
  [4, 'april', 'avril', 'apr', 'avr'],
  [5, 'may', 'mai'],
  [6, 'june', 'juin', 'jun'],
  [7, 'july', 'juillet', 'juil', 'jul'],
  [8, 'august', 'août', 'aout', 'aug'],
  [9, 'september', 'septembre', 'sept', 'sep'],
  [10, 'october', 'octobre', 'oct'],
  [11, 'november', 'novembre', 'nov'],
  [12, 'december', 'décembre', 'decembre', 'dec', 'déc'],
]
const MONTHS = new Map(MONTH_NAMES.flatMap(([number, ...names]) => names.map((name) => [name, number])))
const MONTH = `(${[...MONTHS.keys()].sort((a, b) => b.length - a.length).join('|')})\\.?`
const ORDINAL = '(?:st|nd|rd|th|er)?'

const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g
// Numeric dates are read day first, as written in Mauritius.
const NUMERIC_DATE = /\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d/.-]?\d)/g
const DAY_MONTH_DATE = new RegExp(`\\b(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+(\\d{4}))?(?![\\w\\u00C0-\\u024F])`, 'gi')
const MONTH_DAY_DATE = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORDINAL}(?:,?\\s+(\\d{4}))?\\b`, 'gi')

const TIME_MERIDIEM = /\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*([ap])\.?\s?m\b(?:(?<=[ap]\.\s?m)\.)?/gi
const TIME_24H = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
const TIME_H = /\b([01]?\d|2[0-3])[hH]([0-5]\d)\b/g

// --- Money ------------------------------------------------------------------

const CURRENCY = '(MUR|USD|EUR|GBP|[Rr][Ss]\\.?|[Rr]upees?)'
const NUMBER = '(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?(?![.,]?\\d)'
const AMOUNT_AFTER_CURRENCY = new RegExp(`(?<![\\w])${CURRENCY}\\s*${NUMBER}(?:\\/-)?`, 'g')
const AMOUNT_BEFORE_CURRENCY = new RegExp(`(?<![\\w.,])${NUMBER}\\s*${CURRENCY}(?![\\w])`, 'g')
const STANDALONE_CURRENCY = /(?<![\w])(MUR|USD|EUR|GBP|[Rr][Ss]\.?|[Rr]upees?)(?![\w])/g

// --- Phones -----------------------------------------------------------------

const INTERNATIONAL_PHONE = /(?<![\w+])(?:\+[1-9]\d{0,2}|00230)(?:[ .-]?\d){6,12}(?![ .-]?\d)/g
// Mauritian mobiles are 8 digits starting with 5.
const MOBILE_PHONE = /(?<![\w+])(?<!\d[ -])5\d{3}[ -]?\d{4}(?![ -]?\d)/g
// A 7-digit landline is only trusted next to a phone word.
const CUED_LANDLINE = /\b(?:tel|telephone|phone|call|contact|hotline|whatsapp|fax)\b[^\d\n]{0,20}?(?<!\d)([2-6]\d{2}[ -]?\d{4})(?![ -]?\d)/gi

// --- Banks and sender claims ------------------------------------------------

const EXTRA_BANK_ALIASES = { MCB: ['Mauritius Commercial Bank'], SBM: ['State Bank of Mauritius'], MAUBANK: ['Mau Bank'] }
const BANK_ALIASES = new Map(
  BANKS.flatMap((bank) => [bank.code, bank.name, ...(EXTRA_BANK_ALIASES[bank.code] ?? [])].map((alias) => [alias.toLowerCase(), bank.code])),
)
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const BANK = `(${[...BANK_ALIASES.keys()].sort((a, b) => b.length - a.length).map((alias) => escape(alias).replace(/ /g, '\\s+')).join('|')})`
const BANK_NAME = new RegExp(`\\b${BANK}\\b`, 'gi')
const FROM_CLAIM = new RegExp(`\\b(from|calling\\s+from|sent\\s+by|on\\s+behalf\\s+of|representing)\\s+(?:the\\s+)?(${BANK.slice(1, -1)}|your\\s+bank|the\\s+bank)\\b`, 'gi')
const DEPARTMENT_CLAIM = new RegExp(
  `(?:\\b${BANK}\\s+)?\\b(fraud\\s+(?:department|team|unit|prevention(?:\\s+team)?)|security\\s+(?:team|department|unit)|customer\\s+(?:care|service|support)(?:\\s+team)?|account\\s+protection(?:\\s+team)?|compliance\\s+(?:team|department)|bank\\s+officer)\\b`,
  'gi',
)

// --- Payees -----------------------------------------------------------------

// Cues that introduce a payee name. `labeled` cues end in ":" or "-", after
// which the name may be in any case; otherwise the name must be capitalised.
const PAYEE_CUES = [
  { pattern: /\b(beneficiary|payee|company|merchant|account\s+(?:name|holder))(?:\s+name)?[ \t]*([:-])?[ \t]*/gi, cue: (m) => normalize(m[1]), labeled: (m) => Boolean(m[2]) },
  { pattern: /\b(made\s+(?:out|payable)\s+to|payable\s+to|in\s+(?:the\s+)?name\s+of)[ \t]+/gi, cue: (m) => normalize(m[1]) },
  { pattern: /\b(invoice|bill|statement|payment\s+request)\s+from[ \t]+/gi, cue: (m) => `${normalize(m[1])} from` },
  { pattern: /\b(pay(?:ment)?|send|transfer(?:red)?|remit|wire)\b(?:\b(?:Rs|rs|RS|No|no)\.|\d\.\d|[^.\n!?]){0,40}?[ \t]to[ \t]+/gi, cue: (m) => `${normalize(m[1])} to` },
  { pattern: /\b(pay)[ \t]+/gi, cue: () => 'pay' },
]
const NAME_TOKEN = /&|[A-Za-zÀ-ɏ][\w&'’.À-ɏ-]*/y
const NAME_GAP = /[ \t]+/y
const NAME_CONNECTORS = new Set(['&', 'and', 'of', 'de', 'du', 'la', 'le', 'des', 'et'])
const NAME_STOP_WORDS = new Set([
  'account', 'acct', 'iban', 'ref', 'reference', 'invoice', 'amount', 'rs', 'mur', 'usd', 'eur', 'gbp',
  'on', 'by', 'before', 'after', 'via', 'at', 'for', 'with', 'using', 'today', 'tomorrow', 'now',
  'immediately', 'urgently', 'please', 'this', 'that', 'it', 'your', 'my', 'our', 'me', 'us', 'them',
  'him', 'her', 'you', 'a', 'an',
])
const MAX_NAME_WORDS = 8

// --- Helpers ----------------------------------------------------------------

const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const pad = (value) => String(value).padStart(2, '0')
const byPosition = (a, b) => a.start - b.start || a.end - b.end
const overlaps = (spans, start, end) => spans.some(([s, e]) => start < e && s < end)
const inside = (spans, index) => spans.some(([s, e]) => index >= s && index < e)
const digitsOf = (text) => text.replace(/\D/g, '')

function span(input, start, end, fields) {
  return { text: input.slice(start, end), start, end, ...fields }
}

// Runs `regex` over the input and keeps each built item that does not overlap
// an already-claimed span; kept items claim their span.
function collect(input, regex, build, claimed) {
  const items = []
  for (const match of input.matchAll(regex)) {
    const found = build(match)
    if (!found || overlaps(claimed, found.start, found.end)) continue
    items.push(found)
    claimed.push([found.start, found.end])
  }
  return items
}

function calendarDate(year, month, day) {
  // A leap year stands in when the text gives no year, so 29 Feb is allowed.
  const check = year ?? 2000
  const date = new Date(Date.UTC(check, month - 1, day))
  if (date.getUTCFullYear() !== check || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { value: year == null ? null : `${year}-${pad(month)}-${pad(day)}`, day, month, year }
}

function currencyCode(token) {
  const upper = token.toUpperCase()
  return upper.startsWith('RS') || upper.startsWith('RUPEE') ? 'MUR' : upper
}

// --- Extractors -------------------------------------------------------------

function extractLinks(input, claimed) {
  const emails = collect(input, EMAIL, (m) => span(input, m.index, m.index + m[0].length, { value: m[0].toLowerCase(), domain: m[0].split('@')[1].toLowerCase() }), claimed)

  const urls = collect(
    input,
    URL,
    (m) => {
      const text = m[0].replace(TRAILING_PUNCTUATION, '')
      return span(input, m.index, m.index + text.length, { value: text })
    },
    claimed,
  )
  const bare = collect(
    input,
    BARE_DOMAIN,
    (m) => {
      const text = m[0].replace(TRAILING_PUNCTUATION, '')
      return span(input, m.index, m.index + text.length, { value: text })
    },
    claimed,
  )
  // A bare domain followed by a path is a link as well.
  for (const found of bare) if (found.text.includes('/')) urls.push({ ...found })
  urls.sort(byPosition)

  const domains = [
    ...urls.map((url) => {
      const host = url.text.match(/^(?:https?:\/\/)?([^/?#:\s]+)/i)[1]
      const start = url.start + url.text.indexOf(host)
      return span(input, start, start + host.length, { value: host.toLowerCase(), source: 'url' })
    }),
    ...bare.filter((found) => !found.text.includes('/')).map((found) => ({ ...found, value: found.text.toLowerCase(), source: 'text' })),
    ...emails.map((email) => {
      const start = email.end - email.domain.length
      return span(input, start, email.end, { value: email.domain, source: 'email' })
    }),
  ].sort(byPosition)

  return { emails, urls, domains }
}

function extractReferences(input, claimed) {
  const prefixed = collect(
    input,
    PREFIXED_REFERENCE,
    (m) => span(input, m.index, m.index + m[0].length, { value: m[0].toUpperCase(), kind: REFERENCE_PREFIXES[m[1].toUpperCase()] }),
    claimed,
  )
  const labeled = collect(
    input,
    LABELED_REFERENCE,
    (m) => {
      const code = m[2]
      if (code.length < 3) return null
      // "order 23/09/2026" is a date, not a reference.
      if (new RegExp(`^${NUMERIC_DATE.source}$`).test(code) || new RegExp(`^${ISO_DATE.source}$`).test(code)) return null
      const end = m.index + m[0].length
      const label = normalize(m[1])
      const kind = REFERENCE_LABELS.find(([pattern]) => pattern.test(label))[1]
      return span(input, end - code.length, end, { value: code.toUpperCase(), kind })
    },
    claimed,
  )
  return [...prefixed, ...labeled].sort(byPosition)
}

function extractLabeledAccounts(input, claimed) {
  const ibans = collect(input, IBAN, (m) => span(input, m.index, m.index + m[0].length, { value: m[0].replace(/ /g, ''), kind: 'IBAN', labeled: false }), claimed)
  const labeled = collect(
    input,
    LABELED_ACCOUNT,
    (m) => {
      const end = m.index + m[0].length
      return span(input, end - m[1].length, end, { value: digitsOf(m[1]), kind: 'ACCOUNT', labeled: true })
    },
    claimed,
  )
  return [...ibans, ...labeled]
}

function extractDates(input, claimed) {
  const build = (m, year, month, day, format) => {
    const date = calendarDate(year, month, day)
    return date && span(input, m.index, m.index + m[0].length, { ...date, format })
  }
  const monthNumber = (name) => MONTHS.get(name.toLowerCase())
  const fullYear = (text) => (text.length === 2 ? 2000 + Number(text) : Number(text))
  return [
    ...collect(input, ISO_DATE, (m) => build(m, Number(m[1]), Number(m[2]), Number(m[3]), 'ISO'), claimed),
    ...collect(input, NUMERIC_DATE, (m) => build(m, fullYear(m[4]), Number(m[3]), Number(m[1]), 'DMY'), claimed),
    ...collect(input, DAY_MONTH_DATE, (m) => build(m, m[3] ? Number(m[3]) : null, monthNumber(m[2]), Number(m[1]), 'TEXT'), claimed),
    ...collect(input, MONTH_DAY_DATE, (m) => build(m, m[3] ? Number(m[3]) : null, monthNumber(m[1]), Number(m[2]), 'TEXT'), claimed),
  ].sort(byPosition)
}

function extractTimes(input, claimed) {
  const build = (m, hour, minute) => span(input, m.index, m.index + m[0].length, { value: `${pad(hour)}:${pad(minute)}`, hour, minute })
  return [
    ...collect(
      input,
      TIME_MERIDIEM,
      (m) => {
        const hour12 = Number(m[1]) % 12
        return build(m, m[3].toLowerCase() === 'p' ? hour12 + 12 : hour12, Number(m[2] ?? 0))
      },
      claimed,
    ),
    ...collect(input, TIME_24H, (m) => build(m, Number(m[1]), Number(m[2])), claimed),
    ...collect(input, TIME_H, (m) => build(m, Number(m[1]), Number(m[2])), claimed),
  ].sort(byPosition)
}

function extractAmounts(input, claimed) {
  const build = (m, token, integer, decimals, currencyStart) => {
    const value = Number(`${integer.replace(/,/g, '')}${decimals ? `.${decimals}` : ''}`)
    return span(input, m.index, m.index + m[0].length, {
      value,
      currency: currencyCode(token),
      currencyText: token,
      currencyStart,
      currencyEnd: currencyStart + token.length,
    })
  }
  return [
    ...collect(input, AMOUNT_AFTER_CURRENCY, (m) => build(m, m[1], m[2], m[3], m.index), claimed),
    ...collect(input, AMOUNT_BEFORE_CURRENCY, (m) => build(m, m[3], m[1], m[2], m.index + m[0].length - m[3].length), claimed),
  ].sort(byPosition)
}

function extractPhones(input, claimed) {
  const phone = (start, text, value) => span(input, start, start + text.length, { value })
  return [
    ...collect(input, INTERNATIONAL_PHONE, (m) => phone(m.index, m[0], `+${digitsOf(m[0]).replace(/^00/, '')}`), claimed),
    ...collect(input, MOBILE_PHONE, (m) => phone(m.index, m[0], `+230${digitsOf(m[0])}`), claimed),
    ...collect(input, CUED_LANDLINE, (m) => phone(m.index + m[0].length - m[1].length, m[1], `+230${digitsOf(m[1])}`), claimed),
  ].sort(byPosition)
}

function extractLastFour(input, claimed) {
  const build = (m) => span(input, m.index, m.index + m[0].length, { value: m[1] })
  return [...collect(input, MASKED_ACCOUNT, build, claimed), ...collect(input, ENDING_IN, build, claimed), ...collect(input, LAST_FOUR, build, claimed)].sort(byPosition)
}

function extractCurrencies(input, amounts, claimed) {
  const fromAmounts = amounts.map((amount) => span(input, amount.currencyStart, amount.currencyEnd, { code: amount.currency }))
  const standalone = collect(input, STANDALONE_CURRENCY, (m) => span(input, m.index, m.index + m[0].length, { code: currencyCode(m[1]) }), claimed)
  return [...fromAmounts, ...standalone].sort(byPosition)
}

function extractBanks(input, claimed) {
  const banks = []
  for (const m of input.matchAll(BANK_NAME)) {
    if (inside(claimed, m.index)) continue
    const code = BANK_ALIASES.get(normalize(m[1]))
    banks.push(span(input, m.index, m.index + m[0].length, { code, name: getBank(code).name }))
  }
  return banks
}

function extractSenderClaims(input, claimed) {
  const claims = []
  const bankCode = (text) => (text ? BANK_ALIASES.get(normalize(text)) ?? null : null)
  for (const m of input.matchAll(FROM_CLAIM)) {
    if (inside(claimed, m.index + m[0].length - 1)) continue
    const phrase = normalize(m[1])
    const kind = phrase === 'on behalf of' || phrase === 'representing' ? 'ON_BEHALF_OF' : 'FROM'
    claims.push(span(input, m.index, m.index + m[0].length, { kind, value: normalize(m[2]), bank: bankCode(m[2]) }))
  }
  for (const m of input.matchAll(DEPARTMENT_CLAIM)) {
    if (inside(claimed, m.index)) continue
    claims.push(span(input, m.index, m.index + m[0].length, { kind: 'DEPARTMENT', value: normalize(m[2]), bank: bankCode(m[1]) }))
  }
  return claims.sort(byPosition)
}

// Reads a name starting at `from`: capitalised words (any case when
// `anyCase`), joined by spaces or connectors like "of" and "&". Stops at
// punctuation, a line break, a word with digits, a stop word or a word ending
// in a full stop.
function readName(input, from, anyCase) {
  const words = []
  let pos = from
  while (words.length < MAX_NAME_WORDS) {
    NAME_TOKEN.lastIndex = pos
    const token = NAME_TOKEN.exec(input)
    if (!token) break
    const word = token[0]
    const bare = word.toLowerCase().replace(/\.$/, '')
    if (/\d/.test(word) || NAME_STOP_WORDS.has(bare)) break
    const connector = NAME_CONNECTORS.has(bare) && !/^[A-Z]/.test(word)
    if (!connector && !anyCase && !/^[A-ZÀ-Þ]/.test(word)) break
    words.push({ word, bare, connector, end: token.index + word.length })
    pos = token.index + word.length
    if (word.endsWith('.')) break
    NAME_GAP.lastIndex = pos
    if (!NAME_GAP.exec(input)) break
    pos = NAME_GAP.lastIndex
  }
  while (words.length && words.at(-1).connector) words.pop()
  if (!words.length || words.every(({ bare }) => bare === 'the')) return null
  // A final full stop is read as the end of the sentence, not part of the name.
  const last = words.at(-1)
  return { start: from, end: last.word.endsWith('.') ? last.end - 1 : last.end }
}

function extractPayees(input, claimed) {
  const payees = []
  for (const { pattern, cue, labeled } of PAYEE_CUES) {
    for (const m of input.matchAll(pattern)) {
      const start = m.index + m[0].length
      if (payees.some((payee) => payee.start === start)) continue
      const name = readName(input, start, labeled?.(m) ?? false)
      if (!name || overlaps(claimed, name.start, name.end)) continue
      const text = input.slice(name.start, name.end)
      payees.push(span(input, name.start, name.end, { value: text.replace(/\s+/g, ' '), cue: cue(m) }))
    }
  }
  return payees.sort(byPosition)
}

// Extracts entities from `input` (any string; null or undefined count as
// empty). Returns a plain, JSON-serialisable object with one list per entity
// type; see the file header for the item shape.
export function extractEntities(input) {
  const text = typeof input === 'string' ? input : input == null ? '' : String(input)
  const result = Object.fromEntries(EMPTY_KEYS.map((key) => [key, []]))
  if (!text.trim()) return result

  const claimed = []
  const { emails, urls, domains } = extractLinks(text, claimed)
  const references = extractReferences(text, claimed)
  const labeledAccounts = extractLabeledAccounts(text, claimed)
  const dates = extractDates(text, claimed)
  const times = extractTimes(text, claimed)
  const amounts = extractAmounts(text, claimed)
  const phoneNumbers = extractPhones(text, claimed)
  const bareAccounts = collect(text, BARE_ACCOUNT, (m) => span(text, m.index, m.index + m[0].length, { value: digitsOf(m[0]), kind: 'ACCOUNT', labeled: false }), claimed)
  const accountLastFour = extractLastFour(text, claimed)
  const currencies = extractCurrencies(text, amounts, claimed)

  const accountNumbers = [...labeledAccounts, ...bareAccounts]
    .map((account) => ({ ...account, lastFour: digitsOf(account.value).slice(-4) }))
    .sort(byPosition)

  return {
    ...result,
    amounts: amounts.map(({ currencyStart, currencyEnd, ...amount }) => amount),
    currencies,
    accountNumbers,
    accountLastFour,
    dates,
    times,
    payees: extractPayees(text, claimed),
    banks: extractBanks(text, claimed),
    references,
    urls,
    domains,
    emails,
    phoneNumbers,
    senderClaims: extractSenderClaims(text, claimed),
  }
}
