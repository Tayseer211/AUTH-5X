import { LANGUAGE_PATTERNS } from './text/patterns.js'

// One registry of every signal the fraud layers produce, assigned to a
// concern family. The hybrid assessment counts families, not layers:
//
//   transaction   — the request against the user's history: the rule checks
//                   except language, the model's estimate and behaviour.
//                   One vote, however many layers report it.
//   message       — what the message says: the text classifier (and the
//                   engine's language check, which is displayed but never
//                   counted, since the classifier reads the same words).
//   contradiction — where the message disagrees with the request: the
//                   evidence comparison's CONFLICT signals.
//
// Topics name the same concern across sources ("urgency" from the engine,
// the classifier and so on), so explanations can list it once.

export const FAMILIES = ['transaction', 'message', 'contradiction']

// --- Rule engine (engine.js CHECKS) -----------------------------------------

export const ENGINE_CHECK_FAMILIES = {
  amount: 'transaction',
  frequency: 'transaction',
  recipient: 'transaction',
  behaviour: 'transaction',
  language: 'message',
  expected: 'transaction',
}

// The check the hybrid transaction baseline leaves out: its evidence is the
// message, which the message family already covers.
export const ENGINE_LANGUAGE_CHECK = 'language'

// Language findings read "<pattern label>: “<match>”" (checks.js).
const LANGUAGE_TOPICS = {
  urgency: 'urgency',
  threat: 'threat',
  bypassChecks: 'bypass',
  externalLink: 'externalLink',
  sensitiveInfo: 'sensitiveInfo',
  bankImpersonation: 'bankImpersonation',
}

export function engineFindingTopic(checkId, text) {
  if (checkId !== ENGINE_LANGUAGE_CHECK) return null
  const pattern = LANGUAGE_PATTERNS.find(({ label }) => text.startsWith(`${label}:`))
  return pattern ? LANGUAGE_TOPICS[pattern.id] ?? null : null
}

// --- Text classifier (text/classifier.js SIGNALS) ----------------------------

// Every classifier signal belongs to the message family; `topic` is set where
// the same concern is also reported elsewhere.
export const MESSAGE_SIGNALS = {
  urgency: { topic: 'urgency' },
  threat: { topic: 'threat' },
  externalLink: { topic: 'externalLink' },
  linkAction: { topic: null },
  lookalikeLink: { topic: 'lookalikeLink' },
  bypassVerification: { topic: 'bypass' },
  sensitiveInfoRequest: { topic: 'sensitiveInfo' },
  bankImpersonation: { topic: 'bankImpersonation' },
  changedPaymentDetails: { topic: null },
  promisedReturns: { topic: null },
  newPaymentDestination: { topic: null },
  refundRedirection: { topic: null },
  suspiciousContact: { topic: null },
  unusualInstruction: { topic: null },
  officialChannelAdvice: { topic: null },
  reassurance: { topic: null },
}

export const messageSignalTopic = (id) => MESSAGE_SIGNALS[id]?.topic ?? null

// --- Evidence comparison (text/evidence.js signal ids) ----------------------

// Signal ids are "<field>.<outcome>". Fields compared with the request are the
// contradiction family; fields about the message's own content are message.
export const EVIDENCE_FIELD_FAMILIES = {
  amount: 'contradiction',
  currency: 'contradiction',
  payee: 'contradiction',
  bank: 'contradiction',
  account: 'contradiction',
  reference: 'contradiction',
  date: 'contradiction',
  sender: 'message',
  link: 'message',
  sensitive: 'message',
  consistency: 'message',
}

const EVIDENCE_TOPICS = {
  'sensitive.request': 'sensitiveInfo',
  'link.lookalike': 'lookalikeLink',
}

export const evidenceSignalFamily = (id) => EVIDENCE_FIELD_FAMILIES[id.split('.')[0]] ?? null
export const evidenceSignalTopic = (id) => EVIDENCE_TOPICS[id] ?? null

// The payment fact each compared field is about. A different currency makes
// both the amount and the currency disagree, but it is one fact, so the two
// fields share it and a single currency difference counts once.
export const EVIDENCE_FIELD_FACTS = {
  amount: 'amount',
  currency: 'amount',
  payee: 'payee',
  bank: 'bank',
  account: 'account',
  reference: 'reference',
  date: 'date',
}

