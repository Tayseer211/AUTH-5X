// Fictional vocabulary for the synthetic dataset: payee names, amounts and
// payment wording. Every name is assembled from generic words (Mauritian
// flora, fauna and coastline terms plus a business-type suffix); none is taken
// from a real company or customer, and people are never named — personal
// payees appear only as "Family account ••1234" style labels. Links in scam
// wording use the reserved `.example` domain.
//
// Amounts are MUR per payment for a reference household income of
// Rs 50,000/month; generator.js scales them by each user's income.

export const NAME_STEMS = [
  'Corail', 'Filao', 'Lagon Bleu', 'Flamboyant', 'Ravenala', 'Takamaka', 'Latanier', 'Bambou', 'Vanille', 'Alizé',
  'Pointe Azur', 'Belle Lagune', 'Ebony Ridge', 'Cascade', 'Mangrove', 'Sable Doré', 'Varangue', 'Camaron', 'Palmiste',
  'Kestrel', 'Anse Claire', 'Coco Plage', 'Montagne Verte', 'Rivière Claire', 'Baie Turquoise', 'Île Verte', 'Tec-Tec',
  'Paille-en-Queue', 'Cardinal Rouge', 'Bois Jaune', 'Pointe Sable', 'Vieux Phare', 'Récif', 'Salangane',
]

// `personal` payees are individuals' accounts, labelled without a name.
export const PAYEE_CATEGORIES = {
  PROPERTY: {
    suffixes: ['Property Management', 'Residences Syndic', 'Estate Services'],
    amount: [2500, 12000],
    descriptions: ['Building maintenance fees', 'Syndic contribution', 'Residence service charge'],
    refPrefix: 'UNIT',
  },
  RENT: {
    suffixes: ['Lettings Ltd', 'Rentals Co.'],
    amount: [8000, 32000],
    descriptions: ['Monthly rent', 'Apartment rent'],
    refPrefix: 'TEN',
  },
  TELECOM: {
    suffixes: ['Fibre Ltd', 'Telecom Services', 'Connect Ltd'],
    amount: [800, 3500],
    descriptions: ['Home internet', 'Fibre broadband', 'Mobile plan'],
    refPrefix: 'ACC',
  },
  UTILITIES: {
    suffixes: ['Power Utility', 'Water Services'],
    amount: [600, 4500],
    descriptions: ['Electricity bill', 'Water bill'],
    refPrefix: 'MTR',
  },
  INSURANCE: {
    suffixes: ['Insurance Ltd', 'Assurance Co.', 'Mutual Cover'],
    amount: [1200, 9000],
    descriptions: ['Home insurance', 'Health insurance premium', 'Motor insurance', 'Life cover premium'],
    refPrefix: 'POL',
  },
  EDUCATION: {
    suffixes: ['Academy', 'College', 'Learning Centre'],
    amount: [2500, 20000],
    descriptions: ['School fees', 'Tuition fees', 'After-school classes'],
    refPrefix: 'STU',
  },
  CHILDCARE: {
    suffixes: ['Crèche', 'Childcare Centre'],
    amount: [2500, 9000],
    descriptions: ['Crèche fees', 'Childcare fees'],
    refPrefix: 'CHD',
  },
  FITNESS: {
    suffixes: ['Fitness Club', 'Wellness Studio'],
    amount: [700, 3000],
    descriptions: ['Gym membership', 'Fitness membership', 'Yoga classes'],
    refPrefix: 'MEM',
  },
  SERVICES: {
    suffixes: ['Cleaning Services Ltd', 'Garden Care', 'Home Services'],
    amount: [1200, 8000],
    descriptions: ['Office cleaning contract', 'Garden upkeep', 'Housekeeping services'],
    refPrefix: 'INV',
  },
  LOAN: {
    suffixes: ['Finance Ltd', 'Credit Union', 'Leasing Co.'],
    amount: [3000, 25000],
    descriptions: ['Car lease instalment', 'Personal loan repayment'],
    refPrefix: 'LN',
  },
  CHARITY: {
    suffixes: ['Foundation', 'Community Fund'],
    amount: [200, 2000],
    descriptions: ['Monthly donation', 'Charity pledge'],
    refPrefix: 'DON',
  },
  // Genuine businesses whose names use the same "safe / guardian / shield /
  // invest" vocabulary as scam payees, so that wording is not a fraud label.
  HOME_SECURITY: {
    suffixes: ['Safeguard Alarms', 'Home Protection Services', 'Guardian Monitoring', 'Shield Alarm Systems'],
    amount: [600, 3500],
    descriptions: ['Alarm monitoring', 'Home protection plan', 'Guardian patrol subscription', 'Safe-deposit box rental'],
    refPrefix: 'SEC',
  },
  INVESTMENT_PLAN: {
    suffixes: ['Unit Trust', 'Pension Fund', 'Investment Management', 'Asset Management'],
    amount: [1000, 10000],
    descriptions: ['Pension contribution', 'Unit trust savings plan', 'Monthly investment plan'],
    refPrefix: 'PLN',
  },
  SAVINGS: {
    personal: 'Savings account',
    amount: [2000, 20000],
    descriptions: ['Monthly savings', 'Savings top-up'],
    refPrefix: null,
  },
  FAMILY: {
    personal: 'Family account',
    amount: [1500, 12000],
    descriptions: ['Family support', 'Monthly allowance'],
    refPrefix: null,
  },
}

