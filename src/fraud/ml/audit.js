import { validateRecord } from '../synthetic/schema.js'
import { RISK_CLASSES, SCENARIOS } from '../synthetic/scenarios.js'
import { MODEL_FEATURES } from './featureSpec.js'
import { rocAuc } from './metrics.js'
import { MISSING_LEVEL, fitPreprocessor, transformFeatures } from './preprocess.js'

// Shortcut audit of a synthetic dataset: does any model input reveal the
// label on its own because of how the generator builds records, rather than
// as a plausible, imperfect fraud signal?
//
// Reads isFraud, riskClass and scenario for analysis only. Used by the
// training report, `npm run data:audit` and the generator realism tests.

export const AUDIT_DEFAULTS = {
  // A value seen at least `minCount` times that is fraud at least `purity`
  // of the time is reported as a shortcut.
  minCount: 15,
  purity: 0.97,
}

const share = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 1000 : null)

// Numeric features are audited on whether they are present; booleans and
// categories on each value.
function valueKey(feature, value) {
  if (feature.kind === 'numeric' || feature.kind === 'cyclic') return value == null ? 'null' : 'present'
  return value == null ? MISSING_LEVEL : String(value)
}

function histogram(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return counts
}

export function auditDataset(records, { features = MODEL_FEATURES, minCount = AUDIT_DEFAULTS.minCount, purity = AUDIT_DEFAULTS.purity } = {}) {
  const byClass = Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, records.filter((record) => record.labels.riskClass === riskClass)]))
  const fraud = records.filter((record) => record.labels.isFraud)

  const riskSignalCount = Object.fromEntries(
    [...RISK_CLASSES.map((riskClass) => [riskClass, byClass[riskClass]]), ['isFraud=true', fraud], ['isFraud=false', records.filter((record) => !record.labels.isFraud)]].map(([name, group]) => {
      const counts = group.map((record) => record.derived.riskSignalCount)
      return [name, { min: counts.length ? Math.min(...counts) : null, max: counts.length ? Math.max(...counts) : null, histogram: histogram(counts) }]
    }),
  )

  const missingByClass = Object.fromEntries(
    features
      .filter((feature) => feature.nullable)
      .map((feature) => [
        feature.name,
        Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, share(byClass[riskClass].filter((record) => record[feature.source][feature.name] == null).length, byClass[riskClass].length)])),
      ]),
  )

  const shortcuts = []
  const valueTable = []
  for (const feature of features) {
    const tally = new Map()
    for (const record of records) {
      const key = valueKey(feature, record[feature.source][feature.name])
      const entry = tally.get(key) ?? { n: 0, fraud: 0, legitNormal: 0, legitUnusual: 0 }
      entry.n += 1
      if (record.labels.isFraud) entry.fraud += 1
      if (record.labels.riskClass === 'legit_normal') entry.legitNormal += 1
      if (record.labels.riskClass === 'legit_unusual') entry.legitUnusual += 1
      tally.set(key, entry)
    }
    for (const [value, entry] of tally) {
      const row = { feature: feature.name, value, ...entry, fraudShare: share(entry.fraud, entry.n) }
      valueTable.push(row)
      if (entry.n >= minCount && entry.fraud / entry.n >= purity) shortcuts.push(row)
    }
  }

  // Each encoded column on its own, over the whole dataset (analysis only;
  // the model's own encoder is fitted on the training split).
  const preprocessing = fitPreprocessor(records, features)
  const X = records.map((record) => transformFeatures(preprocessing, record).vector)
  const y = records.map((record) => record.labels.isFraud)
  const singleColumnAuc = preprocessing.columns
    .map((column, j) => ({ column, auc: rocAuc(y, X.map((row) => row[j])) }))
    .filter(({ auc }) => auc != null)
    .map(({ column, auc }) => ({ column, auc: Math.round(auc * 1e4) / 1e4, strength: Math.round(Math.abs(auc - 0.5) * 2e4) / 1e4 }))
    .sort((a, b) => b.strength - a.strength || a.column.localeCompare(b.column))

  return {
    records: records.length,
    invalidRecords: records.filter((record) => validateRecord(record).length > 0).length,
    fraud: fraud.length,
    fraudRate: share(fraud.length, records.length),
    byClass: Object.fromEntries(RISK_CLASSES.map((riskClass) => [riskClass, { records: byClass[riskClass].length, fraud: byClass[riskClass].filter((record) => record.labels.isFraud).length }])),
    byScenario: Object.fromEntries(
      SCENARIOS.map((scenario) => {
        const group = records.filter((record) => record.labels.scenario === scenario.id)
        return [scenario.id, { riskClass: scenario.riskClass, records: group.length, fraud: group.filter((record) => record.labels.isFraud).length }]
      }),
    ),
    riskSignalCount,
    missingByClass,
    thresholds: { minCount, purity },
    shortcuts,
    valueTable,
    singleColumnAuc,
  }
}
