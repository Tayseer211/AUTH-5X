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