// Categories usually paid by standing order vs. ad-hoc bill payment or
// transfer (the latter become "known payees without an arrangement").
export const BILL_CATEGORIES = ['UTILITIES', 'TELECOM', 'INSURANCE', 'SERVICES', 'HOME_SECURITY']
export const TRANSFER_CATEGORIES = ['FAMILY', 'SAVINGS', 'SERVICES', 'RENT']
// Categories a legitimate new payee is commonly drawn from.
export const EVERYDAY_CATEGORIES = ['TELECOM', 'FITNESS', 'INSURANCE', 'SERVICES', 'UTILITIES', 'CHARITY', 'CHILDCARE', 'HOME_SECURITY']

// Real payee names and payment descriptions often say nothing about the kind
// of service. Some legitimate payees and requests use these, so a missing
// payee/reference category is not a fraud label. None matches a keyword in
// CATEGORY_KEYWORDS (features.js).
export const GENERIC_SUFFIXES = ['Ltd', 'Co. Ltd', 'Enterprises', '& Associates', 'Group', 'Partners']
export const GENERIC_DESCRIPTIONS = ['Monthly payment', 'Standing order', 'Payment as agreed', 'Regular payment', 'Contribution']
// Categories that plausibly justify a large, planned payment.
export const PLANNED_LARGE_CATEGORIES = ['EDUCATION', 'LOAN', 'PROPERTY', 'RENT', 'INSURANCE']

// Card spending (history only), as [suffix, median amount].
export const MERCHANTS = [
  ['Supermarket', 900],
  ['Fuel Station', 1200],
  ['Pharmacy', 450],
  ['Bakery', 180],
  ['Restaurant', 1100],
  ['Hardware', 1500],
  ['Bookshop', 600],
  ['Market Stall', 350],
]

export { RECIPIENT_BANKS as BANKS } from '../../data/recipientBanks.js'
export const CHANNELS = ['ONLINE_BANKING', 'MOBILE_APP', 'BRANCH', 'EMAIL_LINK']

// Fraudster payee names.
const SECURITY_PREFIXES = ['SecureHold', 'SafeGuard', 'Verified', 'Shieldline', 'Guardian', 'SafePoint']
const SECURITY_SUFFIXES = ['Settlements Ltd', 'Holding Account', 'Clearing Services', 'Escrow Ltd', 'Protection Desk']
const INVESTMENT_PREFIXES = ['Apex', 'Quantum', 'Horizon', 'Summit', 'Nova', 'Zenith']
const INVESTMENT_SUFFIXES = ['Yield Partners', 'Capital Growth Ltd', 'Trading Desk', 'Invest Group', 'Crypto Fund']

export const securityThemedName = (rng) => `${rng.pick(SECURITY_PREFIXES)} ${rng.pick(SECURITY_SUFFIXES)}`
export const investmentName = (rng) => `${rng.pick(INVESTMENT_PREFIXES)} ${rng.pick(INVESTMENT_SUFFIXES)}`
export const personalAccountName = (rng, label = 'Personal account') => `${label} ••${rng.digits(4)}`

// A near-copy of a payee's name, as used in invoice-redirection scams.
export function lookalikeName(rng, name) {
  const variants = []
  if (/\bLtd\b/.test(name)) variants.push(name.replace(/\bLtd\b/, 'Limited'))
  else variants.push(`${name} Ltd`)
  const words = name.split(' ')
  if (words.length > 1) variants.push(`${words[0]}-${words.slice(1).join(' ')}`)
  const last = words[words.length - 1]
  if (/s$/.test(last)) variants.push([...words.slice(0, -1), last.slice(0, -1)].join(' '))
  else if (/^[A-Za-z]+$/.test(last) && last.length > 3) variants.push([...words.slice(0, -1), `${last}s`].join(' '))
  const swap = { l: '1', o: '0', i: 'l', e: 'é' }
  const index = [...name].findIndex((char, i) => i > 0 && swap[char])
  if (index > 0) variants.push(name.slice(0, index) + swap[name[index]] + name.slice(index + 1))
  variants.push(`${name} Payments`)
  return rng.pick(variants)
}

