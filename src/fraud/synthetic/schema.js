import { CHANNELS, BANKS } from './catalog.js'
import { RISK_CLASSES, SCENARIOS } from './scenarios.js'
import { CATEGORY_KEYWORDS } from '../features.js'

// Column definitions for the synthetic standing-order dataset: one entry per
// field, with its group, type and meaning. validateRecord checks generated
// records against it and the generator writes it to schema.json; DATA_CARD.md
// documents the same fields.
//
// type: number | integer | boolean | string | category | datetime | list

const FREQUENCIES = ['ONE_OFF', 'DAILY', 'WEEKLY', 'MONTHLY']
const CATEGORIES = CATEGORY_KEYWORDS.map(([category]) => category)

const field = (name, type, description, extra = {}) => ({ name, type, description, nullable: false, ...extra })
const nullable = { nullable: true }

export const ID_FIELDS = [
  field('standingOrderId', 'string', 'Synthetic standing-order request ID (SYN-SO-000001…).'),
  field('userId', 'string', 'Synthetic user ID (SYN-U00001…). Links to users.json.'),
]

export const RAW_FEATURES = [
  field('amount', 'number', 'Amount per payment, MUR.', { min: 0 }),
  field('currency', 'category', 'Always MUR.', { values: ['MUR'] }),
  field('frequency', 'category', 'Payment schedule.', { values: FREQUENCIES }),
  field('recipient', 'string', 'Payee name as entered (fictional).'),
  field('recipientAccount', 'string', 'Last four digits of the payee account (fictional).', nullable),
  field('recipientBank', 'category', 'Where the payee account is held.', { ...nullable, values: BANKS }),
  field('channel', 'category', 'Channel the request was made through.', { ...nullable, values: CHANNELS }),
  field('deviceId', 'string', 'Opaque ID of the device used; null for branch requests.', nullable),
  field('initiatedAt', 'datetime', 'When the request was submitted (ISO 8601, UTC).'),
  field('initiatedHour', 'integer', 'Hour of submission, Mauritius time (0–23).', { min: 0, max: 23 }),
  field('initiatedDayOfWeek', 'integer', 'Day of week of submission, Mauritius time (1 = Monday … 7 = Sunday).', { min: 1, max: 7 }),
  field('firstPaymentDate', 'datetime', 'Requested date of the first payment (ISO 8601, UTC).'),
  field('firstPaymentDayOfMonth', 'integer', 'Day of month of the first payment, Mauritius time.', { min: 1, max: 31 }),
  field('firstPaymentDayOfWeek', 'integer', 'Day of week of the first payment (1 = Monday).', { min: 1, max: 7 }),
  field('beneficiaryAddedMinutesBefore', 'integer', 'Minutes between the payee being added (or its details changed) and the request; null for payees on file.', { ...nullable, min: 0 }),
  field('description', 'string', 'Short description the user chose for the payment.'),
  field('paymentReference', 'string', 'Payment reference, e.g. a policy or invoice number.', nullable),
  field('requestText', 'string', 'Free-text note or message attached to the request; often empty.'),

  field('userBaselineTransactionCount', 'integer', 'Settled outgoing transactions in the user\'s history.', { min: 0 }),
  field('userAverageAmount', 'number', 'Mean amount of those transactions, MUR.', nullable),
  field('userTransactionsPer30Days', 'number', 'Transaction frequency: baseline transactions per 30 days.', { min: 0 }),
  field('userStandingOrderCount', 'integer', 'Payees the user already pays by standing order.', { min: 0 }),
  field('userStandingOrderMinAmount', 'number', 'Smallest existing standing-order payment, MUR.', nullable),
  field('userStandingOrderMaxAmount', 'number', 'Largest existing standing-order payment, MUR.', nullable),
  field('userUsualFrequencies', 'list', 'Frequencies of the user\'s existing standing orders.'),
  field('userPaymentDays', 'list', 'Days of the month existing standing orders are paid on.'),
  field('userActiveHourStart', 'integer', 'Start of the user\'s usual banking hours (inclusive), from history.', { ...nullable, min: 0, max: 24 }),
  field('userActiveHourEnd', 'integer', 'End of the user\'s usual banking hours (exclusive).', { ...nullable, min: 0, max: 24 }),
  field('userKnownDeviceCount', 'integer', 'Devices seen in the user\'s history.', { min: 0 }),
  field('userUsualChannel', 'category', 'Channel the user most often banks through.', { ...nullable, values: CHANNELS }),

  field('recipientPreviouslyUsed', 'boolean', 'The payee name appears in the user\'s history.'),
  field('recipientPreviousPaymentCount', 'integer', 'Earlier payments to this payee.', { min: 0 }),
  field('recipientHistoricalAverageAmount', 'number', 'Mean earlier payment to this payee, MUR.', nullable),
  field('recipientLastPaidDaysAgo', 'number', 'Days since the payee was last paid.', nullable),
  field('recipientAccountPreviouslyUsed', 'boolean', 'For a known payee, whether this account number was paid before; null when not comparable.', nullable),
  field('existingStandingOrderToRecipient', 'boolean', 'The user already pays this payee by standing order.'),
  field('existingStandingOrderAmount', 'number', 'Amount of that existing order, MUR.', nullable),
  field('existingStandingOrderFrequency', 'category', 'Frequency of that existing order.', { ...nullable, values: FREQUENCIES }),
  field('existingStandingOrderDayOfMonth', 'integer', 'Payment day of that existing order.', { ...nullable, min: 1, max: 31 }),
]

