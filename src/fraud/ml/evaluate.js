import { averagePrecision, bestF1Threshold, brierScore, evaluateAt, logLoss, rocAuc, thresholdTable } from './metrics.js'
import { predictFraud } from './predict.js'

// Held-out evaluation of a loaded model, alongside the existing rule engine.
//
// `scenario` and `riskClass` are read here for error analysis only; they are
// never passed to the model. The rule engine's stored benchmark score is
// likewise read only to compare against.

export const REPORT_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
export const THRESHOLD_GRID = Array.from({ length: 19 }, (_, i) => Math.round((i + 1) * 5) / 100)

// Rule engine: 0–100 safety score, higher = safer. As a fraud score we use
// 100 − score. Its own bands: HIGH below 40, MEDIUM 40–84, LOW 85+.
const ruleRisk = (record) => 100 - record.benchmark.ruleEngineScore
export const RULE_OPERATING_POINTS = {
  highBand: { label: 'Rule engine: HIGH risk band (score < 40)', riskAtLeast: 61 },
  reviewBand: { label: 'Rule engine: MEDIUM or HIGH (score < 85)', riskAtLeast: 16 },
}
const RULE_CUTOFFS = Array.from({ length: 100 }, (_, i) => i + 1)

const round = (value, places = 4) => (value == null ? null : Math.round(value * 10 ** places) / 10 ** places)

export function roundMetrics(result) {
  const out = {}
  for (const [key, value] of Object.entries(result)) out[key] = typeof value === 'number' && !Number.isInteger(value) ? round(value) : value
  return out
}

export const labelsOf = (records) => records.map((record) => record.labels.isFraud)
export const scoreRecords = (model, records) => records.map((record) => predictFraud(model, { raw: record.raw, derived: record.derived }).fraudProbability)

export function probabilityMetrics(labels, probabilities) {
  return {
    rocAuc: round(rocAuc(labels, probabilities)),
    averagePrecision: round(averagePrecision(labels, probabilities)),
    logLoss: round(logLoss(labels, probabilities)),
    brierScore: round(brierScore(labels, probabilities)),
  }
}

// Chosen on validation data only; the test set never influences it.
export function chooseThresholds(labels, probabilities, records, { falseNegativeCost = 5, falsePositiveCost = 1 } = {}) {
  const f1 = bestF1Threshold(labels, probabilities, THRESHOLD_GRID)
  let costBest = null
  for (const threshold of THRESHOLD_GRID) {
    const { confusion } = evaluateAt(labels, probabilities, threshold)
    const cost = confusion.falseNegatives * falseNegativeCost + confusion.falsePositives * falsePositiveCost
    if (costBest === null || cost < costBest.cost) costBest = { threshold, cost }
  }
  const risks = records.map(ruleRisk)
  const rules = bestF1Threshold(labels, risks, RULE_CUTOFFS)
  return {
    candidate: { threshold: f1.threshold, rule: 'highest F1 on the validation set', validationF1: round(f1.f1) },
    costSensitive: { threshold: costBest.threshold, falseNegativeCost, falsePositiveCost, rule: 'lowest validation cost' },
    ruleEngineTunedCutoff: {
      riskAtLeast: rules.threshold,
      label: `Rule engine: score ≤ ${100 - rules.threshold} (cutoff tuned for F1 on validation)`,
      validationF1: round(rules.f1),
    },
  }
}

function tally(records, flagged) {
  const fraud = records.filter((record) => record.labels.isFraud)
  const legit = records.filter((record) => !record.labels.isFraud)
  return {
    fraudCaught: fraud.filter((record) => flagged.get(record)).length,
    legitFlagged: legit.filter((record) => flagged.get(record)).length,
  }
}

export function evaluateModel(model, records, { threshold, ruleCutoff }) {
  const labels = labelsOf(records)
  const probabilities = scoreRecords(model, records)
  const risks = records.map(ruleRisk)

  const rulePoints = {
    ...RULE_OPERATING_POINTS,
    tuned: { label: `Rule engine: score ≤ ${100 - ruleCutoff} (cutoff tuned on validation)`, riskAtLeast: ruleCutoff },
  }

  const mlFlag = new Map(records.map((record, i) => [record, probabilities[i] >= threshold]))
  const ruleFlag = new Map(records.map((record, i) => [record, risks[i] >= ruleCutoff]))
  const reviewFlag = new Map(records.map((record, i) => [record, risks[i] >= RULE_OPERATING_POINTS.reviewBand.riskAtLeast]))

  const probabilityOf = new Map(records.map((record, i) => [record, probabilities[i]]))
  const scenarios = [...new Set(records.map((record) => record.labels.scenario))]
  const byScenario = scenarios
    .map((scenario) => {
      const group = records.filter((record) => record.labels.scenario === scenario)
      const groupProbabilities = group.map((record) => probabilityOf.get(record))
      return {
        scenario,
        riskClass: group[0].labels.riskClass,
        records: group.length,
        fraud: group.filter((record) => record.labels.isFraud).length,
        meanProbability: round(groupProbabilities.reduce((sum, p) => sum + p, 0) / group.length),
        ml: tally(group, mlFlag),
        rulesTuned: tally(group, ruleFlag),
        rulesReviewBand: tally(group, reviewFlag),
      }
    })
    .sort((a, b) => a.riskClass.localeCompare(b.riskClass) || a.scenario.localeCompare(b.scenario))

  return {
    records: records.length,
    fraud: labels.filter(Boolean).length,
    legitimate: labels.filter((label) => !label).length,
    ml: {
      ...probabilityMetrics(labels, probabilities),
      atCandidateThreshold: roundMetrics(evaluateAt(labels, probabilities, threshold)),
      atHalf: roundMetrics(evaluateAt(labels, probabilities, 0.5)),
      thresholds: thresholdTable(labels, probabilities, REPORT_THRESHOLDS).map(roundMetrics),
    },
    ruleEngine: {
      rocAuc: round(rocAuc(labels, risks)),
      averagePrecision: round(averagePrecision(labels, risks)),
      operatingPoints: Object.fromEntries(
        Object.entries(rulePoints).map(([id, point]) => [id, { label: point.label, ...roundMetrics(evaluateAt(labels, risks, point.riskAtLeast)) }]),
      ),
    },
    byScenario,
  }
}
