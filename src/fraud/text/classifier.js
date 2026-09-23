import { extractEntities } from './extract.js'
import { CHANGED_DETAILS_TEXT, LANGUAGE_PATTERNS, PROMISED_RETURNS_TEXT } from './patterns.js'

// Deterministic, explainable classifier for a financial message.
//
// Input is the raw message text and nothing else: no request, profile,
// model output or corpus metadata. It combines the shared patterns
// (patterns.js) and extracted entities (extract.js) into named signals, adds
// their fixed weights into a signal score, and places the score in one of four
// bands:
//
//   score < 1      legit_normal   reads as a routine message
//   1 ≤ score < 2.5 legit_unusual  genuine-looking but unusual
//   2.5 ≤ score < 5 suspicious     several warning signals
//   score ≥ 5      fraudulent     matches common fraud patterns
//
// No single signal weighs 5 or more, so no one keyword or signal can make a
// message "fraudulent" on its own; that takes a combination. Mitigating signals
// (advice to use official channels, "no action is needed") lower the score.
//
// This is a text-analysis result, not fraud.auth's transaction risk score.
// `confidence` is a classification confidence in [0, 1]: how far the score sits
// from the nearest band boundary (0.5 on a boundary, 1 when it is 1.5 or more
// points inside its band). It is not a calibrated probability of fraud. Empty
// text gives classification null and confidence 0.
//
// English, French and Mauritian Kreol wording are recognised; language itself
// is never a signal.

export const CLASSIFIER_VERSION = 'text-rules-1.0.0'

export const CLASSIFICATIONS = ['legit_normal', 'legit_unusual', 'suspicious', 'fraudulent']

// Lower bounds of the bands above legit_normal.
export const THRESHOLDS = { legit_unusual: 1, suspicious: 2.5, fraudulent: 5 }

// Points inside a band at which confidence reaches 1.
const CONFIDENCE_MARGIN = 1.5

// Total mitigation never removes more than this.
const MAX_MITIGATION = 2

const languagePattern = (id) => LANGUAGE_PATTERNS.find((pattern) => pattern.id === id).pattern

// --- Wording ----------------------------------------------------------------
//
// Patterns end in (?![\wÀ-ɏ]) rather than \b, which never matches
// after an accented letter ("sécurité", "changé").

const URGENCY_EXTRA =
  /\b(urgent|end of (the )?day|this morning|within \d+ hours|limited places|en priorit[ée]|d[èe]s que possible|imm[ée]diatement|zordi|irzans)(?![\w\u00C0-\u024F])|aujourd['’]hui/i
const THREAT_EXTRA = /\b(restricted|deactivated|cancell?ed|at risk|exposed|suspendu|suspension|bloqu[ée]e?s?|bloke|expire[sd]?|late (payment )?fee)(?![\w\u00C0-\u024F])/i

const SENSITIVE_TERMS =
  /\b(otp|one-time (pass)?code|\d-digit code|security code|pin|password|card number|cvv|banking login|login details|code de s[ée]curit[ée]|mot de passe|modpas|kod)(?![\w\u00C0-\u024F])/i
// A sentence that warns about sharing codes is advice, not a request.
const SENSITIVE_NEGATION = /\b(never|will not|won['’]t|do not share|don['’]t share|jamais|zame|pa donn)(?![\w\u00C0-\u024F])/i
const SENSITIVE_REQUEST =
  /\b(reply|replying|send|enter|confirm|provide|give|read (us|me)|share|type|using|with your|avoy|donn|confirmez|entrez|avec votre)(?![\w\u00C0-\u024F])/i

const BYPASS_EXTRA =
  /\b(keep this (between us|confidential)|confidential (review|payment|supplier payment|matter)|do not discuss|don['’]t discuss|(do not|don['’]t) call (the|your) branch|no need to (call|contact) your branch|ne (contactez|parlez) pas|pa bizin telefonn|pa dir personn)(?![\w\u00C0-\u024F])/i

const CHANGED_DETAILS_EXTRA =
  /\b(bank details have changed|coordonn[ée]es bancaires (ont chang[ée]|ayant [ée]t[ée] mises? [àa] jour)|changement de banque|nouveau compte|(is moving|has moved|moved) its (account|receivables)|now receives payments at|payments should now be made to|no longer in use|sanz (nou )?kont|nouvo kont|kont ki lor faktir pa bon)(?![\w\u00C0-\u024F])/i
const CHANGED_DETAILS_NEGATED = /\b(restent inchang[ée]es|remain unchanged|have not changed|pa finn sanze)(?![\w\u00C0-\u024F])/i

const INVESTMENT_CONTEXT = /\b(invest\w*|trading|guaranteed|profits?|fixed-income|allocation|custodian|yield)(?![\w\u00C0-\u024F])/i

const REFUND_WORDS = /\b(refund\w*|overpayment|duplicate payment|overcharged|credit of|rebate|remboursement)(?![\w\u00C0-\u024F])/i
const SEND_BACK = /\b(transfer|send|return|pay)\b[^.]{0,30}\b(back|difference)(?![\w\u00C0-\u024F])/i