export const DERIVED_FEATURES = [
  field('amountLog10', 'number', 'log10 of the amount.'),
  field('amountToUserAverageRatio', 'number', 'Amount ÷ user\'s average transaction.', nullable),
  field('amountToStandingOrderMaxRatio', 'number', 'Amount ÷ user\'s largest existing standing order.', nullable),
  field('amountLogZScore', 'number', 'Standard score of log(amount) against the user\'s transaction amounts.', nullable),
  field('amountToRecipientAverageRatio', 'number', 'Amount ÷ average earlier payment to this payee.', nullable),
  field('amountChangeVsExistingOrderRatio', 'number', 'Amount ÷ the existing standing order to this payee.', nullable),
  field('amountAboveUsualRange', 'boolean', 'Amount exceeds the user\'s largest existing standing order.'),
  field('roundThousandAmount', 'boolean', 'Amount is a whole multiple of Rs 1,000.'),
  field('paymentsPerYear', 'integer', 'Payments per year implied by the frequency.', { min: 1 }),
  field('annualisedAmount', 'number', 'Amount × payments per year, MUR.'),
  field('annualisedToUsualRatio', 'number', 'Annualised amount ÷ (largest existing standing order × 12).', nullable),
  field('unusualFrequency', 'boolean', 'Frequency not among the user\'s existing standing orders.'),
  field('frequencyChangedForRecipient', 'boolean', 'Differs from the frequency of the existing order to this payee.'),
  field('duplicateOfExistingOrder', 'boolean', 'Same payee, amount and frequency as an existing order.'),
  field('newRecipient', 'boolean', 'Payee never paid before (negation of recipientPreviouslyUsed).'),
  field('recipientAccountChanged', 'boolean', 'Known payee name, account number never used before.'),
  field('recipientNameSimilarity', 'number', 'Highest 0–1 name similarity to a *different* known payee.', { min: 0, max: 1 }),
  field('lookalikeRecipient', 'boolean', 'New payee whose name is ≥ 0.8 similar to a known payee.'),
  field('securityThemedRecipientName', 'boolean', 'Payee name uses security/settlement wording ("Secure", "Escrow", "Protection"…).'),
  field('overseasRecipient', 'boolean', 'Payee account is held overseas.'),
  field('beneficiaryAddedRecently', 'boolean', 'Payee added or changed less than 24 hours before the request.'),
  field('unusualHour', 'boolean', 'Submitted outside the user\'s usual banking hours.'),
  field('hoursOutsideActiveWindow', 'integer', 'Hours between submission and the nearest edge of the usual window (0 if inside).', { min: 0, max: 12 }),
  field('nightTime', 'boolean', 'Submitted between 00:00 and 04:59.'),
  field('hourTypicality', 'number', 'Share of the user\'s history initiated within ±1 hour of this hour.', { ...nullable, min: 0, max: 1 }),
  field('unusualPaymentDay', 'boolean', 'First payment day more than two days from any existing payment day.'),
  field('weekendInitiation', 'boolean', 'Submitted on a Saturday or Sunday.'),
  field('newDevice', 'boolean', 'Device not seen in the user\'s history.'),
  field('unusualChannel', 'boolean', 'Channel differs from the user\'s usual channel.'),
  field('externalLinkChannel', 'boolean', 'Request came through a link in an email.'),
  field('textLength', 'integer', 'Characters in requestText.', { min: 0 }),
  field('textUrgency', 'boolean', 'requestText contains urgency wording.'),
  field('textThreat', 'boolean', 'requestText threatens consequences (suspension, freeze…).'),
  field('textBypassChecks', 'boolean', 'requestText asks the user not to contact or verify with the bank.'),
  field('textExternalLink', 'boolean', 'requestText contains a link or web address.'),
  field('textSensitiveInfo', 'boolean', 'requestText asks for an OTP, PIN, password or card details.'),
  field('textBankImpersonation', 'boolean', 'requestText claims to come from the bank\'s security team.'),
  field('textChangedPaymentDetails', 'boolean', 'requestText says payment/bank details have changed.'),
  field('textPromisedReturns', 'boolean', 'requestText promises returns or profits.'),
  field('textRiskTermCount', 'integer', 'Number of the text flags above that are true.', { min: 0 }),
  field('payeeCategory', 'category', 'Kind of payee, from its known relationship or its name.', { ...nullable, values: CATEGORIES }),
  field('referenceCategory', 'category', 'Kind of service named by the description and reference.', { ...nullable, values: CATEGORIES }),
  field('referencePayeeConflict', 'boolean', 'payeeCategory and referenceCategory are both known and differ.'),
  field('riskSignalCount', 'integer', 'How many departure-from-normal flags are set (see RISK_SIGNAL_FLAGS in features.js).', { min: 0 }),
]