// ---- Payment wording -----------------------------------------------------

export const ROUTINE_TEXTS = [
  '{desc} for {payee}, reference {ref}.',
  'Monthly {descLower} as agreed with {payee}.',
  'Setting up {descLower}. Ref {ref}.',
  '{desc} – standing order from next cycle.',
  '{desc}, account {ref}.',
]

export const LARGE_LEGIT_TEXTS = [
  'Annual {descLower} paid in one go this year. Ref {ref}.',
  'Catch-up payment for {descLower} arrears, agreed with {payee}.',
  'Revised {descLower} following the new contract. Ref {ref}.',
  'First-term {descLower} deposit for {payee}.',
  'No need to call to confirm – this is the agreed {descLower} for {payee}.',
]

export const LEGIT_URGENT_TEXTS = [
  'Urgent: {descLower} due before 15:00 on Friday, ref {ref}.',
  'Needs to go out today so the {descLower} is not late. Ref {ref}.',
  'Please process as soon as possible – {descLower} for {payee}.',
]

// Genuine supplier notices quoted by the customer: threat wording
// ("suspended", "penalty") without a scam.
export const LEGIT_NOTICE_TEXTS = [
  'Service will be suspended if the arrears are not cleared this month, per the {payee} notice.',
  'Setting this up to avoid the late payment penalty on the {descLower}.',
  '{payee} sent a closure warning for the unpaid {descLower}; paying it off now.',
]

// A genuine customer who needs no call-back, in their own words.
export const NO_CALLBACK_TEXTS = [
  'No need to call me to confirm – this is the agreed {descLower} for {payee}.',
  'Agreed with {payee} in person, no need to contact me about it. Ref {ref}.',
]

// A genuine e-bill "pay by standing order" link from a real biller.
export const EBILL_TEXTS = [
  'Set up from the e-bill link sent by {payee}: https://billing-{code}.example/pay',
  'Payment link from {payee}: https://pay-{code}.example/standing-order',
  '',
]

// A genuine customer following a real fraud alert from their bank: they move
// their savings to a newly opened account. Uses the same security vocabulary
// as impersonation scams.
export const BANK_ADVISED_TEXTS = [
  'Moving my savings to the new account as advised by the bank fraud department after the card incident.',
  'The branch security team recommended a new account after the card fraud; transferring my savings there.',
  'Card replaced and new PIN received; moving the savings order to my new account as agreed at the branch.',
  '',
]

// A genuine, regulated savings plan.
export const LEGIT_RETURNS_TEXTS = [
  'Monthly contribution to my retirement plan; returns are reinvested.',
  'Unit trust savings plan, returns reviewed every year with my adviser.',
  'Pension contribution as agreed with my adviser.',
  '',
]

export const CHANGED_DETAILS_TEXTS = [
  'Please note our bank details have changed; kindly use the new account for all future payments. Ref {ref}.',
  'Following an internal audit our payment account was updated. The previous account is no longer active.',
  '{desc} – {payee} asked that payments now go to their updated account details.',
]

export const MILD_PRESSURE_TEXTS = [
  'Please set this up today if possible, the provider is waiting.',
  'Needed urgently to secure the booking. Ref {ref}.',
  'Deposit must be in place within 48 hours according to the agent.',
]

export const IMPERSONATION_TEXTS = {
  opener: ['Dear customer,', 'Important notice from your bank security team.', 'This is the account protection desk.', 'Notice regarding your account security review.'],
  body: [
    'A settlement to our secure holding account is required to protect your savings.',
    'Your account has been flagged and funds must be moved to a verified safe account.',
    'To complete the security review a recurring transfer to the protection account is needed.',
  ],
  pressure: [
    'Please complete this today before 17:00.',
    'Failure to act within 2 hours will result in account suspension.',
    'Your online banking will be frozen if this is not set up immediately.',
  ],
  bypass: ['There is no need to contact your branch.', 'Do not tell bank staff about this arrangement; it is confidential.'],
  link: ['Confirm the arrangement at https://secure-review-{code}.example/confirm once submitted.', 'Verify at https://account-protect-{code}.example before 17:00.'],
  sensitive: ['You will receive an OTP to confirm – read it back to our agent.', 'Keep your PIN ready for the verification call.'],
}

export const INVESTMENT_TEXTS = {
  pitch: [
    'Guaranteed 15% monthly returns on your capital.',
    'Our trading desk will double your savings within 3 months.',
    'Weekly profit withdrawals, capital fully protected.',
    'Exclusive crypto fund with guaranteed returns for early members.',
  ],
  pressure: ['Limited places – the offer closes today.', 'Only 3 slots left this week, act immediately.', ''],
}

export const BLAND_TEXTS = ['', '', 'Payment', 'Transfer', 'Monthly', 'Services', 'Invoice {ref}']