export const evidenceSignalFact = (id) => EVIDENCE_FIELD_FACTS[id.split('.')[0]] ?? null

// The payment facts a message's own warning signals are about. A message
// that says the account has changed, and then contradicts the request's
// account, is reporting one fact twice; a request for a PIN plus a different
// amount is two independent facts.
export const MESSAGE_INTENT_FACTS = {
  changedPaymentDetails: ['account', 'bank', 'payee'],
  newPaymentDestination: ['account'],
  refundRedirection: ['amount', 'account'],
  promisedReturns: ['amount'],
}

// --- Profile checks ------------------------------------------------------------

// Deterministic checks of the payee against the user's history (features.js
// derived flags) that the original rule engine does not make. They are
// transaction-family evidence, at the level of a rule finding: never a
// separate vote.
export const TRANSACTION_PROFILE_FLAGS = {
  recipientAccountChanged: 'The payee is known, but this account is not one you have paid them at before.',
  lookalikeRecipient: 'The payee name closely resembles, but does not match, a payee you already pay.',
}

export function transactionProfileFlags(features) {
  return Object.keys(TRANSACTION_PROFILE_FLAGS).filter((flag) => features?.derived?.[flag] === true)
}

// --- Model features (ml/featureSpec.js MODEL_FEATURES) ----------------------

// Group names are for explanations. The wording features are message family:
// the assessment scores the model with the message removed, so they carry no
// message evidence into the transaction estimate.
const MODEL_FEATURE_GROUPS = {
  schedule: ['frequency', 'existingStandingOrderFrequency', 'unusualFrequency', 'frequencyChangedForRecipient', 'duplicateOfExistingOrder', 'unusualPaymentDay'],
  amount: [
    'amountLog10', 'amountToUserAverageRatio', 'amountToStandingOrderMaxRatio', 'amountLogZScore', 'amountToRecipientAverageRatio',
    'amountChangeVsExistingOrderRatio', 'amountAboveUsualRange', 'roundThousandAmount', 'annualisedAmount', 'annualisedToUsualRatio',
    'existingStandingOrderAmount',
  ],
  baseline: ['userAverageAmount', 'userStandingOrderCount', 'userStandingOrderMinAmount', 'userStandingOrderMaxAmount', 'userKnownDeviceCount', 'userUsualChannel'],
  payee: [
    'recipientBank', 'beneficiaryAddedMinutesBefore', 'recipientPreviousPaymentCount', 'recipientHistoricalAverageAmount', 'recipientLastPaidDaysAgo',
    'recipientAccountPreviouslyUsed', 'existingStandingOrderToRecipient', 'newRecipient', 'recipientAccountChanged', 'recipientNameSimilarity',
    'lookalikeRecipient', 'securityThemedRecipientName', 'overseasRecipient', 'beneficiaryAddedRecently', 'payeeCategory', 'referenceCategory',
    'referencePayeeConflict',
  ],
  behaviour: ['channel', 'initiatedHour', 'unusualHour', 'hoursOutsideActiveWindow', 'nightTime', 'hourTypicality', 'weekendInitiation', 'newDevice', 'unusualChannel', 'externalLinkChannel'],
  summary: ['riskSignalCount'],
  wording: [
    'textLength', 'textUrgency', 'textThreat', 'textBypassChecks', 'textExternalLink', 'textSensitiveInfo', 'textBankImpersonation',
    'textChangedPaymentDetails', 'textPromisedReturns', 'textRiskTermCount',
  ],
}

export const MODEL_FEATURE_FAMILIES = Object.fromEntries(
  Object.entries(MODEL_FEATURE_GROUPS).flatMap(([group, names]) => names.map((name) => [name, { group, family: group === 'wording' ? 'message' : 'transaction' }])),
)

export const modelFeatureGroup = (name) => MODEL_FEATURE_FAMILIES[name] ?? null

