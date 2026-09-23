import { BENCHMARK_FIELDS, DERIVED_FEATURES, ID_FIELDS, LABEL_FIELDS, RAW_FEATURES } from '../synthetic/schema.js'

// Which dataset fields the fraud model may read, and how each is encoded.
//
// Every field in the Stage 2 schema is either listed in MODEL_FEATURE_NAMES
// (an input) or in EXCLUDED_FIELDS (with the reason), and a test checks that
// nothing is in both or neither — so a new schema field cannot silently
// become a model input. Labels, benchmark scores and IDs are always excluded.
//
// kind:
//   numeric  — number, optional `transform`, median-imputed, standardised
//   boolean  — 1 / 0
//   category — one-hot over the levels seen in training (null is a level)
//   cyclic   — hour of day as sin/cos, so 23:00 and 00:00 are close
// transform (numeric only):
//   log1p — log(1 + x) for non-negative, heavy-tailed counts and amounts
//   log   — log(x) for positive ratios, so ×2 and ÷2 are symmetric

const MODEL_FEATURE_NAMES = [
  // Request, as observed.
  ['raw', 'frequency', 'category'],
  ['raw', 'recipientBank', 'category'],
  ['raw', 'channel', 'category'],
  ['raw', 'initiatedHour', 'cyclic', { period: 24 }],
  ['raw', 'beneficiaryAddedMinutesBefore', 'numeric', { transform: 'log1p' }],

  // The user's baseline, as context for the ratios below.
  ['raw', 'userAverageAmount', 'numeric', { transform: 'log1p' }],
  ['raw', 'userStandingOrderCount', 'numeric'],
  ['raw', 'userStandingOrderMinAmount', 'numeric', { transform: 'log1p' }],
  ['raw', 'userStandingOrderMaxAmount', 'numeric', { transform: 'log1p' }],
  ['raw', 'userKnownDeviceCount', 'numeric'],
  ['raw', 'userUsualChannel', 'category'],

  // The payee against the user's history.
  ['raw', 'recipientPreviousPaymentCount', 'numeric', { transform: 'log1p' }],
  ['raw', 'recipientHistoricalAverageAmount', 'numeric', { transform: 'log1p' }],
  ['raw', 'recipientLastPaidDaysAgo', 'numeric', { transform: 'log1p' }],
  ['raw', 'recipientAccountPreviouslyUsed', 'category'],
  ['raw', 'existingStandingOrderToRecipient', 'boolean'],
  ['raw', 'existingStandingOrderAmount', 'numeric', { transform: 'log1p' }],
  ['raw', 'existingStandingOrderFrequency', 'category'],

  // Amount.
  ['derived', 'amountLog10', 'numeric'],
  ['derived', 'amountToUserAverageRatio', 'numeric', { transform: 'log' }],
  ['derived', 'amountToStandingOrderMaxRatio', 'numeric', { transform: 'log' }],
  ['derived', 'amountLogZScore', 'numeric'],
  ['derived', 'amountToRecipientAverageRatio', 'numeric', { transform: 'log' }],
  ['derived', 'amountChangeVsExistingOrderRatio', 'numeric', { transform: 'log' }],
  ['derived', 'amountAboveUsualRange', 'boolean'],
  ['derived', 'roundThousandAmount', 'boolean'],
  ['derived', 'annualisedAmount', 'numeric', { transform: 'log1p' }],
  ['derived', 'annualisedToUsualRatio', 'numeric', { transform: 'log' }],

  // Schedule.
  ['derived', 'unusualFrequency', 'boolean'],
  ['derived', 'frequencyChangedForRecipient', 'boolean'],
  ['derived', 'duplicateOfExistingOrder', 'boolean'],
  ['derived', 'unusualPaymentDay', 'boolean'],

  // Payee.
  ['derived', 'newRecipient', 'boolean'],
  ['derived', 'recipientAccountChanged', 'boolean'],
  ['derived', 'recipientNameSimilarity', 'numeric'],
  ['derived', 'lookalikeRecipient', 'boolean'],
  ['derived', 'securityThemedRecipientName', 'boolean'],
  ['derived', 'overseasRecipient', 'boolean'],
  ['derived', 'beneficiaryAddedRecently', 'boolean'],

  // Session.
  ['derived', 'unusualHour', 'boolean'],
  ['derived', 'hoursOutsideActiveWindow', 'numeric'],
  ['derived', 'nightTime', 'boolean'],
  ['derived', 'hourTypicality', 'numeric'],
  ['derived', 'weekendInitiation', 'boolean'],
  ['derived', 'newDevice', 'boolean'],
  ['derived', 'unusualChannel', 'boolean'],
  ['derived', 'externalLinkChannel', 'boolean'],

  // Wording (pattern flags only; the free text is left for the NLP stage).
  ['derived', 'textLength', 'numeric', { transform: 'log1p' }],
  ['derived', 'textUrgency', 'boolean'],
  ['derived', 'textThreat', 'boolean'],
  ['derived', 'textBypassChecks', 'boolean'],
  ['derived', 'textExternalLink', 'boolean'],
  ['derived', 'textSensitiveInfo', 'boolean'],
  ['derived', 'textBankImpersonation', 'boolean'],
  ['derived', 'textChangedPaymentDetails', 'boolean'],
  ['derived', 'textPromisedReturns', 'boolean'],
  ['derived', 'textRiskTermCount', 'numeric'],
  ['derived', 'payeeCategory', 'category'],
  ['derived', 'referenceCategory', 'category'],
  ['derived', 'referencePayeeConflict', 'boolean'],

  // Count of departure-from-normal flags (features.js). Label-free.
  ['derived', 'riskSignalCount', 'numeric'],
]