const NEW_CONTACT = /\b(new number|lost my phone|changed phones?|old one broke|nouveau num[ée]ro)(?![\w\u00C0-\u024F])/i
const REPLY_CHANNEL = /\b(reply(ing)? (with|to)|when our agent calls|a call from our)(?![\w\u00C0-\u024F])/i
const FREE_MAIL_DOMAIN = /(webmail|mail-?box|inbox|gmail|yahoo|hotmail|outlook)/i

const UNUSUAL_INSTRUCTIONS = [
  /\b(director|boss|manager|ceo) is (travelling|traveling|away|unavailable)|\bi am in meetings\b/i,
  /\b(invoice|paperwork|documents?) (will follow|to follow)\b/i,
  /\bconfirmation only\b/i,
  /\bapprove the request\b/i,
  /\b(move|transfer)\b[^.]{0,20}\b(balance|savings|funds)\b/i,
  /\b(protected|holding|temporary|custodian|safe) account\b/i,
  /\b(processing|customs|release|delivery|admin\w*) fee\b/i,
]

const PAYMENT_VERB = /\b(pay|paid|payments?|transfer\w*|send|move|settle|invest|r[ée]gler|r[èe]glement|paiement|virement|peyman|avoy)(?![\w\u00C0-\u024F])/i
const LINK_ACTION = /\b(pay|confirm|verify|claim|restore|update|enter|log ?in|login|review|cancel|annulez|confirmez|verifie|rant)(?![\w\u00C0-\u024F])/i

const OFFICIAL_CHANNEL =
  /(number on the back of your card|any branch|number printed on your last|type our address yourself|official app|in the \w+ app|verify them in person|your usual internet banking|kouma dabitid)/i
const REASSURANCE =
  /\b(no action is (needed|required)|no payment or action|ignore if already paid|if you have already paid|will never ask|never share|aucune action|ne les communiquez|zame nou pa)(?![\w\u00C0-\u024F])/i

const BANK_DOMAIN_TOKENS = new Set(['mcb', 'sbm', 'maubank'])

// --- Signals ----------------------------------------------------------------

// Each signal: label and weight (negative for mitigating signals).
export const SIGNALS = {
  urgency: { label: 'pressure to act quickly', weight: 1 },
  threat: { label: 'threat of consequences', weight: 1 },
  externalLink: { label: 'external link', weight: 0.5 },
  linkAction: { label: 'asks you to act through a link', weight: 1 },
  lookalikeLink: { label: 'look-alike bank link', weight: 3 },
  bypassVerification: { label: 'asks you to bypass normal checks or keep it secret', weight: 3 },
  sensitiveInfoRequest: { label: 'asks for codes, PINs or passwords', weight: 4 },
  bankImpersonation: { label: 'speaks for a bank while asking for risky actions', weight: 2 },
  changedPaymentDetails: { label: 'changed payment or account details', weight: 2.5 },
  promisedReturns: { label: 'promised investment returns', weight: 3 },
  newPaymentDestination: { label: 'payment to an account number given in the message', weight: 1.5 },
  refundRedirection: { label: 'refund or overpayment asking for money or details', weight: 2.5 },
  suspiciousContact: { label: 'unusual contact channel', weight: 1.5 },
  unusualInstruction: { label: 'unusual payment instruction', weight: 2 },
  officialChannelAdvice: { label: 'points to official channels', weight: -1 },
  reassurance: { label: 'no action or credentials requested', weight: -1 },
}

const sentencesOf = (text) => text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)
const matchText = (pattern, text) => text.match(pattern)?.[0] ?? null

function domainLabels(domain) {
  return domain.replace(/^www\./, '').split('.').slice(0, -1).flatMap((label) => label.split('-'))
}

