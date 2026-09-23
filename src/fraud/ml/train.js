import { chooseThresholds, evaluateModel, labelsOf, probabilityMetrics, scoreRecords } from './evaluate.js'
import { MODEL_FEATURES } from './featureSpec.js'
import { predictProbability, trainLogisticRegression } from './logistic.js'
import { rocAuc } from './metrics.js'
import { MODEL_TYPE, loadFraudModel } from './predict.js'
import { fitPreprocessor, transformFeatures } from './preprocess.js'
import { DEFAULT_FRACTIONS, SPLITS, recordSplit, userSplit } from './split.js'

// Training pipeline for the first fraud model (Stage 3):
//
//   synthetic records ─► user-level stratified split
//   ─► fit preprocessing on train ─► logistic regression per L2 strength
//   ─► pick L2 by validation log loss ─► pick candidate threshold on validation
//   ─► evaluate once on test, next to the rule engine
//
// Only `raw` and `derived` features reach the model (see featureSpec.js);
// labels are read for the target and, with scenario/riskClass and the rule
// engine's benchmark, for evaluation. Deterministic: the same records and
// options give the same artifact.

// 1.1.0 (Stage 3.1): generator 2.0.0 dataset, canonical bank codes, category
// features restored, account-activity-volume features dropped.
export const MODEL_VERSION = 'fraud-lr-1.1.0'

export const TRAINING_DEFAULTS = {
  seed: 'fraud-auth-stage3',
  split: 'user',
  fractions: DEFAULT_FRACTIONS,
  l2Grid: [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1],
  features: MODEL_FEATURES,
}

const PRECISION = 1e8
const round = (value) => Math.round(value * PRECISION) / PRECISION
const round4 = (value) => (value == null ? null : Math.round(value * 1e4) / 1e4)

// Only synthetic dataset records may be trained on — never the app's demo
// cases or a real user's requests.
export function assertTrainable(records) {
  if (!records.length) throw new Error('No records to train on')
  for (const record of records) {
    if (!/^SYN-SO-\d+$/.test(record.standingOrderId ?? '')) throw new Error(`Not a synthetic dataset record: ${record.standingOrderId ?? record.id}`)
    if (typeof record.labels?.isFraud !== 'boolean') throw new Error(`Record ${record.standingOrderId} has no isFraud label`)
    if (!record.raw || !record.derived) throw new Error(`Record ${record.standingOrderId} has no features`)
  }
}

const encode = (preprocessing, records) => records.map((record) => transformFeatures(preprocessing, { raw: record.raw, derived: record.derived }).vector)
const targets = (records) => records.map((record) => (record.labels.isFraud ? 1 : 0))

function describeSplit(records) {
  return {
    records: records.length,
    fraud: records.filter((record) => record.labels.isFraud).length,
    users: new Set(records.map((record) => record.userId)).size,
  }
}

// Strongest single columns on the training set, by how far their AUC is from
// 0.5. A column near 1.0 (or 0.0) on its own would suggest label leakage.
function singleColumnAuc(columns, X, y) {
  return columns
    .map((column, j) => ({ column, auc: rocAuc(y, X.map((row) => row[j])) }))
    .filter(({ auc }) => auc != null)
    .map(({ column, auc }) => ({ column, auc: round4(auc) }))
    .sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5) || a.column.localeCompare(b.column))
    .slice(0, 12)
}

export function trainFraudModel(records, options = {}) {
  const settings = { ...TRAINING_DEFAULTS, ...options }
  assertTrainable(records)

  const splitter = settings.split === 'user' ? userSplit : settings.split === 'record' ? recordSplit : null
  if (!splitter) throw new Error(`Unknown split strategy ${settings.split}`)
  const splits = splitter(records, { seed: settings.seed, fractions: settings.fractions })

  // Everything below is fitted on the training split only.
  const preprocessing = fitPreprocessor(splits.train, settings.features)
  const Xtrain = encode(preprocessing, splits.train)
  const ytrain = targets(splits.train)
  const Xvalidation = encode(preprocessing, splits.validation)
  const yvalidation = labelsOf(splits.validation)

  const search = settings.l2Grid.map((l2) => {
    const fit = trainLogisticRegression(Xtrain, ytrain, { l2 })
    const probabilities = Xvalidation.map((row) => predictProbability(fit.weights, fit.bias, row))
    return { l2, fit, validation: probabilityMetrics(yvalidation, probabilities) }
  })
  // Lowest validation log loss; ties go to the stronger regularisation.
  const best = search.reduce((a, b) => (b.validation.logLoss < a.validation.logLoss || (b.validation.logLoss === a.validation.logLoss && b.l2 > a.l2) ? b : a))

  const artifact = {
    modelType: MODEL_TYPE,
    modelVersion: MODEL_VERSION,
    synthetic: true,
    notice:
      'Prototype model trained only on synthetic data. Its metrics describe the synthetic generator, not real-world fraud detection performance. Not connected to the fraud.auth UI.',
    target: 'isFraud (synthetic ground truth): probability that a pending standing-order request is fraud',
    dataset: settings.dataset ?? null,
    training: {
      seed: settings.seed,
      split: settings.split,
      fractions: settings.fractions,
      sizes: Object.fromEntries(SPLITS.map((split) => [split, describeSplit(splits[split])])),
      classWeighting: 'none (probabilities stay on the training prevalence; imbalance is handled by the threshold)',
      l2Search: search.map(({ l2, fit, validation }) => ({ l2, iterations: fit.iterations, converged: fit.converged, validation })),
      selectedL2: best.l2,
      iterations: best.fit.iterations,
      converged: best.fit.converged,
    },
    features: settings.features.map(({ source, name, kind, transform }) => ({ source, name, kind, ...(transform ? { transform } : {}) })),
    model: {
      preprocessing,
      weights: best.fit.weights.map(round),
      bias: round(best.fit.bias),
    },
  }

  // From here on the model is used exactly as the app would load it.
  const model = loadFraudModel(artifact)
  const validationProbabilities = scoreRecords(model, splits.validation)
  const thresholds = chooseThresholds(yvalidation, validationProbabilities, splits.validation)

  artifact.thresholds = {
    ...thresholds,
    note: 'Candidates for experimentation, chosen on validation data. Not a production threshold: the right value depends on the relative cost of a missed fraud versus a wrongly held legitimate payment.',
  }
  artifact.evaluation = {
    validation: probabilityMetrics(yvalidation, validationProbabilities),
    test: evaluateModel(model, splits.test, { threshold: thresholds.candidate.threshold, ruleCutoff: thresholds.ruleEngineTunedCutoff.riskAtLeast }),
  }
  artifact.diagnostics = {
    largestWeights: preprocessing.columns
      .map((column, j) => ({ column, weight: round4(artifact.model.weights[j]) }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.column.localeCompare(b.column))
      .slice(0, 15),
    strongestSingleColumns: singleColumnAuc(preprocessing.columns, Xtrain, ytrain),
  }

  return { artifact, model, splits }
}