const LABEL_REASON = 'Label / generation metadata: would leak the answer.'
const BENCHMARK_REASON = 'Rule-engine benchmark: comparison only, never a model input.'
const ID_REASON = 'Identifier: lets the model memorise users or records.'

export const EXCLUDED_FIELDS = {
  ...Object.fromEntries(ID_FIELDS.map((spec) => [spec.name, ID_REASON])),
  ...Object.fromEntries(LABEL_FIELDS.map((spec) => [spec.name, LABEL_REASON])),
  ...Object.fromEntries(BENCHMARK_FIELDS.map((spec) => [spec.name, BENCHMARK_REASON])),

  recipient: 'Payee name: high-cardinality identifier. Its signal is carried by newRecipient, recipientNameSimilarity, securityThemedRecipientName and payeeCategory.',
  recipientAccount: 'Account suffix: identifier. Its signal is carried by recipientAccountChanged / recipientAccountPreviouslyUsed.',
  deviceId: 'Device identifier. Its signal is carried by newDevice.',
  description: 'Free text, reserved for the NLP stage. Summarised by referenceCategory.',
  paymentReference: 'Free text, reserved for the NLP stage. Summarised by referenceCategory.',
  requestText: 'Free text, reserved for the NLP stage. Summarised by the text* pattern flags.',
  initiatedAt: 'Absolute timestamp: reflects the generator\'s request window, not behaviour. Hour and weekday are used instead.',
  firstPaymentDate: 'Absolute timestamp: reflects the generator\'s calendar, not behaviour. Covered by unusualPaymentDay.',
  currency: 'Constant (always MUR).',
  amount: 'Same information as amountLog10, which is on a usable scale.',
  paymentsPerYear: 'Same information as frequency.',
  recipientPreviouslyUsed: 'Exact negation of newRecipient.',
  initiatedDayOfWeek: 'Covered by weekendInitiation; the weekday number has no linear meaning.',
  firstPaymentDayOfMonth: 'Covered by unusualPaymentDay; the day number has no linear meaning.',
  firstPaymentDayOfWeek: 'Weekday of the scheduled first payment: calendar artefact, no behavioural meaning.',
  existingStandingOrderDayOfMonth: 'Covered by unusualPaymentDay; the day number has no linear meaning.',
  userUsualFrequencies: 'List. Summarised by unusualFrequency.',
  userPaymentDays: 'List. Summarised by unusualPaymentDay.',
  userActiveHourStart: 'Covered by unusualHour, hoursOutsideActiveWindow and hourTypicality.',
  userActiveHourEnd: 'Covered by unusualHour, hoursOutsideActiveWindow and hourTypicality.',
  // Stage 3.1: fraud is assigned to users independently of how much they
  // bank, so these only picked up spurious, mutually cancelling weights, and
  // they extrapolate badly to real accounts with shorter histories (the app's
  // demo account has 18 settled transactions; synthetic users 66–398).
  userBaselineTransactionCount: 'Account activity volume, not a fraud signal: spurious weight in training and far out of range for short real histories (Stage 3.1).',
  userTransactionsPer30Days: 'Account activity volume, not a fraud signal: spurious weight in training and far out of range for short real histories (Stage 3.1).',
}

const SCHEMA_FIELDS = { raw: RAW_FEATURES, derived: DERIVED_FEATURES }

export const MODEL_FEATURES = MODEL_FEATURE_NAMES.map(([source, name, kind, options = {}]) => {
  const schemaField = SCHEMA_FIELDS[source].find((spec) => spec.name === name)
  if (!schemaField) throw new Error(`Model feature ${source}.${name} is not in the dataset schema`)
  const feature = { source, name, kind, nullable: schemaField.nullable, ...options }
  // Categories use the schema's full vocabulary, so a valid value that happens
  // not to occur in the training split is still a known level.
  if (kind === 'category') {
    const values = schemaField.type === 'boolean' ? [false, true] : schemaField.values
    feature.values = schemaField.nullable ? [...values, null] : values
  }
  return feature
})
