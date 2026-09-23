import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { extractEntities } from './extract.js'

const values = (items) => items.map((item) => item.value)
const texts = (items) => items.map((item) => item.text)

const KEYS = [
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

const SCAM_MESSAGE =
  'Dear customer, this is the MCB fraud department. Your account ending in 4821 has been suspended. ' +
  'Transfer Rs 25,000 and MUR 1,250.50 to Acme Rentals Ltd before 17:00 today, account no: 000 1234 5678 90. ' +
  'Ref INV-2026-0042. Visit https://mcb-secure.com/verify?id=1, or email help@mcb-secure.com. ' +
  'Call +230 5712 3456 or 5798 1234 by 23/09/2026 at 5.30 pm.'

describe('extractEntities — amounts and currencies', () => {
  test('Rs with thousands separators', () => {
    const { amounts, currencies } = extractEntities('Please pay Rs 25,000 now.')
    assert.deepEqual(amounts, [{ text: 'Rs 25,000', start: 11, end: 20, value: 25000, currency: 'MUR', currencyText: 'Rs' }])
    assert.deepEqual(currencies, [{ text: 'Rs', start: 11, end: 13, code: 'MUR' }])
  })

  test('MUR without separators, Rs. and suffix forms', () => {
    const { amounts } = extractEntities('MUR 25000, Rs.300/- and 1500 rupees')
    assert.deepEqual(texts(amounts), ['MUR 25000', 'Rs.300/-', '1500 rupees'])
    assert.deepEqual(values(amounts), [25000, 300, 1500])
    assert.ok(amounts.every((amount) => amount.currency === 'MUR'))
  })

  test('decimal amounts', () => {
    const { amounts } = extractEntities('Balance due: MUR 1,250.50 (was Rs 99.9)')
    assert.deepEqual(values(amounts), [1250.5, 99.9])
  })

  test('multiple amounts keep their order and original text', () => {
    const text = 'Send Rs 5,000 today and Rs 10,000 tomorrow, then MUR 2,500.75.'
    const { amounts } = extractEntities(text)
    assert.deepEqual(values(amounts), [5000, 10000, 2500.75])
    for (const amount of amounts) assert.equal(text.slice(amount.start, amount.end), amount.text)
  })

  test('numbers without a currency are not money', () => {
    const { amounts, currencies } = extractEntities('Unit 42, 3 payments of 25000 over 12 months')
    assert.deepEqual(amounts, [])
    assert.deepEqual(currencies, [])
  })

  test('a currency named without an amount is still a currency', () => {
    const { amounts, currencies } = extractEntities('All fees are charged in MUR.')
    assert.deepEqual(amounts, [])
    assert.deepEqual(currencies.map(({ text, code }) => [text, code]), [['MUR', 'MUR']])
  })
})

describe('extractEntities — accounts', () => {
  test('labelled and bare account numbers', () => {
    const { accountNumbers } = extractEntities('Account no: 000 1234 5678 90. Alternatively use 12345678901.')
    assert.deepEqual(
      accountNumbers.map(({ text, value, labeled, lastFour }) => ({ text, value, labeled, lastFour })),
      [
        { text: '000 1234 5678 90', value: '0001234567890', labeled: true, lastFour: '7890' },
        { text: '12345678901', value: '12345678901', labeled: false, lastFour: '8901' },
      ],
    )
  })

  test('Mauritian IBAN', () => {
    const { accountNumbers } = extractEntities('IBAN: MU17BOMM0101101030300200000MUR')
    assert.deepEqual(accountNumbers.map(({ kind, value }) => [kind, value]), [['IBAN', 'MU17BOMM0101101030300200000MUR']])
  })

  test('last-four digits from masked and spelled-out forms', () => {
    const { accountLastFour, accountNumbers } = extractEntities('Card ****7788, account ending in 4821, XXXX-1234, last four digits: 9090')
    assert.deepEqual(values(accountLastFour), ['7788', '4821', '1234', '9090'])
    assert.deepEqual(accountNumbers, [])
  })

  test('dates, times, phones and amounts are not account numbers', () => {
    const { accountNumbers } = extractEntities('On 23/09/2026 at 10:30 call +230 5712 3456 about Rs 1,000,000,000 or 2026-09-23.')
    assert.deepEqual(accountNumbers, [])
  })
})

describe('extractEntities — dates and times', () => {
  test('ISO, day-first numeric and written dates', () => {
    const { dates } = extractEntities('Due 2026-09-30, pay by 23/09/2026 or 5.10.26, from 5 October 2026, 1st Sept and 23 septembre 2026.')
    assert.deepEqual(
      dates.map(({ text, value, format }) => [text, value, format]),
      [
        ['2026-09-30', '2026-09-30', 'ISO'],
        ['23/09/2026', '2026-09-23', 'DMY'],
        ['5.10.26', '2026-10-05', 'DMY'],
        ['5 October 2026', '2026-10-05', 'TEXT'],
        ['1st Sept', null, 'TEXT'],
        ['23 septembre 2026', '2026-09-23', 'TEXT'],
      ],
    )
    assert.deepEqual([dates[4].day, dates[4].month, dates[4].year], [1, 9, null])
  })

  test('month-first written dates and impossible dates', () => {
    const { dates } = extractEntities('Starting September 23, 2026. Not a date: 31/02/2026.')
    assert.deepEqual(values(dates), ['2026-09-23'])
  })

  test('24-hour, h-form and AM/PM times', () => {
    const { times } = extractEntities('Before 17:00, at 14h30, around 9am, 5.30 pm or 12:15 a.m.')
    assert.deepEqual(
      times.map(({ text, value }) => [text, value]),
      [
        ['17:00', '17:00'],
        ['14h30', '14:30'],
        ['9am', '09:00'],
        ['5.30 pm', '17:30'],
        ['12:15 a.m.', '00:15'],
      ],
    )
  })
})

describe('extractEntities — links and contacts', () => {
  test('URLs, bare domains and their hosts', () => {
    const { urls, domains } = extractEntities('Go to https://mcb-secure.com/verify?id=1, www.sbm-help.net or mcb.mu. Also pay-now.co.uk/login')
    assert.deepEqual(texts(urls), ['https://mcb-secure.com/verify?id=1', 'www.sbm-help.net', 'pay-now.co.uk/login'])
    assert.deepEqual(
      domains.map(({ value, source }) => [value, source]),
      [
        ['mcb-secure.com', 'url'],
        ['www.sbm-help.net', 'url'],
        ['mcb.mu', 'text'],
        ['pay-now.co.uk', 'url'],
      ],
    )
  })

  test('emails, reported once, with their domain', () => {
    const { emails, domains, urls } = extractEntities('Reply to Help.Desk@MCB-Secure.com today.')
    assert.deepEqual(emails.map(({ text, value, domain }) => [text, value, domain]), [['Help.Desk@MCB-Secure.com', 'help.desk@mcb-secure.com', 'mcb-secure.com']])
    assert.deepEqual(domains.map(({ value, source }) => [value, source]), [['mcb-secure.com', 'email']])
    assert.deepEqual(urls, [])
  })

  test('Mauritian and international phone numbers', () => {
    const { phoneNumbers } = extractEntities('Call +230 5712 3456, 5798-1234, tel: 212 3456, 00230 208 1234 or +44 20 7946 0958.')
    assert.deepEqual(values(phoneNumbers), ['+23057123456', '+23057981234', '+2302123456', '+2302081234', '+442079460958'])
  })

  test('a bare 7-digit number without a phone cue is not a phone', () => {
    assert.deepEqual(extractEntities('Order quantity 2123456 units').phoneNumbers, [])
  })
})

describe('extractEntities — references, banks and names', () => {
  test('prefixed and labelled references', () => {
    const { references } = extractEntities('Invoice INV-12345 for policy POL-2026-0042. Ref: REF-77. Payment reference 88231. Order no. 23/09/2026.')
    assert.deepEqual(
      references.map(({ value, kind }) => [value, kind]),
      [
        ['INV-12345', 'INVOICE'],
        ['POL-2026-0042', 'POLICY'],
        ['REF-77', 'REFERENCE'],
        ['88231', 'PAYMENT'],
      ],
    )
  })

  test('bank names and aliases map to the app bank codes', () => {
    const { banks } = extractEntities('Moved from Mauritius Commercial Bank to SBM, then maubank. Not mcb-secure.com.')
    assert.deepEqual(banks.map(({ text, code, name }) => [text, code, name]), [
      ['Mauritius Commercial Bank', 'MCB', 'MCB'],
      ['SBM', 'SBM', 'SBM'],
      ['maubank', 'MAUBANK', 'MauBank'],
    ])
  })

  test('payees need a contextual cue', () => {
    const { payees } = extractEntities(
      'Invoice from Blue Lagoon Services Ltd. Beneficiary: acme rentals ltd, account 12345678901. Transfer Rs 5,000 to Island Fresh Co before Friday. Pay Coral Bay Syndic.',
    )
    assert.deepEqual(
      payees.map(({ value, cue }) => [value, cue]),
      [
        ['Blue Lagoon Services Ltd', 'invoice from'],
        ['acme rentals ltd', 'beneficiary'],
        ['Island Fresh Co', 'transfer to'],
        ['Coral Bay Syndic', 'pay'],
      ],
    )
  })

  test('capitalised words without a cue, and cues without a name, give no payee', () => {
    assert.deepEqual(extractEntities('Hello From Port Louis. Please Send The Money Soon.').payees, [])
    assert.deepEqual(extractEntities('Pay MUR 5000 to the account below. Payment to be made monthly.').payees, [])
  })

  test('sender and department claims are extracted, not judged', () => {
    const { senderClaims } = extractEntities('This is the MCB fraud department. Our security team, on behalf of your bank, writes from SBM.')
    assert.deepEqual(
      senderClaims.map(({ text, kind, value, bank }) => ({ text, kind, value, bank })),
      [
        { text: 'MCB fraud department', kind: 'DEPARTMENT', value: 'fraud department', bank: 'MCB' },
        { text: 'security team', kind: 'DEPARTMENT', value: 'security team', bank: null },
        { text: 'on behalf of your bank', kind: 'ON_BEHALF_OF', value: 'your bank', bank: null },
        { text: 'from SBM', kind: 'FROM', value: 'sbm', bank: 'SBM' },
      ],
    )
  })
})

describe('extractEntities — whole messages', () => {
  test('empty, blank and missing input give empty lists', () => {
    for (const input of ['', '   \n\t', null, undefined]) {
      const result = extractEntities(input)
      assert.deepEqual(Object.keys(result), KEYS)
      for (const key of KEYS) assert.deepEqual(result[key], [], `${key} for ${JSON.stringify(input)}`)
    }
  })

  test('noisy text', () => {
    const result = extractEntities('!!!URGENT!!! >>> rs25,000/-  ::  ~~ a/c#12345678901 ~~ ***  wwww  ???   5.30pm\n\n\t@@ ..... ')
    assert.deepEqual(values(result.amounts), [25000])
    assert.deepEqual(values(result.accountNumbers), ['12345678901'])
    assert.deepEqual(values(result.times), ['17:30'])
    assert.deepEqual(result.emails, [])
    assert.deepEqual(result.urls, [])
  })

  test('multiple entity types in one message', () => {
    const result = extractEntities(SCAM_MESSAGE)
    assert.deepEqual(values(result.amounts), [25000, 1250.5])
    assert.deepEqual(values(result.accountNumbers), ['0001234567890'])
    assert.deepEqual(values(result.accountLastFour), ['4821'])
    assert.deepEqual(values(result.dates), ['2026-09-23'])
    assert.deepEqual(values(result.times), ['17:00', '17:30'])
    assert.deepEqual(values(result.payees), ['Acme Rentals Ltd'])
    assert.deepEqual(result.banks.map((bank) => bank.code), ['MCB'])
    assert.deepEqual(values(result.references), ['INV-2026-0042'])
    assert.deepEqual(values(result.urls), ['https://mcb-secure.com/verify?id=1'])
    assert.deepEqual(values(result.emails), ['help@mcb-secure.com'])
    assert.deepEqual(values(result.phoneNumbers), ['+23057123456', '+23057981234'])
    assert.deepEqual(values(result.senderClaims), ['fraud department'])
  })

  test('every item points back at its text in the input', () => {
    const result = extractEntities(SCAM_MESSAGE)
    for (const key of KEYS) {
      for (const found of result[key]) assert.equal(SCAM_MESSAGE.slice(found.start, found.end), found.text, `${key}: ${found.text}`)
    }
  })

  test('deterministic and serialisable, with no verdict or score', () => {
    const first = extractEntities(SCAM_MESSAGE)
    for (let run = 0; run < 5; run++) assert.deepEqual(extractEntities(SCAM_MESSAGE), first)
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first)
    assert.deepEqual(Object.keys(first), KEYS)
  })
})