export const LABEL_FIELDS = [
  field('isFraud', 'boolean', 'Ground-truth fraud label in the synthetic world. Always true for fraudulent, always false for legit_*, drawn per record for suspicious.'),
  field('riskClass', 'category', 'Which of the four generation classes produced the record.', { values: RISK_CLASSES }),
  field('scenario', 'category', 'The specific generation pattern within the class.', { values: SCENARIOS.map((scenario) => scenario.id) }),
]

export const BENCHMARK_FIELDS = [
  field('ruleEngineScore', 'integer', 'Score from the existing rule engine (engine.js) on this request, 0–100, higher = safer. For comparison only — not a feature and not a training target.', { min: 0, max: 100 }),
  field('ruleEngineRiskLevel', 'category', 'The rule engine\'s risk band.', { values: ['LOW', 'MEDIUM', 'HIGH'] }),
]

export const SCHEMA = {
  ids: ID_FIELDS,
  raw: RAW_FEATURES,
  derived: DERIVED_FEATURES,
  labels: LABEL_FIELDS,
  benchmark: BENCHMARK_FIELDS,
}

function checkValue(spec, value) {
  if (value === null || value === undefined) return spec.nullable && value === null ? null : 'missing'
  switch (spec.type) {
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'not a finite number'
      if (spec.type === 'integer' && !Number.isInteger(value)) return 'not an integer'
      if (spec.min != null && value < spec.min) return `below ${spec.min}`
      if (spec.max != null && value > spec.max) return `above ${spec.max}`
      return null
    case 'boolean':
      return typeof value === 'boolean' ? null : 'not a boolean'
    case 'string':
      return typeof value === 'string' ? null : 'not a string'
    case 'category':
      return spec.values.includes(value) ? null : `unexpected value ${JSON.stringify(value)}`
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? null : 'not a date'
    case 'list':
      return Array.isArray(value) ? null : 'not a list'
    default:
      return `unknown type ${spec.type}`
  }
}

// Problems with one record, as strings; empty when the record is valid.
export function validateRecord(record) {
  const problems = []
  const sections = { ids: record, raw: record.raw, derived: record.derived, labels: record.labels, benchmark: record.benchmark }
  for (const [section, fields] of Object.entries(SCHEMA)) {
    const values = sections[section]
    if (!values) {
      problems.push(`${section}: missing section`)
      continue
    }
    for (const spec of fields) {
      const problem = checkValue(spec, values[spec.name])
      if (problem) problems.push(`${section}.${spec.name}: ${problem}`)
    }
    if (section !== 'ids') {
      const known = new Set(fields.map((spec) => spec.name))
      for (const name of Object.keys(values)) if (!known.has(name)) problems.push(`${section}.${name}: not in schema`)
    }
  }

  const { riskClass, isFraud, scenario } = record.labels ?? {}
  const definition = SCENARIOS.find((candidate) => candidate.id === scenario)
  if (definition && definition.riskClass !== riskClass) problems.push(`labels.scenario: ${scenario} belongs to ${definition.riskClass}, not ${riskClass}`)
  if (riskClass === 'fraudulent' && isFraud !== true) problems.push('labels.isFraud: fraudulent records must be fraud')
  if (riskClass?.startsWith('legit_') && isFraud !== false) problems.push('labels.isFraud: legitimate records cannot be fraud')
  return problems
}

// ---- Flat (CSV) form ------------------------------------------------------

// Column order for the CSV: ids, raw features, derived features, then
// `label_*` and `benchmark_*` columns so they cannot be mistaken for inputs.
export const CSV_COLUMNS = [
  ...ID_FIELDS.map((spec) => ({ header: spec.name, get: (record) => record[spec.name] })),
  ...RAW_FEATURES.map((spec) => ({ header: spec.name, get: (record) => record.raw[spec.name] })),
  ...DERIVED_FEATURES.map((spec) => ({ header: spec.name, get: (record) => record.derived[spec.name] })),
  ...LABEL_FIELDS.map((spec) => ({ header: `label_${spec.name}`, get: (record) => record.labels[spec.name] })),
  ...BENCHMARK_FIELDS.map((spec) => ({ header: `benchmark_${spec.name}`, get: (record) => record.benchmark[spec.name] })),
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '1' : '0'
  const text = Array.isArray(value) ? value.join('|') : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(records) {
  const lines = [CSV_COLUMNS.map((column) => column.header).join(',')]
  for (const record of records) lines.push(CSV_COLUMNS.map((column) => csvCell(column.get(record))).join(','))
  return `${lines.join('\n')}\n`
}