// Returns { id: evidence[] } for every signal present.
function detectSignals(text, entities) {
  const found = {}
  const add = (id, evidence) => {
    const items = [].concat(evidence).filter(Boolean)
    if (items.length) found[id] = [...new Set([...(found[id] ?? []), ...items])]
  }

  add('urgency', [matchText(languagePattern('urgency'), text), matchText(URGENCY_EXTRA, text)])
  add('threat', [matchText(languagePattern('threat'), text), matchText(THREAT_EXTRA, text)])

  // An email address is not a link.
  const domains = [...new Set(entities.domains.filter((domain) => domain.source !== 'email').map((domain) => domain.value))]
  if (entities.urls.length || domains.length) {
    add('externalLink', domains)
    if (LINK_ACTION.test(text)) add('linkAction', matchText(LINK_ACTION, text))
  }
  for (const domain of domains) {
    const labels = domainLabels(domain)
    const bank = labels.find((label) => BANK_DOMAIN_TOKENS.has(label))
    // A bank's name plus anything else ("mcb-secure-login", "sbm-online-4f2a");
    // a bare "www.mcb.example" is not flagged.
    if (bank && labels.length > 1) add('lookalikeLink', domain)
  }

  add('bypassVerification', [matchText(languagePattern('bypassChecks'), text), matchText(BYPASS_EXTRA, text)])

  for (const sentence of sentencesOf(text)) {
    const term = matchText(SENSITIVE_TERMS, sentence)
    if (term && !SENSITIVE_NEGATION.test(sentence) && SENSITIVE_REQUEST.test(sentence)) add('sensitiveInfoRequest', term)
  }

  if (!CHANGED_DETAILS_NEGATED.test(text)) add('changedPaymentDetails', [matchText(CHANGED_DETAILS_TEXT, text), matchText(CHANGED_DETAILS_EXTRA, text)])

  // "return" alone also means sending money back, so a promise needs
  // investment context as well.
  const returns = matchText(PROMISED_RETURNS_TEXT, text)
  if (returns && INVESTMENT_CONTEXT.test(text)) add('promisedReturns', [returns, matchText(INVESTMENT_CONTEXT, text)])

  const fullAccounts = entities.accountNumbers.filter((account) => account.kind === 'ACCOUNT' || account.kind === 'IBAN')
  if (fullAccounts.length && PAYMENT_VERB.test(text)) add('newPaymentDestination', fullAccounts.map((account) => account.text))

  const refund = matchText(REFUND_WORDS, text)
  if (refund && (SEND_BACK.test(text) || found.externalLink || found.sensitiveInfoRequest || fullAccounts.length)) add('refundRedirection', refund)

  add('suspiciousContact', [matchText(NEW_CONTACT, text), matchText(REPLY_CHANNEL, text)])
  for (const email of entities.emails) if (FREE_MAIL_DOMAIN.test(email.domain)) add('suspiciousContact', email.value)

  for (const pattern of UNUSUAL_INSTRUCTIONS) add('unusualInstruction', matchText(pattern, text))

  // Speaking as a bank is normal; it matters combined with a risky request.
  const bankVoice = entities.banks.length > 0 || entities.senderClaims.length > 0 || Boolean(found.lookalikeLink)
  const riskyAction = found.sensitiveInfoRequest || found.lookalikeLink || found.bypassVerification || (found.threat && found.externalLink) || found.unusualInstruction
  if (bankVoice && riskyAction) add('bankImpersonation', [...entities.banks.map((bank) => bank.text), ...entities.senderClaims.map((claim) => claim.text), ...(found.lookalikeLink ?? [])])

  add('officialChannelAdvice', matchText(OFFICIAL_CHANNEL, text))
  add('reassurance', matchText(REASSURANCE, text))
  return found
}

// --- Classification ---------------------------------------------------------

function classify(score) {
  if (score >= THRESHOLDS.fraudulent) return 'fraudulent'
  if (score >= THRESHOLDS.suspicious) return 'suspicious'
  if (score >= THRESHOLDS.legit_unusual) return 'legit_unusual'
  return 'legit_normal'
}

function confidenceOf(score, classification) {
  const lower = { legit_normal: -Infinity, legit_unusual: THRESHOLDS.legit_unusual, suspicious: THRESHOLDS.suspicious, fraudulent: THRESHOLDS.fraudulent }[classification]
  const upper = { legit_normal: THRESHOLDS.legit_unusual, legit_unusual: THRESHOLDS.suspicious, suspicious: THRESHOLDS.fraudulent, fraudulent: Infinity }[classification]
  const margin = Math.min(score - lower, upper - score)
  return Math.round((0.5 + 0.5 * Math.min(1, margin / CONFIDENCE_MARGIN)) * 100) / 100
}

const DESCRIPTIONS = {
  legit_normal: 'Reads as a routine message',
  legit_unusual: 'Reads as genuine but unusual',
  suspicious: 'Contains several warning signals',
  fraudulent: 'Matches common fraud patterns',
}

// Classifies one message from its raw text. Anything that is not a string is
// treated as empty text.
export function classifyMessage(text) {
  const input = typeof text === 'string' ? text : ''
  if (!input.trim()) {
    return {
      version: CLASSIFIER_VERSION,
      classification: null,
      score: 0,
      confidence: 0,
      intents: [],
      signals: [],
      summary: 'No text to analyse.',
    }
  }

  const found = detectSignals(input, extractEntities(input))
  const signals = Object.keys(SIGNALS)
    .filter((id) => found[id])
    .map((id) => ({ id, label: SIGNALS[id].label, weight: SIGNALS[id].weight, evidence: found[id] }))

  const risk = signals.filter((signal) => signal.weight > 0).reduce((sum, signal) => sum + signal.weight, 0)
  const mitigation = Math.min(MAX_MITIGATION, -signals.filter((signal) => signal.weight < 0).reduce((sum, signal) => sum + signal.weight, 0))
  const score = Math.max(0, Math.round((risk - mitigation) * 100) / 100)
  const classification = classify(score)
  const confidence = confidenceOf(score, classification)
  const intents = signals.filter((signal) => signal.weight > 0).map((signal) => signal.id)
  const described = signals.filter((signal) => signal.weight > 0).map((signal) => signal.label)

  return {
    version: CLASSIFIER_VERSION,
    classification,
    score,
    confidence,
    intents,
    signals,
    summary: `${DESCRIPTIONS[classification]}${described.length ? `: ${described.join('; ')}` : ''}. Classification confidence ${confidence.toFixed(2)} (text analysis only, not a fraud probability or transaction risk score).`,
  }
}