// Plain-language names for the model's inputs, used to say which factors
// raised a model estimate. They name the factor, not a direction: a positive
// contribution means the factor raised the estimate for this request.
export const MODEL_FEATURE_DESCRIPTIONS = {
  frequency: 'the payment frequency',
  existingStandingOrderFrequency: 'the frequency of your existing order with this payee',
  unusualFrequency: 'a frequency you do not usually use',
  frequencyChangedForRecipient: 'a change of frequency for this payee',
  duplicateOfExistingOrder: 'a possible duplicate of an existing order',
  unusualPaymentDay: 'the first payment day compared with your usual days',
  amountLog10: 'the size of the amount',
  amountToUserAverageRatio: 'the amount compared with your average payment',
  amountToStandingOrderMaxRatio: 'the amount compared with your largest standing order',
  amountLogZScore: 'how far the amount is from your usual amounts',
  amountToRecipientAverageRatio: 'the amount compared with what you usually pay this payee',
  amountChangeVsExistingOrderRatio: 'the change from your existing order with this payee',
  amountAboveUsualRange: 'an amount above your usual range',
  roundThousandAmount: 'a round-thousand amount',
  annualisedAmount: 'the total the order would move in a year',
  annualisedToUsualRatio: 'the yearly total compared with your usual orders',
  existingStandingOrderAmount: 'the amount of your existing order with this payee',
  userAverageAmount: 'your average payment amount',
  userStandingOrderCount: 'how many standing orders you have',
  userStandingOrderMinAmount: 'your smallest standing order',
  userStandingOrderMaxAmount: 'your largest standing order',
  userKnownDeviceCount: 'how many devices you normally use',
  userUsualChannel: 'your usual banking channel',
  recipientBank: 'where the payee banks',
  beneficiaryAddedMinutesBefore: 'how recently the payee was added',
  recipientPreviousPaymentCount: 'how often you have paid this payee',
  recipientHistoricalAverageAmount: 'what you have paid this payee before',
  recipientLastPaidDaysAgo: 'when you last paid this payee',
  recipientAccountPreviouslyUsed: 'whether this account has been used for the payee before',
  existingStandingOrderToRecipient: 'whether you already have an order with this payee',
  newRecipient: 'a payee you have not paid before',
  recipientAccountChanged: 'a changed account for a known payee',
  recipientNameSimilarity: 'the payee name compared with your known payees',
  lookalikeRecipient: 'a payee name resembling a known payee',
  securityThemedRecipientName: 'security-themed wording in the payee name',
  overseasRecipient: 'an overseas payee',
  beneficiaryAddedRecently: 'a payee added shortly before the request',
  payeeCategory: 'the kind of payee',
  referenceCategory: 'the kind of payment reference',
  referencePayeeConflict: 'a reference that does not fit the payee',
  channel: 'the channel the request came through',
  initiatedHour: 'the time of day it was set up',
  unusualHour: 'a time outside your usual banking hours',
  hoursOutsideActiveWindow: 'how far outside your usual hours it was set up',
  nightTime: 'being set up at night',
  hourTypicality: 'how typical the time of day is for you',
  weekendInitiation: 'being set up at the weekend',
  newDevice: 'a device not used on this account before',
  unusualChannel: 'a channel you do not usually use',
  externalLinkChannel: 'arriving through a link in an email',
  riskSignalCount: 'the number of departures from your usual pattern',
  textLength: 'the length of the request text',
  textUrgency: 'urgent wording',
  textThreat: 'threatening wording',
  textBypassChecks: 'wording that discourages checks',
  textExternalLink: 'a link in the text',
  textSensitiveInfo: 'a request for sensitive details',
  textBankImpersonation: 'wording that claims to act for a bank',
  textChangedPaymentDetails: 'wording about changed payment details',
  textPromisedReturns: 'promised returns',
  textRiskTermCount: 'the number of risky terms in the text',
}

// Behavioural departures from the user's profile (features.js derived
// flags). Explanatory only: the same departures already feed the rule
// checks and the model, so they are never counted as a separate family.
export const BEHAVIOUR_ANOMALY_FLAGS = {
  unusualHour: 'Set up outside the hours you normally bank',
  nightTime: 'Set up at night',
  weekendInitiation: 'Set up at the weekend',
  newDevice: 'From a device not used on this account before',
  unusualChannel: 'Through a channel you do not usually use',
  externalLinkChannel: 'Arrived through a link in an email',
  unusualPaymentDay: 'First payment outside your usual payment days',
}

export function behaviourAnomalies(features) {
  return Object.keys(BEHAVIOUR_ANOMALY_FLAGS).filter((flag) => features?.derived?.[flag] === true)
}
