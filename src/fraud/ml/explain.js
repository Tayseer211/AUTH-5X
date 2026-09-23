import { APP_TIMEZONE } from '../../utils/time.js'
import { extractFeatures } from '../features.js'
import { deriveUserProfile } from '../profile.js'
import { sigmoid } from './logistic.js'
import { loadFraudModel } from './predict.js'
import { transformFeatures } from './preprocess.js'

// Explainable use of the fraud model inside the assessment (Stage 5).
//
// The model is a logistic regression, so its logit is exactly
//   bias + Σ weight[i] · encoded[i]
// and each column's contribution can be reported without approximation.
//
// The assessment uses a *transaction-only* estimate: the request is scored
// with its message text removed. The message is judged by the text
// classifier; scoring it here as well would count the same words twice (and
// the synthetic-trained text weights are not reliable: see MODEL_CARD.md).
//
// The model was trained on synthetic data and is not calibrated to real-world
// fraud rates, so its output is a *model estimate* placed in a band, never a
// probability of fraud. Nothing here reads the clock: the history cut-off is
// the explicit `asOf` timestamp of the analysis.

export const MODEL_NOTICE = 'Synthetic-trained; not calibrated to real-world fraud rates.'
export const MODEL_INPUT = 'request without message text'

const ESTIMATE_PLACES = 4
const CONTRIBUTION_PLACES = 4
const TOP_POSITIVE = 5
const TOP_NEGATIVE = 3

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places

// "amount=…", "beneficiaryAddedMinutesBefore__missing", "initiatedHour__sin"
// → the feature they encode.
export const columnFeature = (column) => column.split('=')[0].replace(/__(missing|sin|cos)$/, '')

// Band thresholds come from the artifact's own recorded candidates:
// `costSensitive` (lowest validation cost) and `candidate` (best validation F1).
export function bandThresholds(artifactThresholds) {
  const elevated = artifactThresholds?.costSensitive?.threshold
  const high = artifactThresholds?.candidate?.threshold
  if (!Number.isFinite(elevated) || !Number.isFinite(high) || !(elevated < high)) throw new Error('Model artifact has no usable band thresholds')
  return { elevated, high }
}

// A loaded model plus its band thresholds, ready for transactionModelEstimate.
export function prepareModel(artifact) {
  return Object.freeze({ ...loadFraudModel(artifact), bandThresholds: Object.freeze(bandThresholds(artifact.thresholds)) })
}

export function bandFor(estimate, thresholds) {
  if (estimate >= thresholds.high) return 'HIGH'
  if (estimate >= thresholds.elevated) return 'ELEVATED'
  return 'LOW'
}

// Per-feature contributions to the logit for an encoded { raw, derived }
// feature set. `logit` equals bias + the sum of every contribution.
export function explainPrediction(model, features) {
  const { vector, warnings } = transformFeatures(model.preprocessing, features)
  const byFeature = new Map()
  model.preprocessing.columns.forEach((column, i) => {
    const feature = columnFeature(column)
    byFeature.set(feature, (byFeature.get(feature) ?? 0) + model.weights[i] * vector[i])
  })
  const contributions = [...byFeature].map(([feature, logit]) => ({ feature, logit }))
  const logit = model.bias + contributions.reduce((sum, item) => sum + item.logit, 0)
  return { logit, estimate: sigmoid(logit), contributions, warnings }
}

// History as it stood at the analysis: transactions created after `asOf`
// are left out, so re-running with the same `asOf` gives the same result.
export function historyAsOf(history, asOf) {
  const cutoff = new Date(asOf).getTime()
  if (!Number.isFinite(cutoff)) throw new Error(`Invalid asOf timestamp: ${asOf}`)
  return history.filter((tx) => !tx.createdAt || new Date(tx.createdAt).getTime() <= cutoff)
}

// The model's inputs as they stood at `asOf`: the history cut off at `asOf`
// and the profile derived from that same history (in the given profile's time
// zone), so a later ledger cannot change either.
export function inputsAsOf(history, profile, asOf) {
  const pinned = historyAsOf(history, asOf)
  return { history: pinned, profile: deriveUserProfile(pinned, { timeZone: profile?.timezone ?? APP_TIMEZONE }) }
}

// The transaction-only model estimate for a pending request, as a
// serialisable snapshot. `model` is a prepareModel result; history and
// profile are pinned to `asOf` (inputsAsOf). `features` (the request's
// extracted features, message removed) is returned for callers that need
// other derived flags.
export function transactionModelEstimate(model, request, { history, profile, asOf }) {
  const base = { modelVersion: model.modelVersion, asOf, input: MODEL_INPUT, notice: MODEL_NOTICE }
  const features = extractFeatures({ ...request, requestText: '' }, inputsAsOf(history, profile, asOf))
  const thresholds = model.bandThresholds
  const { estimate, contributions, warnings } = explainPrediction(model, features)

  // An input the model has not seen is encoded neutrally but is out of
  // distribution; the estimate is then not used.
  if (warnings.length) return { snapshot: { ...base, status: 'UNAVAILABLE', estimate: null, band: null, bandThresholds: thresholds, contributions: [], warnings }, features }

  const ranked = contributions.filter((item) => Math.abs(item.logit) > 1e-9)
  const positive = ranked.filter((item) => item.logit > 0).sort((a, b) => b.logit - a.logit || a.feature.localeCompare(b.feature)).slice(0, TOP_POSITIVE)
  const negative = ranked.filter((item) => item.logit < 0).sort((a, b) => a.logit - b.logit || a.feature.localeCompare(b.feature)).slice(0, TOP_NEGATIVE)
  return {
    snapshot: {
      ...base,
      status: 'AVAILABLE',
      estimate: round(estimate, ESTIMATE_PLACES),
      band: bandFor(estimate, thresholds),
      bandThresholds: thresholds,
      contributions: [...positive, ...negative].map(({ feature, logit }) => ({ feature, logit: round(logit, CONTRIBUTION_PLACES) })),
      warnings: [],
    },
    features,
  }
}
